import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import {
  NOTIFICATION_TEMPLATE_MAP,
  sendWhatsAppTemplate,
  type WhatsAppTemplateComponent,
} from "@/lib/services/whatsapp";
import { formatMauritiusDateTime } from "@/lib/timezone";
import type { Json, NotificationType } from "@/types/database.types";

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
}): WhatsAppTemplateComponent[] {
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: input.customerName },
        { type: "text", text: input.salonName },
        { type: "text", text: formatMauritiusDateTime(input.startTime) },
      ],
    },
    { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `confirm:${input.bookingId}` }] },
    { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `cancel:${input.bookingId}` }] },
  ];
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
      .select("id, customer_name, start_time, status, salon_id")
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

    if (booking.status === "cancelled" || booking.status === "no_show") {
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
      .select("name")
      .eq("id", job.salon_id)
      .maybeSingle();

    const templateName =
      NOTIFICATION_TEMPLATE_MAP[job.notification_type as NotificationType];

    const result = await sendWhatsAppTemplate(
      job.recipient_phone,
      templateName,
      templateComponents({
        customerName: booking.customer_name,
        salonName: salon?.name ?? "Salon",
        startTime: booking.start_time,
        bookingId: booking.id,
      }),
    );

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
