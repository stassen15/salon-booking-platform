import { addMinutes } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { requireSalonOwner, resolveOwnedSalonId } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;

  let body: { salonId?: string; staffId?: string; durationMinutes?: number } = {};
  try { body = (await request.json()) as typeof body; } catch { /* defaults */ }

  const salonId = resolveOwnedSalonId(auth.context, body.salonId);
  if (!salonId) return jsonError("Salon not found", 404);

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // Resolve staffId
  let staffId = body.staffId;
  if (!staffId) {
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .maybeSingle();
    staffId = staff?.id;
  }
  if (!staffId) return jsonError("No active staff member found", 400);

  // Resolve first active service
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_minutes")
    .eq("salon_id", salonId)
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .maybeSingle();
  if (!service) return jsonError("No active service found", 400);

  const duration = Math.min(Math.max(body.durationMinutes ?? 30, 15), 240);

  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Check if an appointment is currently active right now
  const { data: activeBookings } = await supabase
    .from("bookings")
    .select("id, start_time, end_time, status")
    .eq("salon_id", salonId)
    .eq("staff_id", staffId)
    .eq("status", "confirmed")
    .lte("start_time", nowIso)
    .gt("end_time", nowIso)
    .order("end_time", { ascending: false })
    .limit(1);

  const activeAppointment = activeBookings?.[0];

  let candidateStart: Date;
  if (activeAppointment) {
    // An appointment is currently active right now:
    // Set the walk-in start_time to the active appointment's end_time (holds the chair for when client finishes)
    candidateStart = new Date(activeAppointment.end_time);
  } else {
    // No appointment is currently active (chair is empty right now):
    // Snap the walk-in start_time to current minute rounded to nearest 5 minutes (e.g., 13:24 becomes 13:25)
    const FIVE_MIN_MS = 5 * 60_000;
    const roundedMs = Math.round(now.getTime() / FIVE_MIN_MS) * FIVE_MIN_MS;
    candidateStart = new Date(roundedMs);
  }

  const candidateEnd = addMinutes(candidateStart, duration);

  const { data, error } = await adminSupabase
    .from("bookings")
    .insert({
      salon_id: salonId,
      staff_id: staffId,
      service_id: service.id,
      customer_name: "Walk-in / Counter Hold",
      customer_phone: "00000000",
      start_time: candidateStart.toISOString(),
      end_time: candidateEnd.toISOString(),
      status: "confirmed",
      payment_status: "unpaid",
    })
    .select(
      "id, salon_id, staff_id, service_id, customer_name, customer_phone, " +
      "start_time, end_time, status, payment_status, juice_reference, notes, " +
      "deposit_required_mur, cancellation_reason, cancelled_at, cancelled_by, " +
      "refund_status, refund_reference, refund_requested_at, refunded_at, created_at"
    )
    .single();

  if (error) {
    console.error("[walk-in] insert error:", error);
    return jsonError("Failed to create walk-in booking", 500, error.message);
  }
  return jsonOk({ booking: data }, 201);
}
