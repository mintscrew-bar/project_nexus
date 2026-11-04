"use client";

// 개발용 프리뷰 — 펼친 내전 전적(InternalMatchView) 탭 확인
// 접속: http://localhost:3010/dev/internal-match
//
// 실제 화면은 API 가 있어야 그려져서, 가짜 경기 하나를 넣어 확인한다.

import {
  InternalMatchView,
  type MatchDetails,
} from "@/components/matches/internal-match/InternalMatchView";

const CHAMPS = [
  ["Aatrox", 266, "TOP"],
  ["LeeSin", 64, "JUNGLE"],
  ["Ahri", 103, "MIDDLE"],
  ["Jinx", 222, "BOTTOM"],
  ["Thresh", 412, "UTILITY"],
  ["Darius", 122, "TOP"],
  ["Hecarim", 120, "JUNGLE"],
  ["Syndra", 134, "MIDDLE"],
  ["Kaisa", 145, "BOTTOM"],
  ["Nautilus", 111, "UTILITY"],
] as const;

const participants = CHAMPS.map(([name, id, position], i) => {
  const teamA = i < 5;
  return {
    id: `p${i}`,
    userId: `u${i}`,
    teamId: teamA ? "team-a" : "team-b",
    championId: id,
    championName: name,
    champLevel: 15 + (i % 3),
    position,
    summoner1Id: 4,
    summoner2Id: 14,
    kills: teamA ? 2 + i : 6 + i,
    deaths: teamA ? 8 - i : 2 + (i % 3),
    assists: 5 + i,
    totalMinionsKilled: 150 + i * 10,
    neutralMinionsKilled: position === "JUNGLE" ? 120 : 5,
    goldEarned: 9000 + i * 600,
    goldSpent: 8800,
    totalDamageDealt: 120000,
    totalDamageDealtToChampions: 12000 + i * 2100,
    totalDamageTaken: 22000,
    totalHeal: 3000,
    damageSelfMitigated: 15000,
    visionScore: 15 + i * 3,
    wardsPlaced: 8,
    wardsKilled: 3,
    detectorWardsPlaced: 2,
    item0: 3031,
    item1: 3006,
    item2: 3046,
    item3: 3036,
    item4: 0,
    item5: 0,
    item6: 3340,
    perks: null,
    doubleKills: 1,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    firstBloodKill: i === 7,
    firstTowerKill: false,
    turretKills: 1,
    inhibitorKills: 0,
    dragonKills: 0,
    baronKills: 0,
    largestKillingSpree: 3,
    largestMultiKill: 2,
    longestTimeSpentLiving: 600,
    totalTimeSpentDead: 120,
    win: !teamA,
    user: { id: `u${i}`, username: `플레이어${i + 1}` },
  };
});

const teamStats = (teamId: string, win: boolean) => ({
  id: `ts-${teamId}`,
  teamId,
  win,
  baronKills: win ? 1 : 0,
  dragonKills: win ? 3 : 1,
  towerKills: win ? 9 : 2,
  inhibitorKills: win ? 2 : 0,
  riftHeraldKills: 1,
  firstBlood: win,
  firstTower: win,
  firstBaron: win,
  firstDragon: !win,
  bans: [{ championId: 157 }, { championId: 238 }, { championId: 555 }],
  team: { id: teamId, name: teamId, color: "" },
});

const MATCH = {
  id: "m1",
  teamAId: "team-a",
  teamBId: "team-b",
  winnerId: "team-b",
  status: "COMPLETED",
  startedAt: "2026-11-03T12:00:00Z",
  completedAt: "2026-11-03T12:30:00Z",
  gameDuration: 1812,
  dataCollected: true,
  bracketRound: null,
  matchNumber: 1,
  riotMatchId: null,
  teamA: { id: "team-a", name: "레몬쉬론 팀", color: "" },
  teamB: { id: "team-b", name: "임전무 팀", color: "" },
  participants,
  teamStats: [teamStats("team-a", false), teamStats("team-b", true)],
} as unknown as MatchDetails;

export default function InternalMatchPreview() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <InternalMatchView match={MATCH} />
    </div>
  );
}
