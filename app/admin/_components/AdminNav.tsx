"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Bookings",
    exact: true,
    path: "M4 6h16M4 12h16M4 18h16",
  },
  {
    href: "/admin/customers",
    label: "Clients",
    exact: false,
    path: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm7-4a3 3 0 110 6",
  },
  {
    href: "/admin/analytics",
    label: "Insights",
    exact: false,
    path: "M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-7",
  },
  {
    href: "/admin/setup",
    label: "Settings",
    exact: false,
    path: "M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 000 2.4l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 00-2.4 0 1.7 1.7 0 00-.5 1.2v.2h-2.6v-.2a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-2.4 0l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 000-2.4 1.7 1.7 0 00-1.2-.5h-.2v-2.6h.2a1.7 1.7 0 001.2-2.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 002.4 0 1.7 1.7 0 00.5-1.2V4h2.6v.2a1.7 1.7 0 002.9 1.2l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 000 2.4c.3.3.7.5 1.2.5h.2v2.6h-.2c-.5 0-.9.2-1.2.5z",
  },
] as const;

export default function AdminNav({ salonName }: { salonName: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const monogram =
    salonName
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  // Live clock — updates every 30 seconds
  const [clockTime, setClockTime] = useState("");
  useEffect(() => {
    function tick() {
      setClockTime(
        new Intl.DateTimeFormat("en-MU", {
          timeZone: "Indian/Mauritius",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date())
      );
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Date label for desktop sub-line
  const [today, setToday] = useState("Today");
  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat("en-MU", {
        timeZone: "Indian/Mauritius",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date())
    );
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <>
      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <nav className="safe-top sticky top-0 z-30 border-b border-black/[0.06] bg-white/85 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">

          {/* Left: Monogram + Salon Name */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white font-bold text-sm shadow-md shadow-zinc-950/15">
              {monogram}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-zinc-950">{salonName}</p>
              {/* Date sub-line — desktop only */}
              <p className="hidden md:block text-xs text-zinc-500">{today}</p>
            </div>
          </div>

          {/* Right: Desktop nav links + Sign Out (Desktop) / Live Clock only (Mobile) */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href="/api/v1/admin/qr-kit"
                download
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                QR Kit
              </a>
            </div>

            {/* Desktop: Sign Out button */}
            <button
              onClick={handleSignOut}
              className="hidden md:flex min-h-9 items-center gap-1.5 rounded-xl bg-zinc-100 px-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 active:scale-95 shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>

            {/* Mobile: Live clock pill (md:hidden) */}
            <div className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 text-xs font-medium text-zinc-700">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse shrink-0" />
              {clockTime ? `${clockTime} · Live` : "Live"}
            </div>
          </div>
        </div>
      </nav>

      {/* ── iOS Frosted Bottom Navigation Bar (mobile only: md:hidden) ─────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden backdrop-blur-xl bg-white/85 border-t border-black/[0.06] shadow-[0_-1px_3px_rgba(0,0,0,0.02)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 px-6 flex justify-around items-center">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex flex-col items-center justify-center gap-1 min-h-12 min-w-[52px] rounded-xl text-[10px] transition-all " +
                (active
                  ? "text-[#1D1D1F] font-semibold scale-105"
                  : "text-[#86868B] hover:text-zinc-700 font-medium")
              }
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.2 : 1.8} d={item.path} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
