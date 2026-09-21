import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsClient from "@/app/admin/_components/SettingsClient";

export const dynamic = "force-dynamic";

function parseServiceDescription(rawDescription: string | null) {
  if (!rawDescription) return { category: "General", description: "" };
  const match = rawDescription.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (match) {
    return { category: match[1].trim() || "General", description: match[2].trim() };
  }
  return { category: "General", description: rawDescription.trim() };
}

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/admin/login");
  }

  const { data: salon } = await supabase
    .from("salons")
    .select("*")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!salon) {
    redirect("/admin/setup");
  }

  const [staffRes, servicesRes, staffServicesRes, hoursRes, closuresRes] = await Promise.all([
    supabase.from("staff").select("*").eq("salon_id", salon.id).order("created_at", { ascending: true }),
    supabase.from("services").select("*").eq("salon_id", salon.id).order("name", { ascending: true }),
    supabase.from("staff_services").select("staff_id, service_id"),
    supabase.from("working_hours").select("*").eq("salon_id", salon.id).order("day_of_week", { ascending: true }),
    supabase
      .from("salon_closures")
      .select("*")
      .eq("salon_id", salon.id)
      .gte("ends_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  const rawStaff = staffRes.data ?? [];
  const rawServices = servicesRes.data ?? [];
  const staffServices = staffServicesRes.data ?? [];
  const workingHours = hoursRes.data ?? [];
  const closures = closuresRes.data ?? [];

  // Parse service categories and assigned staff
  const services = rawServices.map((srv) => {
    const parsed = parseServiceDescription(srv.description);
    const assignedStaffIds = staffServices
      .filter((ss) => ss.service_id === srv.id)
      .map((ss) => ss.staff_id);

    return {
      id: srv.id,
      salon_id: srv.salon_id,
      name: srv.name,
      description: srv.description,
      category: parsed.category,
      cleanDescription: parsed.description,
      duration_minutes: srv.duration_minutes,
      price_mur: srv.price_mur,
      deposit_required_mur: srv.deposit_required_mur,
      is_active: srv.is_active,
      assignedStaffIds,
    };
  });

  const staff = rawStaff.map((m, idx) => {
    const raw = m as Record<string, unknown>;
    return {
      id: m.id,
      salon_id: m.salon_id,
      name: m.name,
      phone: m.phone,
      is_active: m.is_active,
      role: typeof raw.role === "string" ? raw.role : idx === 0 ? "Owner" : "Stylist",
      chair_number: typeof raw.chair_number === "string" ? raw.chair_number : null,
    };
  });

  // Check if today is emergency paused
  const nowIso = new Date().toISOString();
  const emergencyClosure = closures.find(
    (c) =>
      c.staff_id === null &&
      c.reason?.toLowerCase().includes("emergency pause") &&
      c.starts_at <= nowIso &&
      c.ends_at >= nowIso
  );

  return (
    <SettingsClient
      initialSalon={salon}
      initialStaff={staff}
      initialServices={services}
      initialWorkingHours={workingHours}
      initialClosures={closures}
      initialIsEmergencyPaused={!!emergencyClosure}
    />
  );
}
