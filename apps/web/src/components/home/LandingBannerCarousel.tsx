"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CreatorBanner } from "@/components/home/CreatorBanner";
import { AuctionBanner } from "@/components/home/AuctionBanner";
import { StatsBanner } from "@/components/home/StatsBanner";
import { DiscordBanner } from "@/components/home/DiscordBanner";
import { cn } from "@/lib/utils";

const TOTAL_SLIDES = 4;

export function LandingBannerCarousel() {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const SWIPE_THRESHOLD = 50;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) < SWIPE_THRESHOLD) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrent((c) => diff > 0 ? (c + 1) % TOTAL_SLIDES : (c - 1 + TOTAL_SLIDES) % TOTAL_SLIDES);
    startTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % TOTAL_SLIDES);
    }, 5000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const goTo = (idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrent(idx);
    startTimer();
  };

  const slides = [
    <CreatorBanner key="creator" className="h-full aspect-auto" isActive={current === 0} priority />,
    <AuctionBanner key="auction" isActive={current === 1} />,
    <StatsBanner key="stats" isActive={current === 2} />,
    <DiscordBanner key="discord" />,
  ];

  return (
    <div
      className="relative w-full aspect-[3/2] max-h-[430px] rounded-2xl overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-all duration-500 ease-out"
          style={{
            opacity: i === current ? 1 : 0,
            pointerEvents: i === current ? "auto" : "none",
            transform: i === current ? "scale(1)" : "scale(0.98)",
          }}
        >
          {slide}
        </div>
      ))}

      <button
        onClick={() => goTo((current - 1 + TOTAL_SLIDES) % TOTAL_SLIDES)}
        aria-label="이전 슬라이드"
        className="hidden lg:block absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/5 text-white/45 hover:bg-white/10 hover:text-white transition-all z-20 backdrop-blur-sm"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => goTo((current + 1) % TOTAL_SLIDES)}
        aria-label="다음 슬라이드"
        className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/5 text-white/45 hover:bg-white/10 hover:text-white transition-all z-20 backdrop-blur-sm"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 z-20">
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`슬라이드 ${i + 1}/${TOTAL_SLIDES}`}
            aria-current={i === current ? "true" : undefined}
            className="flex items-center justify-center h-7 px-1"
          >
            <span
              className={cn(
                "block rounded-full transition-all duration-500",
                i === current ? "h-1.5 w-6 bg-violet-500" : "h-1.5 w-1.5 bg-white/50"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
