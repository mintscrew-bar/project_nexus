"use client";

import { useState, useEffect, ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
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

  const response = await fetch(
    `${DDRAGON_BASE}/cdn/${DDRAGON_VERSION}/data/ko_KR/runesReforged.json`
  );
  const styles: any[] = await response.json();

  // 모든 스타일의 룬을 단일 맵으로 평탄화
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

  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      {isHovered && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-bg-primary border border-bg-tertiary rounded-lg shadow-xl p-3 pointer-events-none animate-fade-in">
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

          {/* 툴팁 화살표 */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-bg-tertiary" />
        </div>
      )}
    </div>
  );
}
