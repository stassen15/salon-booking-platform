"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { format, addDays, isSameDay } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalonCatalog {
  salon: {
    id: string;
    slug: string;
    name: string;
    phone: string;
    address: string;
    district: string;
    juice_phone: string | null;
    juice_account_name: string | null;
    currency: string;
    is_active: boolean;
  };
  services: {
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price_mur: number;
    deposit_required_mur: number;
  }[];
  staff: {
    id: string;
    name: string;
  }[];
  workingHours: {
    id: string;
    staff_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_closed: boolean;
  }[];
}

interface AvailableSlot {
  start: string;
  end: string;
}

interface StaffSlotResult {
  staffId: string;
  staffName: string;
  slots: AvailableSlot[];
}

interface SlotAvailabilityResult {
  salonId: string;
  serviceId: string;
  date: string;
  durationMinutes: number;
  results: StaffSlotResult[];
}

interface BookingConfirmation {
  id: string;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_status: string;
}

interface DepositQuote {
  required: boolean;
  amountMur: number;
  reason: "none" | "first_visit" | "high_demand" | "blacklisted";
  isFirstVisit: boolean;
  trustTier: string;
  juicePhone: string | null;
  juiceAccountName: string | null;
}

type Step = 1 | 2 | 3 | 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-MU", {
    timeZone: "Indian/Mauritius",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-MU", {
    timeZone: "Indian/Mauritius",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function toLocalDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Mauritius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildGoogleCalendarUrl(
  title: string,
  start: string,
  end: string,
  location: string,
): string {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ─── Icon components ──────────────────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function DurationIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function PayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  );
}

// ─── Detail row (confirmation) ─────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="text-zinc-400 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-400 font-medium">{label}</p>
        <p className="text-sm font-semibold text-zinc-800 leading-snug">{value}</p>
      </div>
    </div>
  );
}

// ─── Boutique Salon Header ───────────────────────────────────────────────────

function BoutiqueSalonHeader({
  name,
  address,
  monogram: propMonogram,
}: {
  name: string;
  address: string;
  monogram?: string;
}) {
  const monogram =
    propMonogram ||
    name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    "S";

  return (
    <div className="flex flex-col items-center text-center mb-6">
      <div className="w-14 h-14 rounded-full bg-[#1D1D1F] text-white flex items-center justify-center font-bold text-lg shadow-sm">
        {monogram}
      </div>
      <h1 className="text-xl font-bold tracking-tight text-[#1D1D1F] mt-3">
        {name}
      </h1>
      <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium mt-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Open for bookings
      </div>
      <p className="text-xs text-zinc-400 mt-1 max-w-xs px-4">
        {address}
      </p>
    </div>
  );
}

// ─── Tactile Service Card ──────────────────────────────────────────────────────

function ServiceCard({
  service,
  selected,
  onSelect,
}: {
  service: SalonCatalog["services"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`w-full text-left p-4 rounded-2xl transition-all cursor-pointer ${
        selected
          ? "border-2 border-[#1D1D1F] bg-zinc-50/50 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
          : "bg-white border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:border-zinc-300 active:scale-[0.98]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left side */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-[#1D1D1F] leading-snug">
            {service.name}
          </h3>
          {service.description && (
            <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5 leading-relaxed">
              {service.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] font-medium text-zinc-400">
              ⏱ {service.duration_minutes} min
            </span>
            {service.deposit_required_mur > 0 && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                Rs {service.deposit_required_mur} deposit
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="text-right shrink-0 flex items-center gap-2.5">
          <div>
            <span className="text-xs font-normal text-zinc-400">Rs </span>
            <span className="font-semibold text-base tabular-nums text-[#1D1D1F]">
              {service.price_mur}
            </span>
          </div>
          {selected && (
            <div className="h-5 w-5 rounded-full bg-[#1D1D1F] text-white flex items-center justify-center shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Date picker (Desktop Mouse + Mobile Swipe + Week Nav + Calendar Jump) ──

function DatePicker({
  selected,
  onSelect,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
}) {
  const [baseDate, setBaseDate] = useState<Date>(() => new Date());
  const dateInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = Array.from({ length: 14 }, (_, i) => addDays(baseDate, i));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const canGoBack = baseDate > today;

  function handlePrevWeek() {
    setBaseDate((prev) => {
      const next = addDays(prev, -7);
      return next < today ? today : next;
    });
  }

  function handleNextWeek() {
    setBaseDate((prev) => addDays(prev, 7));
  }

  function handleNativeDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    const chosen = new Date(y, m - 1, d);
    onSelect(chosen);
    setBaseDate(chosen);
  }

  const monthYearLabel = format(selected, "MMMM yyyy");

  return (
    <div className="space-y-2.5">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#1D1D1F]">
          {monthYearLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canGoBack}
            onClick={handlePrevWeek}
            aria-label="Previous week"
            className="p-1.5 rounded-lg text-zinc-600 hover:text-[#1D1D1F] hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleNextWeek}
            aria-label="Next week"
            className="p-1.5 rounded-lg text-zinc-600 hover:text-[#1D1D1F] hover:bg-zinc-100 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="relative inline-flex items-center ml-0.5">
            <button
              type="button"
              onClick={() => {
                if (dateInputRef.current?.showPicker) {
                  dateInputRef.current.showPicker();
                } else {
                  dateInputRef.current?.click();
                }
              }}
              aria-label="Pick date from calendar"
              className="p-1.5 rounded-lg text-zinc-600 hover:text-[#1D1D1F] hover:bg-zinc-100 transition"
              title="Pick a date"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </button>
            <input
              ref={dateInputRef}
              type="date"
              min={toLocalDateString(today)}
              onChange={handleNativeDateChange}
              className="sr-only absolute opacity-0 pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* Date Pills Slider */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto pb-2 pt-1 snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {days.map((day) => {
          const isSelected = isSameDay(day, selected);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={`snap-start flex-shrink-0 flex flex-col items-center justify-center w-14 min-h-[72px] rounded-2xl transition-all duration-150 active:scale-95 ${
                isSelected
                  ? "bg-[#1D1D1F] text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] scale-[1.02] border border-[#1D1D1F]"
                  : "bg-white text-zinc-700 border border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  isSelected ? "text-zinc-300" : "text-zinc-400"
                }`}
              >
                {format(day, "EEE")}
              </span>
              <span className="text-lg font-bold mt-0.5">{format(day, "d")}</span>
              <span className={`text-[10px] ${isSelected ? "text-zinc-300" : "text-zinc-400"}`}>
                {format(day, "MMM")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time slot grid (Morning / Afternoon Hierarchy & Proactive Recovery) ─────

function TimeSlotGrid({
  results,
  selectedSlot,
  selectedStaffId,
  onSelect,
  onJumpToNextAvailable,
}: {
  results: StaffSlotResult[];
  selectedSlot: AvailableSlot | null;
  selectedStaffId: string | null;
  onSelect: (slot: AvailableSlot, staffId: string) => void;
  onJumpToNextAvailable: () => void;
}) {
  const rows = selectedStaffId
    ? results.filter((r) => r.staffId === selectedStaffId)
    : results;

  const totalSlots = rows.reduce((acc, r) => acc + r.slots.length, 0);

  if (rows.length === 0 || totalSlots === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-zinc-400">No slots open on this day</p>
        <button
          type="button"
          onClick={onJumpToNextAvailable}
          className="mt-2 text-xs font-semibold text-[#1D1D1F] underline underline-offset-4"
        >
          Jump to next available date &rarr;
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((staffRow) => {
        const morningSlots: AvailableSlot[] = [];
        const afternoonSlots: AvailableSlot[] = [];

        staffRow.slots.forEach((slot) => {
          const timeStr = formatTimeLocal(slot.start);
          const hour = parseInt(timeStr.split(":")[0], 10);
          if (hour < 12) {
            morningSlots.push(slot);
          } else {
            afternoonSlots.push(slot);
          }
        });

        return (
          <div key={staffRow.staffId} className="space-y-4">
            {results.length > 1 && (
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                {staffRow.staffName}
              </p>
            )}

            {staffRow.slots.length === 0 ? (
              <p className="text-xs text-zinc-400 py-1">No slots for this barber</p>
            ) : (
              <>
                {morningSlots.length > 0 && (
                  <div>
                    <span className="block text-[10px] font-bold tracking-wider uppercase text-zinc-400 mb-2">
                      Morning
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {morningSlots.map((slot) => {
                        const isSelected =
                          selectedSlot?.start === slot.start &&
                          selectedStaffId === staffRow.staffId;
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            onClick={() => onSelect(slot, staffRow.staffId)}
                            className={`py-3 px-2 rounded-xl text-xs font-semibold font-mono text-center border transition-all active:scale-95 ${
                              isSelected
                                ? "bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-sm scale-[1.02]"
                                : "bg-white text-zinc-700 border-zinc-200/90 hover:border-[#1D1D1F]"
                            }`}
                          >
                            {formatTimeLocal(slot.start)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {afternoonSlots.length > 0 && (
                  <div>
                    <span className="block text-[10px] font-bold tracking-wider uppercase text-zinc-400 mb-2">
                      Afternoon / Evening
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {afternoonSlots.map((slot) => {
                        const isSelected =
                          selectedSlot?.start === slot.start &&
                          selectedStaffId === staffRow.staffId;
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            onClick={() => onSelect(slot, staffRow.staffId)}
                            className={`py-3 px-2 rounded-xl text-xs font-semibold font-mono text-center border transition-all active:scale-95 ${
                              isSelected
                                ? "bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-sm scale-[1.02]"
                                : "bg-white text-zinc-700 border-zinc-200/90 hover:border-[#1D1D1F]"
                            }`}
                          >
                            {formatTimeLocal(slot.start)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BookingPage() {
  // useParams() gives the slug synchronously on the first render — no
  // async-params race condition and no empty-slug guard needed.
  const routeParams = useParams<{ slug: string }>();
  const slug = routeParams.slug ?? "";

  const [catalog, setCatalog] = useState<SalonCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [selectedService, setSelectedService] = useState<
    SalonCatalog["services"][number] | null
  >(null);

  // Step 2
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slotsData, setSlotsData] = useState<SlotAvailabilityResult | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  // Step 3
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [juiceRef, setJuiceRef] = useState("");
  const [depositQuote, setDepositQuote] = useState<DepositQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 4
  const [booking, setBooking] = useState<BookingConfirmation | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch catalog
  useEffect(() => {
    if (!slug) return;
    setLoadingCatalog(true);
    fetch(`/api/v1/public/${slug}/catalog`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setCatalog(json as SalonCatalog);
      })
      .catch((e: unknown) =>
        setCatalogError(
          e instanceof Error ? e.message : "Failed to load salon",
        ),
      )
      .finally(() => setLoadingCatalog(false));
  }, [slug]);

  // Fetch slots whenever service or date changes on step 2
  useEffect(() => {
    if (!slug || !selectedService || step !== 2) return;
    setLoadingSlots(true);
    setSlotsError(null);
    setSelectedSlot(null);
    setSelectedStaffId(null);
    const dateStr = toLocalDateString(selectedDate);
    fetch(
      `/api/v1/public/${slug}/slots?serviceId=${selectedService.id}&date=${dateStr}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setSlotsData(json as SlotAvailabilityResult);
      })
      .catch((e: unknown) =>
        setSlotsError(
          e instanceof Error ? e.message : "Failed to load slots",
        ),
      )
      .finally(() => setLoadingSlots(false));
  }, [slug, selectedService, selectedDate, step]);

  useEffect(() => {
    if (!slug || !selectedService || !selectedSlot || step !== 3) return;
    const params = new URLSearchParams({ slug, serviceId: selectedService.id, startTime: selectedSlot.start });
    if (customerPhone.trim()) params.set("customerPhone", customerPhone.trim());
    fetch(`/api/v1/public/deposit-quote?${params.toString()}`)
      .then((response) => response.json())
      .then((json) => { if (!json.error) setDepositQuote(json as DepositQuote); })
      .catch(() => setDepositQuote(null));
  }, [slug, selectedService, selectedSlot, customerPhone, step]);

  // Submit booking
  async function handleBook() {
    if (!slug || !selectedService || !selectedSlot || !selectedStaffId) return;
    setSubmitting(true);
    setSubmitError(null);
    const body: Record<string, string> = {
      slug,
      serviceId: selectedService.id,
      staffId: selectedStaffId,
      startTime: selectedSlot.start,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
    };
    if (juiceRef.trim()) body.juiceReference = juiceRef.trim();
    try {
      const res = await fetch("/api/v1/public/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseText = await res.text();
      let json: { error?: string; booking?: BookingConfirmation } = {};
      if (responseText.trim()) {
        try {
          json = JSON.parse(responseText) as typeof json;
        } catch {
          throw new Error(
            res.ok
              ? "The booking service returned an invalid response. Please try again."
              : `Booking failed (${res.status}). Please try again.`,
          );
        }
      }
      if (!res.ok || json.error) throw new Error(json.error ?? "Booking failed");
      setBooking(json.booking as BookingConfirmation);
      setStep(4);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // Derived
  const depositRequired = depositQuote?.required ?? Boolean(selectedService && selectedService.deposit_required_mur > 0);
  const depositAmount = depositQuote?.amountMur ?? selectedService?.deposit_required_mur ?? 0;
  const juicePhone = depositQuote?.juicePhone ?? catalog?.salon?.juice_phone;
  const juiceAccountName = depositQuote?.juiceAccountName ?? catalog?.salon?.juice_account_name;
  const juiceDeepLink = juicePhone ? `mcbjuice://pay?recipient=${encodeURIComponent(juicePhone)}&amount=${depositAmount}` : null;
  const step2CanProceed = selectedSlot !== null && selectedStaffId !== null;
  const step3CanProceed =
    customerName.trim().length >= 2 &&
    /^\+?[0-9]{8,15}$/.test(customerPhone.trim()) &&
    (!depositRequired || juiceRef.trim().length >= 3);

  function resetFlow() {
    setStep(1);
    setSelectedService(null);
    setSelectedSlot(null);
    setSelectedStaffId(null);
    setCustomerName("");
      setCustomerPhone("");
      setDepositQuote(null);
    setJuiceRef("");
    setBooking(null);
  }

  // ── Loading ──
  if (!isMounted || loadingCatalog) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-zinc-200 border-t-zinc-900 animate-spin" />
          <p className="text-zinc-500 text-sm">Loading salon…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (catalogError || !catalog) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-800 mb-1">Salon not found</h2>
          <p className="text-zinc-500 text-sm">
            {catalogError ?? "This salon is not available."}
          </p>
        </div>
      </div>
    );
  }

  const { salon, services } = catalog;
  const fullAddress = [salon.address, salon.district].filter(Boolean).join(", ") || salon.address || "Mauritius";
  const monogram =
    salon.name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  // ── Step 4: Confirmation ──
  if (step === 4 && booking) {
    const calUrl = buildGoogleCalendarUrl(
      `${selectedService?.name ?? "Appointment"} @ ${salon.name}`,
      booking.start_time,
      booking.end_time,
      `${salon.name}, ${salon.address}`,
    );
    return (
      <div className="min-h-screen w-full bg-[#F5F5F7] py-8 px-4 touch-pan-y overscroll-y-auto">
        <div className="max-w-md mx-auto">
          <BoutiqueSalonHeader
            name={salon.name}
            address={fullAddress}
            monogram={monogram}
          />
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-6 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#1D1D1F] mb-1">Booking Confirmed!</h2>
            <p className="text-[#86868B] text-xs mb-6">
              We&apos;ll send a reminder before your appointment.
            </p>

            <div className="rounded-2xl bg-[#F5F5F7] border border-black/[0.04] p-4 text-left divide-y divide-zinc-200/60 mb-6">
              <DetailRow
                icon={<ClockIcon />}
                label="Date & Time"
                value={`${formatDateLabel(new Date(booking.start_time))} · ${formatTimeLocal(booking.start_time)}`}
              />
              <DetailRow
                icon={<DurationIcon />}
                label="Duration"
                value={`${selectedService?.duration_minutes} minutes`}
              />
              <DetailRow icon={<PersonIcon />} label="Customer" value={booking.customer_name} />
              <DetailRow icon={<PhoneIcon />} label="Phone" value={booking.customer_phone} />
              {depositRequired && (
                <DetailRow
                  icon={<PayIcon />}
                  label="Deposit"
                  value={`Rs ${depositAmount} (Juice submitted)`}
                />
              )}
              <DetailRow
                icon={<TicketIcon />}
                label="Booking ID"
                value={`#${booking.id.slice(0, 8).toUpperCase()}`}
              />
            </div>

            <a
              href={calUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full py-3.5 px-4 bg-[#1D1D1F] text-white rounded-xl font-semibold text-sm hover:bg-black transition-all active:scale-[0.98] mb-3 shadow-sm"
            >
              Add to Google Calendar
            </a>
            <button
              onClick={resetFlow}
              className="w-full py-2.5 text-xs text-[#86868B] hover:text-[#1D1D1F] transition-colors"
            >
              Book another appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Steps 1–3: Responsive Boutique Link-in-Bio Funnel ──
  return (
    <div className="min-h-screen w-full bg-[#F5F5F7] text-[#1D1D1F] touch-pan-y overscroll-y-auto">
      <div className="max-w-md md:max-w-5xl mx-auto px-4 md:px-8 pt-6 md:py-12 md:grid md:grid-cols-12 md:gap-8 items-start pb-32">
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="md:hidden">
          <BoutiqueSalonHeader
            name={salon.name}
            address={fullAddress}
            monogram={monogram}
          />
        </div>

        {/* Desktop Left Column (Persistent Profile & Appointment Summary) */}
        <div className="hidden md:block md:col-span-4 sticky top-8">
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-6 space-y-6">
            {/* Salon Profile */}
            <div className="flex flex-col items-start text-left">
              <div className="w-14 h-14 rounded-full bg-[#1D1D1F] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                {monogram}
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[#1D1D1F] mt-3">
                {salon.name}
              </h1>
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Open for bookings
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {fullAddress}
              </p>
            </div>

            {/* Persistent Appointment Summary */}
            <div className="pt-5 border-t border-zinc-100 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Appointment Summary
              </h3>
              {selectedService ? (
                <div className="space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-[#1D1D1F]">{selectedService.name}</p>
                      <p className="text-zinc-500 mt-0.5">⏱ {selectedService.duration_minutes} min</p>
                    </div>
                    <p className="font-mono font-bold text-sm text-[#1D1D1F]">Rs {selectedService.price_mur}</p>
                  </div>

                  {selectedSlot ? (
                    <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between text-zinc-600">
                      <span>Time Slot</span>
                      <span className="font-semibold text-[#1D1D1F] font-mono">
                        {formatDateLabel(new Date(selectedSlot.start))} · {formatTimeLocal(selectedSlot.start)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-400 pt-2 border-t border-zinc-100 italic">
                      Select date &amp; time in Step 2
                    </p>
                  )}

                  {selectedService.deposit_required_mur > 0 && (
                    <div className="pt-2 flex items-center justify-between text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200/60">
                      <span className="font-medium">Deposit Required</span>
                      <span className="font-bold font-mono">Rs {depositAmount}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 py-2">
                  No service selected yet. Choose a service to begin.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Booking Step Card */}
        <div className="col-span-12 md:col-span-8">
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-5 sm:p-8 mb-4">
            {/* iOS-style Segmented Progress Bar */}
            <div className="flex items-center gap-1.5 mb-5">
              <div className={`h-1 flex-1 rounded-full ${step >= 1 ? "bg-[#1D1D1F]" : "bg-zinc-200"} transition-all`} />
              <div className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-[#1D1D1F]" : "bg-zinc-200"} transition-all`} />
              <div className={`h-1 flex-1 rounded-full ${step >= 3 ? "bg-[#1D1D1F]" : "bg-zinc-200"} transition-all`} />
            </div>

            {/* ── STEP 1: Service Selection ── */}
            {step === 1 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-bold tracking-tight text-[#1D1D1F]">Choose a Service</h2>
                  <p className="text-xs text-[#86868B] mt-0.5">Select what you&apos;d like done today</p>
                </div>

                <div className="space-y-2.5">
                  {services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      selected={selectedService?.id === service.id}
                      onSelect={() => setSelectedService(service)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP 2: Date & Time Selection ── */}
            {step === 2 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-bold tracking-tight text-[#1D1D1F]">Pick a Date &amp; Time</h2>
                  <p className="text-xs text-[#86868B] mt-0.5">
                    {selectedService?.name} &bull; {selectedService?.duration_minutes} min
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-2.5">
                      Date
                    </p>
                    <DatePicker selected={selectedDate} onSelect={setSelectedDate} />
                  </div>

                  {catalog.staff.length > 1 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-2">
                        Barber / Stylist
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStaffId(null);
                            setSelectedSlot(null);
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            selectedStaffId === null
                              ? "bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-sm"
                              : "bg-[#F5F5F7] text-[#1D1D1F] border-transparent hover:bg-zinc-200"
                          }`}
                        >
                          Any Available
                        </button>
                        {catalog.staff.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedStaffId(s.id);
                              setSelectedSlot(null);
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              selectedStaffId === s.id
                                ? "bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-sm"
                                : "bg-[#F5F5F7] text-[#1D1D1F] border-transparent hover:bg-zinc-200"
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mb-2.5">
                      Available Times
                    </p>
                    {loadingSlots ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="h-6 w-6 rounded-full border-2 border-zinc-300 border-t-[#1D1D1F] animate-spin" />
                      </div>
                    ) : slotsError ? (
                      <div className="py-6 text-center">
                        <p className="text-red-500 text-xs">{slotsError}</p>
                        <button
                          type="button"
                          onClick={() => setSelectedDate(new Date(selectedDate))}
                          className="mt-2 text-xs text-zinc-500 underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : slotsData ? (
                      <TimeSlotGrid
                        results={slotsData.results}
                        selectedSlot={selectedSlot}
                        selectedStaffId={selectedStaffId}
                        onSelect={(slot, staffId) => {
                          setSelectedSlot(slot);
                          setSelectedStaffId(staffId);
                        }}
                        onJumpToNextAvailable={() => setSelectedDate((prev) => addDays(prev, 1))}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Customer Details & Juice Deposit ── */}
            {step === 3 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-bold tracking-tight text-[#1D1D1F]">Your Details</h2>
                  <p className="text-xs text-[#86868B] mt-0.5">Almost done — tell us who you are</p>
                </div>

                {selectedService && selectedSlot && (
                  <div className="bg-[#1D1D1F] text-white rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)] flex items-center justify-between mb-5">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{selectedService.name}</p>
                      <p className="text-zinc-300 text-xs mt-0.5">
                        {formatDateLabel(new Date(selectedSlot.start))} &bull; {formatTimeLocal(selectedSlot.start)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="text-xs text-zinc-400 hover:text-white underline shrink-0"
                    >
                      Change
                    </button>
                  </div>
                )}

                <div className="space-y-3.5">
                  <div className="bg-white border border-zinc-200 focus-within:border-[#1D1D1F] focus-within:ring-2 focus-within:ring-black/5 rounded-xl p-3 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-zinc-400 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Ravi Jugurnath"
                      className="w-full bg-transparent text-sm font-medium text-zinc-900 placeholder:text-zinc-300 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="bg-white border border-zinc-200 focus-within:border-[#1D1D1F] focus-within:ring-2 focus-within:ring-black/5 rounded-xl p-3 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                      <label className="block text-[10px] font-bold tracking-wider uppercase text-zinc-400 mb-1">
                        WhatsApp / Phone
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="+230 5XXX XXXX"
                        className="w-full bg-transparent text-sm font-medium text-zinc-900 placeholder:text-zinc-300 focus:outline-none font-mono"
                      />
                    </div>
                    <p className="text-[11px] text-[#86868B] px-1">
                      Booking confirmation &amp; reminders will be sent here
                    </p>
                  </div>

                  {depositRequired && (
                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <div className="h-5 w-5 rounded-full bg-[#FF9500] text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                          !
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                            MCB Juice Deposit Required
                          </p>
                          <p className="text-xs text-amber-800 mt-0.5">
                            A deposit of <span className="font-bold font-mono">Rs {depositAmount}</span> must be paid via MCB Juice to lock in your slot.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-amber-200/60 p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">Send to Juice number</span>
                          <span className="font-bold text-[#1D1D1F] font-mono">{juicePhone ?? "—"}</span>
                        </div>
                        {juiceAccountName && (
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Account name</span>
                            <span className="font-semibold text-[#1D1D1F]">{juiceAccountName}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">Amount</span>
                          <span className="font-bold text-emerald-600 font-mono">Rs {depositAmount}</span>
                        </div>

                        {juiceDeepLink && juicePhone && (
                          <div className="mt-3 flex items-center gap-3 border-t border-amber-100 pt-3">
                            <Image
                              src={`/api/v1/public/juice-qr?phone=${encodeURIComponent(juicePhone)}&amount=${depositAmount}`}
                              alt="MCB Juice payment QR"
                              width={72}
                              height={72}
                              className="h-18 w-18 rounded-lg border border-amber-200"
                            />
                            <div className="flex-1">
                              <a
                                href={juiceDeepLink}
                                className="block rounded-xl bg-[#1D1D1F] px-3 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-black transition active:scale-95"
                              >
                                Pay via MCB Juice
                              </a>
                              <p className="mt-1 text-[10px] text-amber-700">Or scan QR then enter Juice reference below</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="bg-white border border-amber-300 focus-within:border-[#1D1D1F] focus-within:ring-2 focus-within:ring-black/5 rounded-xl p-3 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                          <label className="block text-[10px] font-bold tracking-wider uppercase text-amber-900 mb-1">
                            Juice Transaction Reference
                          </label>
                          <input
                            type="text"
                            value={juiceRef}
                            onChange={(e) => setJuiceRef(e.target.value)}
                            placeholder="e.g. TXN123456789"
                            className="w-full bg-transparent text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none font-mono"
                          />
                        </div>
                        <p className="text-[10px] text-amber-700 px-1">Found in your MCB Juice receipt / SMS notification</p>
                      </div>
                    </div>
                  )}
                </div>

                {submitError && (
                  <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-600 font-medium">
                    {submitError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Frosted Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-xl bg-white/80 border-t border-zinc-200/60 z-30 gpu-layer">
        <div className="max-w-md md:max-w-3xl mx-auto flex items-center gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="h-[50px] w-[50px] rounded-xl bg-zinc-100 hover:bg-zinc-200 text-[#1D1D1F] flex items-center justify-center transition-all shrink-0 active:scale-95"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {step === 1 && (
            selectedService ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full h-12 rounded-xl font-medium text-sm transition-all inline-flex items-center justify-between px-4 bg-[#1D1D1F] hover:bg-black active:scale-[0.98] text-white shadow-sm"
              >
                <span className="truncate">Continue with {selectedService.name}</span>
                <span className="shrink-0 ml-2 font-mono">Rs {selectedService.price_mur} &rarr;</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="w-full h-12 rounded-xl font-medium text-sm transition-all inline-flex items-center justify-center px-4 bg-zinc-100 text-zinc-400 cursor-not-allowed"
              >
                Select a service to continue
              </button>
            )
          )}

          {step === 2 && (
            step2CanProceed ? (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full h-12 rounded-xl font-medium text-sm transition-all inline-flex items-center justify-between px-4 bg-[#1D1D1F] hover:bg-black active:scale-[0.98] text-white shadow-sm"
              >
                <span>Confirm {formatTimeLocal(selectedSlot!.start)}</span>
                <span className="shrink-0 ml-2">Next &rarr;</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="w-full h-12 rounded-xl font-medium text-sm transition-all inline-flex items-center justify-center px-4 bg-zinc-100 text-zinc-400 cursor-not-allowed"
              >
                Select a time slot
              </button>
            )
          )}

          {step === 3 && (
            <button
              type="button"
              disabled={!step3CanProceed || submitting}
              onClick={handleBook}
              className="w-full h-12 rounded-xl font-medium text-sm transition-all inline-flex items-center justify-center gap-2.5 bg-[#1D1D1F] text-white active:scale-[0.98] disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-zinc-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-zinc-600 font-medium">Securing appointment...</span>
                </>
              ) : (
                <span>Complete Booking</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
