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

  // Fetch today's bookings for this staff to check conflicts
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = addMinutes(windowStart, 24 * 60);

  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("start_time, end_time, status")
    .eq("salon_id", salonId)
    .eq("staff_id", staffId)
    .not("status", "in", '("cancelled","no_show")')
    .gte("start_time", windowStart.toISOString())
    .lte("start_time", windowEnd.toISOString());

  const occupied = (existingBookings ?? []).map((b) => ({
    start: new Date(b.start_time).getTime(),
    end: new Date(b.end_time).getTime(),
  }));

  // Find next free 15-minute-aligned slot starting from now
  let candidateStart = new Date(
    Math.ceil(Date.now() / (15 * 60_000)) * (15 * 60_000)
  );
  let candidateEnd = addMinutes(candidateStart, duration);
  const searchLimit = addMinutes(new Date(), 4 * 60); // search up to 4h ahead

  let found = false;
  while (candidateStart <= searchLimit) {
    const cs = candidateStart.getTime();
    const ce = candidateEnd.getTime();
    const conflicts = occupied.some((o) => cs < o.end && ce > o.start);
    if (!conflicts) {
      found = true;
      break;
    }
    // Advance by 15 minutes and try again
    candidateStart = addMinutes(candidateStart, 15);
    candidateEnd = addMinutes(candidateStart, duration);
  }

  if (!found) {
    return jsonError("No free slot available in the next 4 hours", 409);
  }

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
