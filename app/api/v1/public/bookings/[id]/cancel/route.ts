import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { verifyBookingActionToken } from "@/lib/services/booking-actions";
import { sendWhatsAppText } from "@/lib/services/whatsapp";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  let body: { token?: string; reason?: string };
  try { body = (await request.json()) as { token?: string; reason?: string }; } catch { return jsonError("Invalid JSON body", 400); }
  if (!body.token || !verifyBookingActionToken(id, body.token)) return jsonError("Invalid cancellation link", 401);
  const admin = createAdminClient();
  const { data: booking, error: bookingError } = await admin.from("bookings").select("id, customer_name, start_time, status, staff_id, salon_id").eq("id", id).maybeSingle();
  if (bookingError) return jsonError("Failed to load booking", 500, bookingError.message);
  if (!booking) return jsonError("Booking not found", 404);
  if (["cancelled", "completed", "no_show"].includes(booking.status)) return jsonError("This booking can no longer be cancelled", 409);
  const { data: updated, error } = await admin.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "customer", cancellation_reason: body.reason ?? "Customer cancelled" }).eq("id", id).select("id, status, cancelled_at").single();
  if (error) return jsonError("Failed to cancel booking", 500, error.message);
  const { data: staff } = await admin.from("staff").select("phone").eq("id", booking.staff_id).maybeSingle();
  if (staff?.phone) await sendWhatsAppText(staff.phone, `Booking cancelled: ${booking.customer_name} at ${new Date(booking.start_time).toLocaleString("en-MU", { timeZone: "Indian/Mauritius" })}. The slot is available again.`);
  return jsonOk({ booking: updated });
}
