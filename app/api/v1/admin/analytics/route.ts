import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireSalonOwner, resolveOwnedSalonId } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const salonId = resolveOwnedSalonId(auth.context, params.get("salonId") ?? undefined);
  if (!salonId) return jsonError("Salon not found", 404);
  const from = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = params.get("to") ?? new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").select("id, status, payment_status, service_id, start_time").eq("salon_id", salonId).gte("created_at", from).lt("created_at", to);
  if (error) return jsonError("Failed to load analytics", 500, error.message);
  const rows = data ?? [];
  return jsonOk({
    period: { from, to },
    totalBookings: rows.length,
    completedBookings: rows.filter((row) => row.status === "completed").length,
    cancelledBookings: rows.filter((row) => row.status === "cancelled").length,
    noShowBookings: rows.filter((row) => row.status === "no_show").length,
    paidBookings: rows.filter((row) => row.payment_status === "paid_in_full").length,
    serviceCounts: rows.reduce<Record<string, number>>((acc, row) => { acc[row.service_id] = (acc[row.service_id] ?? 0) + 1; return acc; }, {}),
  });
}
