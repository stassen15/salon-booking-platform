import { addMinutes, areIntervalsOverlapping } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAURITIUS_TIMEZONE,
  mauritiusDateTimeToUtc,
  mauritiusDayBounds,
  mauritiusWeekday,
} from "@/lib/timezone";
import type { SlotQueryInput } from "@/lib/validators/booking";
import type { Staff, WorkingHour } from "@/types/database.types";

const SLOT_STEP_MINUTES = 15;
const BLOCKING_STATUSES = ["pending", "confirmed", "completed"] as const;

export type AvailableSlot = {
  start: string;
  end: string;
};

export type StaffSlotResult = {
  staffId: string;
  staffName: string;
  slots: AvailableSlot[];
};

export type SlotAvailabilityResult = {
  salonId: string;
  serviceId: string;
  date: string;
  timezone: string;
  durationMinutes: number;
  slotStepMinutes: number;
  results: StaffSlotResult[];
};

type BusyInterval = {
  start: Date;
  end: Date;
};

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function resolveWindowsForStaff(
  hours: WorkingHour[],
  staffId: string,
): WorkingHour[] {
  const staffSpecific = hours.filter((row) => row.staff_id === staffId);
  if (staffSpecific.length > 0) {
    return staffSpecific.filter((row) => !row.is_closed);
  }
  return hours.filter((row) => row.staff_id === null && !row.is_closed);
}

function generateCandidateStarts(
  date: string,
  window: WorkingHour,
  durationMinutes: number,
): Date[] {
  const windowStart = mauritiusDateTimeToUtc(date, window.start_time);
  const windowEnd = mauritiusDateTimeToUtc(date, window.end_time);
  const lastStart = addMinutes(windowEnd, -durationMinutes);
  const starts: Date[] = [];

  if (lastStart < windowStart) {
    return starts;
  }

  for (
    let cursor = windowStart;
    cursor.getTime() <= lastStart.getTime();
    cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
  ) {
    starts.push(cursor);
  }

  return starts;
}

function overlapsBusy(start: Date, end: Date, busy: BusyInterval[]): boolean {
  return busy.some((interval) =>
    areIntervalsOverlapping(
      { start, end },
      { start: interval.start, end: interval.end },
      { inclusive: false },
    ),
  );
}

export async function getAvailableSlots(
  input: SlotQueryInput & { salonId: string },
): Promise<SlotAvailabilityResult> {
  const timezone = input.timezone ?? MAURITIUS_TIMEZONE;
  const supabase = createAdminClient();
  const weekday = mauritiusWeekday(input.date);
  const { start: dayStart, end: dayEnd } = mauritiusDayBounds(input.date);

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, salon_id, duration_minutes, is_active")
    .eq("id", input.serviceId)
    .eq("salon_id", input.salonId)
    .eq("is_active", true)
    .maybeSingle();

  if (serviceError) {
    throw new Error(serviceError.message);
  }
  if (!service) {
    throw new Error("SERVICE_NOT_FOUND");
  }

  let staffQuery = supabase
    .from("staff")
    .select("id, name, is_active, salon_id")
    .eq("salon_id", input.salonId)
    .eq("is_active", true);

  if (input.staffId) {
    staffQuery = staffQuery.eq("id", input.staffId);
  }

  const { data: staffRows, error: staffError } = await staffQuery;
  if (staffError) {
    throw new Error(staffError.message);
  }

  const staffList = (staffRows ?? []) as Pick<Staff, "id" | "name">[];
  if (staffList.length === 0) {
    return {
      salonId: input.salonId,
      serviceId: input.serviceId,
      date: input.date,
      timezone,
      durationMinutes: service.duration_minutes,
      slotStepMinutes: SLOT_STEP_MINUTES,
      results: [],
    };
  }

  const staffIds = staffList.map((row) => row.id);

  const { data: eligibilityRows, error: eligibilityError } = await supabase
    .from("staff_services")
    .select("staff_id")
    .eq("service_id", input.serviceId)
    .in("staff_id", staffIds);
  if (eligibilityError) throw new Error(eligibilityError.message);
  if ((eligibilityRows ?? []).length > 0) {
    const eligible = new Set(eligibilityRows.map((row) => row.staff_id));
    for (let index = staffList.length - 1; index >= 0; index -= 1) {
      if (!eligible.has(staffList[index].id)) staffList.splice(index, 1);
    }
  }
  const effectiveStaffIds = staffList.map((row) => row.id);

  const { data: hoursRows, error: hoursError } = await supabase
    .from("working_hours")
    .select(
      "id, salon_id, staff_id, day_of_week, start_time, end_time, is_closed",
    )
    .eq("salon_id", input.salonId)
    .eq("day_of_week", weekday);

  if (hoursError) {
    throw new Error(hoursError.message);
  }

  const hours = (hoursRows ?? []) as WorkingHour[];

  const { data: bookingRows, error: bookingError } = await supabase
    .from("bookings")
    .select("staff_id, start_time, end_time, status")
    .eq("salon_id", input.salonId)
    .in("staff_id", effectiveStaffIds)
    .in("status", [...BLOCKING_STATUSES])
    .lt("start_time", dayEnd.toISOString())
    .gt("end_time", dayStart.toISOString());

  if (bookingError) {
    throw new Error(bookingError.message);
  }

  const { data: closureRows, error: closureError } = await supabase
    .from("salon_closures")
    .select("staff_id, starts_at, ends_at")
    .eq("salon_id", input.salonId)
    .lt("starts_at", dayEnd.toISOString())
    .gt("ends_at", dayStart.toISOString());
  if (closureError) throw new Error(closureError.message);

  const busyByStaff = new Map<string, BusyInterval[]>();
  for (const booking of bookingRows ?? []) {
    const list = busyByStaff.get(booking.staff_id) ?? [];
    list.push({
      start: new Date(booking.start_time),
      end: new Date(booking.end_time),
    });
    busyByStaff.set(booking.staff_id, list);
  }
  for (const closure of closureRows ?? []) {
    const targetStaffIds = closure.staff_id ? [closure.staff_id] : effectiveStaffIds;
    for (const staffId of targetStaffIds) {
      const list = busyByStaff.get(staffId) ?? [];
      list.push({ start: new Date(closure.starts_at), end: new Date(closure.ends_at) });
      busyByStaff.set(staffId, list);
    }
  }

  const now = new Date();
  const results: StaffSlotResult[] = staffList.map((member) => {
    const windows = resolveWindowsForStaff(hours, member.id).sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
    );
    const busy = busyByStaff.get(member.id) ?? [];
    const slots: AvailableSlot[] = [];

    for (const window of windows) {
      for (const start of generateCandidateStarts(
        input.date,
        window,
        service.duration_minutes,
      )) {
        const end = addMinutes(start, service.duration_minutes);
        if (start <= now) {
          continue;
        }
        if (overlapsBusy(start, end, busy)) {
          continue;
        }
        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
        });
      }
    }

    return {
      staffId: member.id,
      staffName: member.name,
      slots,
    };
  });

  return {
    salonId: input.salonId,
    serviceId: input.serviceId,
    date: input.date,
    timezone,
    durationMinutes: service.duration_minutes,
    slotStepMinutes: SLOT_STEP_MINUTES,
    results,
  };
}
