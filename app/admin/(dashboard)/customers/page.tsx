"use client";

import { useEffect, useState } from "react";

type Customer = { id: string; name: string; phone: string; notes: string | null; updated_at: string };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => { fetch(`/api/v1/admin/customers?q=${encodeURIComponent(query)}`).then((r) => r.json()).then((json) => setCustomers(json.customers ?? [])); }, [query]);
  return <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:py-8"><div className="premium-rise"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Your client book</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-zinc-950">Customers</h1><p className="mt-1 text-sm text-zinc-500">Your returning customer base, in one place.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or phone" className="w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3.5 outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-950/10" /><div className="space-y-3">{customers.map((customer) => <div key={customer.id} className="premium-surface rounded-[22px] p-4"><div className="flex items-center justify-between"><div><p className="text-lg font-semibold text-zinc-950">{customer.name}</p><p className="text-sm text-zinc-500">{customer.phone}</p></div><a href={`tel:${customer.phone}`} className="min-h-11 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white">Call</a></div>{customer.notes && <p className="mt-3 text-sm text-zinc-500">{customer.notes}</p>}</div>)}{customers.length === 0 && <p className="py-12 text-center text-sm text-zinc-400">No customers yet.</p>}</div></div>;
}
