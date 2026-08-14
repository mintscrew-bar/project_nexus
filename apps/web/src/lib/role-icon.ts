/**
 * 라인(포지션) 아이콘 경로 단일 진입점.
 *
 * `/icons/positions/position-*.svg` 를 9개 파일이 각자 맵으로 들고 있었고,
 * MID/MIDDLE·ADC/BOTTOM·SUPPORT/UTILITY 같은 별칭 처리도 제각각이었다.
 *
 * Riot API는 MIDDLE/BOTTOM/UTILITY를, Nexus DB(Role enum)는 MID/ADC/SUPPORT를
 * 쓰기 때문에 두 표기가 코드 곳곳에서 섞인다. 여기서 한 번에 흡수한다.
 */

/** Nexus Role enum 과 동일한 정규 라인 키 */
export const ROLE_KEYS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** 라인 순서 — 표시할 때는 항상 탑→서폿 순으로 고정한다 */
export const ROLE_ORDER: readonly RoleKey[] = ROLE_KEYS;

const ROLE_ALIASES: Record<string, RoleKey> = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  JUNGLER: "JUNGLE",
  MID: "MID",
  MIDDLE: "MID",
  ADC: "ADC",
  BOT: "ADC",
  BOTTOM: "ADC",
  SUPPORT: "SUPPORT",
  UTILITY: "SUPPORT",
  SUP: "SUPPORT",
};

const ROLE_ICON: Record<RoleKey, string> = {
  TOP: "/icons/positions/position-top.svg",
  JUNGLE: "/icons/positions/position-jungle.svg",
  MID: "/icons/positions/position-middle.svg",
  ADC: "/icons/positions/position-bottom.svg",
  SUPPORT: "/icons/positions/position-utility.svg",
};

const ROLE_LABEL: Record<RoleKey, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};

/** 어떤 표기로 들어와도 정규 라인 키로 바꾼다. 알 수 없으면 null. */
export function normalizeRole(role?: string | null): RoleKey | null {
  if (!role) return null;
  return ROLE_ALIASES[role.trim().toUpperCase()] ?? null;
}

/** 라인 아이콘 경로. 알 수 없는 라인이면 null이라 호출부가 숨기면 된다. */
export function getRoleIcon(role?: string | null): string | null {
  const key = normalizeRole(role);
  return key ? ROLE_ICON[key] : null;
}

/** 한글 라인명 (탑/정글/미드/원딜/서폿) */
export function getRoleLabel(role?: string | null): string | null {
  const key = normalizeRole(role);
  return key ? ROLE_LABEL[key] : null;
}
