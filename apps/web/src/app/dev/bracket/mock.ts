// 개발용 대진표 미리보기들이 함께 쓰는 가짜 대진 (4팀 싱글 엘리미네이션)
import type { Match } from "@/components/domain/BracketView";

// 팀장 닉네임 — 실제 화면처럼 "OO 팀" 으로 보이게 한다
export const TEAMS = [
  { id: "t1", name: "새벽정글러 팀", captain: "새벽정글러" },
  { id: "t2", name: "원딜장인 팀", captain: "원딜장인" },
  { id: "t3", name: "한타요정 팀", captain: "한타요정" },
  { id: "t4", name: "운영의신 팀", captain: "운영의신" },
].map((t) => ({
  id: t.id,
  name: t.name,
  captain: { id: `${t.id}-c`, username: t.captain },
  // 카드의 인원수 표시용 — 5인 팀
  members: Array.from({ length: 5 }, (_, i) => ({
    id: `${t.id}-m${i}`,
    username: `${t.captain}${i}`,
  })),
}));

export const MATCHES: Match[] = [
  // 준결승 1 — 끝난 경기 (2:1)
  {
    id: "m1",
    round: 1,
    matchNumber: 1,
    team1: { ...TEAMS[0], score: 2 },
    team2: { ...TEAMS[1], score: 1 },
    winner: TEAMS[0],
    status: "COMPLETED",
    bestOf: 3,
    blueSideTeamId: "t1",
  },
  // 준결승 2 — 진행 중인 2세트, 진영 확정
  {
    id: "m2",
    round: 1,
    matchNumber: 2,
    team1: { ...TEAMS[2], score: 1 },
    team2: { ...TEAMS[3], score: 0 },
    status: "IN_PROGRESS",
    bestOf: 3,
    currentGameNumber: 2,
    currentGameStatus: "IN_PROGRESS",
    blueSideTeamId: "t4",
  },
  // 결승 — 한쪽만 올라온 상태
  {
    id: "m3",
    round: 2,
    matchNumber: 1,
    team1: TEAMS[0],
    status: "PENDING",
    bestOf: 3,
  },
];
