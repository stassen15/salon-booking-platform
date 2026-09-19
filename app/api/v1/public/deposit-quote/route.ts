import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { getDepositQuote } from "@/lib/services/deposits";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug");
  const serviceId = params.get("serviceId");
  const startTime = params.get("startTime");
  if (!slug || !serviceId || !startTime) return jsonError("slug, serviceId, and startTime are required", 400);
  const admin = createAdminClient();
  const { data: salon, error } = await admin.from("salons").select("id").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (error) return jsonError("Failed to load salon", 500, error.message);
  if (!salon) return jsonError("Salon not found", 404);
  try { return jsonOk(await getDepositQuote({ salonId: salon.id, serviceId, startTime, customerPhone: params.get("customerPhone") ?? undefined })); }
  catch (error) { return jsonError(error instanceof Error && error.message === "SERVICE_NOT_FOUND" ? "Service not found" : "Failed to calculate deposit", error instanceof Error && error.message === "SERVICE_NOT_FOUND" ? 404 : 500); }
}
