import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import type { Json } from "@/types/database.types";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendWhatsAppText } from "@/lib/services/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WhatsAppStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

type WhatsAppChangeValue = {
  statuses?: WhatsAppStatus[];
  messages?: Array<{ from?: string; type?: string; interactive?: { type?: string; button_reply?: { id?: string; title?: string } }; button?: { payload?: string; text?: string } }>;
};

type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: WhatsAppChangeValue;
    }>;
  }>;
};

function validSignature(body: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return jsonError("Webhook verification failed", 403);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"))) return jsonError("Invalid webhook signature", 401);
  let body: WhatsAppWebhookBody;
  try {
    body = JSON.parse(rawBody) as WhatsAppWebhookBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (body.object !== "whatsapp_business_account") {
    return jsonOk({ received: true });
  }

  const statuses: WhatsAppStatus[] = [];
  const incomingActions: Array<{ from: string; payload: string }> = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        statuses.push(status);
      }
      for (const message of change.value?.messages ?? []) {
        const payload = message.interactive?.button_reply?.id ?? message.button?.payload;
        if (message.from && payload) incomingActions.push({ from: message.from, payload });
      }
    }
  }

  if (statuses.length === 0) {
    return jsonOk({ received: true, updated: 0 });
  }

  const admin = createAdminClient();
  let updated = 0;

  for (const action of incomingActions) {
    const [command, bookingId] = action.payload.split(":");
    if (!bookingId || !["confirm", "cancel"].includes(command)) continue;
    const { data: booking } = await admin.from("bookings").select("id, status, customer_name, start_time, staff_id").eq("id", bookingId).maybeSingle();
    if (!booking || ["cancelled", "completed", "no_show"].includes(booking.status)) continue;
    const nextStatus = command === "cancel" ? "cancelled" : "confirmed";
    const { error } = await admin.from("bookings").update({ status: nextStatus, cancelled_at: command === "cancel" ? new Date().toISOString() : null, cancelled_by: command === "cancel" ? "customer_whatsapp" : null, cancellation_reason: command === "cancel" ? "Customer cancelled via WhatsApp" : null }).eq("id", bookingId);
    if (!error) {
      updated += 1;
      await sendWhatsAppText(action.from, command === "cancel" ? "Your appointment has been cancelled and the slot is available again." : "Your appointment is confirmed. See you soon!");
      if (command === "cancel") {
        const { data: staff } = await admin.from("staff").select("phone").eq("id", booking.staff_id).maybeSingle();
        if (staff?.phone) await sendWhatsAppText(staff.phone, `Booking cancelled by ${booking.customer_name}; the slot is available again.`);
      }
    }
  }

  for (const status of statuses) {
    if (!status.id) {
      continue;
    }

    const payload: Json = {
      receiptStatus: status.status ?? null,
      timestamp: status.timestamp ?? null,
      errors: status.errors ?? null,
    };

    const nextStatus =
      status.status === "failed" || (status.errors && status.errors.length > 0)
        ? "failed"
        : "sent";

    const { error } = await admin
      .from("notification_queue")
      .update({
        status: nextStatus,
        error_payload: payload,
        ...(nextStatus === "sent" ? { meta_message_id: status.id } : {}),
      })
      .eq("meta_message_id", status.id);

    if (!error) {
      updated += 1;
    }
  }

  return jsonOk({ received: true, updated });
}
