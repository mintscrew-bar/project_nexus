"use client";

import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";

export function CreatorPromoStrip() {
  return (
    <aside className="relative flex-shrink-0 overflow-hidden border-b border-violet-100 bg-[#fff8ef]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(167,139,250,0.2),transparent_30%),linear-gradient(90deg,#fffaf2,rgba(245,243,255,0.92)_56%,#fffaf2)]" />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-violet-300/30 bg-violet-300/15 text-violet-700 sm:flex">
            <Radio className="h-4 w-4" />
          </span>
          <p className="truncate text-sm font-black text-zinc-950">
            NEXUS와 함께 성장할 스트리머, 클랜을 찾고 있어요
          </p>
        </div>

        <Link
          href="/partners"
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-violet-500"
        >
          자세히 보기
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}
