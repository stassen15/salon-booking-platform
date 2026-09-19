"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f7] px-4 py-10 text-zinc-950">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-amber-100/80 blur-3xl" />
      <div className="premium-rise relative w-full max-w-md">

        {/* Brand icon */}
        <div className="mb-7 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-zinc-950 shadow-2xl shadow-zinc-400/30">
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.121 7.879a3 3 0 11-4.242 4.242M9.879 9.879A3 3 0 0114.12 14.12
                   M9.879 9.879L7 7m2.879 2.879l4.242 4.242M7 7l-3 3m3-3l3 3" />
            </svg>
          </div>
        </div>

        <h1 className="text-center text-[30px] font-semibold tracking-[-0.04em] text-zinc-950">Salon Dashboard</h1>
        <p className="mb-8 mt-2 text-center text-sm text-zinc-500">Sign in to manage your bookings</p>

        <form onSubmit={handleSubmit} className="premium-surface space-y-4 rounded-[28px] p-5 sm:p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
              autoComplete="email"
              className="w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3.5 text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3.5 text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-2xl bg-zinc-950 py-3.5 text-base font-semibold text-white shadow-lg shadow-zinc-950/15 transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          New salon? <Link href="/admin/signup" className="font-semibold text-zinc-950 underline underline-offset-4">Create an owner account</Link>
        </p>
      </div>
    </main>
  );
}
