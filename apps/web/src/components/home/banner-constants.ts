// ─────────────────────────────────────────────────────────────────────────────
// 배너 공통 상수 — 색상 팔레트 & 공유 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** AuctionBanner — 경매 드래프트의 긴장감 + 프리미엄 */
export const AUCTION_COLORS = {
  primary: "#8b5cf6",     // violet-500
  glow: "#a78bfa",        // violet-400 (하이라이트)
  accent: "#f59e0b",      // amber-500 (입찰가 강조)
  bg: "#0d0820",          // 짙은 다크 퍼플
  teamBlue: "#3b82f6",
  teamRed: "#ef4444",
} as const;

/** StatsBanner — 데이터/분석 느낌의 차분한 인디고 */
export const STATS_COLORS = {
  primary: "#6366f1",     // indigo-500
  dark: "#4f46e5",        // indigo-600
  glow: "#818cf8",        // indigo-400 (하이라이트)
  bgLeft: "#0a0e1a",
  bgRight: "#0f1628",
} as const;

/** DiscordBanner — Discord 브랜드 블루 */
export const DISCORD_COLORS = {
  primary: "#5865F2",     // Discord blurple
  light: "#7289DA",       // Discord light blue
  accent: "#4338ca",      // 깊은 인디고
  bgDark: "#1e1b4b",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 공통 배너 뱃지 스타일 생성기
// ─────────────────────────────────────────────────────────────────────────────

/** 배너 상단 뱃지 (DRAFT, UPDATE, FEATURE 등)의 인라인 스타일 생성 */
export function bannerBadgeStyle(color: string) {
  return {
    color,
    backgroundColor: `${color}15`,
    border: `1px solid ${color}30`,
  } as const;
}

/** 배너 하단 glow 라인 그라데이션 생성 */
export function bannerGlowGradient(color: string) {
  return `linear-gradient(90deg, transparent, ${color}80, transparent)`;
}
