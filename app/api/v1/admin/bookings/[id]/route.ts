import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { requireSalonOwner } from "@/lib/auth/require-owner";
import { bookingAdminPatchSchema } from "@/lib/validators/booking";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalonOwner();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  if (!id) {
    return jsonError("Missing booking id", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = bookingAdminPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid update payload", 400, parsed.error.flatten());
  }

  const salonIds = auth.context.salons.map((salon) => salon.id);
  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("bookings")
    .select("id, salon_id, customer_name, customer_phone, start_time, status, payment_status")
    .eq("id", id)
    .in("salon_id", salonIds)
    .maybeSingle();

  if (loadError) {
    return jsonError("Failed to load booking", 500, loadError.message);
  }
  if (!existing) {
    return jsonError("Booking not found", 404);
  }

  const patch: {
    status?: "confirmed" | "cancelled" | "no_show" | "completed";
    payment_status?: "unpaid" | "deposit_submitted" | "paid_in_full";
    juice_reference?: string;
    juice_proof_url?: string | null;
    notes?: string | null;
    cancellation_reason?: string | null;
    cancelled_at?: string | null;
    cancelled_by?: string | null;
    refund_status?: "not_required" | "pending" | "refunded" | "not_possible";
    refund_reference?: string | null;
    refund_requested_at?: string | null;
    refunded_at?: string | null;
  } = {};

  if (parsed.data.status) {
    patch.status = parsed.data.status;
  }
  if (parsed.data.paymentStatus) {
    patch.payment_status = parsed.data.paymentStatus;
  }
  if (parsed.data.juiceReference) {
    patch.juice_reference = parsed.data.juiceReference;
  }
  if (parsed.data.juiceProofUrl !== undefined) {
    patch.juice_proof_url = parsed.data.juiceProofUrl;
  }
  if (parsed.data.notes !== undefined) {
    patch.notes = parsed.data.notes;
  }
  if (parsed.data.cancellationReason !== undefined) {
    patch.cancellation_reason = parsed.data.cancellationReason;
  }
  if (parsed.data.refundStatus) {
    patch.refund_status = parsed.data.refundStatus;
    patch.refund_reference = parsed.data.refundReference ?? null;
    patch.refunded_at = parsed.data.refundStatus === "refunded" ? new Date().toISOString() : null;
  }
  if (parsed.data.status === "cancelled" && existing.status !== "cancelled") {
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_by = auth.context.userId;
    if (!patch.refund_status && existing.payment_status !== "unpaid") {
      patch.refund_status = "pending";
      patch.refund_requested_at = new Date().toISOString();
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", id)
    .select(
      "id, salon_id, staff_id, service_id, customer_name, customer_phone, start_time, end_time, status, payment_status, juice_reference, juice_proof_url, notes, cancellation_reason, cancelled_at, cancelled_by, refund_status, refund_reference, refund_requested_at, refunded_at, created_at",
    )
    .single();

  if (updateError) {
    return jsonError("Failed to update booking", 500, updateError.message);
  }

  if (parsed.data.status === "cancelled" && existing.status !== "cancelled") {
    const admin = createAdminClient();
    await admin.from("notification_queue").insert({
      booking_id: id,
      salon_id: existing.salon_id,
      recipient_phone: existing.customer_phone,
      notification_type: "cancellation",
      scheduled_for: new Date().toISOString(),
      status: "queued",
    });
  }

  return jsonOk({ booking: updated });
}
