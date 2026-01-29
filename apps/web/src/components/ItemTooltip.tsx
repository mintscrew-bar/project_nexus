"use client";

import { useState, useEffect, ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
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

  const response = await fetch(
    `${DDRAGON_BASE}/cdn/${DDRAGON_VERSION}/data/ko_KR/item.json`
  );
  const json = await response.json();
  itemDataCache = json.data;
  return json.data;
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

  const stats = item?.stats
    ? Object.entries(item.stats).filter(([_, value]) => value && value !== 0)
    : [];

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
          ) : item ? (
            <>
              {/* 아이템 이름 & 가격 */}
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={`${DDRAGON_BASE}/cdn/${DDRAGON_VERSION}/img/item/${itemId}.png`}
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
              <div className="text-xs text-text-secondary border-t border-bg-tertiary pt-2 whitespace-pre-wrap">
                {cleanDescription(item.description)}
              </div>

              {/* 판매 가격 */}
              <p className="text-xs text-text-tertiary mt-2">
                판매 가격: {item.gold.sell.toLocaleString()}G
              </p>
            </>
          ) : (
            <div className="text-text-tertiary text-sm">
              아이템 정보를 찾을 수 없습니다
            </div>
          )}

          {/* 툴팁 화살표 */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-bg-tertiary" />
        </div>
      )}
    </div>
  );
}
