"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";

const BANNER_IMAGE = "/images/banners/creator-recruit-banner.png";

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
          <span className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 sm:flex">
            <Radio className="h-4 w-4 text-violet-700" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-zinc-950">
              내전 운영, 더 쉽고 재밌게! NEXUS가 도와드릴게요
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <a
            href={NEXUS_DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-violet-500"
          >
            시작하기
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
          <Link
            href="/tournaments?create=true"
            className="hidden items-center gap-1.5 rounded-lg border border-violet-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-violet-800 transition-colors hover:bg-white sm:inline-flex"
          >
            방 만들기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
