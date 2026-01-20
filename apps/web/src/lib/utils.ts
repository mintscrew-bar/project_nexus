import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind 클래스 병합 유틸리티
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 티어 이름을 색상 클래스로 변환
 */
export function getTierColor(tier: string): string {
  const tierLower = tier.toLowerCase();

  if (tierLower.includes('iron')) return 'text-tier-iron';
  if (tierLower.includes('bronze')) return 'text-tier-bronze';
  if (tierLower.includes('silver')) return 'text-tier-silver';
  if (tierLower.includes('gold')) return 'text-tier-gold';
  if (tierLower.includes('platinum')) return 'text-tier-platinum';
  if (tierLower.includes('emerald')) return 'text-tier-emerald';
  if (tierLower.includes('diamond')) return 'text-tier-diamond';
  if (tierLower.includes('master')) return 'text-tier-master';
  if (tierLower.includes('grandmaster')) return 'text-tier-grandmaster';
  if (tierLower.includes('challenger')) return 'text-tier-challenger';

  return 'text-tier-iron';
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
