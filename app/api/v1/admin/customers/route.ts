import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireSalonOwner, resolveOwnedSalonId } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;
  const salonId = resolveOwnedSalonId(auth.context, new URL(request.url).searchParams.get("salonId") ?? undefined);
  if (!salonId) return jsonError("Salon not found", 404);
  const query = new URL(request.url).searchParams.get("q")?.trim();
  const supabase = await createClient();
  let requestQuery = supabase.from("customers").select("*").eq("salon_id", salonId).order("updated_at", { ascending: false }).limit(100);
  if (query) requestQuery = requestQuery.or(`name.ilike.%${query}%,phone_normalized.ilike.%${query}%`);
  const { data, error } = await requestQuery;
  if (error) return jsonError("Failed to load customers", 500, error.message);
  return jsonOk({ customers: data ?? [] });
}
