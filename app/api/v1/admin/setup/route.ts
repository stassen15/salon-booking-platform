import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/http";
import { salonSetupSchema } from "@/lib/validators/booking";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data: salon, error } = await supabase.from("salons").select("*").eq("owner_id", user.id).maybeSingle();
  if (error) return jsonError("Failed to load setup", 500, error.message);
  if (!salon) return jsonOk({ salon: null, staff: [], services: [], workingHours: [] });

  const [staff, services, workingHours] = await Promise.all([
    supabase.from("staff").select("*").eq("salon_id", salon.id).order("name"),
    supabase.from("services").select("*").eq("salon_id", salon.id).order("name"),
    supabase.from("working_hours").select("*").eq("salon_id", salon.id).order("day_of_week"),
  ]);
  return jsonOk({ salon, staff: staff.data ?? [], services: services.data ?? [], workingHours: workingHours.data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON body", 400); }
  const parsed = salonSetupSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid setup payload", 400, parsed.error.flatten());
  const input = parsed.data;

  const { data: existingSalon } = await supabase.from("salons").select("id").eq("owner_id", user.id).maybeSingle();
  const salonPayload = {
    owner_id: user.id,
    name: input.salon.name,
    slug: input.salon.slug,
    phone: input.salon.phone,
    address: input.salon.address,
    district: input.salon.district,
    juice_phone: input.salon.juicePhone ?? null,
    juice_account_name: input.salon.juiceAccountName ?? null,
    logo_url: input.salon.logoUrl ?? null,
    brand_color: input.salon.brandColor,
    booking_title: input.salon.bookingTitle ?? null,
    cancellation_policy: input.salon.cancellationPolicy ?? null,
    deposit_deadline_minutes: input.salon.depositDeadlineMinutes,
    is_active: true,
  };
  const { data: salon, error: salonError } = existingSalon
    ? await supabase.from("salons").update(salonPayload).eq("id", existingSalon.id).select().single()
    : await supabase.from("salons").insert(salonPayload).select().single();
  if (salonError || !salon) return jsonError("Failed to save salon", 500, salonError?.message);

  const staffIds = new Set<string>();
  for (const item of input.staff) {
    const { data, error } = await supabase.from("staff").upsert({ id: item.id, salon_id: salon.id, name: item.name, phone: item.phone ?? null, is_active: item.isActive }, { onConflict: "id" }).select("id").single();
    if (error || !data) return jsonError("Failed to save staff", 500, error?.message);
    staffIds.add(data.id);
  }

  const serviceIds = new Set<string>();
  for (const item of input.services) {
    const { data, error } = await supabase.from("services").upsert({ id: item.id, salon_id: salon.id, name: item.name, description: item.description ?? null, duration_minutes: item.durationMinutes, price_mur: item.priceMur, deposit_required_mur: item.depositRequiredMur, is_active: item.isActive }, { onConflict: "id" }).select("id").single();
    if (error || !data) return jsonError("Failed to save service", 500, error?.message);
    serviceIds.add(data.id);
  }

  const { error: hoursDeleteError } = await supabase.from("working_hours").delete().eq("salon_id", salon.id);
  if (hoursDeleteError) return jsonError("Failed to replace working hours", 500, hoursDeleteError.message);
  if (input.workingHours.length > 0) {
    const { error } = await supabase.from("working_hours").insert(input.workingHours.map((item) => ({ salon_id: salon.id, staff_id: item.staffId ?? null, day_of_week: item.dayOfWeek, start_time: item.startTime, end_time: item.endTime, is_closed: item.isClosed })));
    if (error) return jsonError("Failed to save working hours", 500, error.message);
  }

  return jsonOk({ salon, staffSaved: staffIds.size, servicesSaved: serviceIds.size }, 201);
}
