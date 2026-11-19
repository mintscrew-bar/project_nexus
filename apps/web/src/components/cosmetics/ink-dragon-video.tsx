"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCosmeticFxStore } from "@/stores/cosmetic-fx-store";
import { useIsClient } from "@/hooks/useIsClient";

/** Original user-supplied ink dragon videos, shared by lobby, hover, shop and avatar. */
const VIDEO_PATH = "/cosmetics/ink-dragon";

export function InkDragonVideo({
  variant,
  className,
}: {
  variant: "avatar" | "card";
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const mode = useCosmeticFxStore((state) => state.mode);
  // 아바타용은 종이를 걷은 투명 영상(VP9+알파, scripts/comfy/avatar_video.py).
  // 사파리는 투명 webm 을 못 틀어 투명한 첫 장면 그림으로 대신한다.
  const isClient = useIsClient();
  const alpha = variant === "avatar";
  const safari =
    isClient &&
    /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const still = mode !== "full" || reducedMotion;
    let inView = true;
    const sync = () => {
      if (still || !inView || document.hidden) {
        video.pause();
        if (still) video.currentTime = 0;
      } else {
        void video.play().catch(() => {});
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(video);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [mode]);

  if (alpha && safari) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 작은 고정 장식 그림이라 최적화가 필요 없다
      <img
        aria-hidden
        alt=""
        src={`${VIDEO_PATH}/avatar-alpha.webp`}
        className={cn("pointer-events-none object-cover", className)}
      />
    );
  }

  return (
    <video
      ref={ref}
      aria-hidden
      muted
      loop
      playsInline
      disablePictureInPicture
      preload="metadata"
      poster={`${VIDEO_PATH}/${alpha ? "avatar-alpha" : variant}.webp`}
      className={cn("pointer-events-none object-cover", className)}
      // 카드는 종이 위 영상을 카드 바탕에 곱해서 깐다. 아바타는 투명 영상이라 그대로
      style={alpha ? undefined : { mixBlendMode: "multiply" }}
    >
      {alpha ? (
        <source src={`${VIDEO_PATH}/avatar-alpha.webm`} type="video/webm" />
      ) : (
        <source src={`${VIDEO_PATH}/${variant}.mp4`} type="video/mp4" />
      )}
    </video>
  );
}
