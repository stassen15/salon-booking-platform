/** Mauritius Standard Time is UTC+4 year-round (no DST). */
export const MAURITIUS_TIMEZONE = "Indian/Mauritius";
export const MAURITIUS_OFFSET = "+04:00";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/** Interpret a calendar date + wall-clock time in Indian/Mauritius as a UTC Date. */
export function mauritiusDateTimeToUtc(date: string, time: string): Date {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${normalizedTime}${MAURITIUS_OFFSET}`);
}

export function mauritiusDayBounds(date: string): { start: Date; end: Date } {
  return {
    start: mauritiusDateTimeToUtc(date, "00:00:00"),
    end: mauritiusDateTimeToUtc(date, "23:59:59.999"),
  };
}

/** Weekday for a Mauritius calendar date: 0 = Sunday … 6 = Saturday. */
export function mauritiusWeekday(date: string): number {
  return mauritiusDateTimeToUtc(date, "12:00:00").getUTCDay();
}

export function formatMauritiusDateTime(iso: string | Date): string {
  const value = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-MU", {
    timeZone: MAURITIUS_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
