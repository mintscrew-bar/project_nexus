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
        "group relative block h-full w-full overflow-hidden rounded-panel border border-violet-100/70 bg-[#fff8ef]",
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

      <div className="absolute inset-0 bg-gradient-to-r from-white/98 via-white/82 to-white/6" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(139,92,246,0.12),transparent_34%)]" />

      <div
        // 그림 속 인물이 오른쪽 절반에 있어 글은 늘 왼쪽 절반 안에 둔다(좁은 틀에서 겹치지 않게)
        className="relative z-10 flex h-full max-w-[46%] flex-col justify-center px-4 py-6 [@container(min-width:480px)]:max-w-[58%] [@container(min-width:480px)]:px-10 [@container(min-width:640px)]:max-w-[52%] [@container(min-width:640px)]:px-14"
        style={{ fontFamily: KKUKKKUK_FONT }}
      >
        {/* ⚠ 이 문구를 바꾸면 scripts/subset-banner-font.sh로 폰트 서브셋을 재생성해야 한다.
            서브셋에 없는 글자는 조용히 폴백 폰트로 렌더되어 글씨체가 섞여 보인다. */}
        <p className="max-w-[560px] text-lg font-black leading-[1.18] text-zinc-950 [@container(min-width:480px)]:text-4xl [@container(min-width:900px)]:text-5xl">
          NEXUS와 함께 성장할
          <br />
          <span className="text-violet-600">스트리머, 클랜</span>을
          <br />
          찾고 있어요
        </p>
      </div>
    </Link>
  );
}
