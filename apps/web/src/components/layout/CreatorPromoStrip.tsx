"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";

const BANNER_IMAGE = "/images/banners/streamer-clan-recruit-characters-v3.png";

export function CreatorPromoStrip() {
  return (
    <aside className="relative flex-shrink-0 overflow-hidden border-b border-white/5 bg-[#17151c]">
      <Image
        src={BANNER_IMAGE}
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-right opacity-25"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,21,28,1)_0%,rgba(23,21,28,0.96)_58%,rgba(23,21,28,0.72)_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-12 max-w-7xl items-center justify-between gap-3 px-4 py-2 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/15 text-violet-300">
            <Radio className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-white sm:text-sm">
              NEXUS 파트너 모집
            </p>
            <p className="hidden truncate text-[11px] text-zinc-400 sm:block">
              스트리머와 클랜의 내전 운영을 함께 만들어요
            </p>
          </div>
        </div>

        <Link
          href="/partners"
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-[11px] font-black text-violet-100 transition-colors hover:bg-violet-500/25 sm:text-xs"
        >
          파트너 안내
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}
