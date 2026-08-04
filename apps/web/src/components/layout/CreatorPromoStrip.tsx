"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CreatorPromoStrip() {
  return (
    <aside className="relative flex-shrink-0 overflow-hidden border-b border-white/[0.06] bg-[radial-gradient(circle_at_12%_50%,rgba(124,58,237,0.2),transparent_34%),linear-gradient(110deg,#16131b_0%,#181420_55%,#111014_100%)]">
      <div className="pointer-events-none absolute inset-y-0 left-[18%] w-px rotate-[24deg] bg-gradient-to-b from-transparent via-violet-400/15 to-transparent" />
      <div className="pointer-events-none absolute -right-16 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full border border-violet-300/[0.06]" />

      <div className="relative mx-auto flex min-h-12 max-w-7xl items-center justify-between gap-4 px-4 py-2 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-7 w-0.5 flex-shrink-0 bg-gradient-to-b from-violet-400 to-indigo-600" />
          <div className="min-w-0 leading-none">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300/80 sm:text-[10px]">
              Partner Program
            </p>
            <p className="truncate text-xs font-black text-zinc-100 sm:text-sm">
              스트리머·클랜 파트너 모집
            </p>
          </div>
        </div>

        <Link
          href="/partners"
          className="group inline-flex flex-shrink-0 items-center gap-1.5 py-2 text-[11px] font-bold text-zinc-300 transition-colors hover:text-white sm:text-xs"
        >
          안내 보기
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </aside>
  );
}
