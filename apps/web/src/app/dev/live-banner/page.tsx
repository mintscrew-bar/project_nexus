"use client";

/**
 * 개발용 — 라이브 프로필 배경 미리보기 (Task 22).
 * 실제 프로필 배너와 같은 칸(최대 1480px, 높이 360px, 아래 그라데이션)에 그린다.
 */
import { LiveBanner } from "@/components/cosmetics/live-banner";

export default function LiveBannerDevPage() {
  return (
    <div className="space-y-8 bg-bg-primary p-8">
      <section data-live>
        <h2 className="mb-3 text-lg font-black text-text-primary">
          수묵 검객 — 프로필 배너 크기 (1280×360)
        </h2>
        <div className="relative h-[360px] w-[1280px] overflow-hidden rounded-lg bg-bg-tertiary">
          <LiveBanner code="ink_swordsman" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-secondary to-transparent" />
        </div>
      </section>
      <section data-live-sm>
        <h2 className="mb-3 text-lg font-black text-text-primary">
          좁은 화면 (640×208)
        </h2>
        <div className="relative h-52 w-[640px] overflow-hidden rounded-lg bg-bg-tertiary">
          <LiveBanner code="ink_swordsman" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-secondary to-transparent" />
        </div>
      </section>
    </div>
  );
}
