"use client";

import { useEffect, useState } from "react";
import type { BookingStatus, PaymentStatus, RefundStatus } from "@/types/database.types";
import { formatCancellationMessage } from "@/lib/services/whatsapp";

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
  deposit_required_mur?: number;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  refund_status?: RefundStatus;
  refund_reference?: string | null;
  refund_requested_at?: string | null;
  refunded_at?: string | null;
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

// ─── Cancellation Modal ───────────────────────────────────────────────────────

const QUICK_REASONS = [
  "Barber Unwell / Emergency",
  "Salon Closure / Power Outage",
  "Water Cut / Technical Issue",
  "Schedule Conflict / Rescheduling",
  "Customer Called to Cancel",
] as const;

interface CancellationModalProps {
  booking: AdminBooking;
  service: ServiceInfo | undefined;
  staffMember: StaffInfo | undefined;
  salonName: string;
  salonSlug: string;
  onClose: () => void;
  onConfirm: (input: {
    bookingId: string;
    cancellationReason: string;
    refundStatus: "not_required" | "pending" | "refunded" | "not_possible";
    refundReference?: string;
    openWhatsApp: boolean;
  }) => Promise<void>;
}

function CancellationModal({
  booking,
  service,
  staffMember,
  salonName,
  salonSlug,
  onClose,
  onConfirm,
}: CancellationModalProps) {
  const [selectedChip, setSelectedChip] = useState<string>(QUICK_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>(QUICK_REASONS[0]);
  
  const depositAmount = booking.deposit_required_mur || service?.deposit_required_mur || 0;
  const depositPaid = booking.payment_status === "deposit_submitted" || booking.payment_status === "paid_in_full" || depositAmount > 0;

  const [refundChoice, setRefundChoice] = useState<"refunded_now" | "pending" | "not_required">(
    depositPaid ? "refunded_now" : "not_required"
  );
  const [refundRef, setRefundRef] = useState("");
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const effectiveRefundStatus: "not_required" | "pending" | "refunded" =
    refundChoice === "refunded_now" ? "refunded" : refundChoice === "pending" ? "pending" : "not_required";

  const messageText = formatCancellationMessage({
    customerName: booking.customer_name,
    salonName,
    serviceName: service?.name,
    startTime: booking.start_time,
    reason: customReason.trim() || selectedChip,
    depositAmount: depositPaid ? depositAmount : 0,
    refundStatus: effectiveRefundStatus,
    refundReference: refundChoice === "refunded_now" ? refundRef.trim() : undefined,
    customerPhone: booking.customer_phone,
    salonSlug,
  });

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(booking.customer_phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  }

  async function handleSubmit(openWhatsApp: boolean) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({
        bookingId: booking.id,
        cancellationReason: customReason.trim() || selectedChip,
        refundStatus: effectiveRefundStatus,
        refundReference: refundChoice === "refunded_now" ? refundRef.trim() : undefined,
        openWhatsApp,
      });
      if (openWhatsApp) {
        const url = "https://wa.me/" + waDigits(booking.customer_phone) + "?text=" + encodeURIComponent(messageText);
        window.open(url, "_blank", "noopener,noreferrer");
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-[28px] bg-white border border-zinc-200 shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="bg-rose-50/80 border-b border-rose-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 text-lg">Cancel Appointment</h3>
              <p className="text-xs text-zinc-500">
                {booking.customer_name} &bull; {formatTimeMU(booking.start_time)} ({service?.name ?? "Service"}{staffMember ? ` &bull; ${staffMember.name}` : ""})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-rose-100/50 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Reason chips */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
              Reason for Cancellation
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {QUICK_REASONS.map((r) => {
                const isSelected = selectedChip === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setSelectedChip(r);
                      setCustomReason(r);
                    }}
                    className={
                      "text-xs px-3 py-1.5 rounded-full font-medium transition " +
                      (isSelected
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")
                    }
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <textarea
              rows={2}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Explain why you need to cancel..."
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition"
            />
          </div>

          {/* Deposit Refund Handler */}
          {depositPaid ? (
            <div className="rounded-2xl bg-amber-50/70 border border-amber-200/90 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    MCB Juice Deposit Refund
                  </span>
                  <p className="text-sm font-bold text-zinc-900 mt-0.5">
                    Rs {depositAmount} to be refunded
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyPhone}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-amber-100 transition active:scale-95"
                >
                  <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  {copiedPhone ? "Copied!" : "Copy Juice No."}
                </button>
              </div>

              {/* Refund Choice Selector */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-white/80 border border-amber-100 cursor-pointer hover:bg-white transition">
                  <input
                    type="radio"
                    name="refundChoice"
                    checked={refundChoice === "refunded_now"}
                    onChange={() => setRefundChoice("refunded_now")}
                    className="text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-zinc-900 block">I refunded via Juice now</span>
                    <span className="text-[11px] text-zinc-500">I already transferred Rs {depositAmount} back</span>
                  </div>
                </label>

                {refundChoice === "refunded_now" && (
                  <div className="pl-6 pt-1">
                    <input
                      type="text"
                      value={refundRef}
                      onChange={(e) => setRefundRef(e.target.value)}
                      placeholder="Juice Ref (e.g. REF-88491)"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-amber-200 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 transition"
                    />
                  </div>
                )}

                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-white/80 border border-amber-100 cursor-pointer hover:bg-white transition">
                  <input
                    type="radio"
                    name="refundChoice"
                    checked={refundChoice === "pending"}
                    onChange={() => setRefundChoice("pending")}
                    className="text-amber-600 focus:ring-amber-500 h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-zinc-900 block">Refund is Pending (I will send later)</span>
                    <span className="text-[11px] text-zinc-500">Mark as pending refund in dashboard</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-white/80 border border-amber-100 cursor-pointer hover:bg-white transition">
                  <input
                    type="radio"
                    name="refundChoice"
                    checked={refundChoice === "not_required"}
                    onChange={() => setRefundChoice("not_required")}
                    className="text-zinc-600 focus:ring-zinc-500 h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-zinc-700 block">No refund required / Deposit waived</span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3 text-xs text-zinc-500">
              No deposit was recorded for this appointment.
            </div>
          )}

          {/* Message Preview */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
              WhatsApp Message Preview
            </label>
            <div className="rounded-2xl bg-zinc-900 text-zinc-100 p-4 font-sans text-xs whitespace-pre-line leading-relaxed shadow-inner">
              {messageText}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-zinc-50 border-t border-zinc-100 px-6 py-4 flex flex-col sm:flex-row gap-2.5 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition"
          >
            Keep Appointment
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            Cancel Only
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.546 4.14 1.587 5.945L.057 23.35a.99.99 0 001.244 1.206l5.526-1.493A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 01-5.031-1.37l-.36-.214-3.734 1.01 1.018-3.625-.234-.375A9.9 9.9 0 012.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/>
            </svg>
            Cancel & WhatsApp Client
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Refund Record Modal ──────────────────────────────────────────────────────

interface RefundCompleteModalProps {
  booking: AdminBooking;
  service: ServiceInfo | undefined;
  onClose: () => void;
  onConfirm: (bookingId: string, refundReference: string) => Promise<void>;
}

function RefundCompleteModal({
  booking,
  service,
  onClose,
  onConfirm,
}: RefundCompleteModalProps) {
  const [ref, setRef] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const depositAmount = booking.deposit_required_mur || service?.deposit_required_mur || 0;

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(booking.customer_phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(booking.id, ref.trim() || "JUICE-REFUND");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[26px] bg-white border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 text-base">Record Juice Refund</h3>
              <p className="text-xs text-zinc-500">{booking.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 font-medium">Refund Amount</p>
              <p className="text-lg font-black text-zinc-900">Rs {depositAmount}</p>
            </div>
            <button
              type="button"
              onClick={copyPhone}
              className="px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-100 transition"
            >
              {copied ? "Copied!" : "Copy " + booking.customer_phone}
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              MCB Juice Transaction Reference
            </label>
            <input
              type="text"
              required
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. JUICE-994821"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-zinc-50 border border-zinc-300 text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
            >
              Confirm Refund Sent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── BookingCard ──────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  service,
  staffMember,
  onStatusChange,
  onConfirmDeposit,
  onInitiateCancel,
  onInitiateRefundComplete,
}: {
  booking: AdminBooking;
  service: ServiceInfo | undefined;
  staffMember: StaffInfo | undefined;
  onStatusChange: (id: string, status: BookingStatus) => Promise<void>;
  onConfirmDeposit: (id: string) => Promise<void>;
  onInitiateCancel: (booking: AdminBooking) => void;
  onInitiateRefundComplete: (booking: AdminBooking) => void;
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
    if (newStatus === "cancelled") {
      onInitiateCancel(booking);
      return;
    }
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
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.546 4.14 1.587 5.945L.057 23.35a.99.99 0 001.244 1.206l5.526-1.493A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 01-5.031-1.37l-.36-.214-3.734 1.01 1.018-3.625-.234-.375A9.9 9.9 0 012.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/>
              </svg>
              WA
            </a>
          </div>
        </div>

        {/* Juice Deposit block (Active Bookings) */}
        {hasDeposit && booking.status !== "cancelled" && (
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

        {/* Cancellation details box */}
        {booking.status === "cancelled" && (
          <div className="rounded-2xl bg-rose-50/70 border border-rose-200/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Cancelled {booking.cancelled_by ? "by Salon" : "by Customer"}</span>
              </div>
              {booking.cancelled_at && (
                <span className="text-[11px] text-rose-500 font-medium">
                  {formatTimeMU(booking.cancelled_at)}
                </span>
              )}
            </div>

            {booking.cancellation_reason && (
              <p className="text-xs text-rose-700 italic bg-white/70 rounded-xl p-2.5 border border-rose-100">
                &ldquo;{booking.cancellation_reason}&rdquo;
              </p>
            )}

            {/* Refund Pending Alert */}
            {booking.refund_status === "pending" && (
              <div className="pt-2 border-t border-rose-200/70 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-amber-800 flex items-center gap-1">
                    <span>⚠️</span> Deposit Refund Due: Rs {booking.deposit_required_mur || service?.deposit_required_mur || 0}
                  </p>
                  <p className="text-[11px] text-amber-700">Client awaiting MCB Juice transfer</p>
                </div>
                <button
                  onClick={() => onInitiateRefundComplete(booking)}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition active:scale-95 shrink-0"
                >
                  Record Refund
                </button>
              </div>
            )}

            {/* Refunded confirmation */}
            {booking.refund_status === "refunded" && (
              <div className="pt-2 border-t border-rose-200/70 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>
                  Deposit Refunded via Juice{booking.refund_reference ? " (Ref: " + booking.refund_reference + ")" : ""}
                </span>
              </div>
            )}
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
  { key: "all",       label: "All"              },
  { key: "confirmed", label: "Confirmed"        },
  { key: "deposit",   label: "Pending Deposit"  },
  { key: "refunds",   label: "Refunds Due"      },
  { key: "completed", label: "Completed"        },
] as const;

type FilterKey = typeof FILTER_TABS[number]["key"];

interface DashboardClientProps {
  initialBookings: AdminBooking[];
  services: ServiceInfo[];
  staff: StaffInfo[];
  todayStr: string;        // "YYYY-MM-DD" in Mauritius tz
  salon?: { name: string; slug: string };
}

export default function DashboardClient({
  initialBookings,
  services,
  staff,
  todayStr,
  salon,
}: DashboardClientProps) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const salonName = salon?.name ?? "Fresh Cuts Grand Baie";
  const salonSlug = salon?.slug ?? "fresh-cuts";

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

  // Cancellation and Refund modals state
  const [cancellingBooking, setCancellingBooking] = useState<AdminBooking | null>(null);
  const [refundingBooking, setRefundingBooking] = useState<AdminBooking | null>(null);

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

  // ── Owner Cancellation Handler ─────────────────────────────────────────────
  async function handleConfirmCancel(input: {
    bookingId: string;
    cancellationReason: string;
    refundStatus: "not_required" | "pending" | "refunded" | "not_possible";
    refundReference?: string;
    openWhatsApp: boolean;
  }) {
    const { bookingId, cancellationReason, refundStatus, refundReference } = input;
    const snapshot = bookings;

    // Optimistic update
    setBookings((bs) =>
      bs.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              status: "cancelled",
              cancellation_reason: cancellationReason,
              refund_status: refundStatus,
              refund_reference: refundReference ?? null,
              cancelled_at: new Date().toISOString(),
              cancelled_by: "owner",
            }
          : b,
      ),
    );

    try {
      const res = await fetch("/api/v1/admin/bookings/" + bookingId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "cancelled",
          cancellationReason,
          refundStatus,
          refundReference: refundReference || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Cancellation failed");
      setBookings((bs) =>
        bs.map((b) => (b.id === bookingId ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)),
      );
    } catch (e) {
      setBookings(snapshot);
      alert(e instanceof Error ? e.message : "Failed to cancel booking");
    }
  }

  // ── Record Refund Complete Handler ─────────────────────────────────────────
  async function handleConfirmRefunded(bookingId: string, refundReference: string) {
    const snapshot = bookings;
    setBookings((bs) =>
      bs.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              refund_status: "refunded",
              refund_reference: refundReference,
              refunded_at: new Date().toISOString(),
            }
          : b,
      ),
    );

    try {
      const res = await fetch("/api/v1/admin/bookings/" + bookingId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundStatus: "refunded",
          refundReference,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to record refund");
      setBookings((bs) =>
        bs.map((b) => (b.id === bookingId ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)),
      );
    } catch (e) {
      setBookings(snapshot);
      alert(e instanceof Error ? e.message : "Failed to record refund");
    }
  }

  // ── Derived: filter + metrics ─────────────────────────────────────────────
  const filtered = bookings.filter((b) => {
    if (filter === "confirmed") return b.status === "confirmed";
    if (filter === "deposit")   return b.payment_status === "deposit_submitted";
    if (filter === "refunds")   return b.refund_status === "pending";
    if (filter === "completed") return b.status === "completed";
    return true;
  });

  const activeBookings = bookings.filter((b) => b.status !== "cancelled");
  const estRevenue = activeBookings.reduce(
    (sum, b) => sum + (serviceMap[b.service_id]?.price_mur ?? 0),
    0,
  );
  const pendingDeposits = bookings.filter((b) => b.payment_status === "deposit_submitted").length;
  const pendingRefunds = bookings.filter((b) => b.refund_status === "pending").length;

  async function blockWalkIn() {
    setWalkInMessage(null);
    const response = await fetch("/api/v1/admin/walk-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMinutes: 30 }),
    });
    const json = await response.json();
    setWalkInMessage(response.ok ? "Next 30 minutes blocked for a walk-in." : (json.error ?? "Could not block slot"));
    if (response.ok) fetchBookings(selectedDate);
  }

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-zinc-200" />
        <div className="mt-5 h-24 animate-pulse rounded-[22px] bg-white" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-3 sm:space-y-5 sm:py-8">
      {/* Top Header */}
      <div className="premium-rise flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Today at the chair
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-zinc-950 sm:text-2xl">
            Bookings
          </h1>
        </div>
        <div className="rounded-2xl bg-white/70 px-3 py-2 text-right text-xs text-zinc-500 shadow-sm">
          <span className="block font-semibold text-zinc-950">
            {selectedDate === todayStr ? "Today" : selectedDate}
          </span>
          <span>{bookings.length} appointments</span>
        </div>
      </div>

      {/* ── Metrics row ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:gap-3">
        {/* Bookings */}
        <div className="premium-surface min-w-[110px] flex-1 rounded-[18px] px-3 py-2.5 sm:rounded-[22px] sm:px-4 sm:py-3.5">
          <p className="text-xs font-medium text-zinc-400 mb-0.5">Bookings</p>
          <p className="text-xl font-bold leading-none text-zinc-900 sm:text-2xl">{activeBookings.length}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">active</p>
        </div>

        {/* Revenue */}
        <div className="premium-surface min-w-[110px] flex-1 rounded-[18px] px-3 py-2.5 sm:rounded-[22px] sm:px-4 sm:py-3.5">
          <p className="text-xs font-medium text-zinc-400 mb-0.5">Revenue</p>
          <p className="text-lg font-bold leading-none text-zinc-900 sm:text-xl">Rs {estRevenue}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">est.</p>
        </div>

        {/* Juice deposits */}
        <div
          className={
            pendingDeposits > 0
              ? "min-w-[110px] flex-1 rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm sm:rounded-[22px] sm:px-4 sm:py-3.5"
              : "premium-surface min-w-[110px] flex-1 rounded-[18px] px-3 py-2.5 sm:rounded-[22px] sm:px-4 sm:py-3.5"
          }
        >
          <p
            className={
              "text-xs font-medium mb-0.5 " +
              (pendingDeposits > 0 ? "text-amber-600" : "text-zinc-400")
            }
          >
            Deposits
          </p>
          <p
            className={
              "text-xl font-bold leading-none sm:text-2xl " +
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
            to verify
          </p>
        </div>

        {/* Refunds Due Alert */}
        <div
          className={
            pendingRefunds > 0
              ? "min-w-[110px] flex-1 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-2.5 shadow-sm sm:rounded-[22px] sm:px-4 sm:py-3.5"
              : "premium-surface min-w-[110px] flex-1 rounded-[18px] px-3 py-2.5 sm:rounded-[22px] sm:px-4 sm:py-3.5"
          }
        >
          <p
            className={
              "text-xs font-medium mb-0.5 " +
              (pendingRefunds > 0 ? "text-rose-600 font-bold" : "text-zinc-400")
            }
          >
            Refunds
          </p>
          <p
            className={
              "text-xl font-bold leading-none sm:text-2xl " +
              (pendingRefunds > 0 ? "text-rose-700" : "text-zinc-900")
            }
          >
            {pendingRefunds}
          </p>
          <p
            className={
              "text-xs mt-0.5 " +
              (pendingRefunds > 0 ? "text-rose-500 font-medium" : "text-zinc-400")
            }
          >
            pending
          </p>
        </div>
      </div>

      {/* Walk-in Block */}
      <div className="flex flex-col gap-3 rounded-[24px] border border-zinc-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <button
          onClick={blockWalkIn}
          className="min-h-12 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-900/15 transition hover:bg-black active:scale-95"
        >
          Block 30m / Walk-in
        </button>
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
            className="flex-1 py-2 px-3 rounded-xl text-sm bg-zinc-100 text-zinc-700 border-0 focus:outline-none focus:ring-2 focus:ring-zinc-800 focus:ring-offset-1"
          />
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={
                active
                  ? "flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-zinc-900 text-white shadow-sm"
                  : "flex-shrink-0 flex min-h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white/70 px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400"
              }
            >
              {tab.label}
              {tab.key === "deposit" && pendingDeposits > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {pendingDeposits}
                </span>
              )}
              {tab.key === "refunds" && pendingRefunds > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-xs font-bold">
                  {pendingRefunds}
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
              onInitiateCancel={(b) => setCancellingBooking(b)}
              onInitiateRefundComplete={(b) => setRefundingBooking(b)}
            />
          ))}
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellingBooking && (
        <CancellationModal
          booking={cancellingBooking}
          service={serviceMap[cancellingBooking.service_id]}
          staffMember={staffMap[cancellingBooking.staff_id]}
          salonName={salonName}
          salonSlug={salonSlug}
          onClose={() => setCancellingBooking(null)}
          onConfirm={handleConfirmCancel}
        />
      )}

      {/* Record Refund Modal */}
      {refundingBooking && (
        <RefundCompleteModal
          booking={refundingBooking}
          service={serviceMap[refundingBooking.service_id]}
          onClose={() => setRefundingBooking(null)}
          onConfirm={handleConfirmRefunded}
        />
      )}
    </div>
  );
}
