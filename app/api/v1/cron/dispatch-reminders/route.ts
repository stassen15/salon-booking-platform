import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import {
  NOTIFICATION_TEMPLATE_MAP,
  confirmationTemplateUsesButtons,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  formatCancellationMessage,
  type WhatsAppSendResult,
  type WhatsAppTemplateComponent,
} from "@/lib/services/whatsapp";
import { formatMauritiusDateTime } from "@/lib/timezone";
import type { Json, RefundStatus } from "@/types/database.types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 40;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

function templateComponents(input: {
  customerName: string;
  salonName: string;
  startTime: string;
  bookingId: string;
  includeActions: boolean;
}): WhatsAppTemplateComponent[] {
  const body = {
      type: "body",
      parameters: [
        { type: "text", text: input.customerName },
        { type: "text", text: process.env.WHATSAPP_CONFIRMATION_TEMPLATE ? input.bookingId.slice(0, 6).toUpperCase() : input.salonName },
        { type: "text", text: formatMauritiusDateTime(input.startTime) },
      ],
    } satisfies WhatsAppTemplateComponent;
  if (!input.includeActions) return [body];
  return [body, { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `confirm:${input.bookingId}` }] }, { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `cancel:${input.bookingId}` }] }];
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return jsonError("Unauthorized", 401);
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: queued, error: queueError } = await admin
    .from("notification_queue")
    .select(
      "id, booking_id, salon_id, recipient_phone, notification_type, scheduled_for, status",
    )
    .eq("status", "queued")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  if (queueError) {
    return jsonError("Failed to load notification queue", 500, queueError.message);
  }

  const jobs = queued ?? [];
  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, customer_name, customer_phone, start_time, status, salon_id, cancellation_reason, deposit_required_mur, refund_status, refund_reference")
      .eq("id", job.booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      failed += 1;
      await admin
        .from("notification_queue")
        .update({
          status: "failed",
          error_payload: { message: "Booking not found for queued notification" } satisfies Json,
        })
        .eq("id", job.id);
      continue;
    }

    if (job.notification_type !== "cancellation" && (booking.status === "cancelled" || booking.status === "no_show")) {
      await admin
        .from("notification_queue")
        .update({
          status: "failed",
          error_payload: {
            message: "Skipped because booking is cancelled or no-show",
            bookingStatus: booking.status,
          } satisfies Json,
        })
        .eq("id", job.id);
      failed += 1;
      continue;
    }

    const { data: salon } = await admin
      .from("salons")
      .select("name, slug")
      .eq("id", job.salon_id)
      .maybeSingle();

    let result: WhatsAppSendResult;
    if (job.notification_type === "cancellation") {
      const message = formatCancellationMessage({
        customerName: booking.customer_name,
        salonName: salon?.name ?? "Salon",
        startTime: booking.start_time,
        reason: (booking as { cancellation_reason?: string | null }).cancellation_reason,
        depositAmount: (booking as { deposit_required_mur?: number }).deposit_required_mur,
        refundStatus: (booking as { refund_status?: RefundStatus }).refund_status,
        refundReference: (booking as { refund_reference?: string | null }).refund_reference,
        customerPhone: booking.customer_phone,
        salonSlug: salon?.slug,
      });
      result = await sendWhatsAppText(job.recipient_phone, message);
    } else {
      const templateName =
        NOTIFICATION_TEMPLATE_MAP[job.notification_type as keyof typeof NOTIFICATION_TEMPLATE_MAP];

      result = await sendWhatsAppTemplate(
        job.recipient_phone,
        templateName,
        templateComponents({
          customerName: booking.customer_name,
          salonName: salon?.name ?? "Salon",
          startTime: booking.start_time,
          bookingId: booking.id,
          includeActions: job.notification_type === "confirmation" ? confirmationTemplateUsesButtons() : true,
        }),
      );
    }

    if (result.ok) {
      sent += 1;
      await admin
        .from("notification_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          meta_message_id: result.messageId ?? null,
          error_payload: null,
        })
        .eq("id", job.id);
    } else {
      failed += 1;
      await admin
        .from("notification_queue")
        .update({
          status: "failed",
          error_payload: (result.error ?? { message: "Unknown WhatsApp error" }) as Json,
        })
        .eq("id", job.id);
    }
  }

  return jsonOk({
    processed: jobs.length,
    sent,
    failed,
  });
}
