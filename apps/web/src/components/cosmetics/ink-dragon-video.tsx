"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCosmeticFxStore } from "@/stores/cosmetic-fx-store";

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

  return (
    <video
      ref={ref}
      aria-hidden
      muted
      loop
      playsInline
      disablePictureInPicture
      preload="metadata"
      poster={`${VIDEO_PATH}/${variant}.webp`}
      className={cn("pointer-events-none object-cover", className)}
      style={{ mixBlendMode: "multiply" }}
    >
      <source src={`${VIDEO_PATH}/${variant}.mp4`} type="video/mp4" />
    </video>
  );
}
