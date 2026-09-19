import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!slug) {
    return jsonError("Missing salon slug", 400);
  }

  const supabase = createAdminClient();

  const { data: salon, error: salonError } = await supabase
    .from("salons")
    .select(
      "id, slug, name, phone, address, district, juice_phone, juice_account_name, currency, is_active, logo_url, brand_color, booking_title, cancellation_policy, timezone",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (salonError) {
    return jsonError("Failed to load salon", 500, salonError.message);
  }
  if (!salon) {
    return jsonError("Salon not found", 404);
  }

  const [servicesResult, staffResult, hoursResult] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, description, duration_minutes, price_mur, deposit_required_mur",
      )
      .eq("salon_id", salon.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("staff")
      .select("id, name")
      .eq("salon_id", salon.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("working_hours")
      .select("id, staff_id, day_of_week, start_time, end_time, is_closed")
      .eq("salon_id", salon.id)
      .order("day_of_week", { ascending: true }),
  ]);

  if (servicesResult.error || staffResult.error || hoursResult.error) {
    return jsonError("Failed to load catalog", 500);
  }

  return jsonOk({
    salon,
    services: servicesResult.data ?? [],
    staff: staffResult.data ?? [],
    workingHours: hoursResult.data ?? [],
  });
}
