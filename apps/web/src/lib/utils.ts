import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind 클래스 병합 유틸리티
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type TierKey =
  | 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum'
  | 'emerald' | 'diamond' | 'master' | 'grandmaster' | 'challenger';

interface TierInfo {
  key: TierKey;
  textClass: string;
  bgClass: string;
  badgeVariant: string;
  icon: string;
}

const TIER_MAP: TierInfo[] = [
  { key: 'challenger',  textClass: 'text-tier-challenger',  bgClass: 'bg-tier-challenger',  badgeVariant: 'challenger',  icon: '👑' },
  { key: 'grandmaster', textClass: 'text-tier-grandmaster', bgClass: 'bg-tier-grandmaster', badgeVariant: 'grandmaster', icon: '💎' },
  { key: 'master',      textClass: 'text-tier-master',      bgClass: 'bg-tier-master',      badgeVariant: 'master',      icon: '⭐' },
  { key: 'diamond',     textClass: 'text-tier-diamond',     bgClass: 'bg-tier-diamond',     badgeVariant: 'diamond',     icon: '💠' },
  { key: 'emerald',     textClass: 'text-tier-emerald',     bgClass: 'bg-tier-emerald',     badgeVariant: 'emerald',     icon: '💚' },
  { key: 'platinum',    textClass: 'text-tier-platinum',    bgClass: 'bg-tier-platinum',    badgeVariant: 'platinum',    icon: '🔷' },
  { key: 'gold',        textClass: 'text-tier-gold',        bgClass: 'bg-tier-gold',        badgeVariant: 'tier-gold',   icon: '🥇' },
  { key: 'silver',      textClass: 'text-tier-silver',      bgClass: 'bg-tier-silver',      badgeVariant: 'silver',      icon: '🥈' },
  { key: 'bronze',      textClass: 'text-tier-bronze',      bgClass: 'bg-tier-bronze',      badgeVariant: 'bronze',      icon: '🥉' },
  { key: 'iron',        textClass: 'text-tier-iron',        bgClass: 'bg-tier-iron',        badgeVariant: 'iron',        icon: '⚪' },
];

const DEFAULT_TIER = TIER_MAP[TIER_MAP.length - 1]; // iron

function findTier(tier?: string | null): TierInfo {
  const lower = (tier ?? "").toLowerCase();
  if (!lower) return DEFAULT_TIER;
  return TIER_MAP.find((t) => lower.includes(t.key)) ?? DEFAULT_TIER;
}

export function getTierColor(tier?: string | null): string {
  return findTier(tier).textClass;
}

export function getTierBgClass(tier?: string | null): string {
  return findTier(tier).bgClass;
}

export function getTierBadgeVariant(tier?: string | null): string {
  return findTier(tier).badgeVariant;
}

export function getTierIcon(tier?: string | null): string {
  return findTier(tier).icon;
}

/**
 * 롤 티어/랭크/LP → 통합 MMR 점수 변환
 * 백엔드 tier-score.util.ts 와 동일한 로직
 *   IRON IV 0LP = 0 … BRONZE IV 0LP = 400 … CHALLENGER = 3600+
 */
const TIER_SCORE_BASE: Record<string, number> = {
  UNRANKED: 0, IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200,
  PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400,
  MASTER: 2800, GRANDMASTER: 3200, CHALLENGER: 3600,
};
const RANK_SCORE_BONUS: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300, '': 0 };
const MASTER_PLUS_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export function calculateTierScore(tier?: string | null, rank?: string | null, lp = 0): number {
  const normalizedTier = (tier ?? "UNRANKED").toUpperCase();
  const normalizedRank = rank ?? "";
  const base = TIER_SCORE_BASE[normalizedTier] ?? 0;
  const bonus = MASTER_PLUS_TIERS.has(normalizedTier) ? 0 : (RANK_SCORE_BONUS[normalizedRank] ?? 0);
  return base + bonus + lp;
}

/**
 * 상태를 색상 클래스로 변환
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'WAITING':
      return 'text-text-secondary';
    case 'IN_PROGRESS':
      return 'text-accent-primary';
    case 'COMPLETED':
      return 'text-accent-success';
    default:
      return 'text-text-secondary';
  }
}

/**
 * 날짜를 상대 시간으로 변환
 */
export function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const diffInSeconds = Math.floor((now.getTime() - targetDate.getTime()) / 1000);

  if (diffInSeconds < 60) return '방금 전';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`;

  return targetDate.toLocaleDateString('ko-KR');
}
