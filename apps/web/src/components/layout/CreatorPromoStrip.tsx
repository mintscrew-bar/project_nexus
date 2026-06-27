"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";

const BANNER_IMAGE = "/images/banners/streamer-clan-recruit-characters-v3.png";

export function CreatorPromoStrip() {
  return (
    <aside className="relative flex-shrink-0 overflow-hidden border-b border-violet-100 bg-[#fff8ef]">
      <Image
        src={BANNER_IMAGE}
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-center opacity-45"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,250,242,0.98),rgba(255,250,242,0.9)_56%,rgba(255,250,242,0.96))]" />

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
