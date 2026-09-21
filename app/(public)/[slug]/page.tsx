"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { format, addDays, isSameDay } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedServiceItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  cleanDescription: string;
  duration_minutes: number;
  price_mur: number;
  deposit_required_mur: number;
}

interface SalonCatalog {
  salon: {
    id: string;
    slug: string;
    name: string;
    phone: string;
    address: string;
    district: string;
    town?: string | null;
    maps_url?: string | null;
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

function parseServiceItem(srv: SalonCatalog["services"][number]): ParsedServiceItem {
  let category = (srv as { category?: string }).category || "General";
  let cleanDescription = srv.description || "";

  if (srv.description) {
    const match = srv.description.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (match) {
      category = match[1].trim() || category;
      cleanDescription = match[2].trim();
    }
  }

  return {
    ...srv,
    category,
    cleanDescription,
  };
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
  service_name?: string;
  stylist_name?: string;
  formatted_date?: string;
  balance_due?: number;
  total_price?: number;
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

function downloadICS({
  title,
  description,
  location,
  startTime,
  endTime,
}: {
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
}) {
  const formatICSDate = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FreshCuts//Salon Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@salonos.mu`,
    `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
    `DTSTART:${formatICSDate(startTime)}`,
    `DTEND:${formatICSDate(endTime)}`,
    `SUMMARY:${title.replace(/[,;\n]/g, " ")}`,
    `DESCRIPTION:${description.replace(/[,;\n]/g, " ")}`,
    `LOCATION:${location.replace(/[,;\n]/g, " ")}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "appointment.ics");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  service: ParsedServiceItem;
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
      className={`group relative p-5 rounded-2xl transition-all duration-200 cursor-pointer ${
        selected
          ? "border-2 border-[#1D1D1F] bg-zinc-50/40 shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
          : "border-2 border-black/[0.06] bg-white hover:border-zinc-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.03)] active:scale-[0.99]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          {/* Category Badge & Duration */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600">
              {service.category || "General"}
            </span>
            <span className="text-zinc-300 text-xs">·</span>
            <span className="text-xs font-medium text-zinc-500 inline-flex items-center gap-1 font-mono">
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {service.duration_minutes} min
            </span>
          </div>

          {/* Title & Description */}
          <h3 className="capitalize font-bold text-base text-[#1D1D1F] tracking-tight group-hover:text-black">
            {service.name}
          </h3>
          {service.cleanDescription && (
            <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
              {service.cleanDescription}
            </p>
          )}

          {/* Deposit Pill (if enabled) */}
          {service.deposit_required_mur > 0 && (
            <div className="pt-1">
              <span className="inline-flex items-center text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                Rs {service.deposit_required_mur} deposit required
              </span>
            </div>
          )}
        </div>

        {/* Price & Selection Radio */}
        <div className="flex flex-col items-end justify-center gap-3 shrink-0 self-center">
          <div className="text-right">
            <span className="text-xs font-medium text-zinc-400 mr-1">Rs</span>
            <span className="font-mono font-bold text-lg text-[#1D1D1F] tracking-tight">
              {service.price_mur}
            </span>
          </div>
          <div
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
              selected
                ? "border-[#1D1D1F] bg-[#1D1D1F]"
                : "border-zinc-300 group-hover:border-zinc-400"
            }`}
          >
            {selected && (
              <div className="w-2 h-2 rounded-full bg-white" />
            )}
          </div>
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
  const [selectedService, setSelectedService] = useState<ParsedServiceItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

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
      const createdBooking = json.booking as BookingConfirmation;
      const matchedStaff = catalog?.staff?.find((s) => s.id === selectedStaffId);
      createdBooking.service_name = createdBooking.service_name || selectedService.name;
      createdBooking.stylist_name = createdBooking.stylist_name || matchedStaff?.name;
      createdBooking.formatted_date = createdBooking.formatted_date || formatDateLabel(new Date(createdBooking.start_time));
      createdBooking.total_price = createdBooking.total_price ?? selectedService.price_mur;
      createdBooking.balance_due = createdBooking.balance_due ?? Math.max(0, selectedService.price_mur - (depositRequired ? depositAmount : 0));
      setBooking(createdBooking);
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

  const parsedServices = useMemo(
    () => (catalog?.services ?? []).map(parseServiceItem),
    [catalog?.services]
  );

  const categories = useMemo(() => {
    const specificCats = new Set<string>();
    let hasGeneral = false;

    parsedServices.forEach((s) => {
      const cat = s.category?.trim();
      if (!cat || cat.toLowerCase() === "general" || cat.toLowerCase() === "uncategorized") {
        hasGeneral = true;
      } else {
        specificCats.add(cat);
      }
    });

    const result = ["All", ...Array.from(specificCats)];
    if (hasGeneral) {
      result.push("General");
    }
    return result;
  }, [parsedServices]);

  const filteredServices = useMemo(() => {
    if (selectedCategory === "All") return parsedServices;
    return parsedServices.filter((s) => {
      const cat = (s.category || "General").trim().toLowerCase();
      const sel = selectedCategory.trim().toLowerCase();
      if (sel === "general") {
        return cat === "general" || cat === "uncategorized" || !s.category;
      }
      return cat === sel;
    });
  }, [parsedServices, selectedCategory]);

  function resetFlow() {
    setStep(1);
    setSelectedService(null);
    setSelectedCategory("All");
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

  const { salon } = catalog;
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
    const confirmedBooking = booking;
    const serviceName = confirmedBooking.service_name || selectedService?.name || "Service";
    const matchedStaff = catalog?.staff?.find((s) => s.id === selectedStaffId);
    const stylistName = confirmedBooking.stylist_name || matchedStaff?.name;
    const formattedDate = confirmedBooking.formatted_date || formatDateLabel(new Date(confirmedBooking.start_time));
    const formattedTime = formatTimeLocal(confirmedBooking.start_time);
    const balanceDue = confirmedBooking.balance_due ?? (confirmedBooking.total_price !== undefined ? confirmedBooking.total_price : Math.max(0, (selectedService?.price_mur ?? 0) - (depositRequired ? depositAmount : 0)));
    const locationText = salon.address || salon.town || fullAddress || "Mauritius";
    const mapsUrl = salon.maps_url || (fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${salon.name}, ${fullAddress}`)}` : null);

    const calUrl = buildGoogleCalendarUrl(
      `${serviceName} @ ${salon.name}`,
      confirmedBooking.start_time,
      confirmedBooking.end_time,
      `${salon.name}, ${locationText}`,
    );

    function handleAddToGoogleCalendar() {
      window.open(calUrl, "_blank", "noopener,noreferrer");
    }

    function handleDownloadICS() {
      downloadICS({
        title: `${serviceName} @ ${salon.name}`,
        description: `Appointment for ${serviceName}${stylistName ? ` with ${stylistName}` : ""} at ${salon.name}. Booking ID: #${confirmedBooking.id.slice(0, 8).toUpperCase()}`,
        location: `${salon.name}, ${locationText}`,
        startTime: confirmedBooking.start_time,
        endTime: confirmedBooking.end_time,
      });
    }

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
              {/* Service & Stylist Row */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-zinc-400">Service</span>
                <span className="text-xs font-semibold text-[#1D1D1F] capitalize text-right">
                  {confirmedBooking.service_name || serviceName} {confirmedBooking.stylist_name || stylistName ? `· with ${confirmedBooking.stylist_name || stylistName}` : ""}
                </span>
              </div>

              {/* Date & Time */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-zinc-400">Date &amp; Time</span>
                <span className="text-xs font-semibold text-[#1D1D1F] text-right font-mono">
                  {confirmedBooking.formatted_date || formattedDate} · {formattedTime}
                </span>
              </div>

              {/* Salon Location / Directions */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-zinc-400">Location</span>
                <span className="text-xs font-medium text-zinc-700 text-right max-w-[200px] truncate">
                  {salon.address || salon.town || locationText}
                </span>
              </div>

              {/* Price & Balance Due */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-zinc-400">Amount Due at Chair</span>
                <div className="text-right">
                  <span className="font-mono font-bold text-xs text-[#1D1D1F]">
                    Rs {confirmedBooking.balance_due ?? balanceDue}
                  </span>
                  <span className="block text-[10px] text-zinc-400">MCB Juice or Cash</span>
                </div>
              </div>

              {/* Customer */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-zinc-400">Customer</span>
                <span className="text-xs font-semibold text-zinc-700 text-right">{confirmedBooking.customer_name}</span>
              </div>

              {/* Deposit Row if paid */}
              {depositRequired && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-zinc-400">Deposit Paid</span>
                  <span className="text-xs font-semibold text-emerald-600 font-mono text-right">
                    Rs {depositAmount} (Juice submitted)
                  </span>
                </div>
              )}

              {/* Booking ID */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-zinc-400">Booking ID</span>
                <span className="text-xs font-mono font-semibold text-zinc-700 text-right">
                  #{confirmedBooking.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            </div>

            {/* Calendar & Directions Action Buttons */}
            <div className="space-y-2 mt-6">
              <button
                type="button"
                onClick={handleAddToGoogleCalendar}
                className="w-full bg-[#1D1D1F] hover:bg-black text-white text-xs font-semibold py-3.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                Add to Google Calendar
              </button>
              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadICS}
                  className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  Add to Apple Calendar (.ics)
                </button>
                {mapsUrl && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                      Get Directions ↗
                    </a>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={resetFlow}
              className="w-full py-3 mt-3 text-xs text-[#86868B] hover:text-[#1D1D1F] transition-colors"
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

            {/* Dynamic Appointment Docket */}
            <div className="pt-5 border-t border-zinc-100 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Appointment Summary
              </h3>
              {selectedService ? (
                <div className="rounded-2xl bg-gradient-to-b from-zinc-50/80 to-zinc-100/50 border border-zinc-200/80 p-4 space-y-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-200/60 px-2 py-0.5 rounded-md">
                        {selectedService.category || "Service"}
                      </span>
                      <h4 className="capitalize font-bold text-sm text-[#1D1D1F] mt-1.5 truncate">
                        {selectedService.name}
                      </h4>
                      <p className="text-xs text-zinc-500 mt-0.5 font-mono inline-flex items-center gap-1">
                        <span>⏱</span> {selectedService.duration_minutes} min
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-medium text-zinc-400 mr-0.5">Rs</span>
                      <span className="font-mono font-bold text-base text-[#1D1D1F]">
                        {selectedService.price_mur}
                      </span>
                    </div>
                  </div>

                  {selectedSlot ? (
                    <div className="pt-2.5 border-t border-zinc-200/60 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Appointment</span>
                      <span className="font-semibold text-[#1D1D1F] font-mono">
                        {formatDateLabel(new Date(selectedSlot.start))} · {formatTimeLocal(selectedSlot.start)}
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2.5 border-t border-zinc-200/60 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Schedule</span>
                      <span className="italic">Pick in Step 2</span>
                    </div>
                  )}

                  {selectedService.deposit_required_mur > 0 ? (
                    <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between text-xs text-amber-800 bg-amber-50/90 -mx-1 px-2.5 py-1.5 rounded-xl border border-amber-200/60">
                      <span className="font-medium">Deposit Required</span>
                      <span className="font-bold font-mono">Rs {depositAmount}</span>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between text-[11px] text-emerald-700">
                      <span>Deposit</span>
                      <span className="font-medium">No deposit required</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-7 px-4 bg-zinc-50/70 rounded-2xl border border-dashed border-zinc-200 flex flex-col items-center justify-center text-center">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-zinc-200/60 shadow-sm flex items-center justify-center text-lg mb-2.5 text-zinc-400">
                    ✂
                  </div>
                  <p className="text-xs font-semibold text-zinc-700">No service selected</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Select a service to start booking</p>
                </div>
              )}
            </div>

            {/* Trust & Verification Badges */}
            <div className="mt-8 pt-6 border-t border-zinc-100 space-y-3">
              <div className="flex items-center gap-2.5 text-xs text-zinc-500">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>Instant WhatsApp confirmation</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-zinc-500">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>Secure MCB Juice P2P deposit</span>
              </div>
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

                {/* Category Filter Tabs at the Top */}
                {categories.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-1 mb-6">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                          selectedCategory.toLowerCase() === cat.toLowerCase()
                            ? "bg-[#1D1D1F] text-white shadow-sm"
                            : "bg-zinc-100 hover:bg-zinc-200/80 text-zinc-600 border border-transparent"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-2.5">
                  {filteredServices.map((service) => (
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
                    <span className="capitalize">{selectedService?.name}</span> &bull; {selectedService?.duration_minutes} min
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
                            className={`capitalize px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
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
                      <p className="capitalize font-semibold text-sm truncate">{selectedService.name}</p>
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
                <span className="truncate">Continue with <span className="capitalize">{selectedService.name}</span></span>
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
