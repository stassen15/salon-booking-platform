"use client";

import { useEffect, useState } from "react";

type Analytics = { totalBookings: number; completedBookings: number; cancelledBookings: number; noShowBookings: number; paidBookings: number };

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  useEffect(() => { fetch("/api/v1/admin/analytics").then((r) => r.json()).then(setData); }, []);
  const cards = data ? [["Bookings", data.totalBookings], ["Completed", data.completedBookings], ["Paid", data.paidBookings], ["Cancelled", data.cancelledBookings], ["No-shows", data.noShowBookings]] : [];
  return <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:py-8"><div className="premium-rise"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Owner overview</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-zinc-950">Insights</h1><p className="mt-1 text-sm text-zinc-500">Last 30 days of booking activity.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{cards.map(([label, value]) => <div key={label} className="premium-surface rounded-[22px] p-4"><p className="text-xs font-medium text-zinc-400">{label}</p><p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-zinc-950">{value}</p></div>)}</div></div>;
}
