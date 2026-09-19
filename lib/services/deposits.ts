import { createAdminClient } from "@/lib/supabase/admin";
import { mauritiusWeekday } from "@/lib/timezone";

export type DepositQuote = {
  required: boolean;
  amountMur: number;
  reason: "none" | "first_visit" | "high_demand" | "blacklisted";
  isFirstVisit: boolean;
  trustTier: string;
  juicePhone: string | null;
  juiceAccountName: string | null;
};

function localTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Indian/Mauritius", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export async function getDepositQuote(input: { salonId: string; serviceId: string; startTime: string; customerPhone?: string }): Promise<DepositQuote> {
  const admin = createAdminClient();
  const [{ data: service, error: serviceError }, { data: salon, error: salonError }] = await Promise.all([
    admin.from("services").select("id, price_mur, deposit_required_mur").eq("id", input.serviceId).eq("salon_id", input.salonId).maybeSingle(),
    admin.from("salons").select("juice_phone, juice_account_name").eq("id", input.salonId).maybeSingle(),
  ]);
  if (serviceError) throw new Error(serviceError.message);
  if (salonError) throw new Error(salonError.message);
  if (!service) throw new Error("SERVICE_NOT_FOUND");

  const normalizedPhone = input.customerPhone?.replace(/\D/g, "") ?? "";
  let isFirstVisit = true;
  let trustTier = "new";
  if (normalizedPhone) {
    const { data: customer } = await admin.from("customers").select("id, trust_tier").eq("salon_id", input.salonId).eq("phone_normalized", normalizedPhone).maybeSingle();
    if (customer) {
      trustTier = customer.trust_tier;
      const { count } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", customer.id).not("status", "eq", "cancelled");
      isFirstVisit = (count ?? 0) === 0;
    }
  }

  const weekday = mauritiusWeekday(new Date(input.startTime).toLocaleDateString("en-CA", { timeZone: "Indian/Mauritius" }));
  const time = localTime(input.startTime);
  const { data: rules, error: rulesError } = await admin.from("deposit_rules").select("day_of_week, starts_at, ends_at, amount_mur, applies_to_first_visit, applies_to_blacklisted, priority").eq("salon_id", input.salonId).eq("is_active", true).order("priority", { ascending: true });
  if (rulesError) throw new Error(rulesError.message);

  const matchingRule = (rules ?? []).find((rule) => {
    if (rule.day_of_week !== null && rule.day_of_week !== weekday) return false;
    if (isFirstVisit && !rule.applies_to_first_visit && trustTier === "new") return false;
    if (trustTier === "blacklisted" && !rule.applies_to_blacklisted) return false;
    return (!rule.starts_at || time >= rule.starts_at.slice(0, 5)) && (!rule.ends_at || time < rule.ends_at.slice(0, 5));
  });

  if (trustTier === "blacklisted") return { required: true, amountMur: Number(service.price_mur), reason: "blacklisted", isFirstVisit, trustTier, juicePhone: salon?.juice_phone ?? null, juiceAccountName: salon?.juice_account_name ?? null };
  const amount = matchingRule ? Number(matchingRule.amount_mur) : (isFirstVisit ? Number(service.deposit_required_mur) : 0);
  const reason = matchingRule ? (isFirstVisit ? "first_visit" : "high_demand") : (isFirstVisit && amount > 0 ? "first_visit" : "none");
  return { required: amount > 0, amountMur: amount, reason, isFirstVisit, trustTier, juicePhone: salon?.juice_phone ?? null, juiceAccountName: salon?.juice_account_name ?? null };
}
