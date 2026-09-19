import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireSalonOwner, resolveOwnedSalonId } from "@/lib/auth/require-owner";
import { adminBookingListQuerySchema } from "@/lib/validators/booking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const parsed = adminBookingListQuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    salonId: url.searchParams.get("salonId") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError("Invalid query parameters", 400, parsed.error.flatten());
  }

  const salonId = resolveOwnedSalonId(auth.context, parsed.data.salonId);
  if (!salonId) {
    return jsonError("Salon not found for this account", 404);
  }

  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, salon_id, staff_id, service_id, customer_name, customer_phone, start_time, end_time, status, payment_status, juice_reference, juice_proof_url, notes, created_at",
    )
    .eq("salon_id", salonId)
    .order("start_time", { ascending: true });

  if (parsed.data.from) {
    query = query.gte("start_time", parsed.data.from);
  }
  if (parsed.data.to) {
    query = query.lt("start_time", parsed.data.to);
  }
  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }

  const { data, error } = await query;
  if (error) {
    return jsonError("Failed to load bookings", 500, error.message);
  }

  return jsonOk({ bookings: data ?? [] });
}
