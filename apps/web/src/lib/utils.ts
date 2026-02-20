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

function findTier(tier: string): TierInfo {
  const lower = tier.toLowerCase();
  return TIER_MAP.find(t => lower.includes(t.key)) ?? DEFAULT_TIER;
}

export function getTierColor(tier: string): string {
  return findTier(tier).textClass;
}

export function getTierBgClass(tier: string): string {
  return findTier(tier).bgClass;
}

export function getTierBadgeVariant(tier: string): string {
  return findTier(tier).badgeVariant;
}

export function getTierIcon(tier: string): string {
  return findTier(tier).icon;
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
