"use client";

/**
 * 라이브 프로필 배경 (Task 22 — 프로필 배경 장식).
 *
 * 원작 일러스트(Animagine XL 4.0)를 그림→영상 모델(LTX-Video 2B)로 움직인 짧은 반복 영상을
 * 배너 뒤에 깐다. 만드는 법은 scripts/comfy/ (i2v.py → loop_video.py).
 * 영상은 끝과 처음을 겹쳐 섞어 이음매 없이 반복된다.
 *
 * - 첫 장면 그림(poster)을 먼저 보여 주고, 영상이 준비되면 그 위에서 재생한다.
 * - 화면 밖이거나 탭이 숨겨지면 멈춘다(배터리·CPU).
 * - 꾸미기 효과 「멈춘 그림」·움직임 줄이기 설정이면 첫 장면에서 멈춘다.
 *   「숨기기」면 cfx-deco 규칙(globals.css)으로 통째로 빠지고 기본 배경이 보인다.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCosmeticFxStore } from "@/stores/cosmetic-fx-store";

export interface LiveBannerDef {
  webm: string;
  mp4: string;
  poster: string;
  /** 영상 원본 크기 — 프로필 배너를 이 비율로 키워 잘림 없이 다 보여 준다 */
  size: [number, number];
  /** 배너가 영상보다 납작할 때 세로 어디를 보여 줄지 (0 위 ~ 1 아래) */
  focusY: number;
}

export const LIVE_BANNERS = {
  ember_knight_card: {
    webm: "/cosmetics/banners/ember_knight/card.webm",
    mp4: "/cosmetics/banners/ember_knight/card.mp4",
    poster: "/cosmetics/banners/ember_knight/card.webp",
    size: [440, 420], focusY: 0.5,
  },
  ember_knight_banner: {
    webm: "/cosmetics/banners/ember_knight/banner.webm",
    mp4: "/cosmetics/banners/ember_knight/banner.mp4",
    poster: "/cosmetics/banners/ember_knight/banner.webp",
    size: [1536, 640], focusY: 0.5,
  },
  ink_swordsman: {
    webm: "/cosmetics/banners/ink_swordsman/loop.webm",
    mp4: "/cosmetics/banners/ink_swordsman/loop.mp4",
    poster: "/cosmetics/banners/ink_swordsman/poster.webp",
    size: [1280, 736],
    focusY: 0.5,
  },
} satisfies Record<string, LiveBannerDef>;

export type LiveBannerCode = keyof typeof LIVE_BANNERS;

/** 그 배경의 가로:세로 비율 (CSS aspect-ratio 값) — 배너·미리보기 칸을 영상과 같은 비율로 */
export function liveBannerAspect(code: LiveBannerCode): string {
  const [w, h] = LIVE_BANNERS[code].size;
  return `${w} / ${h}`;
}

export function LiveBanner({
  code,
  className,
}: {
  code: LiveBannerCode;
  className?: string;
}) {
  const def: LiveBannerDef = LIVE_BANNERS[code];
  const videoRef = useRef<HTMLVideoElement>(null);
  const fxMode = useCosmeticFxStore((s) => s.mode);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const still = reduce || fxMode !== "full";
    let visible = true;

    // 지금 재생해도 되는지 — 아니면 멈추고, 멈춘 그림 설정이면 첫 장면으로 돌린다
    const sync = () => {
      if (still) {
        v.pause();
        v.currentTime = 0;
        return;
      }
      if (visible && !document.hidden) {
        // 자동재생이 막힌 브라우저면 poster 가 그대로 남는다
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [fxMode, def]);

  return (
    <div
      className={cn(
        "cfx-root cfx-deco absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: `50% ${def.focusY * 100}%` }}
        poster={def.poster}
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
        disablePictureInPicture
        controlsList="nodownload noplaybackrate"
        draggable={false}
      >
        {/* H.264 MP4 우선, 미지원 환경에서는 WebM 대체 재생 */}
        <source src={def.mp4} type="video/mp4" />
        <source src={def.webm} type="video/webm" />
      </video>
    </div>
  );
}
