"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function GuideCarousel({ children }: { children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canMoveBack, setCanMoveBack] = useState(false);
  const [canMoveForward, setCanMoveForward] = useState(true);

  const updateControls = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanMoveBack(track.scrollLeft > 4);
    setCanMoveForward(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    updateControls();
    track.addEventListener("scroll", updateControls, { passive: true });
    window.addEventListener("resize", updateControls);
    return () => {
      track.removeEventListener("scroll", updateControls);
      window.removeEventListener("resize", updateControls);
    };
  }, [updateControls]);

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    const firstCard = track?.querySelector<HTMLElement>("[data-guide-card]");
    if (!track || !firstCard) return;
    track.scrollBy({ left: direction * (firstCard.offsetWidth + 20), behavior: "smooth" });
  };

  const buttonClass =
    "flex h-11 w-11 items-center justify-center rounded-full bg-bg-secondary text-text-primary shadow-[0_8px_24px_rgb(0_0_0/0.12)] transition-colors hover:bg-bg-elevated disabled:cursor-default disabled:opacity-30";

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-[-0.04em] text-text-primary">주제별 가이드</h2>
          <p className="mt-2 text-sm text-text-tertiary">옆으로 넘겨 필요한 가이드 페이지를 선택하세요.</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button type="button" onClick={() => move(-1)} disabled={!canMoveBack} aria-label="이전 가이드" className={buttonClass}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => move(1)} disabled={!canMoveForward} aria-label="다음 가이드" className={buttonClass}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="scrollbar-none -mx-4 mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-5 md:-mx-6 md:px-6"
      >
        {children}
      </div>
    </section>
  );
}
