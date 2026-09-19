import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f5f7] px-5 py-8 text-zinc-950 sm:px-8">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-200/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-amber-100/80 blur-3xl" />
      <div className="premium-rise relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-between">
        <header className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-zinc-950 text-white shadow-lg shadow-zinc-950/20">✂</div><span className="font-semibold tracking-[-0.02em]">Salon OS</span></div>
          <Link href="/admin/login" className="rounded-full border border-zinc-200 bg-white/70 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur transition hover:bg-white">Owner sign in</Link>
        </header>
        <section className="grid items-center gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div><p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Made for Mauritius · MUR · UTC+4</p><h1 className="max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.07em] sm:text-7xl">A calmer way to run your chair.</h1><p className="mt-6 max-w-lg text-lg leading-8 text-zinc-500">Beautiful booking links, smarter Juice deposits, and a counter view that keeps your day moving.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/admin/signup" className="rounded-2xl bg-zinc-950 px-5 py-3.5 font-semibold text-white shadow-xl shadow-zinc-950/20 transition hover:bg-zinc-800 active:scale-[0.98]">Create your salon</Link><Link href="/admin/login" className="rounded-2xl border border-zinc-200 bg-white/70 px-5 py-3.5 font-semibold text-zinc-700 backdrop-blur transition hover:bg-white">Open dashboard</Link></div></div>
          <div className="premium-surface rounded-[34px] p-4 sm:p-5"><div className="rounded-[26px] bg-zinc-950 p-5 text-white shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs text-zinc-400">TODAY AT THE CHAIR</p><p className="mt-1 text-xl font-semibold">Friday, 18 September</p></div><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">Live</span></div><div className="mt-6 space-y-3"><div className="rounded-2xl bg-white/10 p-4"><p className="text-sm font-semibold">14:00 – 14:45</p><div className="mt-2 flex items-center justify-between"><span className="text-lg font-semibold">Ravi Jugurnath</span><span className="text-xs text-zinc-400">Classic Haircut</span></div></div><div className="rounded-2xl border border-dashed border-white/15 p-4"><p className="text-sm font-semibold text-zinc-300">14:45 – 15:15</p><p className="mt-2 text-sm text-zinc-500">Open chair</p></div></div></div></div>
        </section>
        <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-200/80 py-5 text-sm text-zinc-500"><span>White-label booking</span><span>MCB Juice ready</span><span>WhatsApp reminders</span><span>Built for barbers</span></footer>
      </div>
    </main>
  );
}
