import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "@/app/admin/_components/DashboardClient";
import type { AdminBooking, ServiceInfo, StaffInfo } from "@/app/admin/_components/DashboardClient";

export const dynamic = "force-dynamic";

/** Returns start-of-day and start-of-next-day ISO strings in Mauritius time (UTC+4). */
function getMauritiusTodayRange(): { from: string; to: string; todayStr: string } {
  const MU_OFFSET = "+04:00";
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Mauritius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const from = new Date(todayStr + "T00:00:00" + MU_OFFSET).toISOString();

  const [y, m, d] = todayStr.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const to = new Date(nextDay + "T00:00:00" + MU_OFFSET).toISOString();

  return { from, to, todayStr };
}

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: salon } = await supabase
    .from("salons")
    .select("id")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!salon) redirect("/admin/setup");

  const { from, to, todayStr } = getMauritiusTodayRange();

  const [bookingsRes, servicesRes, staffRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, salon_id, staff_id, service_id, customer_name, customer_phone, " +
          "start_time, end_time, status, payment_status, juice_reference, notes, created_at",
      )
      .eq("salon_id", salon.id)
      .gte("start_time", from)
      .lt("start_time", to)
      .order("start_time", { ascending: true }),

    supabase
      .from("services")
      .select("id, name, price_mur, deposit_required_mur, duration_minutes")
      .eq("salon_id", salon.id)
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("staff")
      .select("id, name")
      .eq("salon_id", salon.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <DashboardClient
      initialBookings={(bookingsRes.data ?? []) as unknown as AdminBooking[]}
      services={(servicesRes.data ?? []) as unknown as ServiceInfo[]}
      staff={(staffRes.data ?? []) as unknown as StaffInfo[]}
      todayStr={todayStr}
    />
  );
}
