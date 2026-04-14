"use client";

import { useState, useEffect, ReactNode, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.7.1";
const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

interface RuneInfo {
  id: number;
  key: string;
  name: string;
  shortDesc: string;
  longDesc: string;
  icon: string;
}

// 룬 데이터 캐시 (스타일 전체 트리)
let runeDataCache: RuneInfo[] | null = null;

async function fetchRuneData(): Promise<RuneInfo[]> {
  if (runeDataCache) return runeDataCache;

  try {
    const response = await fetch(
      `${DDRAGON_BASE}/cdn/${DDRAGON_VERSION}/data/ko_KR/runesReforged.json`
    );

    if (!response.ok) {
      console.warn(`DDragon 룬 데이터 로드 실패: ${response.status}`);
      // 영문 폴백 시도
      const fallbackResponse = await fetch(
        `${DDRAGON_BASE}/cdn/${DDRAGON_VERSION}/data/en_US/runesReforged.json`
      );
      const styles: any[] = await fallbackResponse.json();
      const runes: RuneInfo[] = [];
      for (const style of styles) {
        for (const slot of style.slots) {
          for (const rune of slot.runes) {
            runes.push(rune);
          }
        }
      }
      runeDataCache = runes;
      return runes;
    }

    const styles: any[] = await response.json();
    const runes: RuneInfo[] = [];
    for (const style of styles) {
      for (const slot of style.slots) {
        for (const rune of slot.runes) {
          runes.push(rune);
        }
      }
    }
    runeDataCache = runes;
    return runes;
  } catch (error) {
    console.error("룬 데이터 로드 중 오류:", error);
    return [];
  }
}

// HTML 태그 제거
function cleanDesc(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

interface RuneTooltipProps {
  runeId: number;
  children: ReactNode;
  className?: string;
}

export function RuneTooltip({ runeId, children, className }: RuneTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [rune, setRune] = useState<RuneInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const [alignment, setAlignment] = useState<"center" | "left" | "right">("center");
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHovered && !rune && !loading) {
      setLoading(true);
      fetchRuneData()
        .then((data) => {
          setRune(data.find((r) => r.id === runeId) ?? null);
        })
        .finally(() => setLoading(false));
    }
  }, [isHovered, rune, runeId, loading]);

  // 툴팁 위치 계산 — 뷰포트 범위 감지
  useEffect(() => {
    if (!isHovered || !containerRef.current) return;

    const calculatePlacement = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const TOOLTIP_HEIGHT = 240; // 대략적인 툴팁 높이
      const TOOLTIP_WIDTH = 288; // w-72 = 18rem = 288px
      const MARGIN = 8; // mb-2 = 8px

      // 위쪽 공간 계산
      const spaceAbove = rect.top - MARGIN;
      const needsAbove = spaceAbove >= TOOLTIP_HEIGHT + MARGIN;

      // 좌우 위치 계산
      const windowWidth = window.innerWidth;
      const tooltipLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      const tooltipRight = tooltipLeft + TOOLTIP_WIDTH;

      let newAlignment: "center" | "left" | "right" = "center";
      if (tooltipLeft < 8) {
        newAlignment = "left";
      } else if (tooltipRight > windowWidth - 8) {
        newAlignment = "right";
      }

      setPlacement(needsAbove ? "top" : "bottom");
      setAlignment(newAlignment);
    };

    const timer = setTimeout(calculatePlacement, 0);
    return () => clearTimeout(timer);
  }, [isHovered]);

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      {isHovered && (
        <div
          ref={tooltipRef}
          className={cn(
            "absolute z-50 w-72 bg-bg-primary border border-bg-tertiary rounded-lg shadow-xl p-3 pointer-events-none animate-fade-in",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
            alignment === "center" && "left-1/2 -translate-x-1/2",
            alignment === "left" && "left-0",
            alignment === "right" && "right-0"
          )}
        >
          {loading ? (
            <div className="text-text-tertiary text-sm">로딩 중...</div>
          ) : rune ? (
            <>
              {/* 룬 이름 */}
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={`/icons/perks/${runeId}.png`}
                  alt={rune.name}
                  width={32}
                  height={32}
                  className="rounded"
                  unoptimized
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <p className="font-semibold text-text-primary">{rune.name}</p>
              </div>

              {/* 짧은 설명 */}
              {rune.shortDesc && (
                <div className="text-xs text-accent-primary mb-1.5 border-b border-bg-tertiary pb-1.5">
                  {cleanDesc(rune.shortDesc)}
                </div>
              )}

              {/* 상세 설명 */}
              {rune.longDesc && (
                <div className="text-xs text-text-secondary whitespace-pre-wrap">
                  {cleanDesc(rune.longDesc)}
                </div>
              )}
            </>
          ) : (
            <div className="text-text-tertiary text-sm">룬 정보를 찾을 수 없습니다</div>
          )}

          {/* 툴팁 화살표 — 위치에 따라 방향 변경 */}
          <div
            className={cn(
              "absolute border-8 border-transparent",
              placement === "top"
                ? "top-full left-1/2 -translate-x-1/2 border-t-bg-tertiary"
                : "bottom-full left-1/2 -translate-x-1/2 border-b-bg-tertiary"
            )}
          />
        </div>
      )}
    </div>
  );
}
