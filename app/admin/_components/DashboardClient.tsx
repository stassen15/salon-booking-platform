"use client";

import { useEffect, useState } from "react";
import type { BookingStatus, PaymentStatus } from "@/types/database.types";

// ─── Shared types (re-exported for page.tsx) ──────────────────────────────────

export type AdminBooking = {
  id: string;
  salon_id: string;
  staff_id: string;
  service_id: string;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  juice_reference: string | null;
  notes: string | null;
  created_at: string;
};

export type ServiceInfo = {
  id: string;
  name: string;
  price_mur: number;
  deposit_required_mur: number;
  duration_minutes: number;
};

export type StaffInfo = { id: string; name: string };

// ─── Lookups ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-Show",
};

const STATUS_BADGE: Record<BookingStatus, string> = {
  pending:   "bg-amber-100   text-amber-700   border border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  completed: "bg-blue-100    text-blue-700    border border-blue-200",
  cancelled: "bg-rose-100    text-rose-700    border border-rose-200",
  no_show:   "bg-rose-100    text-rose-700    border border-rose-200",
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid:            "Unpaid",
  deposit_submitted: "Deposit Sent",
  paid_in_full:      "Paid",
};

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  unpaid:            "bg-zinc-100    text-zinc-600",
  deposit_submitted: "bg-amber-100   text-amber-700",
  paid_in_full:      "bg-emerald-100 text-emerald-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeMU(iso: string): string {
  return new Intl.DateTimeFormat("en-MU", {
    timeZone: "Indian/Mauritius",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function nextDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function dateRangeMU(dateStr: string): { from: string; to: string } {
  const MU = "+04:00";
  return {
    from: new Date(dateStr + "T00:00:00" + MU).toISOString(),
    to:   new Date(nextDayStr(dateStr) + "T00:00:00" + MU).toISOString(),
  };
}

function waDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("230") ? d : "230" + d;
}

// ─── BookingCard ──────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  service,
  staffMember,
  onStatusChange,
  onConfirmDeposit,
}: {
  booking: AdminBooking;
  service: ServiceInfo | undefined;
  staffMember: StaffInfo | undefined;
  onStatusChange: (id: string, status: BookingStatus) => Promise<void>;
  onConfirmDeposit: (id: string) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);

  const waNum = waDigits(booking.customer_phone);
  const waMsg = encodeURIComponent(
    "Hi " + booking.customer_name + "! Your appointment at our salon is confirmed. See you soon!"
  );

  const hasDeposit = service && service.deposit_required_mur > 0;
  const depositPending = booking.payment_status === "deposit_submitted";

  const STATUS_ACTIONS: BookingStatus[] = ["confirmed", "completed", "no_show", "cancelled"];
  const isTerminal = booking.status === "cancelled" || booking.status === "completed";

  async function handleStatus(newStatus: BookingStatus) {
    if (updating || booking.status === newStatus) return;
    setUpdating(true);
    await onStatusChange(booking.id, newStatus);
    setUpdating(false);
  }

  async function handleDeposit() {
    if (updating) return;
    setUpdating(true);
    await onConfirmDeposit(booking.id);
    setUpdating(false);
  }

  return (
    <div
      className={
        "premium-surface rounded-[24px] overflow-hidden transition-opacity " +
        (updating ? "opacity-60 pointer-events-none" : "opacity-100")
      }
    >
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between border-b border-zinc-100/80 bg-white/60 px-4 py-4">
        <div className="flex items-center gap-2 min-w-0">
            <span className="font-black text-zinc-900 text-xl tracking-tight shrink-0">
            {formatTimeMU(booking.start_time)} &ndash; {formatTimeMU(booking.end_time)}
          </span>
          <span className="text-zinc-300 shrink-0">&middot;</span>
            <span className="text-zinc-600 text-base font-semibold truncate">
            {service?.name ?? "Service"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {service && (
            <span className="text-zinc-800 font-semibold text-sm">Rs {service.price_mur}</span>
          )}
          <span
            className={
              "text-xs font-semibold px-2 py-0.5 rounded-full " +
              (STATUS_BADGE[booking.status] ?? "bg-zinc-100 text-zinc-600 border border-zinc-200")
            }
          >
            {STATUS_LABEL[booking.status] ?? booking.status}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">

        {/* Stylist row */}
        {staffMember && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.121 7.879a3 3 0 11-4.242 4.242M9.879 9.879A3 3 0 0114.12 14.12
                   M9.879 9.879L7 7m2.879 2.879l4.242 4.242M7 7l-3 3m3-3l3 3" />
            </svg>
            <span>{staffMember.name}</span>
          </div>
        )}

        {/* Customer row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-zinc-900 text-lg truncate">{booking.customer_name}</p>
            <p className="text-zinc-500 text-sm mt-0.5">{booking.customer_phone}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Call */}
            <a
              href={"tel:" + booking.customer_phone}
              className="flex min-h-12 items-center gap-1 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200
                         text-zinc-700 text-xs font-medium transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21
                     l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502
                     l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call
            </a>
            {/* WhatsApp */}
            <a
              href={"https://wa.me/" + waNum + "?text=" + waMsg}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center gap-1 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100
                         text-emerald-700 text-xs font-medium transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15
                         -.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463
                         -2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606
                         .134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371
                         -.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51
                         -.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016
                         -1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487
                         .709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719
                         2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.546 4.14 1.587 5.945L.057 23.35
                         a.99.99 0 001.244 1.206l5.526-1.493A11.944 11.944 0 0012 24c6.627 0 12-5.373
                         12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 01-5.031-1.37l-.36-.214-3.734 1.01
                         1.018-3.625-.234-.375A9.9 9.9 0 012.1 12C2.1 6.534 6.534 2.1 12 2.1
                         S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/>
              </svg>
              WA
            </a>
          </div>
        </div>

        {/* Juice Deposit block */}
        {hasDeposit && (
          <div
            className={
              "rounded-xl border p-3 " +
              (depositPending
                ? "bg-amber-50 border-amber-200"
                : booking.payment_status === "paid_in_full"
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-zinc-50 border-zinc-200")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-600 mb-0.5">
                  MCB Juice &middot; Rs {service.deposit_required_mur}
                </p>
                {booking.juice_reference ? (
                  <p className="text-xs font-mono text-zinc-500">Ref: {booking.juice_reference}</p>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No reference yet</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={
                    "text-xs font-semibold px-2 py-0.5 rounded-full " +
                    (PAYMENT_BADGE[booking.payment_status] ?? "bg-zinc-100 text-zinc-600")
                  }
                >
                  {PAYMENT_LABEL[booking.payment_status] ?? booking.payment_status}
                </span>
                {depositPending && (
                  <button
                    onClick={handleDeposit}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-600
                               hover:bg-emerald-700 text-white transition-colors"
                  >
                    Confirm
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status action pills */}
        {!isTerminal && (
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto pt-0.5 pb-1">
            {STATUS_ACTIONS.map((s) => {
              const isCurrent = booking.status === s;
              return (
                <button
                  key={s}
                  onClick={() => handleStatus(s)}
                  disabled={isCurrent}
                  className={
                    isCurrent
                      ? "h-9 min-h-9 whitespace-nowrap text-xs font-semibold px-3 rounded-full border " +
                        (STATUS_BADGE[s] ?? "bg-zinc-100 text-zinc-600 border-zinc-200")
                      : "h-9 min-h-9 whitespace-nowrap text-xs font-medium px-3 rounded-full border border-zinc-200 " +
                        "bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-800 transition-colors"
                  }
                >
                  {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: "all",       label: "All"            },
  { key: "confirmed", label: "Confirmed"      },
  { key: "deposit",   label: "Pending Deposit" },
  { key: "completed", label: "Completed"      },
] as const;

type FilterKey = typeof FILTER_TABS[number]["key"];

interface DashboardClientProps {
  initialBookings: AdminBooking[];
  services: ServiceInfo[];
  staff: StaffInfo[];
  todayStr: string;        // "YYYY-MM-DD" in Mauritius tz
}

export default function DashboardClient({
  initialBookings,
  services,
  staff,
  todayStr,
}: DashboardClientProps) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Lookup maps
  const serviceMap: Record<string, ServiceInfo> = Object.fromEntries(
    services.map((s) => [s.id, s]),
  );
  const staffMap: Record<string, StaffInfo> = Object.fromEntries(
    staff.map((s) => [s.id, s]),
  );

  const [bookings, setBookings] = useState<AdminBooking[]>(initialBookings);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [walkInMessage, setWalkInMessage] = useState<string | null>(null);

  const tomorrowStr = nextDayStr(todayStr);

  // ── Fetch bookings for any date ───────────────────────────────────────────
  async function fetchBookings(dateStr: string) {
    setLoading(true);
    setFetchError(null);
    const { from, to } = dateRangeMU(dateStr);
    const url =
      "/api/v1/admin/bookings?from=" +
      encodeURIComponent(from) +
      "&to=" +
      encodeURIComponent(to);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to load");
      setBookings(json.bookings as AdminBooking[]);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }

  function selectDate(dateStr: string) {
    setSelectedDate(dateStr);
    fetchBookings(dateStr);
  }

  // ── Optimistic status update ───────────────────────────────────────────────
  async function handleStatusChange(id: string, status: BookingStatus) {
    const snapshot = bookings;
    setBookings(bookings.map((b) => (b.id === id ? { ...b, status } : b)));
    try {
      const res = await fetch("/api/v1/admin/bookings/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Update failed");
      setBookings((bs) =>
        bs.map((b) => (b.id === id ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)),
      );
    } catch {
      setBookings(snapshot);
    }
  }

  // ── Optimistic deposit confirm ─────────────────────────────────────────────
  async function handleConfirmDeposit(id: string) {
    const snapshot = bookings;
    setBookings(
      bookings.map((b) => (b.id === id ? { ...b, payment_status: "paid_in_full" as PaymentStatus } : b)),
    );
    try {
      const res = await fetch("/api/v1/admin/bookings/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "paid_in_full" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Update failed");
      setBookings((bs) =>
        bs.map((b) => (b.id === id ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)),
      );
    } catch {
      setBookings(snapshot);
    }
  }

  // ── Derived: filter + metrics ─────────────────────────────────────────────
  const filtered = bookings.filter((b) => {
    if (filter === "confirmed") return b.status === "confirmed";
    if (filter === "deposit")   return b.payment_status === "deposit_submitted";
    if (filter === "completed") return b.status === "completed";
    return true;
  });

  const activeBookings = bookings.filter((b) => b.status !== "cancelled");
  const estRevenue = activeBookings.reduce(
    (sum, b) => sum + (serviceMap[b.service_id]?.price_mur ?? 0),
    0,
  );
  const pendingDeposits = bookings.filter((b) => b.payment_status === "deposit_submitted").length;

  async function blockWalkIn() {
    setWalkInMessage(null);
    const response = await fetch("/api/v1/admin/walk-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationMinutes: 30 }) });
    const json = await response.json();
    setWalkInMessage(response.ok ? "Next 30 minutes blocked for a walk-in." : (json.error ?? "Could not block slot"));
    if (response.ok) fetchBookings(selectedDate);
  }

  if (!hydrated) {
    return <div className="mx-auto max-w-3xl px-4 py-5"><div className="h-8 w-40 animate-pulse rounded-xl bg-zinc-200" /><div className="mt-5 h-24 animate-pulse rounded-[22px] bg-white" /></div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-3 sm:space-y-5 sm:py-8">

      <div className="premium-rise flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Today at the chair</p><h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-zinc-950 sm:text-2xl">Bookings</h1></div><div className="rounded-2xl bg-white/70 px-3 py-2 text-right text-xs text-zinc-500 shadow-sm"><span className="block font-semibold text-zinc-950">{selectedDate === todayStr ? "Today" : selectedDate}</span><span>{bookings.length} appointments</span></div></div>

      {/* ── Metrics row ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:gap-4">
        {/* Bookings */}
        <div className="premium-surface min-w-[122px] flex-1 rounded-[18px] px-3 py-2.5 sm:rounded-[22px] sm:px-4 sm:py-4">
          <p className="text-xs font-medium text-zinc-400 mb-0.5">Bookings</p>
          <p className="text-xl font-bold leading-none text-zinc-900 sm:text-2xl">{activeBookings.length}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">today</p>
        </div>

        {/* Revenue */}
        <div className="premium-surface min-w-[122px] flex-1 rounded-[18px] px-3 py-2.5 sm:rounded-[22px] sm:px-4 sm:py-4">
          <p className="text-xs font-medium text-zinc-400 mb-0.5">Revenue</p>
          <p className="text-lg font-bold leading-none text-zinc-900 sm:text-xl">Rs {estRevenue}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">est.</p>
        </div>

        {/* Juice deposits */}
        <div
          className={
            pendingDeposits > 0
              ? "min-w-[122px] flex-1 rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm sm:rounded-[22px] sm:px-4 sm:py-4"
              : "premium-surface min-w-[122px] flex-1 rounded-[18px] px-3 py-2.5 sm:rounded-[22px] sm:px-4 sm:py-4"
          }
        >
          <p
            className={
              "text-xs font-medium mb-0.5 " +
              (pendingDeposits > 0 ? "text-amber-600" : "text-zinc-400")
            }
          >
            Juice
          </p>
          <p
            className={
              "text-2xl font-bold leading-none " +
              (pendingDeposits > 0 ? "text-amber-700" : "text-zinc-900")
            }
          >
            {pendingDeposits}
          </p>
          <p
            className={
              "text-xs mt-0.5 " +
              (pendingDeposits > 0 ? "text-amber-500" : "text-zinc-400")
            }
          >
            pending
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[24px] border border-zinc-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <button onClick={blockWalkIn} className="min-h-12 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-900/15 transition hover:bg-black active:scale-95">Block 30m / Walk-in</button>
        <p className="text-xs text-zinc-500">Keep the next slot clear for someone at the counter.</p>
        {walkInMessage && <p className="text-xs font-semibold text-zinc-900 sm:ml-auto">{walkInMessage}</p>}
      </div>

      {/* ── Date switcher ── */}
      <div className="premium-surface rounded-[22px] p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => selectDate(todayStr)}
            className={
              selectedDate === todayStr
                ? "flex-1 py-2 rounded-xl text-sm font-bold bg-zinc-900 text-white"
                : "flex-1 py-2 rounded-xl text-sm font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
            }
          >
            Today
          </button>
          <button
            onClick={() => selectDate(tomorrowStr)}
            className={
              selectedDate === tomorrowStr
                ? "flex-1 py-2 rounded-xl text-sm font-bold bg-zinc-900 text-white"
                : "flex-1 py-2 rounded-xl text-sm font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
            }
          >
            Tomorrow
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { if (e.target.value) selectDate(e.target.value); }}
            className="flex-1 py-2 px-3 rounded-xl text-sm bg-zinc-100 text-zinc-700
                       border-0 focus:outline-none focus:ring-2 focus:ring-zinc-800 focus:ring-offset-1"
          />
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 overflow-x-auto">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={
                active
                  ? "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-zinc-900 text-white"
                  : "flex-shrink-0 flex min-h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white/70 px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400"
              }
            >
              {tab.label}
              {tab.key === "deposit" && pendingDeposits > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {pendingDeposits}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Booking list ── */}
      {loading ? (
        <div className="flex justify-center py-14">
          <div className="h-8 w-8 rounded-full border-4 border-zinc-200 border-t-zinc-900 animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-5 text-center">
          <p className="text-rose-600 text-sm font-medium mb-2">{fetchError}</p>
          <button
            onClick={() => fetchBookings(selectedDate)}
            className="text-sm text-zinc-500 underline hover:text-zinc-700"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-zinc-400">
          <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-semibold text-zinc-500">No bookings found</p>
          <p className="text-sm mt-1 text-zinc-400">{selectedDate}</p>
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          {filtered.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              service={serviceMap[booking.service_id]}
              staffMember={staffMap[booking.staff_id]}
              onStatusChange={handleStatusChange}
              onConfirmDeposit={handleConfirmDeposit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
