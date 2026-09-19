"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin` },
    });
    setLoading(false);
    if (signUpError) { setError(signUpError.message); return; }
    if (data.session) { router.push("/admin/setup"); router.refresh(); return; }
      setMessage("Check your email to confirm your account. If this email already has an account, use Sign in or Forgot password instead.");
  }

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f7] px-4 py-10 text-zinc-950"><div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet-200/60 blur-3xl" /><div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-sky-100 blur-3xl" /><div className="premium-rise relative w-full max-w-md"><div className="mb-7 text-center"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Salon platform</p><h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em]">Create owner account</h1><p className="mt-2 text-sm text-zinc-500">Set up your salon and publish your first booking link.</p></div><form onSubmit={handleSubmit} className="premium-surface space-y-4 rounded-[28px] p-5 sm:p-6"><label className="block text-sm font-medium text-zinc-700">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3.5 text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10" /></label><label className="block text-sm font-medium text-zinc-700">Password<input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3.5 text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10" /></label>{error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{message && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}<button disabled={loading} className="min-h-12 w-full rounded-2xl bg-zinc-950 py-3.5 font-semibold text-white shadow-lg shadow-zinc-950/15 transition hover:bg-zinc-800 disabled:opacity-50">{loading ? "Creating account…" : "Create account"}</button></form><p className="mt-6 text-center text-sm text-zinc-500">Already have an account? <Link href="/admin/login" className="font-semibold text-zinc-950 underline underline-offset-4">Sign in</Link></p></div></main>;
}
