import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { calculateTierScore as sharedCalculateTierScore } from "@nexus/types";

/**
 * Tailwind 클래스 병합 유틸리티
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * API 에러를 사용자에게 보여줄 문구로 변환한다.
 * axios 에러의 `message`는 "Request failed with status code 404" 같은 내부 문자열이라
 * 그대로 노출하면 안 된다. 서버가 준 메시지 → 상태 코드별 문구 → fallback 순으로 고른다.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  statusMessages: Record<number, string> = {},
): string {
  const err = error as {
    response?: { status?: number; data?: { message?: string | string[] } };
    code?: string;
  };

  const status = err?.response?.status;
  if (status && statusMessages[status]) return statusMessages[status];

  const serverMessage = err?.response?.data?.message;
  if (Array.isArray(serverMessage) && serverMessage.length > 0) return serverMessage[0];
  if (typeof serverMessage === "string" && serverMessage) return serverMessage;

  // 서버 메시지가 없을 때의 기본 문구 — 상태 코드별로 최소한의 맥락은 준다.
  if (status === 401) return "로그인이 필요합니다. 다시 로그인해 주세요.";
  if (status === 403) return "권한이 없습니다.";
  if (status === 404) return "요청한 정보를 찾을 수 없습니다.";
  if (status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (status && status >= 500) return "서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  // 응답 자체가 없으면 네트워크 문제로 간주한다.
  if (!status) return "네트워크 연결을 확인해 주세요.";

  return fallback;
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

export function calculateTierScore(tier?: string | null, rank?: string | null, lp = 0): number {
  return sharedCalculateTierScore(tier ?? "UNRANKED", rank ?? "", lp);
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
