import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireSalonOwner, resolveOwnedSalonId } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

const ruleSchema = z.object({
  salonId: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  amountMur: z.number().min(0).max(100000),
  appliesToFirstVisit: z.boolean().default(false),
  appliesToBlacklisted: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
  isActive: z.boolean().default(true),
});

export async function GET(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;
  const salonId = resolveOwnedSalonId(auth.context, new URL(request.url).searchParams.get("salonId") ?? undefined);
  if (!salonId) return jsonError("Salon not found", 404);
  const supabase = await createClient();
  const { data, error } = await supabase.from("deposit_rules").select("*").eq("salon_id", salonId).order("priority");
  if (error) return jsonError("Failed to load deposit rules", 500, error.message);
  return jsonOk({ rules: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON body", 400); }
  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid deposit rule", 400, parsed.error.flatten());
  const salonId = resolveOwnedSalonId(auth.context, parsed.data.salonId);
  if (!salonId) return jsonError("Salon not found", 404);
  const supabase = await createClient();
  const { data, error } = await supabase.from("deposit_rules").insert({ salon_id: salonId, day_of_week: parsed.data.dayOfWeek ?? null, starts_at: parsed.data.startsAt ?? null, ends_at: parsed.data.endsAt ?? null, amount_mur: parsed.data.amountMur, applies_to_first_visit: parsed.data.appliesToFirstVisit, applies_to_blacklisted: parsed.data.appliesToBlacklisted, priority: parsed.data.priority, is_active: parsed.data.isActive }).select().single();
  if (error) return jsonError("Failed to save deposit rule", 500, error.message);
  return jsonOk({ rule: data }, 201);
}
