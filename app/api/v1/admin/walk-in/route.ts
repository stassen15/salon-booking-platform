import { addMinutes } from "date-fns";
import { createClient } from "@/lib/supabase/server";
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

  // Resolve staffId (use first active staff if not specified)
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

  // Resolve first active service for the walk-in
  const { data: service } = await supabase
    .from("services")
    .select("id, duration_minutes")
    .eq("salon_id", salonId)
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .maybeSingle();
  if (!service) return jsonError("No active service found", 400);

  // Snap start to next 15-minute boundary
  const duration = Math.min(Math.max(body.durationMinutes ?? 30, 15), 240);
  const start = new Date(Math.ceil(Date.now() / (15 * 60_000)) * (15 * 60_000));
  const end = addMinutes(start, duration);

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      salon_id: salonId,
      staff_id: staffId,
      service_id: service.id,
      customer_name: "Walk-in",
      customer_phone: "00000000",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
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

  if (error) return jsonError("Failed to create walk-in booking", 500, error.message);
  return jsonOk({ booking: data }, 201);
}
