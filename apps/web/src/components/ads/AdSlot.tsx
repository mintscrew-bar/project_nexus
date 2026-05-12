"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, ADSENSE_SLOTS, type AdSlotKey } from "@/lib/adsense";

interface AdSlotProps {
  slotKey: AdSlotKey;
  format?: "auto" | "fluid" | "rectangle" | "horizontal" | "vertical";
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  // 슬롯 ID 미설정 상태에서도 placeholder 박스를 보이게 할지 (개발/디버그용)
  showPlaceholder?: boolean;
}

/**
 * AdSense 광고 슬롯.
 * - slotKey 에 해당하는 ADSENSE_SLOTS 값이 비어있으면 null 렌더 (안전)
 * - App Router 클라이언트 사이드 네비게이션마다 push 호출
 * - strict mode 더블 마운트는 data-adsbygoogle-status 로 가드
 */
export function AdSlot({
  slotKey,
  format = "auto",
  responsive = true,
  className,
  style,
  showPlaceholder = false,
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement>(null);
  const slot = ADSENSE_SLOTS[slotKey];

  useEffect(() => {
    const el = insRef.current;
    if (!el || !slot) return;
    // 이미 채워진 슬롯은 다시 push 하지 않음 (TagError 방지)
    if (el.getAttribute("data-adsbygoogle-status") === "done") return;
    try {
      // 스크립트가 아직 로드되지 않았어도 push 큐에 쌓이므로 안전
      (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle =
        (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle || [];
      (
        window as unknown as { adsbygoogle: unknown[] }
      ).adsbygoogle.push({});
    } catch {
      // 광고 실패는 페이지 동작에 영향 없음 — 조용히 무시
    }
  }, [slot]);

  // 슬롯 ID 미설정 — 안전 모드: 아무것도 렌더하지 않음
  if (!slot) {
    if (showPlaceholder) {
      return (
        <div
          className={`flex items-center justify-center rounded-md border border-dashed border-bg-tertiary bg-bg-secondary/30 py-8 text-xs text-text-muted ${className ?? ""}`}
          style={style}
        >
          AdSense slot ({slotKey}) — 슬롯 ID 미설정
        </div>
      );
    }
    return null;
  }

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle ${className ?? ""}`}
      style={{ display: "block", ...style }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? "true" : "false"}
    />
  );
}

/**
 * 사이트 디자인과 조화롭게 보이도록 카드 스타일로 감싼 AdSlot.
 * - 상단에 작은 "광고" 라벨 (AdSense 정책 + UX)
 * - bg-secondary + border-bg-tertiary 로 다른 카드들과 톤 통일
 * - 슬롯 ID 미설정 시엔 null (공간을 차지하지 않음)
 */
export function AdSlotCard({
  slotKey,
  format = "auto",
  minHeight = 100,
  className,
}: {
  slotKey: AdSlotKey;
  format?: AdSlotProps["format"];
  minHeight?: number;
  className?: string;
}) {
  const slot = ADSENSE_SLOTS[slotKey];
  if (!slot) return null;

  return (
    <div
      className={`rounded-xl border border-bg-tertiary bg-bg-secondary/40 p-3 ${className ?? ""}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
          광고
        </span>
      </div>
      <AdSlot
        slotKey={slotKey}
        format={format}
        style={{ minHeight }}
      />
    </div>
  );
}
