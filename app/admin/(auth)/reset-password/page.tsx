"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/admin");
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update your password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f7] px-4 py-10 text-zinc-950">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-amber-100/80 blur-3xl" />
      <div className="premium-rise relative w-full max-w-md">
        <div className="mb-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Salon platform</p>
          <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em]">Choose a new password</h1>
          <p className="mt-2 text-sm text-zinc-500">Make it strong and easy for you to remember.</p>
        </div>
        <form onSubmit={handleSubmit} className="premium-surface space-y-4 rounded-[28px] p-5 sm:p-6">
          <label className="block text-sm font-medium text-zinc-700">
            New password
            <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3.5 text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10" />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Confirm password
            <input type="password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3.5 text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10" />
          </label>
          {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          <button disabled={loading} className="min-h-12 w-full rounded-2xl bg-zinc-950 py-3.5 font-semibold text-white shadow-lg shadow-zinc-950/15 transition hover:bg-zinc-800 disabled:opacity-50">{loading ? "Updating password…" : "Update password"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500"><Link href="/admin/login" className="font-semibold text-zinc-950 underline underline-offset-4">Back to sign in</Link></p>
      </div>
    </main>
  );
}
