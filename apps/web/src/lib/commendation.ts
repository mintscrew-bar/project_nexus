/**
 * 칭찬 태그 — 서버(apps/api/src/modules/reputation/commendation.constants.ts)와 같은 키.
 * 칭찬은 좋은 것만 남긴다. 나쁜 점은 신고로 보낸다.
 */
export const COMMENDATION_TAGS = [
  { key: "MANNER", label: "매너 좋음" },
  { key: "SHOTCALL", label: "콜 잘함" },
  { key: "CARRY", label: "캐리" },
  { key: "TEAMWORK", label: "팀워크" },
  { key: "MENTAL", label: "멘탈 강함" },
] as const;

export type CommendationTag = (typeof COMMENDATION_TAGS)[number]["key"];

/** 한 경기에서 칭찬할 수 있는 최대 인원 (서버와 같은 값) */
export const MAX_COMMENDATIONS_PER_MATCH = 3;

export function commendationTagLabel(tag: string): string {
  return COMMENDATION_TAGS.find((t) => t.key === tag)?.label ?? tag;
}

/** 받은 칭찬 요약 — 랭킹·프로필·경매 카드가 같은 모양을 쓴다 */
export interface CommendationSummary {
  total: number;
  topTags: { tag: CommendationTag; count: number }[];
}
