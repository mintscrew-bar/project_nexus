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
  const [isInView, setIsInView] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const touchStartX = useRef(0);
  const SWIPE_THRESHOLD = 50;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) < SWIPE_THRESHOLD) return;
    setCurrent((c) => diff > 0 ? (c + 1) % TOTAL_SLIDES : (c - 1 + TOTAL_SLIDES) % TOTAL_SLIDES);
  }, []);

  // 화면 근처에 있을 때만 자동 재생해 아래쪽 캐러셀의 백그라운드 작업을 줄인다.
  useEffect(() => {
    const element = carouselRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 숨겨진 브라우저 탭과 모션 축소 설정에서는 자동 전환하지 않는다.
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () =>
      setPrefersReducedMotion(motionQuery.matches);
    const syncVisibility = () =>
      setIsPageVisible(document.visibilityState === "visible");

    syncMotionPreference();
    syncVisibility();
    motionQuery.addEventListener("change", syncMotionPreference);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      motionQuery.removeEventListener("change", syncMotionPreference);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!isInView || !isPageVisible || prefersReducedMotion || isPaused) return;

    const timer = window.setTimeout(() => {
      setCurrent((value) => (value + 1) % TOTAL_SLIDES);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [current, isInView, isPageVisible, prefersReducedMotion, isPaused]);

  const goTo = (idx: number) => {
    setCurrent(idx);
  };

  const slides = [
    <CreatorBanner key="creator" className="h-full aspect-auto" isActive={current === 0} priority />,
    <AuctionBanner key="auction" isActive={current === 1} />,
    <StatsBanner key="stats" isActive={current === 2} />,
    <DiscordBanner key="discord" />,
  ];

  return (
    <div
      ref={carouselRef}
      className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsPaused(false);
        }
      }}
      aria-roledescription="carousel"
      aria-label="Nexus 주요 기능"
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          aria-hidden={i !== current}
          inert={i !== current}
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
