"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, ADSENSE_SLOTS, type AdSlotKey } from "@/lib/adsense";

const ADSENSE_SCRIPT_ID = "adsense-loader";

/** 광고가 실제로 필요해진 시점에 AdSense 로더를 한 번만 내려받는다. */
function loadAdSense(): Promise<void> {
  if ("adsbygoogle" in window) return Promise.resolve();

  const existing = document.getElementById(
    ADSENSE_SCRIPT_ID,
  ) as HTMLScriptElement | null;

  if (existing?.dataset.loaded === "true") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(), { once: true });

    if (!existing) {
      script.id = ADSENSE_SCRIPT_ID;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
        },
        { once: true },
      );
      document.head.appendChild(script);
    }
  });
}

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

    const requestAd = () => {
      // Strict Mode 재실행과 중복 관찰 콜백에서 같은 슬롯을 요청하지 않는다.
      if (
        el.dataset.adsRequested === "true" ||
        el.getAttribute("data-adsbygoogle-status") === "done"
      ) {
        return;
      }
      el.dataset.adsRequested = "true";

      void loadAdSense()
        .then(() => {
          (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle =
            (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle || [];
          (
            window as unknown as { adsbygoogle: unknown[] }
          ).adsbygoogle.push({});
        })
        .catch(() => {
          // 일시적인 로드 실패 뒤 다시 관찰될 때 재시도할 수 있게 한다.
          delete el.dataset.adsRequested;
        });
    };

    if (!("IntersectionObserver" in window)) {
      requestAd();
      return;
    }

    // 뷰포트에 들어오기 직전 로드해 광고 공간의 빈 시간을 줄인다.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        requestAd();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);

    return () => observer.disconnect();
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
 * 콘텐츠와 광고의 경계를 분명히 하되 별도 카드처럼 강조하지 않는 AdSlot.
 * - 상단에 작은 "광고" 라벨
 * - 고정/오버레이 없이 문서 흐름 안에서만 노출
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
      className={`border-y border-bg-tertiary/70 py-3 ${className ?? ""}`}
    >
      <div className="mb-2 flex items-center justify-center">
        <span className="text-[10px] text-text-tertiary">
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
