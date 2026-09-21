import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireSalonOwner, resolveOwnedSalonId } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

// Helper to extract category and description
function parseServiceDescription(rawDescription: string | null) {
  if (!rawDescription) return { category: "General", description: "" };
  const match = rawDescription.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (match) {
    return { category: match[1].trim() || "General", description: match[2].trim() };
  }
  return { category: "General", description: rawDescription.trim() };
}

function formatServiceDescription(category: string, description?: string | null) {
  const cleanCat = category.trim() || "General";
  const cleanDesc = (description || "").trim();
  return cleanDesc ? `[${cleanCat}] ${cleanDesc}` : `[${cleanCat}]`;
}

export async function GET(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const salonId = resolveOwnedSalonId(auth.context, url.searchParams.get("salonId") ?? undefined);
  if (!salonId) return jsonError("Salon not found", 404);

  const supabase = await createClient();

  const [salonRes, staffRes, servicesRes, staffServicesRes, hoursRes, closuresRes] = await Promise.all([
    supabase.from("salons").select("*").eq("id", salonId).single(),
    supabase.from("staff").select("*").eq("salon_id", salonId).order("created_at", { ascending: true }),
    supabase.from("services").select("*").eq("salon_id", salonId).order("name", { ascending: true }),
    supabase.from("staff_services").select("staff_id, service_id"),
    supabase.from("working_hours").select("*").eq("salon_id", salonId).order("day_of_week", { ascending: true }),
    supabase
      .from("salon_closures")
      .select("*")
      .eq("salon_id", salonId)
      .gte("ends_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  if (salonRes.error) {
    return jsonError("Failed to load salon details", 500, salonRes.error.message);
  }

  const salon = salonRes.data;
  const staff = staffRes.data ?? [];
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
      ...srv,
      category: parsed.category,
      cleanDescription: parsed.description,
      assignedStaffIds,
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

  return jsonOk({
    salon,
    staff,
    services,
    staffServices,
    workingHours,
    closures,
    isEmergencyPaused: !!emergencyClosure,
    emergencyClosureId: emergencyClosure?.id ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireSalonOwner();
  if (!auth.ok) return auth.response;

  let body: {
    action: string;
    payload: Record<string, unknown>;
    salonId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { action, payload, salonId: requestedSalonId } = body;
  const salonId = resolveOwnedSalonId(auth.context, requestedSalonId);
  if (!salonId) return jsonError("Salon not found", 404);

  const supabase = await createClient();

  switch (action) {
    case "update_salon": {
      const { name, slug, phone, address, district, brand_color, booking_title } = payload as {
        name?: string;
        slug?: string;
        phone?: string;
        address?: string;
        district?: string;
        brand_color?: string;
        booking_title?: string;
      };
      const { data, error } = await supabase
        .from("salons")
        .update({
          name: name?.trim(),
          slug: slug?.trim()?.toLowerCase(),
          phone: phone?.trim(),
          address: address?.trim(),
          district: district?.trim(),
          brand_color: brand_color || "#18181b",
          booking_title: booking_title?.trim() || null,
        })
        .eq("id", salonId)
        .select()
        .single();

      if (error) return jsonError("Failed to update salon profile", 400, error.message);
      return jsonOk({ salon: data });
    }

    case "update_juice": {
      const { juice_phone, juice_account_name, cancellation_policy, deposit_deadline_minutes } = payload as {
        juice_phone?: string;
        juice_account_name?: string;
        cancellation_policy?: string;
        deposit_deadline_minutes?: number;
      };
      const { data, error } = await supabase
        .from("salons")
        .update({
          juice_phone: juice_phone?.trim() || null,
          juice_account_name: juice_account_name?.trim() || null,
          cancellation_policy: cancellation_policy?.trim() || null,
          deposit_deadline_minutes: deposit_deadline_minutes ?? 30,
        })
        .eq("id", salonId)
        .select()
        .single();

      if (error) return jsonError("Failed to update MCB Juice settings", 400, error.message);
      return jsonOk({ salon: data });
    }

    case "save_service": {
      const { id, name, category, description, duration_minutes, price_mur, deposit_required_mur, is_active, assignedStaffIds } = payload as {
        id?: string;
        name: string;
        category?: string;
        description?: string;
        duration_minutes: number;
        price_mur: number;
        deposit_required_mur?: number;
        is_active?: boolean;
        assignedStaffIds?: string[];
      };
      const fullDescription = formatServiceDescription(category || "General", description);

      const serviceData = {
        salon_id: salonId,
        name: name.trim(),
        description: fullDescription,
        duration_minutes: Number(duration_minutes),
        price_mur: Number(price_mur),
        deposit_required_mur: Number(deposit_required_mur || 0),
        is_active: is_active ?? true,
      };

      let savedServiceId = id;
      if (id) {
        const { error } = await supabase.from("services").update(serviceData).eq("id", id).eq("salon_id", salonId);
        if (error) return jsonError("Failed to update service", 400, error.message);
      } else {
        const { data, error } = await supabase.from("services").insert(serviceData).select("id").single();
        if (error || !data) return jsonError("Failed to create service", 400, error?.message);
        savedServiceId = data.id;
      }

      if (!savedServiceId) return jsonError("Failed to determine service ID", 500);
      const serviceIdStr = savedServiceId;

      // Sync staff assignments
      if (Array.isArray(assignedStaffIds)) {
        await supabase.from("staff_services").delete().eq("service_id", serviceIdStr);
        if (assignedStaffIds.length > 0) {
          const insertPayload = assignedStaffIds.map((staffId: string) => ({
            service_id: serviceIdStr,
            staff_id: staffId,
          }));
          await supabase.from("staff_services").insert(insertPayload);
        }
      }

      return jsonOk({ success: true, serviceId: serviceIdStr });
    }

    case "delete_service": {
      const { serviceId } = payload as { serviceId?: string };
      if (!serviceId) return jsonError("Service ID required", 400);

      const { error } = await supabase
        .from("services")
        .update({ is_active: false })
        .eq("id", serviceId)
        .eq("salon_id", salonId);

      if (error) return jsonError("Failed to deactivate service", 400, error.message);
      return jsonOk({ success: true });
    }

    case "save_staff": {
      const { id, name, phone, is_active, assignedServiceIds, workingDays } = payload as {
        id?: string;
        name: string;
        phone?: string;
        is_active?: boolean;
        assignedServiceIds?: string[];
        workingDays?: unknown[];
      };
      const staffData = {
        salon_id: salonId,
        name: name.trim(),
        phone: phone?.trim() || null,
        is_active: is_active ?? true,
      };

      let savedStaffId = id;
      if (id) {
        const { error } = await supabase.from("staff").update(staffData).eq("id", id).eq("salon_id", salonId);
        if (error) return jsonError("Failed to update staff member", 400, error.message);
      } else {
        const { data, error } = await supabase.from("staff").insert(staffData).select("id").single();
        if (error || !data) return jsonError("Failed to create staff member", 400, error?.message);
        savedStaffId = data.id;
      }

      if (!savedStaffId) return jsonError("Failed to determine staff ID", 500);
      const staffIdStr = savedStaffId;

      // Sync service assignments
      if (Array.isArray(assignedServiceIds)) {
        await supabase.from("staff_services").delete().eq("staff_id", staffIdStr);
        if (assignedServiceIds.length > 0) {
          const insertPayload = assignedServiceIds.map((srvId: string) => ({
            staff_id: staffIdStr,
            service_id: srvId,
          }));
          await supabase.from("staff_services").insert(insertPayload);
        }
      }

      // Sync working days if provided
      if (Array.isArray(workingDays)) {
        await supabase.from("working_hours").delete().eq("salon_id", salonId).eq("staff_id", staffIdStr);
        const shiftHours = (
          workingDays as {
            dayOfWeek: number;
            startTime?: string;
            endTime?: string;
            isClosed?: boolean;
          }[]
        ).map((wd) => ({
          salon_id: salonId,
          staff_id: staffIdStr,
          day_of_week: wd.dayOfWeek,
          start_time: wd.startTime || "09:00",
          end_time: wd.endTime || "18:00",
          is_closed: !!wd.isClosed,
        }));
        if (shiftHours.length > 0) {
          await supabase.from("working_hours").insert(shiftHours);
        }
      }

      return jsonOk({ success: true, staffId: staffIdStr });
    }

    case "toggle_staff_active": {
      const { staffId, isActive } = payload as { staffId?: string; isActive?: boolean };
      if (!staffId) return jsonError("Staff ID required", 400);

      const { error } = await supabase
        .from("staff")
        .update({ is_active: !!isActive })
        .eq("id", staffId)
        .eq("salon_id", salonId);

      if (error) return jsonError("Failed to update staff status", 400, error.message);
      return jsonOk({ success: true });
    }

    case "save_hours": {
      const { hours, breakWindow } = payload as {
        hours?: { dayOfWeek: number; startTime: string; endTime: string; isClosed: boolean }[];
        breakWindow?: { enabled?: boolean; startTime?: string; endTime?: string };
      };
      if (!Array.isArray(hours)) return jsonError("Hours array required", 400);

      // Replace default salon working hours
      await supabase.from("working_hours").delete().eq("salon_id", salonId).is("staff_id", null);

      type InsertHour = {
        salon_id: string;
        staff_id: string | null;
        day_of_week: number;
        start_time: string;
        end_time: string;
        is_closed: boolean;
      };
      const hoursToInsert: InsertHour[] = [];
      for (const h of hours) {
        if (h.isClosed) {
          hoursToInsert.push({
            salon_id: salonId,
            staff_id: null,
            day_of_week: h.dayOfWeek,
            start_time: "09:00",
            end_time: "18:00",
            is_closed: true,
          });
        } else if (breakWindow?.enabled && breakWindow.startTime && breakWindow.endTime) {
          // If break falls inside operating window, split into two windows
          if (h.startTime < breakWindow.startTime && breakWindow.endTime < h.endTime) {
            hoursToInsert.push({
              salon_id: salonId,
              staff_id: null,
              day_of_week: h.dayOfWeek,
              start_time: h.startTime,
              end_time: breakWindow.startTime,
              is_closed: false,
            });
            hoursToInsert.push({
              salon_id: salonId,
              staff_id: null,
              day_of_week: h.dayOfWeek,
              start_time: breakWindow.endTime,
              end_time: h.endTime,
              is_closed: false,
            });
          } else {
            hoursToInsert.push({
              salon_id: salonId,
              staff_id: null,
              day_of_week: h.dayOfWeek,
              start_time: h.startTime,
              end_time: h.endTime,
              is_closed: false,
            });
          }
        } else {
          hoursToInsert.push({
            salon_id: salonId,
            staff_id: null,
            day_of_week: h.dayOfWeek,
            start_time: h.startTime,
            end_time: h.endTime,
            is_closed: false,
          });
        }
      }

      const { error } = await supabase.from("working_hours").insert(hoursToInsert);
      if (error) return jsonError("Failed to save working hours", 400, error.message);

      return jsonOk({ success: true });
    }

    case "toggle_emergency_pause": {
      const { pause } = payload as { pause?: boolean };
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      if (pause) {
        const { error } = await supabase.from("salon_closures").insert({
          salon_id: salonId,
          staff_id: null,
          starts_at: now.toISOString(),
          ends_at: endOfDay.toISOString(),
          reason: "Emergency Pause: New bookings paused for today",
        });
        if (error) return jsonError("Failed to pause bookings", 400, error.message);
        return jsonOk({ success: true, paused: true });
      } else {
        // Remove active emergency closures
        await supabase
          .from("salon_closures")
          .delete()
          .eq("salon_id", salonId)
          .is("staff_id", null)
          .ilike("reason", "%Emergency Pause%");
        return jsonOk({ success: true, paused: false });
      }
    }

    case "add_closure": {
      const { startsAt, endsAt, reason } = payload as {
        startsAt?: string;
        endsAt?: string;
        reason?: string;
      };
      if (!startsAt || !endsAt) return jsonError("Start and end date required", 400);

      const { data, error } = await supabase
        .from("salon_closures")
        .insert({
          salon_id: salonId,
          staff_id: null,
          starts_at: startsAt,
          ends_at: endsAt,
          reason: reason?.trim() || "Special Closure",
        })
        .select()
        .single();

      if (error) return jsonError("Failed to add closure", 400, error.message);
      return jsonOk({ closure: data }, 201);
    }

    case "delete_closure": {
      const { closureId } = payload as { closureId?: string };
      if (!closureId) return jsonError("Closure ID required", 400);

      const { error } = await supabase
        .from("salon_closures")
        .delete()
        .eq("id", closureId)
        .eq("salon_id", salonId);

      if (error) return jsonError("Failed to delete closure", 400, error.message);
      return jsonOk({ success: true });
    }

    default:
      return jsonError("Unknown action", 400);
  }
}
