"use client";

import { useState, useEffect, ReactNode, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { cn } from "@/lib/utils";

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.7.1";
const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

// 아이템 스탯 타입
interface ItemStats {
  FlatHPPoolMod?: number;
  FlatMPPoolMod?: number;
  FlatPhysicalDamageMod?: number;
  FlatMagicDamageMod?: number;
  FlatArmorMod?: number;
  FlatSpellBlockMod?: number;
  PercentAttackSpeedMod?: number;
  FlatCritChanceMod?: number;
  FlatMovementSpeedMod?: number;
  PercentMovementSpeedMod?: number;
  PercentLifeStealMod?: number;
  FlatHPRegenMod?: number;
  FlatMPRegenMod?: number;
}

// 아이템 정보 타입
interface ItemInfo {
  name: string;
  description: string;
  plaintext?: string;
  gold: {
    base: number;
    total: number;
    sell: number;
    purchasable: boolean;
  };
  stats: ItemStats;
  tags?: string[];
}

// 스탯 이름 한글화
const STAT_NAMES: Record<string, string> = {
  FlatHPPoolMod: "체력",
  FlatMPPoolMod: "마나",
  FlatPhysicalDamageMod: "공격력",
  FlatMagicDamageMod: "주문력",
  FlatArmorMod: "방어력",
  FlatSpellBlockMod: "마법저항력",
  PercentAttackSpeedMod: "공격속도",
  FlatCritChanceMod: "치명타 확률",
  FlatMovementSpeedMod: "이동속도",
  PercentMovementSpeedMod: "이동속도",
  PercentLifeStealMod: "생명력 흡수",
  FlatHPRegenMod: "체력 재생",
  FlatMPRegenMod: "마나 재생",
  PercentHealMod: "치유량",
  PercentOmniVampMod: "전능 흡수",
  FlatCastingTimeMod: "시전 시간",
  PercentMovementSpeedMod: "이동 속도",
};

// 스탯 포맷팅
function formatStat(key: string, value: number): string {
  if (key.startsWith("Percent")) {
    return `+${Math.round(value * 100)}%`;
  }
  return `+${Math.round(value)}`;
}

// 아이템 데이터 캐시
let itemDataCache: Record<string, ItemInfo> | null = null;

async function fetchItemData(): Promise<Record<string, ItemInfo>> {
  if (itemDataCache) return itemDataCache;

  try {
    const response = await fetch(
      `${DDRAGON_BASE}/cdn/${DDRAGON_VERSION}/data/ko_KR/item.json`
    );

    if (!response.ok) {
      console.warn(`DDragon 아이템 데이터 로드 실패: ${response.status}`);
      // 영문 폴백 시도
      const fallbackResponse = await fetch(
        `${DDRAGON_BASE}/cdn/${DDRAGON_VERSION}/data/en_US/item.json`
      );
      const json = await fallbackResponse.json();
      itemDataCache = json.data || {};
      return itemDataCache;
    }

    const json = await response.json();
    itemDataCache = json.data || {};
    return itemDataCache;
  } catch (error) {
    console.error("아이템 데이터 로드 중 오류:", error);
    return {};
  }
}

// HTML 태그 제거 및 정리
function cleanDescription(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

interface ItemTooltipProps {
  itemId: string;
  children: ReactNode;
  className?: string;
}

export function ItemTooltip({ itemId, children, className }: ItemTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [item, setItem] = useState<ItemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const [alignment, setAlignment] = useState<"center" | "left" | "right">("center");
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 클라이언트 마운트 확인 (SSR 대비)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isHovered && !item && !loading) {
      setLoading(true);
      fetchItemData()
        .then((data) => {
          setItem(data[itemId] || null);
        })
        .finally(() => setLoading(false));
    }
  }, [isHovered, item, itemId, loading]);

  // 툴팁 위치 계산 — 뷰포트 범위 감지
  useEffect(() => {
    if (!isHovered || !containerRef.current) return;

    const calculatePlacement = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const TOOLTIP_HEIGHT = 240; // 대략적인 툴팁 높이
      const TOOLTIP_WIDTH = 288; // w-72 = 18rem = 288px
      const MARGIN = 8; // mb-2 = 8px

      // 위쪽 공간 계산 — 뷰포트 위에서 요소까지의 거리
      const spaceAbove = rect.top - MARGIN;
      // 필요한 높이는 TOOLTIP_HEIGHT + MARGIN
      const needsAbove = spaceAbove >= TOOLTIP_HEIGHT + MARGIN;

      // 좌우 위치 계산
      const windowWidth = window.innerWidth;
      const tooltipLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      const tooltipRight = tooltipLeft + TOOLTIP_WIDTH;

      let newAlignment: "center" | "left" | "right" = "center";
      // 왼쪽으로 넘침
      if (tooltipLeft < 8) {
        newAlignment = "left";
      }
      // 오른쪽으로 넘침
      else if (tooltipRight > windowWidth - 8) {
        newAlignment = "right";
      }

      setPlacement(needsAbove ? "top" : "bottom");
      setAlignment(newAlignment);
    };

    // 이벤트 루프에서 다음 프레임에 계산 (DOM 완성 후)
    const timer = setTimeout(calculatePlacement, 0);
    return () => clearTimeout(timer);
  }, [isHovered]);

  const stats = item?.stats
    ? Object.entries(item.stats).filter(([_, value]) => value && value !== 0)
    : [];

  // Tooltip 위치 계산
  const tooltipStyle: React.CSSProperties = containerRef.current
    ? (() => {
        const rect = containerRef.current!.getBoundingClientRect();
        const isTop = placement === "top";

        return {
          position: "fixed",
          zIndex: 9999,
          width: "18rem", // w-72
          left: alignment === "center"
            ? rect.left + rect.width / 2 - 144 // 144 = 288px / 2
            : alignment === "left"
            ? rect.left
            : rect.right - 288,
          top: isTop ? rect.top - 240 - 8 : rect.bottom + 8, // 240 = tooltip height, 8 = gap
        };
      })()
    : { display: "none" };

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      {isMounted && isHovered && createPortal(
        <div
          ref={tooltipRef}
          style={tooltipStyle}
          className="bg-bg-primary border border-bg-tertiary rounded-lg shadow-xl p-3 pointer-events-none animate-fade-in"
        >
          {loading ? (
            <div className="text-text-tertiary text-sm">로딩 중...</div>
          ) : item ? (
            <>
              {/* 아이템 이름 & 가격 */}
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={`/icons/items/${itemId}.png`}
                  alt={item.name}
                  width={32}
                  height={32}
                  className="rounded"
                  unoptimized
                />
                <div>
                  <p className="font-semibold text-text-primary">{item.name}</p>
                  <p className="text-xs text-accent-gold">
                    {item.gold.total.toLocaleString()}G
                  </p>
                </div>
              </div>

              {/* 스탯 */}
              {stats.length > 0 && (
                <div className="mb-2 text-sm">
                  {stats.map(([key, value]) => (
                    <p key={key} className="text-accent-success">
                      {formatStat(key, value as number)} {STAT_NAMES[key] || key}
                    </p>
                  ))}
                </div>
              )}

              {/* 설명 (효과) */}
              {(item.description || item.plaintext) && (
                <div className="text-xs text-text-secondary border-t border-bg-tertiary pt-2 whitespace-pre-wrap">
                  {cleanDescription(item.description || item.plaintext || "")}
                </div>
              )}

              {/* 판매 가격 */}
              <p className="text-xs text-text-tertiary mt-2">
                판매 가격: {item.gold.sell.toLocaleString()}G
              </p>
            </>
          ) : (
            <div className="text-text-tertiary text-sm">
              <p>아이템 정보를 찾을 수 없습니다</p>
              <p className="text-[10px] mt-1 text-text-muted">
                (아이템 ID: {itemId})
              </p>
            </div>
          )}

          {/* 툴팁 화살표 — Portal에서는 position 계산이 복잡해 생략 */}
        </div>,
        document.body
      )}
    </div>
  );
}
