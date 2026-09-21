"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────
export type SalonData = {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
  district: string;
  juice_phone: string | null;
  juice_account_name: string | null;
  currency: string;
  is_active: boolean;
  logo_url: string | null;
  brand_color: string;
  booking_title: string | null;
  cancellation_policy: string | null;
  deposit_deadline_minutes: number;
};

export type StaffMember = {
  id: string;
  salon_id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  role?: string;
  chair_number?: string | null;
  working_days?: number[];
  shift_label?: string;
};

export type ServiceItem = {
  id: string;
  salon_id: string;
  name: string;
  description: string | null;
  category: string;
  cleanDescription: string;
  duration_minutes: number;
  price_mur: number;
  deposit_required_mur: number;
  is_active: boolean;
  assignedStaffIds: string[];
};

export type WorkingHourItem = {
  id?: string;
  staff_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_closed: boolean;
};

export type SalonClosureItem = {
  id: string;
  salon_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

type Props = {
  initialSalon: SalonData;
  initialStaff: StaffMember[];
  initialServices: ServiceItem[];
  initialWorkingHours: WorkingHourItem[];
  initialClosures: SalonClosureItem[];
  initialIsEmergencyPaused: boolean;
};

type TabId = "services" | "team" | "hours" | "juice" | "profile";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "services", label: "Services & Menu", icon: "✂" },
  { id: "team", label: "Team & Staff", icon: "👥" },
  { id: "hours", label: "Hours & Breaks", icon: "⏱" },
  { id: "juice", label: "MCB Juice", icon: "💳" },
  { id: "profile", label: "Salon Profile", icon: "💈" },
];

const PRESET_CATEGORIES = ["Men", "Women", "Beards", "Kids", "Treatments"];
const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

// Phone formatter for Mauritius: +230 5XXX XXXX
function formatMauritiusPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  let national = digits;
  if (digits.startsWith("230")) {
    national = digits.slice(3);
  }
  if (national.length === 0) return "+230 ";
  if (national.length <= 4) {
    return `+230 ${national}`;
  }
  return `+230 ${national.slice(0, 4)} ${national.slice(4, 8)}`;
}

// Format compact working days badge (e.g. "Mon – Sat · 09:00 – 18:00")
function formatShiftLabel(days: number[], startTime = "09:00", endTime = "18:00"): string {
  if (days.length === 0) return "Not scheduled";
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sorted = [...days].sort((a, b) => a - b);
  
  // Check if consecutive Mon-Sat
  if (sorted.length === 6 && !sorted.includes(0)) {
    return `Mon – Sat · ${startTime} – ${endTime}`;
  }
  if (sorted.length === 5 && sorted.join(",") === "2,3,4,5,6") {
    return `Tue – Sat · ${startTime} – ${endTime}`;
  }
  if (sorted.length === 7) {
    return `Everyday · ${startTime} – ${endTime}`;
  }
  
  const formattedDays = sorted.map((d) => dayLabels[d]).join(", ");
  return `${formattedDays} · ${startTime} – ${endTime}`;
}

export default function SettingsClient({
  initialSalon,
  initialStaff,
  initialServices,
  initialWorkingHours,
  initialClosures,
  initialIsEmergencyPaused,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("services");
  const [isPending, startTransition] = useTransition();

  // Floating save feedback
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Changes saved");

  function triggerSavedToast(msg = "Changes saved") {
    setToastMessage(msg);
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
    }, 2800);
  }

  // ── Tab 1: Services & Categories State ────────────────────────────────
  const [services, setServices] = useState<ServiceItem[]>(initialServices);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCatInput, setNewCatInput] = useState("");
  const [showAddCatModal, setShowAddCatModal] = useState(false);

  // Service Edit/Add Modal
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState(false);

  // All distinct categories
  const allCategories = useMemo(() => {
    return Array.from(
      new Set([
        ...PRESET_CATEGORIES,
        ...customCategories,
        ...services.map((s) => s.category).filter(Boolean),
      ])
    );
  }, [customCategories, services]);

  // Categories list with counts for pills
  const categoriesWithCounts = useMemo(() => {
    const list = [
      { id: "All", name: "All", count: services.length },
      ...allCategories.map((cat) => ({
        id: cat,
        name: cat,
        count: services.filter((s) => s.category.toLowerCase() === cat.toLowerCase()).length,
      })),
    ];
    return list;
  }, [allCategories, services]);

  // Filtered services
  const filteredServices =
    selectedCategory === "All"
      ? services
      : services.filter((s) => s.category.toLowerCase() === selectedCategory.toLowerCase());

  // ── Tab 2: Team & Staff State ─────────────────────────────────────────
  // Calculate initial shifts per staff from working_hours
  const initialStaffWithShifts = useMemo(() => {
    return initialStaff.map((member) => {
      const specificHours = initialWorkingHours.filter((h) => h.staff_id === member.id && !h.is_closed);
      const activeDays = specificHours.length > 0 ? specificHours.map((h) => h.day_of_week) : [1, 2, 3, 4, 5, 6];
      return {
        ...member,
        working_days: activeDays,
        shift_label: formatShiftLabel(activeDays, "09:00", "18:00"),
      };
    });
  }, [initialStaff, initialWorkingHours]);

  const [staff, setStaff] = useState<StaffMember[]>(initialStaffWithShifts);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [isNewStaffModalOpen, setIsNewStaffModalOpen] = useState(false);
  const [staffWorkingDays, setStaffWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [staffAssignedServices, setStaffAssignedServices] = useState<string[]>([]);

  // ── Tab 3: Operating Hours, Breaks & Closures State ────────────────────
  // Normalize 7 days of salon-level working hours (standard 09:00 - 18:00 full days)
  const normalizedHours = DAYS_OF_WEEK.map((_, dayOfWeek) => {
    const found = initialWorkingHours.find(
      (h) => h.staff_id === null && h.day_of_week === dayOfWeek
    );
    return (
      found || {
        day_of_week: dayOfWeek,
        start_time: "09:00",
        end_time: "18:00",
        is_closed: dayOfWeek === 0,
        staff_id: null,
      }
    );
  });

  const [hours, setHours] = useState<WorkingHourItem[]>(normalizedHours);
  const breakWindow = {
    enabled: true,
    startTime: "12:30",
    endTime: "13:30",
  };
  const [isEmergencyPaused, setIsEmergencyPaused] = useState(initialIsEmergencyPaused);
  const [closures, setClosures] = useState<SalonClosureItem[]>(initialClosures);
  const [newClosureDate, setNewClosureDate] = useState("");
  const [newClosureReason, setNewClosureReason] = useState("");
  const [showAddClosureModal, setShowAddClosureModal] = useState(false);

  // ── Tab 4: Payments & MCB Juice State ──────────────────────────────────
  const [juicePhone, setJuicePhone] = useState(initialSalon.juice_phone || "");
  const [juiceAccountName, setJuiceAccountName] = useState(initialSalon.juice_account_name || "");
  const [cancellationPolicy, setCancellationPolicy] = useState(initialSalon.cancellation_policy || "");
  const [globalDepositPolicy, setGlobalDepositPolicy] = useState<"custom" | "all">("custom");
  const [defaultDepositAmount, setDefaultDepositAmount] = useState<number>(200);
  const [juiceQrPreview, setJuiceQrPreview] = useState<string | null>(null);

  // ── Tab 5: Salon Profile State ────────────────────────────────────────
  // Parse address and optional Google Maps URL
  const initialAddressMatch = initialSalon.address.match(/^([\s\S]*?)(?:\s*\[maps:([\s\S]*?)\])?$/);
  const cleanInitialAddress = initialAddressMatch ? initialAddressMatch[1].trim() : initialSalon.address;
  const initialMapsUrl = initialAddressMatch && initialAddressMatch[2] ? initialAddressMatch[2].trim() : "";

  const [salonProfile, setSalonProfile] = useState({
    name: initialSalon.name,
    slug: initialSalon.slug,
    phone: initialSalon.phone,
    address: cleanInitialAddress,
    googleMapsUrl: initialMapsUrl,
    district: initialSalon.district,
    brand_color: initialSalon.brand_color || "#18181b",
    booking_title: initialSalon.booking_title || "",
    logo_url: initialSalon.logo_url || null,
  });

  const [logoMode, setLogoMode] = useState<"initials" | "image">(
    initialSalon.logo_url && (initialSalon.logo_url.startsWith("http") || initialSalon.logo_url.startsWith("data:"))
      ? "image"
      : "initials"
  );

  // ── Generic API Action Dispatcher ─────────────────────────────────────
  async function callSettingsApi(action: string, payload: unknown) {
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload, salonId: initialSalon.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Operation failed");
      }
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      alert(msg);
      throw err;
    }
  }

  // ── Services Actions ──────────────────────────────────────────────────
  async function handleSaveService(serviceData: Partial<ServiceItem>) {
    startTransition(async () => {
      const payload = {
        id: serviceData.id,
        name: serviceData.name,
        category: serviceData.category || "General",
        description: serviceData.cleanDescription,
        duration_minutes: serviceData.duration_minutes,
        price_mur: serviceData.price_mur,
        deposit_required_mur: serviceData.deposit_required_mur,
        is_active: serviceData.is_active ?? true,
        assignedStaffIds: serviceData.assignedStaffIds || [],
      };

      const result = await callSettingsApi("save_service", payload);
      const savedId = result.serviceId || serviceData.id;

      setServices((prev) => {
        const existingIdx = prev.findIndex((s) => s.id === savedId);
        const updatedItem: ServiceItem = {
          id: savedId,
          salon_id: initialSalon.id,
          name: serviceData.name || "",
          category: serviceData.category || "General",
          cleanDescription: serviceData.cleanDescription || "",
          description: `[${serviceData.category || "General"}] ${serviceData.cleanDescription || ""}`,
          duration_minutes: serviceData.duration_minutes || 30,
          price_mur: serviceData.price_mur || 0,
          deposit_required_mur: serviceData.deposit_required_mur || 0,
          is_active: serviceData.is_active ?? true,
          assignedStaffIds: serviceData.assignedStaffIds || [],
        };
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = updatedItem;
          return next;
        }
        return [...prev, updatedItem];
      });

      setEditingService(null);
      setIsNewServiceModalOpen(false);
      triggerSavedToast("Service saved");
    });
  }

  async function handleToggleServiceActive(serviceId: string, currentActive: boolean) {
    const nextState = !currentActive;
    setServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, is_active: nextState } : s))
    );

    const srv = services.find((s) => s.id === serviceId);
    if (!srv) return;

    await callSettingsApi("save_service", {
      ...srv,
      is_active: nextState,
    });
    triggerSavedToast(nextState ? "Service activated" : "Service paused");
  }

  async function handleDeleteService(serviceId: string) {
    if (!confirm("Are you sure you want to delete this service?")) return;
    startTransition(async () => {
      await callSettingsApi("delete_service", { serviceId });
      setServices((prev) => prev.filter((s) => s.id !== serviceId));
      setEditingService(null);
      setIsNewServiceModalOpen(false);
      triggerSavedToast("Service deleted");
    });
  }

  // ── Team & Staff Actions ──────────────────────────────────────────────
  async function handleToggleStaffActive(staffId: string, currentActive: boolean) {
    const nextState = !currentActive;
    setStaff((prev) =>
      prev.map((m) => (m.id === staffId ? { ...m, is_active: nextState } : m))
    );

    await callSettingsApi("toggle_staff_active", {
      staffId,
      isActive: nextState,
    });
    triggerSavedToast(nextState ? "Stylist activated" : "Stylist on leave");
  }

  async function handleSaveStaff(staffData: Partial<StaffMember>) {
    startTransition(async () => {
      const workingDaysPayload = DAYS_OF_WEEK.map((_, dayOfWeek) => ({
        dayOfWeek,
        startTime: "09:00",
        endTime: "18:00",
        isClosed: !staffWorkingDays.includes(dayOfWeek),
      }));

      const payload = {
        id: staffData.id,
        name: staffData.name,
        phone: staffData.phone,
        is_active: staffData.is_active ?? true,
        assignedServiceIds: staffAssignedServices,
        workingDays: workingDaysPayload,
      };

      const result = await callSettingsApi("save_staff", payload);
      const savedId = result.staffId || staffData.id;

      const shiftLabel = formatShiftLabel(staffWorkingDays, "09:00", "18:00");

      setStaff((prev) => {
        const existingIdx = prev.findIndex((m) => m.id === savedId);
        const updatedItem: StaffMember = {
          id: savedId,
          salon_id: initialSalon.id,
          name: staffData.name || "",
          phone: staffData.phone || null,
          is_active: staffData.is_active ?? true,
          role: staffData.role || "Stylist",
          chair_number: staffData.chair_number || null,
          working_days: staffWorkingDays,
          shift_label: shiftLabel,
        };
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = updatedItem;
          return next;
        }
        return [...prev, updatedItem];
      });

      // Update services that have this staff assigned
      setServices((prev) =>
        prev.map((srv) => {
          const isAssigned = staffAssignedServices.includes(srv.id);
          const hasAlready = srv.assignedStaffIds.includes(savedId);
          if (isAssigned && !hasAlready) {
            return { ...srv, assignedStaffIds: [...srv.assignedStaffIds, savedId] };
          }
          if (!isAssigned && hasAlready) {
            return {
              ...srv,
              assignedStaffIds: srv.assignedStaffIds.filter((id) => id !== savedId),
            };
          }
          return srv;
        })
      );

      setEditingStaff(null);
      setIsNewStaffModalOpen(false);
      triggerSavedToast("Team member saved");
    });
  }

  async function handleRemoveStaff(staffId: string) {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    startTransition(async () => {
      await callSettingsApi("delete_staff", { staffId });
      setStaff((prev) => prev.filter((m) => m.id !== staffId));
      setServices((prev) =>
        prev.map((s) => ({
          ...s,
          assignedStaffIds: s.assignedStaffIds.filter((id) => id !== staffId),
        }))
      );
      setEditingStaff(null);
      setIsNewStaffModalOpen(false);
      triggerSavedToast("Team member removed");
    });
  }

  // ── Hours & Breaks Actions ────────────────────────────────────────────
  async function handleSaveHours() {
    startTransition(async () => {
      await callSettingsApi("save_hours", {
        hours: hours.map((h) => ({
          dayOfWeek: h.day_of_week,
          startTime: h.start_time,
          endTime: h.end_time,
          isClosed: h.is_closed,
        })),
        breakWindow,
      });
      triggerSavedToast("Operating hours saved");
    });
  }

  async function handleToggleEmergencyPause() {
    const nextPause = !isEmergencyPaused;
    setIsEmergencyPaused(nextPause);
    await callSettingsApi("toggle_emergency_pause", { pause: nextPause });
    triggerSavedToast(nextPause ? "Emergency Pause Enabled" : "Online bookings resumed");
  }

  async function handleAddClosure() {
    if (!newClosureDate) return;
    const startsAt = new Date(`${newClosureDate}T00:00:00`).toISOString();
    const endsAt = new Date(`${newClosureDate}T23:59:59`).toISOString();

    const result = await callSettingsApi("add_closure", {
      startsAt,
      endsAt,
      reason: newClosureReason || "Special Closure",
    });

    if (result.closure) {
      setClosures((prev) => [...prev, result.closure]);
      setNewClosureDate("");
      setNewClosureReason("");
      setShowAddClosureModal(false);
      triggerSavedToast("Closure date added");
    }
  }

  async function handleDeleteClosure(closureId: string) {
    await callSettingsApi("delete_closure", { closureId });
    setClosures((prev) => prev.filter((c) => c.id !== closureId));
    triggerSavedToast("Closure removed");
  }

  // ── MCB Juice Actions ─────────────────────────────────────────────────
  async function handleSaveJuice() {
    startTransition(async () => {
      await callSettingsApi("update_juice", {
        juice_phone: juicePhone,
        juice_account_name: juiceAccountName,
        cancellation_policy: cancellationPolicy,
        deposit_deadline_minutes: 30,
      });
      triggerSavedToast("Payment settings saved");
    });
  }

  function handleJuiceQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setJuiceQrPreview(dataUrl);
      triggerSavedToast("QR Code uploaded");
    };
    reader.readAsDataURL(file);
  }

  // ── Salon Profile Actions ─────────────────────────────────────────────
  async function handleSaveProfile() {
    startTransition(async () => {
      const fullAddress = salonProfile.googleMapsUrl.trim()
        ? `${salonProfile.address.trim()} [maps:${salonProfile.googleMapsUrl.trim()}]`
        : salonProfile.address.trim();

      await callSettingsApi("update_salon", {
        ...salonProfile,
        address: fullAddress,
      });
      triggerSavedToast("Salon profile updated");
      router.refresh();
    });
  }

  function handleLogoImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setSalonProfile((prev) => ({ ...prev, logo_url: dataUrl }));
      setLogoMode("image");
      triggerSavedToast("Logo uploaded");
    };
    reader.readAsDataURL(file);
  }

  const monogramText =
    salonProfile.name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  return (
    <div className="relative min-h-screen bg-[#F5F5F7] text-[#1D1D1F] pb-32">
      {/* ── Quiet Floating Top-Right Auto-Save Toast ─────────────────────── */}
      {showSavedToast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-[#1D1D1F] text-white px-4 py-2.5 rounded-2xl text-xs font-medium shadow-2xl transition-all animate-fade-in border border-white/10">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Header Title & Subtitle ──────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">
              Salon Settings
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Manage your services, staff roster, operating hours, and payment policies.
            </p>
          </div>

          {/* Quick link badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-zinc-200/80 rounded-full text-[11px] font-medium text-zinc-600 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              salonos.mu/{salonProfile.slug || "fresh-cuts"}
            </span>
          </div>
        </div>

        {/* ── Apple-Grade Segmented Top Navigation Bar ────────────────────── */}
        <div className="mt-5 p-1 bg-zinc-200/80 rounded-2xl flex overflow-x-auto gap-1 shadow-inner scrollbar-none">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-1 ${
                  active
                    ? "bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)] scale-[1.01]"
                    : "text-zinc-600 hover:text-[#1D1D1F] hover:bg-white/40"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Container ───────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-4">
        {/* ================================================================= */}
        {/* TAB 1: SERVICES & MENU                                           */}
        {/* ================================================================= */}
        {activeTab === "services" && (
          <div className="space-y-6 animate-fade-in">
            {/* Unified Category Filter Strip & Fixed Action Buttons */}
            <div className="flex items-center justify-between gap-4 mb-6">
              {/* Left: Horizontally Scrollable Category Pills with hidden scrollbar */}
              <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-1 min-w-0 flex-1">
                {categoriesWithCounts.map((cat) => {
                  const isSelected = selectedCategory.toLowerCase() === cat.id.toLowerCase();
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                        isSelected
                          ? "bg-[#1D1D1F] text-white shadow-sm"
                          : "bg-white border border-zinc-200/80 text-zinc-600 hover:border-zinc-300"
                      }`}
                    >
                      {cat.name} ({cat.count})
                    </button>
                  );
                })}
              </div>

              {/* Right: Fixed Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddCatModal(true)}
                  className="h-9 px-3.5 rounded-xl border border-zinc-200/80 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] transition-all"
                >
                  + Category
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingService({
                      id: "",
                      salon_id: initialSalon.id,
                      name: "",
                      category: selectedCategory === "All" ? "Men" : selectedCategory,
                      cleanDescription: "",
                      description: "",
                      duration_minutes: 30,
                      price_mur: 500,
                      deposit_required_mur: 0,
                      is_active: true,
                      assignedStaffIds: staff.map((s) => s.id),
                    });
                    setIsNewServiceModalOpen(true);
                  }}
                  className="h-9 px-4 rounded-xl bg-[#1D1D1F] text-white text-xs font-semibold hover:bg-black active:scale-[0.98] transition-all shadow-sm"
                >
                  + Add Service
                </button>
              </div>
            </div>

            {/* Service Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredServices.map((service) => {
                const assignedStaff = staff.filter((s) =>
                  service.assignedStaffIds.includes(s.id)
                );

                return (
                  <div
                    key={service.id}
                    className={`bg-white rounded-3xl border p-5 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between ${
                      service.is_active
                        ? "border-zinc-200/80 hover:border-zinc-300"
                        : "border-zinc-200/50 opacity-60 bg-zinc-50/50"
                    }`}
                  >
                    <div>
                      {/* Top row: Category tag & Price */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-600">
                          {service.category}
                        </span>
                        <div className="text-right">
                          <span className="font-mono text-base font-bold text-[#1D1D1F]">
                            Rs {service.price_mur}
                          </span>
                        </div>
                      </div>

                      {/* Service Name & Description */}
                      <h3 className="text-sm font-bold text-[#1D1D1F] mt-2">
                        {service.name}
                      </h3>
                      {service.cleanDescription && (
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {service.cleanDescription}
                        </p>
                      )}

                      {/* Details row: Duration & Deposit */}
                      <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                        <span className="inline-flex items-center gap-1 text-zinc-500 bg-zinc-100/80 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                          ⏱ {service.duration_minutes} min
                        </span>
                        {service.deposit_required_mur > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-lg text-[11px] font-semibold">
                            Rs {service.deposit_required_mur} deposit
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">
                            No deposit
                          </span>
                        )}
                      </div>

                      {/* Staff Avatars performing this service */}
                      <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                            Stylists:
                          </span>
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {assignedStaff.length > 0 ? (
                              assignedStaff.map((member) => (
                                <span
                                  key={member.id}
                                  title={member.name}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-white text-[10px] font-bold border-2 border-white"
                                >
                                  {member.name.charAt(0).toUpperCase()}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-zinc-400 italic">
                                All staff
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Active toggle */}
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleServiceActive(service.id, service.is_active)
                          }
                          className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                            service.is_active ? "bg-emerald-500" : "bg-zinc-300"
                          }`}
                          aria-label="Toggle active"
                        >
                          <span
                            className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                              service.is_active
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Edit CTA Button */}
                    <div className="mt-4 pt-2 flex justify-end">
                      <button
                        onClick={() => {
                          setEditingService(service);
                          setIsNewServiceModalOpen(true);
                        }}
                        className="text-xs font-semibold text-zinc-600 hover:text-[#1D1D1F] bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 rounded-xl px-3 py-1.5 transition"
                      >
                        Edit Service →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: TEAM & STAFF MANAGEMENT (Fix 3)                            */}
        {/* ================================================================= */}
        {activeTab === "team" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
              <div>
                <h2 className="text-sm font-bold text-[#1D1D1F]">
                  Staff Roster ({staff.length})
                </h2>
                <p className="text-xs text-zinc-500">
                  Configure active stylists, roles, and shift availability.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingStaff({
                    id: "",
                    salon_id: initialSalon.id,
                    name: "",
                    phone: "",
                    role: "Stylist",
                    chair_number: "Chair 1",
                    is_active: true,
                  });
                  setStaffWorkingDays([1, 2, 3, 4, 5, 6]);
                  setStaffAssignedServices(services.map((s) => s.id));
                  setIsNewStaffModalOpen(true);
                }}
                className="px-4 py-2 bg-[#1D1D1F] text-white rounded-xl text-xs font-semibold hover:bg-black transition active:scale-95 shadow-sm"
              >
                + Add Team Member
              </button>
            </div>

            {/* Staff Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {staff.map((member, idx) => {
                const assignedCount = services.filter((s) =>
                  s.assignedStaffIds.includes(member.id)
                ).length;
                const isOwner = member.role === "Owner" || idx === 0;

                return (
                  <div
                    key={member.id}
                    className={`bg-white rounded-3xl border p-5 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.02)] ${
                      member.is_active
                        ? "border-zinc-200/80 hover:border-zinc-300"
                        : "border-zinc-200/50 opacity-60 bg-zinc-50/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-bold text-base shadow-sm">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-[#1D1D1F]">
                              {member.name}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isOwner
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-zinc-100 text-zinc-600"
                              }`}
                            >
                              {isOwner ? "Owner" : "Stylist"}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {member.phone || "No phone linked"}
                          </p>
                        </div>
                      </div>

                      {/* Active switch for sick leave/vacation */}
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleStaffActive(member.id, member.is_active)
                          }
                          className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                            member.is_active ? "bg-emerald-500" : "bg-zinc-300"
                          }`}
                          aria-label="Toggle active"
                        >
                          <span
                            className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                              member.is_active
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span className="text-[10px] font-medium text-zinc-400">
                          {member.is_active ? "Active" : "On Leave"}
                        </span>
                      </div>
                    </div>

                    {/* Working Shift Badge (Fix 3) */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[11px] font-medium text-zinc-600 bg-zinc-100 border border-zinc-200/60 px-2.5 py-1 rounded-lg">
                        {member.shift_label || "Mon – Sat · 09:00 – 18:00"}
                      </span>
                    </div>

                    {/* Meta details */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
                      <div>
                        <span className="font-medium text-zinc-700">
                          {assignedCount > 0 ? `${assignedCount} services` : "All services"}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setEditingStaff(member);
                          setStaffWorkingDays(member.working_days || [1, 2, 3, 4, 5, 6]);
                          setStaffAssignedServices(
                            services
                              .filter((s) => s.assignedStaffIds.includes(member.id))
                              .map((s) => s.id)
                          );
                          setIsNewStaffModalOpen(true);
                        }}
                        className="text-xs font-semibold text-zinc-600 hover:text-[#1D1D1F] bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 rounded-xl px-3 py-1.5 transition"
                      >
                        Edit Roster →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: OPERATING HOURS, BREAKS & CLOSURES (Fix 2)                */}
        {/* ================================================================= */}
        {activeTab === "hours" && (
          <div className="space-y-6 animate-fade-in">
            {/* Hero Card: 1-Tap Emergency Pause */}
            <div
              className={`p-5 rounded-3xl border transition-all ${
                isEmergencyPaused
                  ? "bg-amber-50 border-amber-300 shadow-md"
                  : "bg-white border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🚨</span>
                    <h2 className="text-sm font-bold text-[#1D1D1F]">
                      Emergency Online Booking Pause
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Instantly halts new client reservations for the rest of today
                    without altering your regular weekly hours.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleToggleEmergencyPause}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition shadow-sm ${
                    isEmergencyPaused
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-[#1D1D1F] text-white hover:bg-black"
                  }`}
                >
                  {isEmergencyPaused
                    ? "✓ Currently Paused — Resume Bookings"
                    : "Pause Bookings For Today"}
                </button>
              </div>
            </div>

            {/* Weekly Operating Schedule & Clean Non-Overwriting Lunch Break */}
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-4">
                <div>
                  <h2 className="text-sm font-bold text-[#1D1D1F]">
                    Weekly Operating Schedule (Standard Full Days)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Standard working hours are 09:00 – 18:00. The lunch break excludes slots without rewriting operating windows.
                  </p>
                </div>
                <button
                  onClick={handleSaveHours}
                  disabled={isPending}
                  className="px-4 py-2 bg-[#1D1D1F] text-white rounded-xl text-xs font-semibold hover:bg-black transition active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {isPending ? "Saving..." : "Save Schedule"}
                </button>
              </div>

              {/* Exclusion Filter Lunch Break Bar */}
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🍽</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-[#1D1D1F]">
                        Daily Lunch Break (Exclusion Filter)
                      </p>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                        Active Slot Exclusion
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      12:30 → 13:30 slots are automatically excluded from the booking engine without overwriting your 09:00–18:00 full-day schedule.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl font-mono text-xs font-bold text-zinc-800">
                    12:30 → 13:30
                  </span>
                </div>
              </div>

              {/* Days Table (Standard Full Days 09:00 - 18:00) */}
              <div className="divide-y divide-zinc-100">
                {hours.map((hour, idx) => (
                  <div
                    key={hour.day_of_week}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="w-16 font-bold text-zinc-700">
                      {DAYS_OF_WEEK[hour.day_of_week]}
                    </div>

                    <div className="flex items-center gap-2 flex-1 max-w-xs">
                      <input
                        type="time"
                        value={hour.start_time}
                        disabled={hour.is_closed}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((h, i) =>
                              i === idx ? { ...h, start_time: e.target.value } : h
                            )
                          )
                        }
                        className="px-3 py-1.5 font-mono bg-zinc-50 border border-zinc-200 rounded-xl outline-none disabled:opacity-40"
                      />
                      <span className="text-zinc-400 font-semibold">→</span>
                      <input
                        type="time"
                        value={hour.end_time}
                        disabled={hour.is_closed}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((h, i) =>
                              i === idx ? { ...h, end_time: e.target.value } : h
                            )
                          )
                        }
                        className="px-3 py-1.5 font-mono bg-zinc-50 border border-zinc-200 rounded-xl outline-none disabled:opacity-40"
                      />
                    </div>

                    {/* Open/Closed Toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        setHours((prev) =>
                          prev.map((h, i) =>
                            i === idx ? { ...h, is_closed: !h.is_closed } : h
                          )
                        )
                      }
                      className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                        !hour.is_closed ? "bg-emerald-500" : "bg-zinc-300"
                      }`}
                      aria-label="Toggle open"
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          !hour.is_closed
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Special Closures & Public Holidays as Compact Removable Pills (Fix 2) */}
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-[#1D1D1F]">
                    Special Closures &amp; Public Holidays
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Add specific blocked dates for holidays, renovations, or private events.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddClosureModal(true)}
                  className="px-3.5 py-1.5 bg-[#1D1D1F] text-white rounded-xl text-xs font-semibold hover:bg-black transition shadow-sm self-start sm:self-auto"
                >
                  + Add Date
                </button>
              </div>

              {/* Compact Removable Pills Display */}
              {closures.length === 0 ? (
                <p className="text-xs text-zinc-400 py-3 italic">
                  No upcoming holiday closures scheduled.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {closures.map((closure) => {
                    const dateStr = new Date(closure.starts_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    });

                    return (
                      <span
                        key={closure.id}
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-100 border border-zinc-200/80 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200/60"
                      >
                        <span>
                          {dateStr} · {closure.reason || "Salon Closed"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteClosure(closure.id)}
                          className="w-4 h-4 rounded-full bg-zinc-300 hover:bg-rose-500 hover:text-white flex items-center justify-center text-[10px] text-zinc-600 transition ml-1"
                          aria-label="Remove closure"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: PAYMENTS & MCB JUICE (Fix 4)                              */}
        {/* ================================================================= */}
        {activeTab === "juice" && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-5 sm:p-7 rounded-3xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-[#1D1D1F]">
                    MCB Juice Account &amp; Deposit Policy
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Configure your Mauritian payment details and checkout cancellation terms.
                  </p>
                </div>
                <button
                  onClick={handleSaveJuice}
                  disabled={isPending}
                  className="px-4 py-2 bg-[#1D1D1F] text-white rounded-xl text-xs font-semibold hover:bg-black transition active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {isPending ? "Saving..." : "Save Payments"}
                </button>
              </div>

              {/* Juice Phone & Name Fields (Mauritian Phone Mask) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    MCB Juice Phone Number
                  </label>
                  <input
                    type="text"
                    value={juicePhone}
                    onChange={(e) => setJuicePhone(formatMauritiusPhone(e.target.value))}
                    placeholder="+230 5XXX XXXX"
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-sm font-mono focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Customers send booking deposits to this Mauritius Juice mobile number.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Account Name (Displayed on QR)
                  </label>
                  <input
                    type="text"
                    value={juiceAccountName}
                    onChange={(e) => setJuiceAccountName(e.target.value)}
                    placeholder="Fresh Cuts Ltd"
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Ensures client verifies correct recipient before transferring.
                  </p>
                </div>
              </div>

              {/* MCB Juice QR Code File Upload (Fix 4) */}
              <div className="pt-2 border-t border-zinc-100">
                <label className="block text-xs font-semibold text-zinc-700 mb-2">
                  MCB Juice QR Code Sticker / Image (.png / .jpg)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-200/60">
                  {juiceQrPreview ? (
                    <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-zinc-200 bg-white shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={juiceQrPreview}
                        alt="MCB Juice QR"
                        className="w-full h-full object-contain p-1"
                      />
                      <button
                        type="button"
                        onClick={() => setJuiceQrPreview(null)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center text-zinc-400 shrink-0">
                      <span className="text-xl">📷</span>
                      <span className="text-[10px] mt-0.5">QR</span>
                    </div>
                  )}

                  <div className="flex-1">
                    <p className="text-xs font-medium text-zinc-700">
                      Upload your official MCB Juice Merchant QR Code
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      PNG or JPG, up to 5MB. Clients can scan this directly to pay deposits.
                    </p>
                    <label className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-xs font-semibold text-zinc-700 cursor-pointer transition shadow-sm">
                      <span>📁 Select Image</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleJuiceQrUpload}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Global Deposit Policy Selector */}
              <div className="pt-2 border-t border-zinc-100">
                <label className="block text-xs font-semibold text-zinc-700 mb-2">
                  Deposit Application Policy
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGlobalDepositPolicy("custom")}
                    className={`p-4 rounded-2xl border text-left transition ${
                      globalDepositPolicy === "custom"
                        ? "border-[#1D1D1F] bg-zinc-50 shadow-sm"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#1D1D1F]">
                        Custom per-service deposit
                      </p>
                      {globalDepositPolicy === "custom" && (
                        <span className="text-emerald-600 font-bold text-sm">✓</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Only services with an explicit deposit requirement will request Juice payment.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGlobalDepositPolicy("all")}
                    className={`p-4 rounded-2xl border text-left transition ${
                      globalDepositPolicy === "all"
                        ? "border-[#1D1D1F] bg-zinc-50 shadow-sm"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#1D1D1F]">
                        Mandatory on all services
                      </p>
                      {globalDepositPolicy === "all" && (
                        <span className="text-emerald-600 font-bold text-sm">✓</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Enforces anti-no-show deposit across every appointment in your catalog.
                    </p>
                  </button>
                </div>

                {/* Default Deposit Amount Input (revealed when Mandatory on all services is active) */}
                {globalDepositPolicy === "all" && (
                  <div className="mt-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-200/80 animate-fade-in">
                    <label className="block text-xs font-semibold text-zinc-700">
                      Default Deposit Amount (Rs)
                    </label>
                    <div className="mt-1.5 flex items-center bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs max-w-xs">
                      <span className="text-zinc-400 mr-2 font-semibold">Rs</span>
                      <input
                        type="number"
                        value={defaultDepositAmount}
                        onChange={(e) => setDefaultDepositAmount(Number(e.target.value))}
                        className="w-full bg-transparent font-mono font-bold text-sm outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      This deposit amount will automatically apply to services that don&apos;t have a custom deposit specified.
                    </p>
                  </div>
                )}
              </div>

              {/* Policy Note Textarea */}
              <div className="pt-2 border-t border-zinc-100">
                <label className="block text-xs font-semibold text-zinc-700">
                  Cancellation &amp; Refund Terms (Client Checkout Disclaimer)
                </label>
                <textarea
                  rows={3}
                  value={cancellationPolicy}
                  onChange={(e) => setCancellationPolicy(e.target.value)}
                  placeholder="e.g. Free cancellation up to 2 hours before appointment. Juice deposits are non-refundable for no-shows."
                  className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 text-xs focus:bg-white focus:border-zinc-400 outline-none leading-relaxed transition"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: SALON PROFILE & BRANDING (Fix 5)                          */}
        {/* ================================================================= */}
        {activeTab === "profile" && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-5 sm:p-7 rounded-3xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-[#1D1D1F]">
                    Salon Identity &amp; Branding
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Basic information that represents your boutique on the client booking page.
                  </p>
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={isPending}
                  className="px-4 py-2 bg-[#1D1D1F] text-white rounded-xl text-xs font-semibold hover:bg-black transition active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {isPending ? "Saving..." : "Save Profile"}
                </button>
              </div>

              {/* Logo / Monogram Picker (Fix 5) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-2">
                  Salon Logo / Avatar Presentation
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-200/60">
                  {/* Visual Preview */}
                  <div className="shrink-0">
                    {logoMode === "image" && salonProfile.logo_url ? (
                      <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={salonProfile.logo_url}
                          alt="Salon Logo"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        style={{ backgroundColor: salonProfile.brand_color }}
                        className="w-16 h-16 rounded-2xl text-white font-bold text-xl flex items-center justify-center shadow-md transition-colors"
                      >
                        {monogramText}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLogoMode("initials")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                          logoMode === "initials"
                            ? "bg-[#1D1D1F] text-white border-[#1D1D1F]"
                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                        }`}
                      >
                        Initials Monogram ({monogramText})
                      </button>
                      <label className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-600 cursor-pointer transition">
                        <span>Upload Logo Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoImageUpload}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      The monogram dynamically uses your brand accent color, or you can upload a crisp custom icon.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Salon Name
                  </label>
                  <input
                    type="text"
                    value={salonProfile.name}
                    onChange={(e) =>
                      setSalonProfile({ ...salonProfile, name: e.target.value })
                    }
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                </div>

                {/* Robust Booking Link Slug Input (Fix 5) */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Booking Link Slug
                  </label>
                  <div className="mt-1.5 flex items-center rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden focus-within:border-[#1D1D1F]">
                    <span className="px-3 text-xs text-zinc-400 select-none bg-zinc-100/60 border-r border-zinc-200 py-3 font-mono">
                      salonos.mu/
                    </span>
                    <input
                      type="text"
                      value={salonProfile.slug}
                      onChange={(e) =>
                        setSalonProfile({
                          ...salonProfile,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        })
                      }
                      className="w-full bg-transparent px-3 py-3 text-xs font-mono text-zinc-900 outline-none"
                      placeholder="your-salon"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Salon Phone
                  </label>
                  <input
                    type="text"
                    value={salonProfile.phone}
                    onChange={(e) =>
                      setSalonProfile({ ...salonProfile, phone: e.target.value })
                    }
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Town / District
                  </label>
                  <input
                    type="text"
                    value={salonProfile.district}
                    onChange={(e) =>
                      setSalonProfile({ ...salonProfile, district: e.target.value })
                    }
                    placeholder="Grand Baie"
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Physical Address
                  </label>
                  <input
                    type="text"
                    value={salonProfile.address}
                    onChange={(e) =>
                      setSalonProfile({ ...salonProfile, address: e.target.value })
                    }
                    placeholder="Royal Road, Grand Baie"
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                </div>

                {/* Google Maps URL Field (Fix 5) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Google Maps URL (Optional, for Client Directions)
                  </label>
                  <input
                    type="url"
                    value={salonProfile.googleMapsUrl}
                    onChange={(e) =>
                      setSalonProfile({ ...salonProfile, googleMapsUrl: e.target.value })
                    }
                    placeholder="https://maps.app.goo.gl/..."
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-xs focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Booking Header Tagline
                  </label>
                  <input
                    type="text"
                    value={salonProfile.booking_title}
                    onChange={(e) =>
                      setSalonProfile({ ...salonProfile, booking_title: e.target.value })
                    }
                    placeholder="Boutique Grooming & Barbershop"
                    className="mt-1.5 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl px-4 py-3 text-sm focus:bg-white focus:border-zinc-400 outline-none transition"
                  />
                </div>

                {/* Brand Color Picker */}
                <div className="sm:col-span-2 pt-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-2">
                    Brand Color Accent
                  </label>
                  <div className="flex items-center gap-3">
                    {["#18181b", "#059669", "#4f46e5", "#e11d48", "#2563eb"].map(
                      (color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            setSalonProfile({ ...salonProfile, brand_color: color })
                          }
                          style={{ backgroundColor: color }}
                          className={`w-9 h-9 rounded-2xl transition-transform ${
                            salonProfile.brand_color === color
                              ? "scale-110 ring-2 ring-offset-2 ring-zinc-800"
                              : "opacity-80 hover:opacity-100"
                          }`}
                        />
                      )
                    )}
                    <div className="flex items-center gap-2 ml-2 bg-zinc-50 border border-zinc-200/80 rounded-xl px-3 py-1.5">
                      <input
                        type="color"
                        value={salonProfile.brand_color}
                        onChange={(e) =>
                          setSalonProfile({
                            ...salonProfile,
                            brand_color: e.target.value,
                          })
                        }
                        className="w-6 h-6 border-0 bg-transparent cursor-pointer"
                      />
                      <span className="text-xs font-mono text-zinc-600">
                        {salonProfile.brand_color}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL: EDIT / ADD SERVICE                                         */}
      {/* ================================================================= */}
      {isNewServiceModalOpen && editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-base text-[#1D1D1F]">
                {editingService.id ? "Edit Service" : "New Service"}
              </h3>
              <button
                onClick={() => setIsNewServiceModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition"
              >
                ✕
              </button>
            </div>

            {/* Service Name */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700">
                Service Name
              </label>
              <input
                type="text"
                value={editingService.name}
                onChange={(e) =>
                  setEditingService({ ...editingService, name: e.target.value })
                }
                placeholder="e.g. Skin Fade & Beard Trim"
                className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:bg-white focus:border-zinc-400"
              />
            </div>

            {/* Category Tag */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700">
                Category
              </label>
              <select
                value={editingService.category}
                onChange={(e) =>
                  setEditingService({ ...editingService, category: e.target.value })
                }
                className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs outline-none"
              >
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={editingService.cleanDescription}
                onChange={(e) =>
                  setEditingService({
                    ...editingService,
                    cleanDescription: e.target.value,
                  })
                }
                placeholder="Brief summary of service details"
                className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:bg-white focus:border-zinc-400"
              />
            </div>

            {/* Duration Preset Chips */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Duration
              </label>
              <div className="flex gap-2">
                {DURATION_PRESETS.map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() =>
                      setEditingService({
                        ...editingService,
                        duration_minutes: dur,
                      })
                    }
                    className={`flex-1 py-1.5 rounded-xl text-xs font-medium border transition ${
                      editingService.duration_minutes === dur
                        ? "bg-[#1D1D1F] text-white border-[#1D1D1F]"
                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    {dur}m
                  </button>
                ))}
              </div>
            </div>

            {/* Price & Deposit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Price (MUR)
                </label>
                <div className="mt-1 flex items-center bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs">
                  <span className="text-zinc-400 mr-1.5">Rs</span>
                  <input
                    type="number"
                    value={editingService.price_mur}
                    onChange={(e) =>
                      setEditingService({
                        ...editingService,
                        price_mur: Number(e.target.value),
                      })
                    }
                    className="w-full bg-transparent font-mono font-semibold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Deposit (MUR)
                </label>
                <div className="mt-1 flex items-center bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs">
                  <span className="text-zinc-400 mr-1.5">Rs</span>
                  <input
                    type="number"
                    value={editingService.deposit_required_mur}
                    onChange={(e) =>
                      setEditingService({
                        ...editingService,
                        deposit_required_mur: Number(e.target.value),
                      })
                    }
                    className="w-full bg-transparent font-mono font-semibold outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Stylist Multi-select */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Stylist Assignment (Who performs this?)
              </label>
              <div className="space-y-1.5 max-h-32 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-2 bg-zinc-50 rounded-xl border border-zinc-200">
                {staff.map((member) => {
                  const isChecked = editingService.assignedStaffIds.includes(
                    member.id
                  );
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer p-1 hover:bg-zinc-100 rounded-lg"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const nextStaffIds = isChecked
                            ? editingService.assignedStaffIds.filter(
                                (id) => id !== member.id
                              )
                            : [...editingService.assignedStaffIds, member.id];
                          setEditingService({
                            ...editingService,
                            assignedStaffIds: nextStaffIds,
                          });
                        }}
                        className="rounded border-zinc-300 text-[#1D1D1F] focus:ring-0"
                      />
                      <span>{member.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 mt-6 border-t border-zinc-100">
              {editingService.id ? (
                <button
                  type="button"
                  onClick={() => handleDeleteService(editingService.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors"
                >
                  Delete Service
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewServiceModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveService(editingService)}
                  className="px-5 py-2 rounded-xl bg-[#1D1D1F] text-white text-xs font-semibold hover:bg-black active:scale-[0.98] transition-all shadow-sm"
                >
                  Save Service
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: EDIT / ADD TEAM MEMBER (Fix 3)                             */}
      {/* ================================================================= */}
      {isNewStaffModalOpen && editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-base text-[#1D1D1F]">
                {editingStaff.id ? "Edit Roster Member" : "New Team Member"}
              </h3>
              <button
                onClick={() => setIsNewStaffModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">
                Stylist Name
              </label>
              <input
                type="text"
                value={editingStaff.name}
                onChange={(e) =>
                  setEditingStaff({ ...editingStaff, name: e.target.value })
                }
                placeholder="e.g. Alex"
                className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:bg-white focus:border-zinc-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  WhatsApp Phone Number
                </label>
                <input
                  type="text"
                  value={editingStaff.phone || ""}
                  onChange={(e) =>
                    setEditingStaff({
                      ...editingStaff,
                      phone: formatMauritiusPhone(e.target.value),
                    })
                  }
                  placeholder="+230 5XXX XXXX"
                  className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-mono outline-none focus:bg-white focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Role
                </label>
                <select
                  value={editingStaff.role || "Stylist"}
                  onChange={(e) =>
                    setEditingStaff({ ...editingStaff, role: e.target.value })
                  }
                  className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                >
                  <option value="Stylist">Stylist</option>
                  <option value="Owner">Owner</option>
                </select>
              </div>
            </div>

            {/* Working Days Selector (Sun - Sat) */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Working Days (Shift Schedule)
              </label>
              <div className="flex gap-1.5">
                {DAYS_OF_WEEK.map((day, dIdx) => {
                  const isDayActive = staffWorkingDays.includes(dIdx);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setStaffWorkingDays((prev) =>
                          isDayActive
                            ? prev.filter((d) => d !== dIdx)
                            : [...prev, dIdx]
                        );
                      }}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition ${
                        isDayActive
                          ? "bg-[#1D1D1F] text-white shadow-sm"
                          : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assigned Services Multi-Select Checklist */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Assigned Services (Who performs what)
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-2.5 bg-zinc-50 rounded-xl border border-zinc-200">
                {services.map((srv) => {
                  const isChecked = staffAssignedServices.includes(srv.id);
                  return (
                    <label
                      key={srv.id}
                      className="flex items-center justify-between text-xs text-zinc-700 cursor-pointer p-1 hover:bg-zinc-100 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setStaffAssignedServices((prev) =>
                              isChecked
                                ? prev.filter((id) => id !== srv.id)
                                : [...prev, srv.id]
                            );
                          }}
                          className="rounded border-zinc-300 text-[#1D1D1F] focus:ring-0"
                        />
                        <span>{srv.name}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        Rs {srv.price_mur}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons with "Remove Stylist" */}
            <div className="pt-3 flex items-center justify-between border-t border-zinc-100">
              {editingStaff.id ? (
                <button
                  type="button"
                  onClick={() => handleRemoveStaff(editingStaff.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-2 rounded-xl transition"
                >
                  Remove Stylist
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewStaffModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveStaff(editingStaff)}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#1D1D1F] text-white hover:bg-black transition shadow-sm"
                >
                  Save Stylist
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ADD CATEGORY                                               */}
      {/* ================================================================= */}
      {showAddCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-sm text-[#1D1D1F]">
              Add Category
            </h3>
            <input
              type="text"
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              placeholder="e.g. VIP / Color / Spa"
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddCatModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newCatInput.trim()) {
                    setCustomCategories((prev) => [
                      ...prev,
                      newCatInput.trim(),
                    ]);
                    setSelectedCategory(newCatInput.trim());
                    setNewCatInput("");
                    setShowAddCatModal(false);
                  }
                }}
                className="px-4 py-1.5 bg-[#1D1D1F] text-white rounded-xl text-xs font-semibold"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ADD SPECIAL CLOSURE                                        */}
      {/* ================================================================= */}
      {showAddClosureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-sm text-[#1D1D1F]">
              Add Holiday / Blocked Date
            </h3>
            <div>
              <label className="block text-xs font-semibold text-zinc-700">
                Closure Date
              </label>
              <input
                type="date"
                value={newClosureDate}
                onChange={(e) => setNewClosureDate(e.target.value)}
                className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700">
                Reason / Holiday Name
              </label>
              <input
                type="text"
                value={newClosureReason}
                onChange={(e) => setNewClosureReason(e.target.value)}
                placeholder="e.g. Christmas Day / Renovation"
                className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setShowAddClosureModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-600"
              >
                Cancel
              </button>
              <button
                onClick={handleAddClosure}
                className="px-4 py-1.5 bg-[#1D1D1F] text-white rounded-xl text-xs font-semibold"
              >
                Confirm Closure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
