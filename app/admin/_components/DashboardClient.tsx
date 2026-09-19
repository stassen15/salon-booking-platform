"use client";

import { useEffect, useRef, useState } from "react";
import type { BookingStatus, PaymentStatus, RefundStatus } from "@/types/database.types";
import { formatCancellationMessage } from "@/lib/services/whatsapp";

// ─── Shared Types ─────────────────────────────────────────────────────────────

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
  pending:   "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show:   "No-Show",
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid:            "Unpaid",
  deposit_submitted: "Deposit Sent",
  paid_in_full:      "Paid",
};

// ─── Apple HIG Status Dot Indicators ──────────────────────────────────────────

function AppleStatusBadge({ status }: { status: BookingStatus }) {
  const dotColor =
    status === "confirmed" || status === "completed"
      ? "bg-[#34C759]"
      : status === "pending"
        ? "bg-[#FF9500]"
        : "bg-[#FF3B30]";

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F5F7] text-xs font-medium text-[#1D1D1F]">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ApplePaymentBadge({ paymentStatus }: { paymentStatus: PaymentStatus }) {
  const dotColor =
    paymentStatus === "paid_in_full"
      ? "bg-[#34C759]"
      : paymentStatus === "deposit_submitted"
        ? "bg-[#FF9500]"
        : "bg-[#86868B]";

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F5F7] text-xs font-medium text-[#1D1D1F]">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {PAYMENT_LABEL[paymentStatus] ?? paymentStatus}
    </span>
  );
}

// ─── Date / Time Helpers ──────────────────────────────────────────────────────

function formatTimeMU(iso: string): string {
  return new Intl.DateTimeFormat("en-MU", {
    timeZone: "Indian/Mauritius",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function nowTimeMU(): string {
  return new Intl.DateTimeFormat("en-MU", {
    timeZone: "Indian/Mauritius",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
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

function isWalkIn(booking: AdminBooking): boolean {
  return (
    booking.customer_name === "Walk-in" ||
    booking.customer_name === "Walk-in / Counter Hold"
  );
}

function bookingIsInChair(booking: AdminBooking, nowMs: number): boolean {
  return (
    booking.status !== "cancelled" &&
    booking.status !== "completed" &&
    booking.status !== "no_show" &&
    new Date(booking.start_time).getTime() <= nowMs &&
    new Date(booking.end_time).getTime() > nowMs
  );
}

// ─── Cancellation Modal (Apple HIG Sheet) ─────────────────────────────────────

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
  const depositPaid =
    booking.payment_status === "deposit_submitted" ||
    booking.payment_status === "paid_in_full" ||
    depositAmount > 0;

  const [refundChoice, setRefundChoice] = useState<"refunded_now" | "pending" | "not_required">(
    depositPaid ? "refunded_now" : "not_required"
  );
  const [refundRef, setRefundRef] = useState("");
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const effectiveRefundStatus: "not_required" | "pending" | "refunded" =
    refundChoice === "refunded_now"
      ? "refunded"
      : refundChoice === "pending"
        ? "pending"
        : "not_required";

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
    } catch { /* ignore */ }
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
        const url =
          "https://wa.me/" +
          waDigits(booking.customer_phone) +
          "?text=" +
          encodeURIComponent(messageText);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-black/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.18)] overflow-hidden my-6">
        <div className="bg-[#F5F5F7] border-b border-black/[0.06] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#FF3B30]/10 flex items-center justify-center text-[#FF3B30] shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-[#1D1D1F] text-base">Cancel Appointment</h3>
              <p className="text-xs text-[#86868B]">
                {booking.customer_name} &bull; {formatTimeMU(booking.start_time)}
                {" "}({service?.name ?? "Service"}{staffMember ? ` &bull; ${staffMember.name}` : ""})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.05] transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B] mb-2">
              Reason for Cancellation
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setSelectedChip(r); setCustomReason(r); }}
                  className={
                    "text-xs px-3 py-1.5 rounded-full font-medium transition " +
                    (selectedChip === r
                      ? "bg-[#1D1D1F] text-white shadow-sm"
                      : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Explain why you need to cancel..."
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#F5F5F7] border border-black/[0.06] text-[#1D1D1F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D1D1F] transition"
            />
          </div>

          {depositPaid ? (
            <div className="rounded-2xl bg-[#F5F5F7] border border-black/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FF9500]">
                    MCB Juice Deposit Refund
                  </span>
                  <p className="text-sm font-semibold text-[#1D1D1F] mt-0.5">
                    Rs {depositAmount} to be refunded
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyPhone}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-black/[0.08] text-xs font-medium text-[#1D1D1F] shadow-sm hover:bg-[#F5F5F7] transition active:scale-95"
                >
                  {copiedPhone ? "Copied!" : "Copy Juice No."}
                </button>
              </div>
              <div className="space-y-2 pt-1">
                {(["refunded_now", "pending", "not_required"] as const).map((choice) => (
                  <label
                    key={choice}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-black/[0.06] cursor-pointer hover:bg-black/[0.02] transition"
                  >
                    <input
                      type="radio"
                      name="refundChoice"
                      checked={refundChoice === choice}
                      onChange={() => setRefundChoice(choice)}
                      className="h-4 w-4 text-[#1D1D1F] focus:ring-[#1D1D1F]"
                    />
                    <div className="flex-1 min-w-0">
                      {choice === "refunded_now" && (
                        <>
                          <span className="text-xs font-semibold text-[#1D1D1F] block">I refunded via Juice now</span>
                          <span className="text-[11px] text-[#86868B]">Already transferred Rs {depositAmount} back</span>
                        </>
                      )}
                      {choice === "pending" && (
                        <>
                          <span className="text-xs font-semibold text-[#1D1D1F] block">Refund is Pending</span>
                          <span className="text-[11px] text-[#86868B]">Mark as pending refund in dashboard</span>
                        </>
                      )}
                      {choice === "not_required" && (
                        <span className="text-xs font-medium text-[#1D1D1F] block">No refund required / Deposit waived</span>
                      )}
                    </div>
                  </label>
                ))}
                {refundChoice === "refunded_now" && (
                  <div className="pl-6 pt-1">
                    <input
                      type="text"
                      value={refundRef}
                      onChange={(e) => setRefundRef(e.target.value)}
                      placeholder="Juice Ref (e.g. REF-88491)"
                      className="w-full px-3.5 py-2 rounded-xl text-xs bg-white border border-black/[0.12] text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#1D1D1F] transition"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-[#F5F5F7] border border-black/[0.04] p-3 text-xs text-[#86868B]">
              No deposit was recorded for this appointment.
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B] mb-2">
              WhatsApp Message Preview
            </label>
            <div className="rounded-xl bg-[#1D1D1F] text-white p-4 font-sans text-xs whitespace-pre-line leading-relaxed shadow-inner">
              {messageText}
            </div>
          </div>
        </div>

        <div className="bg-[#F5F5F7] border-t border-black/[0.06] px-6 py-4 flex flex-col sm:flex-row gap-2.5 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl border border-black/[0.08] bg-white text-xs font-medium text-[#1D1D1F] hover:bg-[#E8E8ED] transition"
          >
            Keep Appointment
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-[#1D1D1F] hover:bg-[#2C2C2E] text-white text-xs font-medium shadow-sm transition active:scale-[0.98] disabled:opacity-50"
          >
            Cancel Only
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-[#34C759] hover:bg-[#2DB04D] text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.546 4.14 1.587 5.945L.057 23.35a.99.99 0 001.244 1.206l5.526-1.493A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 01-5.031-1.37l-.36-.214-3.734 1.01 1.018-3.625-.234-.375A9.9 9.9 0 012.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z" />
            </svg>
            Cancel &amp; WhatsApp Client
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

function RefundCompleteModal({ booking, service, onClose, onConfirm }: RefundCompleteModalProps) {
  const [ref, setRef] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const depositAmount = booking.deposit_required_mur || service?.deposit_required_mur || 0;

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(booking.customer_phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl bg-white border border-black/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.18)] overflow-hidden">
        <div className="bg-[#F5F5F7] border-b border-black/[0.06] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[#FF9500]/10 flex items-center justify-center text-[#FF9500] shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-[#1D1D1F] text-base">Record Juice Refund</h3>
              <p className="text-xs text-[#86868B]">{booking.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#86868B] hover:text-[#1D1D1F]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl bg-[#F5F5F7] border border-black/[0.04] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[#86868B]">Refund Amount</p>
              <p className="text-xl font-semibold tracking-tight text-[#1D1D1F]">
                <span className="text-sm font-normal text-[#86868B]">Rs </span>{depositAmount}
              </p>
            </div>
            <button type="button" onClick={copyPhone}
              className="px-2.5 py-1 rounded-lg bg-white border border-black/[0.08] text-xs font-medium text-[#1D1D1F] shadow-sm hover:bg-[#F5F5F7] transition">
              {copied ? "Copied!" : "Copy " + booking.customer_phone}
            </button>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#86868B] mb-1.5">
              MCB Juice Transaction Reference
            </label>
            <input
              type="text"
              required
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. JUICE-994821"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#F5F5F7] border border-black/[0.08] text-[#1D1D1F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D1D1F] transition"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl border border-black/[0.08] text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7]">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 rounded-xl bg-[#34C759] hover:bg-[#2DB04D] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50">
              Confirm Refund Sent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Walk-in Card (Distinctive Muted Stripes) ─────────────────────────────────

function WalkInCard({
  booking,
  nowMs,
  servicePrice,
  onMarkCompleted,
  onRelease,
}: {
  booking: AdminBooking;
  nowMs: number;
  servicePrice: number;
  onMarkCompleted: (id: string) => Promise<void>;
  onRelease: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const inChair = bookingIsInChair(booking, nowMs);
  const minsRemaining = inChair
    ? Math.max(0, Math.ceil((new Date(booking.end_time).getTime() - nowMs) / 60_000))
    : 0;

  async function handleCompleted() {
    if (busy) return;
    setBusy(true);
    await onMarkCompleted(booking.id);
    setBusy(false);
  }

  async function handleRelease() {
    if (busy) return;
    setBusy(true);
    await onRelease(booking.id);
    setBusy(false);
  }

  return (
    <div
      className={
        "rounded-2xl border transition-all overflow-hidden " +
        (busy ? "opacity-60 pointer-events-none " : "") +
        (inChair
          ? "border-[#34C759] shadow-[0_4px_20px_rgba(52,199,89,0.15)] bg-white"
          : "border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] bg-white")
      }
      style={{
        backgroundImage: inChair
          ? undefined
          : "repeating-linear-gradient(-45deg, #FFFFFF, #FFFFFF 12px, #F5F5F7 12px, #F5F5F7 24px)",
      }}
    >
      {/* Active In-Chair Banner */}
      {inChair && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#34C759] text-white text-[11px] font-semibold tracking-wider uppercase">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>In Chair &bull; Walk-in &bull; {minsRemaining} min remaining</span>
        </div>
      )}

      <div className="p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-semibold tracking-tight tabular-nums text-[#1D1D1F]">
              {formatTimeMU(booking.start_time)} &ndash; {formatTimeMU(booking.end_time)}
            </span>
            <span className="text-[#86868B]">&bull;</span>
            <span className="text-xs font-semibold text-[#1D1D1F]">
              {booking.customer_name || "Walk-in / Counter Hold"}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F5F7] text-xs font-medium text-[#1D1D1F]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF9500]" />
            Counter Hold
          </span>
        </div>

        <p className="text-xs text-[#86868B]">
          Slot reserved for counter customer. Free this window or complete to record revenue.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleCompleted}
            disabled={busy}
            className="flex-1 bg-[#1D1D1F] hover:bg-[#2C2C2E] active:scale-[0.98] text-white font-medium text-xs rounded-xl px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5 text-[#34C759]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Mark Completed (+Rs {servicePrice || 300})
          </button>
          <button
            onClick={handleRelease}
            disabled={busy}
            className="bg-[#F5F5F7] hover:bg-[#E8E8ED] active:scale-[0.98] text-[#1D1D1F] font-medium text-xs rounded-xl px-4 py-2.5 transition-all disabled:opacity-50"
          >
            Release Block
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Compact Completed Row (Apple Subdued) ────────────────────────────────────

function CompletedRow({
  booking,
  service,
}: {
  booking: AdminBooking;
  service: ServiceInfo | undefined;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-4 bg-[#F5F5F7]/80 rounded-xl border border-black/[0.03] text-xs">
      <span className="line-through text-[#86868B] truncate font-normal mr-2">
        {formatTimeMU(booking.start_time)} – {formatTimeMU(booking.end_time)} &bull; {service?.name ?? "Service"}
      </span>
      <span className="shrink-0 text-[#1D1D1F] font-medium">
        {booking.customer_name} &bull; <span className="text-[#86868B]">Rs </span>{service?.price_mur ?? 0} ✓
      </span>
    </div>
  );
}

// ─── Compact Cancelled Row (Collapsible) ──────────────────────────────────────

function CancelledRow({
  booking,
  service,
  staffMember,
  expanded,
  onToggle,
  onInitiateRefundComplete,
}: {
  booking: AdminBooking;
  service: ServiceInfo | undefined;
  staffMember: StaffInfo | undefined;
  expanded: boolean;
  onToggle: () => void;
  onInitiateRefundComplete: (booking: AdminBooking) => void;
}) {
  const waNum = waDigits(booking.customer_phone);
  const waMsg = encodeURIComponent(
    "Hi " + booking.customer_name + ", regarding your cancelled booking at our salon..."
  );

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden transition-all">
      {/* Clickable compact row header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#F5F5F7]/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F5F5F7] text-[10px] font-medium text-[#1D1D1F] shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
            Cancelled
          </span>
          <span className="text-xs text-[#86868B] font-normal line-through truncate">
            {formatTimeMU(booking.start_time)} – {formatTimeMU(booking.end_time)} &bull; {service?.name ?? "Service"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-[#1D1D1F] font-medium truncate max-w-[110px] sm:max-w-[160px]">
            {booking.customer_name}
          </span>
          {booking.refund_status === "pending" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FF9500]/10 text-[#FF9500] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF9500] animate-pulse" /> Refund Due
            </span>
          )}
          <svg
            className={`w-4 h-4 text-[#86868B] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 space-y-3 border-t border-black/[0.04] bg-[#F5F5F7]/40">
          {/* Barber & Price */}
          <div className="flex items-center justify-between text-xs text-[#86868B] pt-1">
            {staffMember ? (
              <span>Barber: <strong className="text-[#1D1D1F] font-medium">{staffMember.name}</strong></span>
            ) : <span />}
            {service && (
              <span className="text-[#1D1D1F] font-medium">Rs {service.price_mur}</span>
            )}
          </div>

          {/* Customer & Call / WA */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-[#1D1D1F] text-sm">{booking.customer_name}</p>
              <p className="text-xs text-[#86868B]">{booking.customer_phone}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={"tel:" + booking.customer_phone}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-xs font-medium transition"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call
              </a>
              <a
                href={"https://wa.me/" + waNum + "?text=" + waMsg}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#248A3D] text-xs font-medium transition"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.546 4.14 1.587 5.945L.057 23.35a.99.99 0 001.244 1.206l5.526-1.493A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 01-5.031-1.37l-.36-.214-3.734 1.01 1.018-3.625-.234-.375A9.9 9.9 0 012.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/>
                </svg>
                WA
              </a>
            </div>
          </div>

          {/* Cancellation Info */}
          <div className="rounded-xl bg-white border border-black/[0.06] p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#FF3B30] font-medium">
              <span>Cancelled {booking.cancelled_by ? "by Salon" : "by Customer"}</span>
              {booking.cancelled_at && (
                <span className="text-[11px] text-[#86868B] font-normal">
                  {formatTimeMU(booking.cancelled_at)}
                </span>
              )}
            </div>
            {booking.cancellation_reason && (
              <p className="text-[#86868B] italic bg-[#F5F5F7] rounded-lg p-2.5">
                &ldquo;{booking.cancellation_reason}&rdquo;
              </p>
            )}

            {/* Refund Pending Action */}
            {booking.refund_status === "pending" && (
              <div className="pt-2 border-t border-black/[0.06] flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#FF9500]">
                    Deposit Refund Due: Rs {booking.deposit_required_mur || service?.deposit_required_mur || 0}
                  </p>
                  <p className="text-[11px] text-[#86868B]">Client awaiting MCB Juice transfer</p>
                </div>
                <button
                  type="button"
                  onClick={() => onInitiateRefundComplete(booking)}
                  className="px-3 py-1.5 rounded-xl bg-[#1D1D1F] hover:bg-[#2C2C2E] text-white text-xs font-medium shadow-sm transition active:scale-[0.98] shrink-0"
                >
                  Record Refund
                </button>
              </div>
            )}

            {/* Refund Completed */}
            {booking.refund_status === "refunded" && (
              <div className="pt-2 border-t border-black/[0.06] flex items-center gap-1.5 text-xs text-[#248A3D] font-medium">
                <svg className="w-4 h-4 text-[#34C759] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>
                  Deposit Refunded via Juice{booking.refund_reference ? ` (Ref: ${booking.refund_reference})` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BookingCard (Apple HIG Milled Surface) ───────────────────────────────────

function BookingCard({
  booking,
  service,
  staffMember,
  isUpNext,
  nowMs,
  onStatusChange,
  onConfirmDeposit,
  onInitiateCancel,
  onInitiateRefundComplete,
}: {
  booking: AdminBooking;
  service: ServiceInfo | undefined;
  staffMember: StaffInfo | undefined;
  isUpNext: boolean;
  nowMs: number;
  onStatusChange: (id: string, status: BookingStatus) => Promise<void>;
  onConfirmDeposit: (id: string) => Promise<void>;
  onInitiateCancel: (booking: AdminBooking) => void;
  onInitiateRefundComplete: (booking: AdminBooking) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [cancelledExpanded, setCancelledExpanded] = useState(false);

  const inChair = bookingIsInChair(booking, nowMs);
  const minsRemaining = inChair
    ? Math.max(0, Math.ceil((new Date(booking.end_time).getTime() - nowMs) / 60_000))
    : 0;

  const waNum = waDigits(booking.customer_phone);
  const waMsg = encodeURIComponent(
    "Hi " + booking.customer_name + "! Your appointment at our salon is confirmed. See you soon!"
  );

  const hasDeposit = service && service.deposit_required_mur > 0;
  const depositPending = booking.payment_status === "deposit_submitted";
  const STATUS_ACTIONS: BookingStatus[] = ["confirmed", "completed", "no_show", "cancelled"];

  async function handleStatus(newStatus: BookingStatus) {
    if (updating || booking.status === newStatus) return;
    if (newStatus === "cancelled") { onInitiateCancel(booking); return; }
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

  // Tier 1: Completed → compact row
  if (booking.status === "completed") {
    return <CompletedRow booking={booking} service={service} />;
  }

  // Tier 2: Cancelled → collapsible compact row
  if (booking.status === "cancelled") {
    return (
      <CancelledRow
        booking={booking}
        service={service}
        staffMember={staffMember}
        expanded={cancelledExpanded}
        onToggle={() => setCancelledExpanded((prev) => !prev)}
        onInitiateRefundComplete={onInitiateRefundComplete}
      />
    );
  }

  // Tier 3: In Chair (Active Hero Card)
  if (inChair) {
    return (
      <div
        className={
          "rounded-2xl border-2 border-[#34C759]/80 bg-white shadow-[0_4px_24px_rgba(52,199,89,0.14)] overflow-hidden transition-all " +
          (updating ? "opacity-60 pointer-events-none" : "")
        }
      >
        <div className="flex items-center gap-2 bg-[#34C759] text-white px-5 py-2 text-[11px] font-semibold tracking-wider uppercase">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>In Chair &bull; {minsRemaining} min remaining</span>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-semibold tracking-tight tabular-nums text-[#1D1D1F]">
                {formatTimeMU(booking.start_time)} &ndash; {formatTimeMU(booking.end_time)}
              </span>
              <span className="text-[#86868B]">&bull;</span>
              <span className="text-sm font-medium text-[#1D1D1F]">{service?.name ?? "Service"}</span>
            </div>
            {service && (
              <span className="font-semibold text-sm text-[#1D1D1F]">
                <span className="text-xs font-normal text-[#86868B]">Rs </span>{service.price_mur}
              </span>
            )}
          </div>

          {staffMember && (
            <p className="text-xs text-[#86868B]">Stylist: <span className="text-[#1D1D1F] font-medium">{staffMember.name}</span></p>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#1D1D1F] text-base">{booking.customer_name}</p>
              <p className="text-xs text-[#86868B]">{booking.customer_phone}</p>
            </div>
            <a
              href={"tel:" + booking.customer_phone}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-xs font-medium transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call
            </a>
          </div>

          <button
            onClick={() => handleStatus("completed")}
            disabled={updating}
            className="w-full min-h-12 rounded-xl bg-[#1D1D1F] hover:bg-[#2C2C2E] active:scale-[0.98] text-white font-medium text-sm shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 text-[#34C759]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Complete &amp; Collect Rs {service?.price_mur ?? 0}
          </button>

          <div className="flex gap-2 pt-0.5">
            <button
              onClick={() => handleStatus("no_show")}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#86868B] hover:text-[#1D1D1F] transition"
            >
              No-Show
            </button>
            <button
              onClick={() => handleStatus("cancelled")}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-[#F5F5F7] hover:bg-[#FF3B30]/10 text-[#86868B] hover:text-[#FF3B30] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normal Card (Apple Milled Surface)
  return (
    <div
      className={
        "rounded-2xl border bg-white p-5 transition-all " +
        (isUpNext
          ? "border-black/[0.08] ring-1 ring-[#34C759]/40 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_20px_rgba(52,199,89,0.08)]"
          : "border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)]") +
        (updating ? " opacity-60 pointer-events-none" : "")
      }
    >
      <div className="space-y-3.5">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl font-semibold tracking-tight tabular-nums text-[#1D1D1F] shrink-0">
              {formatTimeMU(booking.start_time)} &ndash; {formatTimeMU(booking.end_time)}
            </span>
            <span className="text-[#86868B] shrink-0">&bull;</span>
            <span className="text-sm font-medium text-[#1D1D1F] truncate">
              {service?.name ?? "Service"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isUpNext && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#34C759]/10 text-[10px] font-semibold text-[#248A3D] uppercase tracking-wider border border-[#34C759]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
                Up Next
              </span>
            )}
            <AppleStatusBadge status={booking.status} />
          </div>
        </div>

        {/* Stylist */}
        {staffMember && (
          <p className="text-xs text-[#86868B]">
            Stylist: <span className="text-[#1D1D1F] font-medium">{staffMember.name}</span>
          </p>
        )}

        {/* Customer & Call / WA */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-[#1D1D1F] text-base truncate">{booking.customer_name}</p>
            <p className="text-xs text-[#86868B] mt-0.5">{booking.customer_phone}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={"tel:" + booking.customer_phone}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-xs font-medium transition"
            >
              <svg className="w-3.5 h-3.5 text-[#1D1D1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call
            </a>
            <a
              href={"https://wa.me/" + waNum + "?text=" + waMsg}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#248A3D] text-xs font-medium transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.546 4.14 1.587 5.945L.057 23.35a.99.99 0 001.244 1.206l5.526-1.493A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 01-5.031-1.37l-.36-.214-3.734 1.01 1.018-3.625-.234-.375A9.9 9.9 0 012.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/>
              </svg>
              WA
            </a>
          </div>
        </div>

        {/* Juice Deposit Block */}
        {hasDeposit && (
          <div className="rounded-xl bg-[#F5F5F7] p-3 flex items-center justify-between gap-2 border border-black/[0.04]">
            <div>
              <p className="text-xs font-medium text-[#1D1D1F]">
                MCB Juice &bull; <span className="text-[#86868B]">Rs </span>{service.deposit_required_mur}
              </p>
              {booking.juice_reference ? (
                <p className="text-[11px] font-mono text-[#86868B]">Ref: {booking.juice_reference}</p>
              ) : (
                <p className="text-[11px] text-[#86868B] italic">No reference recorded</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ApplePaymentBadge paymentStatus={booking.payment_status} />
              {depositPending && (
                <button
                  onClick={handleDeposit}
                  className="px-2.5 py-1 rounded-lg bg-[#34C759] hover:bg-[#2DB04D] text-white text-xs font-semibold shadow-sm transition"
                >
                  Verify
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status Pills */}
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto pt-1">
          {STATUS_ACTIONS.map((s) => {
            const isCurrent = booking.status === s;
            return (
              <button
                key={s}
                onClick={() => handleStatus(s)}
                disabled={isCurrent}
                className={
                  isCurrent
                    ? "px-3 py-1.5 rounded-full text-xs font-semibold bg-[#1D1D1F] text-white shadow-sm"
                    : "px-3 py-1.5 rounded-full text-xs font-medium bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#E8E8ED] transition"
                }
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Apple HIG Scrubber Indicator ─────────────────────────────────────────────

function AppleNowScrubber({ currentTime }: { currentTime: string }) {
  return (
    <div className="flex items-center gap-3 my-3 text-xs font-semibold text-[#86868B] select-none">
      <div className="h-px bg-red-400/60 flex-1" />
      <span className="text-red-500 uppercase tracking-widest text-[10px]">
        NOW &bull; {currentTime}
      </span>
      <div className="h-px bg-red-400/60 flex-1" />
    </div>
  );
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: "all",       label: "All"             },
  { key: "confirmed", label: "Confirmed"       },
  { key: "deposit",   label: "Pending Deposit" },
  { key: "refunds",   label: "Refunds Due"     },
  { key: "completed", label: "Completed"       },
] as const;

type FilterKey = typeof FILTER_TABS[number]["key"];

interface DashboardClientProps {
  initialBookings: AdminBooking[];
  services: ServiceInfo[];
  staff: StaffInfo[];
  todayStr: string;
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

  const serviceMap: Record<string, ServiceInfo> = Object.fromEntries(services.map((s) => [s.id, s]));
  const staffMap: Record<string, StaffInfo>     = Object.fromEntries(staff.map((s) => [s.id, s]));

  const [bookings, setBookings]           = useState<AdminBooking[]>(initialBookings);
  const [selectedDate, setSelectedDate]   = useState(todayStr);
  const [filter, setFilter]               = useState<FilterKey>("all");
  const [loading, setLoading]             = useState(false);
  const [fetchError, setFetchError]       = useState<string | null>(null);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInNotice, setWalkInNotice]   = useState<string | null>(null);

  // Live clock: update every 30 seconds as requested
  const [clockTime, setClockTime] = useState<string>(nowTimeMU());
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    setClockTime(nowTimeMU());
    clockRef.current = setInterval(() => setClockTime(nowTimeMU()), 30_000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  const [cancellingBooking, setCancellingBooking] = useState<AdminBooking | null>(null);
  const [refundingBooking,  setRefundingBooking]  = useState<AdminBooking | null>(null);

  const tomorrowStr = nextDayStr(todayStr);
  const isToday     = selectedDate === todayStr;

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function fetchBookings(dateStr: string) {
    setLoading(true);
    setFetchError(null);
    const { from, to } = dateRangeMU(dateStr);
    const url = "/api/v1/admin/bookings?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    try {
      const res  = await fetch(url);
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

  // ── Status / deposit ──────────────────────────────────────────────────────
  async function handleStatusChange(id: string, status: BookingStatus) {
    const snap = bookings;
    setBookings(bookings.map((b) => (b.id === id ? { ...b, status } : b)));
    try {
      const res  = await fetch("/api/v1/admin/bookings/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Update failed");
      setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)));
    } catch { setBookings(snap); }
  }

  async function handleConfirmDeposit(id: string) {
    const snap = bookings;
    setBookings(bookings.map((b) => (b.id === id ? { ...b, payment_status: "paid_in_full" as PaymentStatus } : b)));
    try {
      const res  = await fetch("/api/v1/admin/bookings/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "paid_in_full" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Update failed");
      setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)));
    } catch { setBookings(snap); }
  }

  // ── Cancellation ──────────────────────────────────────────────────────────
  async function handleConfirmCancel(input: {
    bookingId: string;
    cancellationReason: string;
    refundStatus: "not_required" | "pending" | "refunded" | "not_possible";
    refundReference?: string;
    openWhatsApp: boolean;
  }) {
    const { bookingId, cancellationReason, refundStatus, refundReference } = input;
    const snap = bookings;
    setBookings((bs) =>
      bs.map((b) =>
        b.id === bookingId
          ? { ...b, status: "cancelled", cancellation_reason: cancellationReason,
              refund_status: refundStatus, refund_reference: refundReference ?? null,
              cancelled_at: new Date().toISOString(), cancelled_by: "owner" }
          : b
      )
    );
    try {
      const res  = await fetch("/api/v1/admin/bookings/" + bookingId, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", cancellationReason, refundStatus,
          refundReference: refundReference || undefined }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Cancellation failed");
      setBookings((bs) => bs.map((b) => (b.id === bookingId ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)));
    } catch (e) {
      setBookings(snap);
      alert(e instanceof Error ? e.message : "Failed to cancel booking");
    }
  }

  async function handleConfirmRefunded(bookingId: string, refundReference: string) {
    const snap = bookings;
    setBookings((bs) =>
      bs.map((b) =>
        b.id === bookingId
          ? { ...b, refund_status: "refunded", refund_reference: refundReference, refunded_at: new Date().toISOString() }
          : b
      )
    );
    try {
      const res  = await fetch("/api/v1/admin/bookings/" + bookingId, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundStatus: "refunded", refundReference }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to record refund");
      setBookings((bs) => bs.map((b) => (b.id === bookingId ? { ...b, ...(json.booking as Partial<AdminBooking>) } : b)));
    } catch (e) {
      setBookings(snap);
      alert(e instanceof Error ? e.message : "Failed to record refund");
    }
  }

  // ── Walk-in Block Action ──────────────────────────────────────────────────
  async function blockWalkIn() {
    if (walkInLoading) return;
    setWalkInLoading(true);
    try {
      const res  = await fetch("/api/v1/admin/walk-in", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 30 }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { alert(json.error ?? "Could not block walk-in slot"); return; }
      const newBooking = json.booking as AdminBooking;
      setBookings((bs) =>
        [...bs, newBooking].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      );
      setWalkInNotice(`Blocked ${formatTimeMU(newBooking.start_time)} – ${formatTimeMU(newBooking.end_time)} for Walk-in`);
      setTimeout(() => setWalkInNotice(null), 6000);
    } finally {
      setWalkInLoading(false);
    }
  }

  async function handleWalkInCompleted(id: string) {
    const snap = bookings;
    setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status: "completed" as BookingStatus } : b));
    try {
      await fetch("/api/v1/admin/bookings/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
    } catch { setBookings(snap); }
  }

  async function handleWalkInRelease(id: string) {
    setBookings((bs) => bs.filter((b) => b.id !== id));
    try {
      await fetch("/api/v1/admin/bookings/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
    } catch { fetchBookings(selectedDate); }
  }

  // ── Derived Filter & Metrics ──────────────────────────────────────────────
  const filtered = bookings.filter((b) => {
    if (filter === "confirmed") return b.status === "confirmed";
    if (filter === "deposit")   return b.payment_status === "deposit_submitted";
    if (filter === "refunds")   return b.refund_status === "pending";
    if (filter === "completed") return b.status === "completed";
    return true;
  });

  const activeBookings  = bookings.filter((b) => b.status !== "cancelled");
  const estRevenue      = activeBookings.reduce((s, b) => s + (serviceMap[b.service_id]?.price_mur ?? 300), 0);
  const pendingDeposits = bookings.filter((b) => b.payment_status === "deposit_submitted").length;
  const pendingRefunds  = bookings.filter((b) => b.refund_status === "pending").length;

  const nowMs = Date.now();

  // NOW scrubber: sits right before the first appointment that hasn't ended yet
  const nowDividerIndex: number = isToday
    ? filtered.findIndex((b) => new Date(b.end_time).getTime() >= nowMs)
    : -1;

  // Up Next: earliest confirmed/pending appointment starting strictly in the future
  const upNextId: string | null = (() => {
    if (!isToday) return null;
    const found = filtered.find(
      (b) =>
        !isWalkIn(b) &&
        (b.status === "pending" || b.status === "confirmed") &&
        new Date(b.start_time).getTime() > nowMs
    );
    return found?.id ?? null;
  })();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-black/[0.06]" />
        <div className="mt-5 h-24 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:space-y-6 sm:py-8">
      {/* ── Dashboard Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B]">
            Today at the chair
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F] sm:text-3xl">
            Bookings
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Clock: e.g. "14:05 • Grand Baie" */}
          <div className="rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] px-3.5 py-2 text-center">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
              <span className="font-semibold text-sm tracking-tight tabular-nums text-[#1D1D1F]">
                {clockTime} &bull; {salonName}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] px-3.5 py-2 text-right text-xs">
            <span className="block font-semibold text-[#1D1D1F]">
              {selectedDate === todayStr ? "Today" : selectedDate}
            </span>
            <span className="text-[#86868B]">{bookings.length} total</span>
          </div>
        </div>
      </div>

      {/* ── Apple Health-Style Metric Cards ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {/* Bookings */}
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] p-4 transition-all">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-1">
            Bookings
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-[#1D1D1F]">
            {activeBookings.length}
          </p>
          <p className="text-xs text-[#86868B] mt-0.5">active today</p>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] p-4 transition-all">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-1">
            Revenue
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-[#1D1D1F]">
            <span className="text-sm font-normal text-[#86868B]">Rs </span>
            {estRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-[#86868B] mt-0.5">est. total</p>
        </div>

        {/* Deposits */}
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] p-4 transition-all">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-1 flex items-center gap-1.5">
            {pendingDeposits > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#FF9500] animate-pulse" />}
            Deposits
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-[#1D1D1F]">
            {pendingDeposits}
          </p>
          <p className="text-xs text-[#86868B] mt-0.5">to verify</p>
        </div>

        {/* Refunds */}
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] p-4 transition-all">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-1 flex items-center gap-1.5">
            {pendingRefunds > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] animate-pulse" />}
            Refunds
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-[#1D1D1F]">
            {pendingRefunds}
          </p>
          <p className="text-xs text-[#86868B] mt-0.5">pending action</p>
        </div>
      </div>

      {/* ── Operational Control: Block 30m / Walk-in ── */}
      <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={blockWalkIn}
            disabled={walkInLoading}
            className="bg-[#1D1D1F] hover:bg-[#2C2C2E] active:scale-[0.98] text-white font-medium text-sm rounded-xl px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
          >
            {walkInLoading ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Reserving…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Block 30m / Walk-in
              </>
            )}
          </button>

          <p className="text-xs text-[#86868B]">
            Instantly holds the next open chair for a counter walk-in.
          </p>
        </div>

        {walkInNotice && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#34C759]/10 text-xs font-semibold text-[#248A3D] border border-[#34C759]/20 self-start sm:self-auto">
            <span>✓</span>
            <span>{walkInNotice}</span>
          </div>
        )}
      </div>

      {/* ── Date Segmented Control ── */}
      <div className="bg-[#F5F5F7] p-1 rounded-2xl flex items-center gap-1">
        <button
          onClick={() => selectDate(todayStr)}
          className={
            "flex-1 py-2 rounded-xl text-sm transition-all " +
            (selectedDate === todayStr
              ? "bg-[#1D1D1F] text-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
              : "text-[#86868B] hover:text-[#1D1D1F] font-medium")
          }
        >
          Today
        </button>
        <button
          onClick={() => selectDate(tomorrowStr)}
          className={
            "flex-1 py-2 rounded-xl text-sm transition-all " +
            (selectedDate === tomorrowStr
              ? "bg-[#1D1D1F] text-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
              : "text-[#86868B] hover:text-[#1D1D1F] font-medium")
          }
        >
          Tomorrow
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => { if (e.target.value) selectDate(e.target.value); }}
          className="flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-transparent text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#1D1D1F] border-0"
        />
      </div>

      {/* ── Filter Segmented Tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={
                "flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all " +
                (active
                  ? "bg-[#1D1D1F] text-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                  : "bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#E8E8ED] font-medium")
              }
            >
              {tab.label}
              {tab.key === "deposit" && pendingDeposits > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[#FF9500] text-white text-[10px] font-bold">
                  {pendingDeposits}
                </span>
              )}
              {tab.key === "refunds" && pendingRefunds > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[#FF3B30] text-white text-[10px] font-bold">
                  {pendingRefunds}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Timeline Bookings List ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 rounded-full border-2 border-black/[0.08] border-t-[#1D1D1F] animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="rounded-2xl bg-white border border-black/[0.06] p-6 text-center shadow-sm">
          <p className="text-[#FF3B30] text-sm font-medium mb-2">{fetchError}</p>
          <button
            onClick={() => fetchBookings(selectedDate)}
            className="text-xs font-semibold text-[#1D1D1F] underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col items-center justify-center py-16 text-[#86868B]">
          <svg className="w-10 h-10 mb-2.5 opacity-30 text-[#86868B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-semibold text-[#1D1D1F]">No bookings scheduled</p>
          <p className="text-xs mt-0.5 text-[#86868B]">{selectedDate}</p>
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          {filtered.map((booking, idx) => {
            const showNowScrubber = isToday && nowDividerIndex >= 0 && idx === nowDividerIndex;

            if (isWalkIn(booking) && booking.status === "confirmed") {
              return (
                <div key={booking.id}>
                  {showNowScrubber && <AppleNowScrubber currentTime={clockTime} />}
                  <WalkInCard
                    booking={booking}
                    nowMs={nowMs}
                    servicePrice={serviceMap[booking.service_id]?.price_mur ?? 300}
                    onMarkCompleted={handleWalkInCompleted}
                    onRelease={handleWalkInRelease}
                  />
                </div>
              );
            }

            return (
              <div key={booking.id}>
                {showNowScrubber && <AppleNowScrubber currentTime={clockTime} />}
                <BookingCard
                  booking={booking}
                  service={serviceMap[booking.service_id]}
                  staffMember={staffMap[booking.staff_id]}
                  isUpNext={booking.id === upNextId}
                  nowMs={nowMs}
                  onStatusChange={handleStatusChange}
                  onConfirmDeposit={handleConfirmDeposit}
                  onInitiateCancel={(b) => setCancellingBooking(b)}
                  onInitiateRefundComplete={(b) => setRefundingBooking(b)}
                />
              </div>
            );
          })}
          {/* NOW scrubber at bottom if all appointments are in the past */}
          {isToday && nowDividerIndex === -1 && filtered.length > 0 && (
            <AppleNowScrubber currentTime={clockTime} />
          )}
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
