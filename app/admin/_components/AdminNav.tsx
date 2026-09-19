"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AdminNav({ salonName }: { salonName: string }) {
  const router = useRouter();

  const [today, setToday] = useState("Today");

  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-MU", {
      timeZone: "Indian/Mauritius",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date()));
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <>
    <nav className="safe-top relative sticky top-0 z-30 border-b border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">

        {/* Salon info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-zinc-950 shadow-lg shadow-zinc-950/15">
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.121 7.879a3 3 0 11-4.242 4.242M9.879 9.879A3 3 0 0114.12 14.12
                   M9.879 9.879L7 7m2.879 2.879l4.242 4.242M7 7l-3 3m3-3l3 3" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-zinc-950">{salonName}</p>
            <p className="text-xs text-zinc-500">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/admin" className="admin-desktop-nav hidden rounded-full px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 sm:block">Bookings</Link>
          <Link href="/admin/customers" className="admin-desktop-nav hidden rounded-full px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 sm:block">Customers</Link>
          <Link href="/admin/analytics" className="admin-desktop-nav hidden rounded-full px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 sm:block">Insights</Link>
          <Link href="/admin/setup" className="admin-desktop-nav hidden rounded-full px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 sm:block">Settings</Link>
          {/* API download intentionally uses a plain anchor. */}
          <a href="/api/v1/admin/qr-kit" download className="admin-desktop-nav hidden rounded-full px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 sm:block">QR Kit</a>
          <button
          onClick={handleSignOut}
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-zinc-100 px-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200
                     active:scale-95 shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
          </button>
        </div>
      </div>
    </nav>
      <div className="admin-mobile-tabs safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-zinc-200/60 bg-white/80 px-2 pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-md sm:hidden">
        {[["/admin", "Bookings", "M4 6h16M4 12h16M4 18h16"], ["/admin/customers", "Customers", "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm7-4a3 3 0 110 6"], ["/admin/analytics", "Insights", "M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-7"], ["/admin/setup", "Settings", "M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 000 2.4l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 00-2.4 0 1.7 1.7 0 00-.5 1.2v.2h-2.6v-.2a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-2.4 0l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 000-2.4 1.7 1.7 0 00-1.2-.5h-.2v-2.6h.2a1.7 1.7 0 001.2-2.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 002.4 0 1.7 1.7 0 00.5-1.2V4h2.6v.2a1.7 1.7 0 002.9 1.2l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 000 2.4c.3.3.7.5 1.2.5h.2v2.6h-.2c-.5 0-.9.2-1.2.5z"]].map(([href, label, path]) => <Link key={href} href={href} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-zinc-500 active:scale-95"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} /></svg>{label}</Link>)}
      </div>
    </>
  );
}
