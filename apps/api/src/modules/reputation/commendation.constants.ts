/**
 * 칭찬 태그. 화면 문구는 웹(apps/web/src/lib/commendation.ts)과 같게 유지한다.
 * 칭찬은 좋은 것만 남긴다 — 나쁜 점은 신고로 보낸다.
 */
export const COMMENDATION_TAGS = [
  "MANNER", // 매너 좋음
  "SHOTCALL", // 콜 잘함
  "CARRY", // 캐리
  "TEAMWORK", // 팀워크
  "MENTAL", // 멘탈 강함
] as const;
export type CommendationTag = (typeof COMMENDATION_TAGS)[number];

/** 한 경기에서 칭찬할 수 있는 최대 인원 — 다 누르면 칭찬이 의미를 잃는다 */
export const MAX_COMMENDATIONS_PER_MATCH = 3;

/** 경기 끝나고 이 시간 안에만 칭찬 창을 띄운다 */
export const COMMENDATION_WINDOW_HOURS = 48;
