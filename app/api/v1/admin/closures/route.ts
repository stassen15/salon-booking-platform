import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/http";
import { closureSchema } from "@/lib/validators/booking";
import { requireSalonOwner, resolveOwnedSalonId } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;
  const salonId = resolveOwnedSalonId(auth.context, new URL(request.url).searchParams.get("salonId") ?? undefined);
  if (!salonId) return jsonError("Salon not found", 404);
  const supabase = await createClient();
  const { data, error } = await supabase.from("salon_closures").select("*").eq("salon_id", salonId).gte("ends_at", new Date().toISOString()).order("starts_at");
  if (error) return jsonError("Failed to load closures", 500, error.message);
  return jsonOk({ closures: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON body", 400); }
  const parsed = closureSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid closure", 400, parsed.error.flatten());
  const salonId = resolveOwnedSalonId(auth.context, parsed.data.salonId);
  if (!salonId) return jsonError("Salon not found", 404);
  const supabase = await createClient();
  const { data, error } = await supabase.from("salon_closures").insert({ salon_id: salonId, staff_id: parsed.data.staffId ?? null, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, reason: parsed.data.reason ?? null }).select().single();
  if (error) return jsonError("Failed to create closure", 500, error.message);
  return jsonOk({ closure: data }, 201);
}
