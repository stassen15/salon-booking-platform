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
  let staffId = body.staffId;
  if (!staffId) {
    const { data: staff } = await supabase.from("staff").select("id").eq("salon_id", salonId).eq("is_active", true).order("name").limit(1).maybeSingle();
    staffId = staff?.id;
  }
  if (!staffId) return jsonError("No active staff member found", 400);
  const duration = Math.min(Math.max(body.durationMinutes ?? 30, 15), 240);
  const start = new Date(Math.ceil(Date.now() / (15 * 60_000)) * (15 * 60_000));
  const end = addMinutes(start, duration);
  const { data, error } = await supabase.from("salon_closures").insert({ salon_id: salonId, staff_id: staffId, starts_at: start.toISOString(), ends_at: end.toISOString(), reason: "Walk-in appointment" }).select().single();
  if (error) return jsonError("Failed to block walk-in slot", 500, error.message);
  return jsonOk({ closure: data }, 201);
}
