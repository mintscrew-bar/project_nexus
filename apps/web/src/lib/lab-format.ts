/**
 * Lab 대시보드 전용 포맷 유틸리티
 * 모든 Lab 페이지에서 동일한 형식으로 데이터를 표시하기 위해 중앙 관리
 */

/** 승률: 54.2% (0–1 소수 → %) */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** 픽률/밴률: 12.34% (이미 % 단위인 값) */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** 변화량: +1.2%p / -0.8%p */
export function formatDelta(delta: number, decimals = 1): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(decimals)}%p`;
}

/** KDA: 4.5 / 2.1 / 6.3 */
export function formatKda(kills: number, deaths: number, assists: number): string {
  return `${kills.toFixed(1)} / ${deaths.toFixed(1)} / ${assists.toFixed(1)}`;
}

/** 게임 수: 1,234게임 */
export function formatGames(games: number): string {
  return `${games.toLocaleString("ko-KR")}게임`;
}

/** 신뢰도 레이블 */
export function confidenceLabel(level: "low" | "moderate" | "high" | "insufficient"): string {
  if (level === "high") return "높음";
  if (level === "moderate") return "보통";
  if (level === "low") return "낮음";
  return "부족";
}

/** 포지션 한국어 */
const POSITION_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

export function formatPosition(position: string): string {
  return POSITION_LABELS[position] ?? position;
}
