import { addMinutes } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk, isPostgresError } from "@/lib/http";
import { getAvailableSlots } from "@/lib/services/slots";
import { bookingCreateInputSchema } from "@/lib/validators/booking";
import { MAURITIUS_TIMEZONE } from "@/lib/timezone";
import { getDepositQuote } from "@/lib/services/deposits";
import { createBookingActionToken } from "@/lib/services/booking-actions";

export const dynamic = "force-dynamic";

const EXCLUSION_VIOLATION = "23P01";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = bookingCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid booking payload", 400, parsed.error.flatten());
  }

  const input = parsed.data;
  const admin = createAdminClient();

  const { data: salon, error: salonError } = await admin
    .from("salons")
    .select("id, slug, is_active, deposit_deadline_minutes")
    .eq("slug", input.slug)
    .eq("is_active", true)
    .maybeSingle();

  if (salonError) {
    return jsonError("Failed to load salon", 500, salonError.message);
  }
  if (!salon) {
    return jsonError("Salon not found", 404);
  }

  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, duration_minutes, deposit_required_mur, is_active, salon_id")
    .eq("id", input.serviceId)
    .eq("salon_id", salon.id)
    .eq("is_active", true)
    .maybeSingle();

  if (serviceError) {
    return jsonError("Failed to load service", 500, serviceError.message);
  }
  if (!service) {
    return jsonError("Service not found", 404);
  }

  const { data: staff, error: staffError } = await admin
    .from("staff")
    .select("id, is_active, salon_id")
    .eq("id", input.staffId)
    .eq("salon_id", salon.id)
    .eq("is_active", true)
    .maybeSingle();

  if (staffError) {
    return jsonError("Failed to load staff", 500, staffError.message);
  }
  if (!staff) {
    return jsonError("Staff member not found", 404);
  }

  const start = new Date(input.startTime);
  if (Number.isNaN(start.getTime())) {
    return jsonError("Invalid startTime", 400);
  }
  if (start.getTime() <= Date.now()) {
    return jsonError("Start time must be in the future", 400);
  }

  const end = addMinutes(start, service.duration_minutes);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: MAURITIUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);

  try {
    const availability = await getAvailableSlots({
      salonId: salon.id,
      serviceId: service.id,
      staffId: staff.id,
      date,
      timezone: MAURITIUS_TIMEZONE,
    });
    const staffSlots = availability.results.find((row) => row.staffId === staff.id);
    const stillOpen = staffSlots?.slots.some((slot) => slot.start === start.toISOString());
    if (!stillOpen) {
      return jsonError("This slot is not available. Please pick another time.", 409);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify slot";
    return jsonError(message, 500);
  }

  const supabase = await createClient();
  const depositQuote = await getDepositQuote({ salonId: salon.id, serviceId: service.id, startTime: start.toISOString(), customerPhone: input.customerPhone });
  if (depositQuote.required && !input.juiceReference) {
    return jsonError(`A MCB Juice deposit of Rs ${depositQuote.amountMur} is required for this appointment.`, 400, depositQuote);
  }
  const normalizedPhone = input.customerPhone.replace(/\D/g, "");
  const { data: customer, error: customerError } = await admin
    .from("customers")
    .upsert({
      salon_id: salon.id,
      name: input.customerName,
      phone: input.customerPhone,
      phone_normalized: normalizedPhone,
    }, { onConflict: "salon_id,phone_normalized" })
    .select("id")
    .single();
  if (customerError || !customer) return jsonError("Failed to save customer", 500, customerError?.message);

  const depositSubmitted = depositQuote.required && Boolean(input.juiceReference);
  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      salon_id: salon.id,
      staff_id: staff.id,
      service_id: service.id,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_id: customer.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "pending",
      payment_status: depositSubmitted ? "deposit_submitted" : "unpaid",
      deposit_required_mur: depositQuote.amountMur,
      juice_reference: input.juiceReference ?? null,
      expires_at: depositQuote.required ? new Date(Date.now() + salon.deposit_deadline_minutes * 60_000).toISOString() : null,
      notes: input.notes ?? null,
    })
    .select(
      "id, salon_id, staff_id, service_id, customer_name, customer_phone, start_time, end_time, status, payment_status, created_at",
    )
    .single();

  if (insertError) {
    if (
      insertError.code === EXCLUSION_VIOLATION ||
      (isPostgresError(insertError) && insertError.code === EXCLUSION_VIOLATION)
    ) {
      return jsonError("This slot was just taken. Please pick another time.", 409);
    }
    return jsonError("Failed to create booking", 500, insertError.message);
  }

  return jsonOk({ booking, cancellationToken: createBookingActionToken(booking.id) }, 201);
}
