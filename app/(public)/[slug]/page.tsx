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

// ─── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
              n < current
                ? "bg-indigo-500 text-white"
                : n === current
                  ? "bg-indigo-600 text-white ring-2 ring-indigo-600 ring-offset-2"
                  : "bg-zinc-200/80 text-zinc-400"
            }`}
          >
            {n < current ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              n
            )}
          </div>
          {n < total && (
            <div
              className={`h-0.5 w-6 transition-all duration-300 ${
                n < current ? "bg-indigo-500" : "bg-zinc-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Service card ──────────────────────────────────────────────────────────────

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
    <button
      onClick={onSelect}
        className={`w-full min-h-[112px] text-left rounded-[24px] border p-5 transition-all duration-200 active:scale-[0.98] ${
        selected
          ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-600/20"
          : "border-zinc-200/80 bg-white/90 text-zinc-800 shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:border-zinc-300 hover:shadow-lg"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base leading-snug">{service.name}</p>
          {service.description && (
            <p
              className={`text-sm mt-0.5 leading-relaxed ${
                selected ? "text-zinc-300" : "text-zinc-500"
              }`}
            >
              {service.description}
            </p>
          )}
          <div
            className={`flex items-center gap-3 mt-2 text-sm ${
              selected ? "text-zinc-300" : "text-zinc-500"
            }`}
          >
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {service.duration_minutes} min
            </span>
            {service.deposit_required_mur > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  selected ? "bg-zinc-700 text-zinc-200" : "bg-amber-50 text-amber-700"
                }`}
              >
                Rs {service.deposit_required_mur} deposit
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-bold ${selected ? "text-white" : "text-zinc-900"}`}>
            Rs {service.price_mur}
          </p>
          {selected && (
            <div className="mt-1 flex justify-end">
              <div className="h-5 w-5 rounded-full bg-emerald-400 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Date picker ───────────────────────────────────────────────────────────────

function DatePicker({
  selected,
  onSelect,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
}) {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
    >
      {days.map((day) => {
        const isSelected = isSameDay(day, selected);
        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelect(day)}
          className={`snap-start flex-shrink-0 flex flex-col items-center justify-center w-16 min-h-[80px] rounded-2xl border transition-all duration-200 active:scale-95 ${
              isSelected
                ? "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "border-zinc-200/80 bg-white/80 text-zinc-700 hover:border-indigo-300"
            }`}
          >
            <span
              className={`text-xs font-medium uppercase tracking-wide ${
                isSelected ? "text-zinc-300" : "text-zinc-400"
              }`}
            >
              {format(day, "EEE")}
            </span>
            <span className="text-xl font-bold mt-0.5">{format(day, "d")}</span>
            <span className={`text-xs ${isSelected ? "text-zinc-300" : "text-zinc-400"}`}>
              {format(day, "MMM")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Time slot grid ────────────────────────────────────────────────────────────

function TimeSlotGrid({
  results,
  selectedSlot,
  selectedStaffId,
  onSelect,
}: {
  results: StaffSlotResult[];
  selectedSlot: AvailableSlot | null;
  selectedStaffId: string | null;
  onSelect: (slot: AvailableSlot, staffId: string) => void;
}) {
  const rows = selectedStaffId
    ? results.filter((r) => r.staffId === selectedStaffId)
    : results;

  if (rows.length === 0 || rows.every((r) => r.slots.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
        <svg
          className="w-12 h-12 mb-3 opacity-40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="font-medium text-zinc-500">No slots available</p>
        <p className="text-sm mt-1">Try a different date</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((staffRow) => (
        <div key={staffRow.staffId}>
          {results.length > 1 && (
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              {staffRow.staffName}
            </p>
          )}
          {staffRow.slots.length === 0 ? (
            <p className="text-sm text-zinc-400 py-2">No slots for this barber</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {staffRow.slots.map((slot) => {
                const isSelected =
                  selectedSlot?.start === slot.start &&
                  selectedStaffId === staffRow.staffId;
                return (
                  <button
                    key={slot.start}
                    onClick={() => onSelect(slot, staffRow.staffId)}
                    className={`min-h-[48px] py-2.5 px-1 rounded-2xl border-2 text-sm font-semibold transition-all duration-150 active:scale-95 ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "border-zinc-200/80 bg-white/80 text-zinc-700 hover:border-indigo-300"
                    }`}
                  >
                    {formatTimeLocal(slot.start)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page header ───────────────────────────────────────────────────────────────

function SalonHeader({ name, address, district }: { name: string; address: string; district: string }) {
  return (
    <div className="mb-1 flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-indigo-600 shadow-lg shadow-indigo-600/20">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14.121 7.879a3 3 0 11-4.242 4.242M9.879 9.879A3 3 0 0114.12 14.12M9.879 9.879L7 7m2.879 2.879l4.242 4.242M7 7l-3 3m3-3l3 3"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><h1 className="truncate text-lg font-semibold leading-tight tracking-[-0.03em] text-zinc-950">{name}</h1><span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:inline">Open for bookings</span></div>
        <p className="truncate text-xs text-zinc-500">
          {address}, {district}
        </p>
      </div>
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
      const json = await res.json();
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

  // ── Step 4: Confirmation ──
  if (step === 4 && booking) {
    const calUrl = buildGoogleCalendarUrl(
      `${selectedService?.name ?? "Appointment"} @ ${salon.name}`,
      booking.start_time,
      booking.end_time,
      `${salon.name}, ${salon.address}`,
    );
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col">
        <div className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-zinc-900 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.121 7.879a3 3 0 11-4.242 4.242M9.879 9.879A3 3 0 0114.12 14.12M9.879 9.879L7 7m2.879 2.879l4.242 4.242M7 7l-3 3m3-3l3 3"
              />
            </svg>
          </div>
          <h1 className="font-bold text-zinc-900 text-lg leading-tight truncate">{salon.name}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="flex justify-center mb-6">
              <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 text-center mb-1">Booking Confirmed!</h2>
            <p className="text-zinc-500 text-sm text-center mb-6">
              {"We'll send a reminder before your appointment."}
            </p>
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-4">
              <div className="px-4 py-3 bg-zinc-900 text-white">
                <p className="font-semibold">{selectedService?.name}</p>
                <p className="text-zinc-300 text-sm">{salon.name}</p>
              </div>
              <div className="divide-y divide-zinc-100">
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
            </div>
            <div className="flex items-start gap-2 text-zinc-500 text-sm mb-6 px-1">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>
                {salon.address}, {salon.district}
              </span>
            </div>
            <a
              href={calUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-3.5 px-4 bg-white border-2 border-zinc-200 rounded-2xl font-semibold text-zinc-800 hover:border-zinc-400 transition-colors active:scale-[0.98] mb-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" strokeWidth="1.8" />
                <path d="M3 9h18" stroke="#4285F4" strokeWidth="1.8" />
                <path d="M8 2v4M16 2v4" stroke="#4285F4" strokeWidth="1.8" strokeLinecap="round" />
                <path
                  d="M8 14l2 2 4-4"
                  stroke="#34A853"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Add to Google Calendar
            </a>
            <button
              onClick={resetFlow}
              className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              Book another appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Steps 1–3 ──
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      {/* Sticky header */}
      <div className="safe-top sticky top-0 z-20 border-b border-zinc-200/70 bg-white/80 px-4 pt-4 pb-0 shadow-sm backdrop-blur-xl">
        <SalonHeader name={salon.name} address={salon.address} district={salon.district} />
        <StepIndicator current={step} total={3} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto bg-[#f5f5f7] px-3 py-4 sm:px-5">
        <div className="mx-auto min-h-full max-w-2xl rounded-[32px] border border-white/80 bg-white/60 px-4 pb-36 pt-2 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:px-6">

          {/* ── STEP 1: Service ── */}
          {step === 1 && (
            <div className="space-y-4 pt-4">
              <div className="rounded-[24px] bg-white/50 p-1">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Step 1 of 3</p>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-zinc-900">Choose a Service</h2>
                <p className="mt-1 text-sm text-zinc-500">Select what you&apos;d like done today</p>
              </div>
              <div className="space-y-3">
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

          {/* ── STEP 2: Date & Time ── */}
          {step === 2 && (
            <div className="space-y-5 pt-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Step 2 of 3</p>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-zinc-900">Pick a Date & Time</h2>
                <p className="text-zinc-500 text-sm mt-0.5">
                  {selectedService?.name} · {selectedService?.duration_minutes} min
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Date
                </p>
                <DatePicker selected={selectedDate} onSelect={setSelectedDate} />
              </div>

              {catalog.staff.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Barber (optional)
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        setSelectedStaffId(null);
                        setSelectedSlot(null);
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        selectedStaffId === null
                        ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white/80 text-zinc-700 border-zinc-200 hover:border-indigo-300"
                      }`}
                    >
                      Any
                    </button>
                    {catalog.staff.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedStaffId(s.id);
                          setSelectedSlot(null);
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                          selectedStaffId === s.id
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white/80 text-zinc-700 border-zinc-200 hover:border-indigo-300"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Available Times
                </p>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-8 w-8 rounded-full border-4 border-zinc-200 border-t-zinc-900 animate-spin" />
                  </div>
                ) : slotsError ? (
                  <div className="py-6 text-center">
                    <p className="text-red-500 text-sm">{slotsError}</p>
                    <button
                      onClick={() => setSelectedDate(new Date(selectedDate))}
                      className="mt-2 text-sm text-zinc-500 underline"
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
                  />
                ) : null}
              </div>
            </div>
          )}

          {/* ── STEP 3: Customer + Juice Deposit ── */}
          {step === 3 && (
            <div className="space-y-5 pt-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Step 3 of 3</p>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-zinc-900">Your Details</h2>
                <p className="text-zinc-500 text-sm mt-0.5">Almost done — tell us who you are</p>
              </div>

              {/* Booking summary chip */}
              {selectedService && selectedSlot && (
                <div className="flex items-center gap-3 bg-zinc-900 text-white rounded-2xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{selectedService.name}</p>
                    <p className="text-zinc-300 text-xs mt-0.5">
                      {formatDateLabel(new Date(selectedSlot.start))} ·{" "}
                      {formatTimeLocal(selectedSlot.start)}
                    </p>
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline shrink-0"
                  >
                    Change
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ravi Jugurnath"
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 transition-colors text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-1.5">
                    WhatsApp / Phone
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+230 5XXX XXXX"
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 transition-colors text-base font-mono"
                  />
                  <p className="text-xs text-zinc-400 mt-1">Reminders will be sent to this number</p>
                </div>

                {/* MCB Juice Deposit */}
                {depositRequired && (
                  <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M12 9v2m0 4h.01"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-amber-800">
                          MCB Juice Deposit Required
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          {"A deposit of "}
                          <span className="font-bold">
                            Rs {depositAmount}
                          </span>
                          {" must be paid via MCB Juice to confirm your booking."}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-amber-200 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 font-medium">Send to Juice number</span>
                        <span className="text-sm font-bold text-zinc-900 font-mono">
                          {juicePhone ?? "—"}
                        </span>
                      </div>
                      {juiceAccountName && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500 font-medium">Account name</span>
                          <span className="text-sm font-semibold text-zinc-800">
                            {juiceAccountName}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 font-medium">Amount</span>
                          <span className="text-sm font-bold text-emerald-600">Rs {depositAmount}</span>
                        </div>
                        {juiceDeepLink && juicePhone && (
                          <div className="mt-3 flex items-center gap-3 border-t border-amber-100 pt-3">
                            <Image src={`/api/v1/public/juice-qr?phone=${encodeURIComponent(juicePhone)}&amount=${depositAmount}`} alt="MCB Juice payment QR" width={80} height={80} className="h-20 w-20 rounded-lg" />
                            <div className="flex-1">
                              <a href={juiceDeepLink} className="block rounded-xl bg-amber-500 px-3 py-2 text-center text-sm font-bold text-white">Pay via MCB Juice</a>
                              <p className="mt-1 text-[11px] text-amber-700">Or scan the QR, then enter your reference below.</p>
                            </div>
                          </div>
                        )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-amber-800 mb-1.5">
                        Juice Transaction Reference
                      </label>
                      <input
                        type="text"
                        value={juiceRef}
                        onChange={(e) => setJuiceRef(e.target.value)}
                        placeholder="e.g. TXN123456789"
                        className="w-full px-4 py-3.5 rounded-xl border-2 border-amber-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-amber-500 transition-colors text-base font-mono"
                      />
                      <p className="text-xs text-amber-700 mt-1">
                        Found in your MCB Juice receipt / SMS confirmation
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {submitError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-red-600 text-sm font-medium">{submitError}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom action bar */}
      <div className="safe-bottom fixed bottom-0 inset-x-0 z-30 border-t border-zinc-200/70 bg-white/85 px-4 py-4 shadow-[0_-16px_40px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
          <div className="max-w-2xl mx-auto flex min-h-[56px] gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="flex items-center justify-center h-14 w-14 rounded-2xl border-2 border-zinc-200 text-zinc-600 hover:border-zinc-400 active:scale-95 transition-all shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {step === 1 && (
            <button
              disabled={!selectedService}
              onClick={() => setStep(2)}
              className="flex-1 h-14 rounded-2xl bg-zinc-900 text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg shadow-zinc-900/20 hover:bg-black"
            >
              {selectedService
                ? `Continue with ${selectedService.name}`
                : "Select a service"}
            </button>
          )}

          {step === 2 && (
            <button
              disabled={!step2CanProceed}
              onClick={() => setStep(3)}
              className="flex-1 h-14 rounded-2xl bg-zinc-900 text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg shadow-zinc-900/20 hover:bg-black"
            >
              {step2CanProceed
                ? `Confirm ${formatTimeLocal(selectedSlot!.start)}`
                : "Select a time slot"}
            </button>
          )}

          {step === 3 && (
            <button
              disabled={!step3CanProceed || submitting}
              onClick={handleBook}
              className="flex-1 h-14 rounded-2xl bg-zinc-900 text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg shadow-zinc-900/20 hover:bg-black flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-zinc-500 border-t-white animate-spin" />
                  Booking…
                </>
              ) : (
                "Confirm Booking"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
