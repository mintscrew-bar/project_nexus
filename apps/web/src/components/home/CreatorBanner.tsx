"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BANNER_IMAGE = "/images/banners/creator-recruit-banner-16x9.png";
const KKUKKKUK_FONT =
  "'MemomentKkukkkuk', 'Cafe24Ssurround', 'NanumSquareRound', 'Apple SD Gothic Neo', sans-serif";

interface CreatorBannerProps {
  isActive?: boolean;
  className?: string;
  priority?: boolean;
}

export function CreatorBanner({
  isActive = true,
  className,
  priority = false,
}: CreatorBannerProps) {
  return (
    <Link
      href="/partners"
      className={cn(
        "group relative block h-full w-full overflow-hidden rounded-2xl border border-violet-100/70 bg-[#fff8ef]",
        "shadow-[0_18px_56px_rgba(83,61,135,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
        className,
      )}
      aria-label="NEXUS 스트리머 및 클랜 모집 배너 열기"
      data-active={isActive}
    >
      <Image
        src={BANNER_IMAGE}
        alt=""
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 1180px"
        className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.012]"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-white/96 via-white/78 to-white/0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(139,92,246,0.14),transparent_30%)]" />

      <div
        className="relative z-10 flex h-full max-w-[86%] flex-col justify-center px-6 py-7 sm:max-w-[62%] sm:px-10 md:max-w-[55%] md:px-14"
        style={{ fontFamily: KKUKKKUK_FONT }}
      >
        <p className="max-w-[560px] text-2xl font-black leading-[1.22] text-zinc-950 sm:text-4xl lg:text-5xl">
          NEXUS와 함께 성장할
          <br className="hidden sm:block" />
          <span className="text-violet-600">스트리머, 클랜</span>을
          <br className="hidden sm:block" />
          찾고 있어요
        </p>

        <p className="mt-4 max-w-[430px] text-sm font-bold leading-relaxed text-zinc-600 sm:text-base lg:text-lg">
          방송 파티와 클랜 내전을 더 쉽고 재밌게.
        </p>
      </div>
    </Link>
  );
}
