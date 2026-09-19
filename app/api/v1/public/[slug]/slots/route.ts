import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { getAvailableSlots } from "@/lib/services/slots";
import { slotQueryInputSchema } from "@/lib/validators/booking";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const parsed = slotQueryInputSchema.safeParse({
    serviceId: url.searchParams.get("serviceId") ?? undefined,
    staffId: url.searchParams.get("staffId") || undefined,
    date: url.searchParams.get("date") ?? undefined,
    timezone: url.searchParams.get("timezone") || undefined,
  });

  if (!parsed.success) {
    return jsonError("Invalid query parameters", 400, parsed.error.flatten());
  }

  const supabase = createAdminClient();
  const { data: salon, error: salonError } = await supabase
    .from("salons")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (salonError) {
    return jsonError("Failed to load salon", 500, salonError.message);
  }
  if (!salon) {
    return jsonError("Salon not found", 404);
  }

  try {
    const slots = await getAvailableSlots({
      ...parsed.data,
      salonId: salon.id,
    });
    return jsonOk(slots);
  } catch (error) {
    if (error instanceof Error && error.message === "SERVICE_NOT_FOUND") {
      return jsonError("Service not found for this salon", 404);
    }
    const message = error instanceof Error ? error.message : "Slot calculation failed";
    return jsonError(message, 500);
  }
}
