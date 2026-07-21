"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const BANNER_IMAGE = "/images/banners/streamer-clan-recruit-characters-v3.png";
const KKUKKKUK_FONT =
  "'MemomentKkukkkuk', 'Cafe24Ssurround', 'NanumSquareRound', 'Apple SD Gothic Neo', sans-serif";

interface CreatorBannerProps {
  isActive?: boolean;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function CreatorBanner({
  isActive = true,
  className,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
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
        quality={65}
        sizes={sizes}
        className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.012]"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-white/98 via-white/82 to-white/6" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(139,92,246,0.12),transparent_34%)]" />

      <div
        className="relative z-10 flex h-full max-w-[86%] flex-col justify-center px-6 py-7 sm:max-w-[58%] sm:px-10 md:max-w-[52%] md:px-14"
        style={{ fontFamily: KKUKKKUK_FONT }}
      >
        <p className="max-w-[560px] text-2xl font-black leading-[1.18] text-zinc-950 sm:text-4xl lg:text-5xl">
          NEXUS와 함께 성장할
          <br className="hidden sm:block" />
          <span className="text-violet-600">스트리머, 클랜</span>을
          <br className="hidden sm:block" />
          찾고 있어요
        </p>
      </div>
    </Link>
  );
}
