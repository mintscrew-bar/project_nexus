"use client";

import { BroadcastShell } from "../[token]/_components/BroadcastShell";
import { LowerThird } from "../[token]/_components/LowerThird";
import {
  RoomScene,
  MatchScene,
  MatchIntroScene,
  LineupOverlayScene,
  IdleScene,
  BreakScene,
  MatchResultScene,
  BracketScene,
  RoleSelectionScene,
  TeamRevealScene,
} from "../[token]/_components/scenes";
import { AuctionBoardView } from "../[token]/_components/AuctionBoardView";
import type { BroadcastAuctionData } from "../[token]/_live/useBroadcastAuction";
import { SnakeDraftBoardView } from "../[token]/_components/SnakeDraftBoardView";
import type { BroadcastSnakeDraftData } from "../[token]/_live/useBroadcastSnakeDraft";

/**
 * /broadcast/preview — 방송 오버레이 디자인 확인용 목업 프리뷰(백엔드 불필요).
 * 실제 씬 컴포넌트를 목 스냅샷으로 렌더한다. 배포/OBS와 무관한 개발 편의 페이지.
 */

const ACCENT = "#8B5CF6";

const THEME = {
  accentColor: ACCENT,
  logo: null as string | null,
  banner: null as string | null,
  clanName: "넥서스 클랜",
  clanTag: "NX",
};

const mkMembers = (names: [string, number][], offset = 0) =>
  names.map(([username, soldPrice], i) => ({
    userId: `u${offset + i}`,
    username,
    avatar: null,
    assignedRole: null,
    soldPrice,
    tier: "GOLD",
  }));

const TEAM_BLUE = {
  id: "teamA",
  name: "블루 웨이브",
  color: "#3B82F6",
  captainId: "u0",
  initialBudget: 1000,
  remainingBudget: 240,
  members: mkMembers([
    ["다이아왕", 220],
    ["미드갓", 180],
    ["정글러킹", 160],
    ["서포터장인", 120],
    ["원딜에이스", 80],
  ]),
};

const TEAM_RED = {
  id: "teamB",
  name: "레드 스톰",
  color: "#EF4444",
  captainId: "u5",
  initialBudget: 1000,
  remainingBudget: 90,
  members: mkMembers(
    [
      ["탑솔러", 260],
      ["갱킹장인", 200],
      ["로밍메타", 150],
      ["와드요정", 100],
      ["막타학살", 200],
    ],
    5,
  ),
};

const TEAM_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
];

// 실제 라이엇 닉네임 길이(최대 16자)를 감안해 짧은 것부터 긴 것까지 섞는다.
// 잘림 여부를 프리뷰에서 바로 확인하기 위한 목업 값이다.
const PREVIEW_NICKNAMES = [
  "칼바람장인",
  "미드차이",
  "정글러킹",
  "와드요정",
  "막타학살자",
  "탑솔러갓",
  "로밍메타",
  "갱킹장인",
  "원딜에이스",
  "서포터장인",
  "한타의신",
  "라인전귀신",
  "닉네임긴사람임",
];

const PREVIEW_TEAM_TIERS = [
  "CHALLENGER",
  "GRANDMASTER",
  "MASTER",
  "DIAMOND",
  "EMERALD",
  "PLATINUM",
  "GOLD",
  "SILVER",
  "BRONZE",
  "IRON",
  "UNRANKED",
];

const makePreviewTeam = (index: number) => ({
  id: `team${index + 1}`,
  name: `${index + 1}팀`,
  color: TEAM_COLORS[index % TEAM_COLORS.length],
  captainId: `m${index}-0`,
  initialBudget: 1000,
  remainingBudget: 1000 - index * 80,
  // 5v5 기준으로 5명을 꽉 채운다. 라인 정렬이 눈에 보이도록 assignedRole 을
  // 일부러 뒤섞어 넣고(원딜→탑→서포→정글→미드), 티어도 팀마다 달라지게 한다.
  members: Array.from({ length: 5 }).map((_, slot) => ({
    userId: `m${index}-${slot}`,
    username:
      slot === 0
        ? `${index + 1}팀장`
        : PREVIEW_NICKNAMES[(index * 5 + slot) % PREVIEW_NICKNAMES.length],
    avatar: null,
    assignedRole: ["ADC", "TOP", "SUPPORT", "JUNGLE", "MID"][slot],
    soldPrice: slot === 0 ? null : 220 - slot * 30,
    tier: PREVIEW_TEAM_TIERS[(index * 5 + slot) % PREVIEW_TEAM_TIERS.length],
  })),
});

const MULTI_TEAMS = Array.from({ length: 6 }).map((_, index) =>
  makePreviewTeam(index),
);

const withPartialAssignedRoles = (team: any, roles: Array<string | null>) => ({
  ...team,
  members: (team.members ?? []).map((member: any, index: number) => ({
    ...member,
    assignedRole: roles[index] ?? null,
  })),
});

const withLineupData = (team: any, roles: string[], scoreOffset: number) => {
  const championIds = ["103", "64", "84", "81", "89"];
  const members = (team.members ?? []).map((member: any, index: number) => ({
    ...member,
    assignedRole: roles[index],
    lineScore: 118.5 + scoreOffset + index * 3.2,
    championPreferences: championIds.map((championId, order) => ({
      role: roles[index],
      championId,
      order,
    })),
  }));
  return {
    ...team,
    members,
    balanceTotal: members.reduce(
      (total: number, member: any) => total + member.lineScore,
      0,
    ),
  };
};

const LINEUP_ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const LINEUP_BLUE = withLineupData(TEAM_BLUE, LINEUP_ROLES, 4);
const LINEUP_RED = withLineupData(TEAM_RED, LINEUP_ROLES, 0);

// 프리뷰용 티어 샘플 — 언랭(UNRANKED)/미연동(null) 케이스도 섞어 표기를 확인한다.
// 길이를 소수(7)로 둬 그리드 열 수(5·6·8)와 주기가 겹치지 않게 한다.
const PREVIEW_TIERS: Array<[string | null, string | null, number | null]> = [
  ["CHALLENGER", "I", 1204],
  ["DIAMOND", "II", 45],
  ["GOLD", "IV", 12],
  ["UNRANKED", "", 0],
  [null, null, null],
  ["EMERALD", "III", 88],
  ["SILVER", "III", 50],
];

const WAITING_PARTICIPANTS = Array.from({ length: 30 }).map((_, index) => {
  const [tier, rank, lp] = PREVIEW_TIERS[index % PREVIEW_TIERS.length];
  return {
    userId: `p${index + 1}`,
    username: ["다이아왕", "미드갓", "정글러킹", "서포터장인", "원딜에이스"][
      index % 5
    ],
    isReady: index % 3 !== 1,
    isCaptain: index === 0 || index === 5,
    tier,
    rank,
    lp,
  };
});

const common = (status: string) => ({
  room: {
    id: "room1",
    name: "제1회 넥서스 내전 리그",
    status,
    teamMode: status === "DRAFT" ? "AUCTION" : "SNAKE_DRAFT",
    participantCount: 10,
    maxParticipants: 10,
    hostName: "스트리머",
    participants: WAITING_PARTICIPANTS,
  },
  theme: THEME,
  teams: [TEAM_BLUE, TEAM_RED],
  focusMatchId: null,
  scene: "room",
});

/** 결과 스코어보드 목업 — [챔피언, K, D, A, 피해량, 골드, CS] */
const mockBoardPlayers = (
  members: any[],
  lines: [string, number, number, number, number, number, number][],
) =>
  lines.map(([championName, kills, deaths, assists, damage, gold, cs], i) => ({
    userId: members[i]?.userId ?? `p${i}`,
    username: members[i]?.username ?? `선수${i + 1}`,
    gameName: null,
    championName,
    position: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"][i],
    kills,
    deaths,
    assists,
    damage,
    gold,
    cs,
  }));

/**
 * 경기 결과 미리보기용 Riot 타임라인.
 * 초반 접전 → 레드의 짧은 우세 → 블루가 오브젝트를 쌓으며 12.2K 차이로 끝나는 흐름이다.
 * 실제 TeamGoldChart가 사용하는 participantFrames/events 모양을 그대로 써서 목업 전용
 * 그래프를 따로 만들지 않는다.
 */
const MOCK_GOLD_TIMELINE = (() => {
  const weights = [0.2, 0.19, 0.21, 0.24, 0.16];
  const split = (total: number) => {
    const values = weights.map((weight) => Math.round(total * weight));
    values[4] += total - values.reduce((sum, value) => sum + value, 0);
    return values;
  };
  const eventsByMinute: Record<number, any[]> = {
    6: [
      {
        type: "ELITE_MONSTER_KILL",
        monsterType: "HORDE",
        killerTeamId: 100,
      },
    ],
    9: [
      {
        type: "ELITE_MONSTER_KILL",
        monsterType: "DRAGON",
        killerTeamId: 200,
      },
    ],
    12: [
      { type: "BUILDING_KILL", buildingType: "TOWER_BUILDING", teamId: 200 },
    ],
    15: [
      {
        type: "ELITE_MONSTER_KILL",
        monsterType: "DRAGON",
        killerTeamId: 100,
      },
    ],
    18: [
      {
        type: "ELITE_MONSTER_KILL",
        monsterType: "RIFTHERALD",
        killerTeamId: 100,
      },
    ],
    21: [
      {
        type: "ELITE_MONSTER_KILL",
        monsterType: "DRAGON",
        killerTeamId: 100,
      },
    ],
    24: [
      {
        type: "ELITE_MONSTER_KILL",
        monsterType: "BARON_NASHOR",
        killerTeamId: 100,
      },
    ],
    27: [
      {
        type: "BUILDING_KILL",
        buildingType: "INHIBITOR_BUILDING",
        teamId: 200,
      },
    ],
  };

  return {
    metadata: {
      participants: Array.from({ length: 10 }, (_, i) =>
        i < 5 ? `blue-${i + 1}` : `red-${i - 4}`,
      ),
    },
    info: {
      frames: Array.from({ length: 29 }, (_, minute) => {
        const progress = minute / 28;
        const blueTotal = Math.round(
          2500 + 61800 * progress - 6000 * Math.sin(Math.PI * progress),
        );
        const redTotal = Math.round(2500 + 49600 * progress);
        const blueGold = split(blueTotal);
        const redGold = split(redTotal);
        return {
          timestamp: minute * 60_000,
          participantFrames: Object.fromEntries([
            ...blueGold.map((totalGold, i) => [i + 1, { totalGold }]),
            ...redGold.map((totalGold, i) => [i + 6, { totalGold }]),
          ]),
          events: (eventsByMinute[minute] ?? []).map((event) => ({
            ...event,
            timestamp: minute * 60_000,
          })),
        };
      }),
    },
  };
})();

export const SNAP: Record<string, any> = {
  waiting: {
    ...common("WAITING"),
    room: {
      ...common("WAITING").room,
      participantCount: WAITING_PARTICIPANTS.length,
      maxParticipants: WAITING_PARTICIPANTS.length,
      participants: WAITING_PARTICIPANTS,
    },
  },
  auction: common("DRAFT"),
  auctionMulti: {
    ...common("DRAFT"),
    room: {
      ...common("DRAFT").room,
      participantCount: 30,
      maxParticipants: 30,
    },
    teams: MULTI_TEAMS,
  },
  roleSelect: {
    ...common("ROLE_SELECTION"),
    teams: [
      withPartialAssignedRoles(TEAM_BLUE, [
        "MID",
        "JUNGLE",
        null,
        "SUPPORT",
        null,
      ]),
      withPartialAssignedRoles(TEAM_RED, ["TOP", null, "ADC", null, "SUPPORT"]),
    ],
  },
  match: {
    ...common("IN_PROGRESS"),
    match: {
      id: "m1",
      status: "IN_PROGRESS",
      round: 1,
      bracketRound: "4강",
      matchNumber: 1,
      winnerId: null,
      blueSideTeamId: "teamA",
      blueScore: 1,
      redScore: 0,
      blue: LINEUP_BLUE,
      red: LINEUP_RED,
      // 선수 소개 배지 — 랭킹 순위·칭찬 (일부만 있게 해 빈 칸 모습도 보이게)
      badges: Object.fromEntries(
        [...LINEUP_BLUE.members, ...LINEUP_RED.members].map(
          (m: any, i: number) => [
            m.userId,
            {
              rank: i % 3 === 2 ? null : i + 1,
              score: i % 3 === 2 ? null : 64 - i * 1.7,
              commendations: i % 4 === 3 ? 0 : 12 - i,
              topTag: ["MANNER", "SHOTCALL", "CARRY", "TEAMWORK"][i % 4],
            },
          ],
        ),
      ),
    },
  },
  bracket: {
    ...common("IN_PROGRESS"),
    focusMatchId: "m5",
    matches: [
      {
        id: "m1",
        status: "COMPLETED",
        round: 1,
        bracketRound: "WB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamA",
        blueSideTeamId: "teamA",
        blue: TEAM_BLUE,
        red: TEAM_RED,
      },
      {
        id: "m2",
        status: "COMPLETED",
        round: 1,
        bracketRound: "WB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 2,
        winnerId: "team3",
        blueSideTeamId: "team3",
        blue: MULTI_TEAMS[2],
        red: MULTI_TEAMS[3],
      },
      {
        id: "m3",
        status: "PENDING",
        round: 2,
        bracketRound: "WB_F",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: TEAM_BLUE,
        red: MULTI_TEAMS[2],
      },
      {
        id: "m4",
        status: "COMPLETED",
        round: 1,
        bracketRound: "LB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamB",
        blueSideTeamId: "teamB",
        blue: TEAM_RED,
        red: MULTI_TEAMS[3],
      },
      {
        id: "m5",
        status: "PENDING",
        round: 2,
        bracketRound: "LB_F",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: TEAM_RED,
        red: null,
      },
      {
        id: "m6",
        status: "PENDING",
        round: 3,
        bracketRound: "GF",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: null,
        red: null,
      },
    ],
  },
  bracketSingle: {
    ...common("IN_PROGRESS"),
    focusMatchId: "s6",
    matches: [
      {
        id: "s1",
        status: "COMPLETED",
        round: 1,
        bracketRound: "ROUND 1",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamA",
        blueSideTeamId: "teamA",
        blue: TEAM_BLUE,
        red: TEAM_RED,
      },
      {
        id: "s2",
        status: "COMPLETED",
        round: 1,
        bracketRound: "ROUND 1",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 2,
        winnerId: "team3",
        blueSideTeamId: "team3",
        blue: MULTI_TEAMS[2],
        red: MULTI_TEAMS[3],
      },
      {
        id: "s3",
        status: "COMPLETED",
        round: 1,
        bracketRound: "ROUND 1",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 3,
        winnerId: "team5",
        blueSideTeamId: "team5",
        blue: MULTI_TEAMS[4],
        red: MULTI_TEAMS[5],
      },
      {
        id: "s4",
        status: "COMPLETED",
        round: 1,
        bracketRound: "ROUND 1",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 4,
        winnerId: "team2",
        blueSideTeamId: "team1",
        blue: MULTI_TEAMS[0],
        red: MULTI_TEAMS[1],
      },
      {
        id: "s5",
        status: "COMPLETED",
        round: 2,
        bracketRound: "SEMI FINAL",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamA",
        blueSideTeamId: "teamA",
        blue: TEAM_BLUE,
        red: MULTI_TEAMS[2],
      },
      {
        id: "s6",
        status: "PENDING",
        round: 2,
        bracketRound: "SEMI FINAL",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 2,
        winnerId: null,
        blueSideTeamId: null,
        blue: MULTI_TEAMS[4],
        red: MULTI_TEAMS[1],
      },
      {
        id: "s7",
        status: "PENDING",
        round: 3,
        bracketRound: "GRAND FINALS",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: TEAM_BLUE,
        red: null,
      },
    ],
  },
  bracketDouble: {
    ...common("IN_PROGRESS"),
    focusMatchId: "m5",
    matches: [
      {
        id: "m1",
        status: "COMPLETED",
        round: 1,
        bracketRound: "WB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamA",
        blueSideTeamId: "teamA",
        blue: TEAM_BLUE,
        red: TEAM_RED,
      },
      {
        id: "m2",
        status: "COMPLETED",
        round: 1,
        bracketRound: "WB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 2,
        winnerId: "team3",
        blueSideTeamId: "team3",
        blue: MULTI_TEAMS[2],
        red: MULTI_TEAMS[3],
      },
      {
        id: "m3",
        status: "PENDING",
        round: 2,
        bracketRound: "WB_F",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: TEAM_BLUE,
        red: MULTI_TEAMS[2],
      },
      {
        id: "m4",
        status: "COMPLETED",
        round: 1,
        bracketRound: "LB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamB",
        blueSideTeamId: "teamB",
        blue: TEAM_RED,
        red: MULTI_TEAMS[3],
      },
      {
        id: "m5",
        status: "PENDING",
        round: 2,
        bracketRound: "LB_F",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: TEAM_RED,
        red: null,
      },
      {
        id: "m6",
        status: "PENDING",
        round: 3,
        bracketRound: "GF",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: null,
        red: null,
      },
    ],
  },
  matchDone: {
    ...common("IN_PROGRESS"),
    match: {
      id: "m1",
      status: "COMPLETED",
      round: 1,
      bracketRound: "결승",
      matchNumber: 1,
      winnerId: "teamA",
      blueSideTeamId: "teamA",
      // 3판 2선승 결승 — 블루가 2:1 로 끝낸 세트
      bestOf: 3,
      currentGameNumber: 3,
      blueScore: 2,
      redScore: 1,
      blue: TEAM_BLUE,
      red: TEAM_RED,
      // Riot 기록이 수집된 판 — 자동 MVP·ACE, 진영 비교, 목업 골드 타임라인
      riot: {
        riotMatchId: null,
        timeline: MOCK_GOLD_TIMELINE,
        gameDuration: 1712,
        mvp: {
          userId: "u2",
          username: "정글러킹",
          championName: "Ahri",
          kills: 11,
          deaths: 2,
          assists: 9,
          damage: 32140,
        },
        ace: {
          userId: "u6",
          username: "갱킹장인",
          championName: "LeeSin",
          kills: 6,
          deaths: 5,
          assists: 7,
          damage: 18620,
        },
        blue: {
          kills: 27,
          gold: 64300,
          towers: 9,
          dragons: 3,
          barons: 1,
          heralds: 1,
          riotTeamId: 100,
          puuids: [],
          players: mockBoardPlayers(TEAM_BLUE.members, [
            ["Aatrox", 4, 3, 6, 18200, 12100, 198],
            ["LeeSin", 5, 2, 11, 14300, 11400, 162],
            ["Ahri", 11, 2, 9, 32140, 15200, 241],
            ["Jinx", 6, 4, 8, 26800, 14800, 256],
            ["Thresh", 1, 3, 19, 7100, 9800, 38],
          ]),
        },
        red: {
          kills: 14,
          gold: 52100,
          towers: 3,
          dragons: 1,
          barons: 0,
          heralds: 0,
          riotTeamId: 200,
          puuids: [],
          players: mockBoardPlayers(TEAM_RED.members, [
            ["Darius", 3, 6, 4, 15200, 10100, 176],
            ["LeeSin", 6, 5, 7, 18620, 10600, 141],
            ["Syndra", 3, 5, 5, 21400, 11200, 214],
            ["Kaisa", 2, 6, 4, 16800, 11300, 228],
            ["Lulu", 0, 5, 9, 5900, 8900, 31],
          ]),
        },
      },
    },
  },
  idle: {
    idle: true,
    scene: "room",
    room: null,
    theme: THEME,
    streamer: { name: "스트리머" },
    teams: [],
    focusMatchId: null,
  },
  snakeDraft: {
    ...common("DRAFT"),
    room: { ...common("DRAFT").room, teamMode: "SNAKE_DRAFT" },
  },
  // 4팀 싱글 엘림 — 트리가 2컬럼(준결승 2 + 결승)으로 줄어드는지 확인용
  bracketSingle4: {
    ...common("IN_PROGRESS"),
    focusMatchId: "f4-3",
    matches: [
      {
        id: "f4-1",
        status: "COMPLETED",
        round: 1,
        bracketRound: "SEMI FINAL",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamA",
        blueSideTeamId: "teamA",
        blue: TEAM_BLUE,
        red: TEAM_RED,
      },
      {
        id: "f4-2",
        status: "COMPLETED",
        round: 1,
        bracketRound: "SEMI FINAL",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 2,
        winnerId: "team3",
        blueSideTeamId: "team3",
        blue: MULTI_TEAMS[2],
        red: MULTI_TEAMS[3],
      },
      {
        id: "f4-3",
        status: "PENDING",
        round: 2,
        bracketRound: "GRAND FINALS",
        bracketType: "SINGLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: TEAM_BLUE,
        red: MULTI_TEAMS[2],
      },
    ],
  },
  // 8팀 더블 엘림 — 섹션 컬럼 모드가 실제 섹션 수만큼만 그리는지 확인용
  bracketDouble8: {
    ...common("IN_PROGRESS"),
    focusMatchId: "d8-wf",
    matches: [
      ...[0, 1, 2, 3].map((i) => ({
        id: `d8-w1-${i}`,
        status: "COMPLETED",
        round: 1,
        bracketRound: "WB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: i + 1,
        winnerId: i % 2 === 0 ? "teamA" : "team3",
        blueSideTeamId: null,
        blue: [TEAM_BLUE, MULTI_TEAMS[0], MULTI_TEAMS[2], MULTI_TEAMS[4]][i],
        red: [TEAM_RED, MULTI_TEAMS[1], MULTI_TEAMS[3], MULTI_TEAMS[5]][i],
      })),
      {
        id: "d8-w2-1",
        status: "COMPLETED",
        round: 2,
        bracketRound: "WB_R2",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: "teamA",
        blueSideTeamId: null,
        blue: TEAM_BLUE,
        red: MULTI_TEAMS[0],
      },
      {
        id: "d8-w2-2",
        status: "IN_PROGRESS",
        round: 2,
        bracketRound: "WB_R2",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 2,
        winnerId: null,
        blueSideTeamId: null,
        blue: MULTI_TEAMS[2],
        red: MULTI_TEAMS[4],
      },
      {
        id: "d8-wf",
        status: "PENDING",
        round: 3,
        bracketRound: "WB_F",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: TEAM_BLUE,
        red: null,
      },
      ...[0, 1].map((i) => ({
        id: `d8-l1-${i}`,
        status: "PENDING",
        round: 1,
        bracketRound: "LB_R1",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: i + 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: [TEAM_RED, MULTI_TEAMS[3]][i],
        red: [MULTI_TEAMS[1], MULTI_TEAMS[5]][i],
      })),
      {
        id: "d8-lsemi",
        status: "PENDING",
        round: 2,
        bracketRound: "LB_SEMI",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: null,
        red: null,
      },
      {
        id: "d8-lf",
        status: "PENDING",
        round: 3,
        bracketRound: "LB_F",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: null,
        red: null,
      },
      {
        id: "d8-gf",
        status: "PENDING",
        round: 4,
        bracketRound: "GF",
        bracketType: "DOUBLE_ELIMINATION",
        matchNumber: 1,
        winnerId: null,
        blueSideTeamId: null,
        blue: null,
        red: null,
      },
    ],
  },
  teamReveal: {
    ...common("DRAFT_COMPLETED"),
    room: { ...common("DRAFT_COMPLETED").room, teamMode: "AUTO_BALANCE" },
  },
  teamReveal4: {
    ...common("DRAFT_COMPLETED"),
    room: { ...common("DRAFT_COMPLETED").room, teamMode: "AUTO_BALANCE" },
    teams: MULTI_TEAMS.slice(0, 4),
  },
  teamReveal6: {
    ...common("DRAFT_COMPLETED"),
    room: { ...common("DRAFT_COMPLETED").room, teamMode: "AUTO_BALANCE" },
    teams: MULTI_TEAMS,
  },
  teamReveal8: {
    ...common("DRAFT_COMPLETED"),
    room: { ...common("DRAFT_COMPLETED").room, teamMode: "AUTO_BALANCE" },
    teams: [...MULTI_TEAMS, makePreviewTeam(6), makePreviewTeam(7)],
  },
};

/** 스네이크 드래프트 프리뷰 — 3픽 진행된 중반 상태 */
export const MOCK_SNAKE_DRAFT: BroadcastSnakeDraftData = {
  connected: true,
  status: "IN_PROGRESS",
  teams: [
    {
      id: "teamA",
      name: "블루 웨이브",
      color: "#3B82F6",
      captainId: "u0",
      members: [
        { id: "u0", username: "다이아왕", tier: "DIAMOND", rank: "2" },
        { id: "u1", username: "미드갓", tier: "PLATINUM", rank: "1" },
      ],
    },
    {
      id: "teamB",
      name: "레드 스톰",
      color: "#EF4444",
      captainId: "u5",
      members: [
        { id: "u5", username: "탑솔러", tier: "EMERALD", rank: "3" },
        { id: "u6", username: "갱킹장인", tier: "GOLD", rank: "1" },
      ],
    },
  ],
  availablePlayers: [
    { id: "a1", username: "서포터장인", tier: "PLATINUM", rank: "4" },
    { id: "a2", username: "원딜에이스", tier: "GOLD", rank: "2" },
    { id: "a3", username: "로밍메타", tier: "EMERALD", rank: "1" },
    { id: "a4", username: "와드요정", tier: "SILVER", rank: "1" },
    { id: "a5", username: "막타학살", tier: "GOLD", rank: "3" },
    { id: "a6", username: "정글차이", tier: "DIAMOND", rank: "4" },
  ],
  pickOrder: ["teamA", "teamB", "teamB", "teamA"],
  currentTeamId: "teamB",
  timerEnd: Date.now() + 23_000,
  lastPick: {
    teamId: "teamA",
    player: { id: "u1", username: "미드갓", tier: "PLATINUM", rank: "1" },
  },
};

const MOCK_PLAYERS = [
  { id: "p1", username: "다이아왕", tier: "DIAMOND", position: "MID" },
  { id: "p2", username: "정글러킹", tier: "PLATINUM", position: "JUNGLE" },
  { id: "p3", username: "탑신병자", tier: "GOLD", position: "TOP" },
  { id: "p4", username: "원딜장인", tier: "PLATINUM", position: "ADC" },
];

export const MOCK_AUCTION_LIVE: BroadcastAuctionData = {
  connected: true,
  status: "IN_PROGRESS",
  captainPhase: null,
  teams: [TEAM_BLUE, TEAM_RED],
  players: MOCK_PLAYERS,
  auctionState: {
    currentPlayer: MOCK_PLAYERS[0],
    currentPlayerIndex: 0,
    currentHighestBid: 320,
    currentHighestBidder: "teamA",
    currentHighestBidderName: "블루 웨이브",
    timerEnd: Date.now() + 9000,
    status: "IN_PROGRESS",
    yuchalCount: 0,
    maxYuchalCycles: 2,
    bidIncrement: 10,
  },
  bidHistory: [
    {
      username: "다이아왕",
      amount: 0,
      timestamp: 0,
      playerLabel: "다이아왕",
      isSeparator: true,
    },
    { username: "레드 스톰", amount: 280, timestamp: 1 },
    { username: "블루 웨이브", amount: 320, timestamp: 2 },
  ],
};

export const MOCK_AUCTION_MULTI: BroadcastAuctionData = {
  ...MOCK_AUCTION_LIVE,
  teams: MULTI_TEAMS,
  players: [
    { id: "mp1", username: "경매대상", tier: "EMERALD", position: "JUNGLE" },
    { id: "mp2", username: "남은선수1", tier: "DIAMOND", position: "MID" },
    { id: "mp3", username: "남은선수2", tier: "PLATINUM", position: "ADC" },
    { id: "mp4", username: "남은선수3", tier: "GOLD", position: "TOP" },
    { id: "mp5", username: "남은선수4", tier: "EMERALD", position: "SUPPORT" },
  ],
  auctionState: {
    ...MOCK_AUCTION_LIVE.auctionState,
    currentPlayer: {
      id: "mp1",
      username: "경매대상",
      tier: "EMERALD",
      position: "JUNGLE",
    },
    currentHighestBid: 460,
    currentHighestBidder: "team4",
    currentHighestBidderName: "4팀",
    maxYuchalCycles: 6,
  },
  bidHistory: [
    { username: "2팀", amount: 360, timestamp: 1 },
    { username: "4팀", amount: 460, timestamp: 2 },
  ],
};

/** 경매 매물 카드 옆 "선수 정보" 판 목업 (방송 전용 선수 프로필과 같은 모양) */
export const MOCK_LOT_PROFILE: any = {
  username: "다이아왕",
  riotAccount: {
    gameName: "다이아왕",
    tagLine: "KR1",
    mainRole: "MID",
    subRole: "TOP",
    roleTiers: [
      { role: "TOP", tier: "EMERALD", rank: "II", lp: 40 },
      { role: "JUNGLE", tier: "PLATINUM", rank: "I", lp: 12 },
      { role: "MID", tier: "DIAMOND", rank: "III", lp: 55 },
      { role: "ADC", tier: "PLATINUM", rank: "III", lp: 0 },
      { role: "SUPPORT", tier: "GOLD", rank: "I", lp: 80 },
    ],
    championPreferences: [
      { role: "MID", championId: "Ahri", order: 0 },
      { role: "MID", championId: "Syndra", order: 1 },
      { role: "MID", championId: "Sylas", order: 2 },
      { role: "TOP", championId: "Aatrox", order: 0 },
      { role: "TOP", championId: "Camille", order: 1 },
      { role: "JUNGLE", championId: "LeeSin", order: 0 },
      { role: "ADC", championId: "Jinx", order: 0 },
      { role: "SUPPORT", championId: "Thresh", order: 0 },
    ],
  },
  stats: { wins: 9, losses: 5, winRate: 64.3 },
  kda: {
    kills: 6.4,
    deaths: 3.1,
    assists: 7.8,
    games: 12,
    damage: 21450,
    cs: 187,
    vision: 24.6,
    gold: 12380,
    killParticipation: 58,
  },
  reputation: {
    commendations: { total: 14, topTags: [{ tag: "SHOTCALL", count: 7 }] },
  },
};

export const SCENES: { key: string; label: string }[] = [
  { key: "waiting", label: "대기" },
  { key: "auction", label: "경매(라이브)" },
  { key: "auctionMulti", label: "경매(6팀)" },
  { key: "snakeDraft", label: "스네이크 드래프트" },
  { key: "teamReveal", label: "팀 확정" },
  { key: "teamReveal4", label: "팀 확정(4팀)" },
  { key: "teamReveal6", label: "팀 확정(6팀)" },
  { key: "teamReveal8", label: "팀 확정(8팀)" },
  { key: "roleSelect", label: "역할선택" },
  { key: "bracketSingle4", label: "일반 대진표(4팀)" },
  { key: "bracketSingle", label: "일반 대진표(8팀)" },
  { key: "bracketDouble", label: "더블 엘림(4팀)" },
  { key: "bracketDouble8", label: "더블 엘림(8팀)" },
  { key: "matchIntro", label: "경기 소개" },
  { key: "lineup", label: "라인업 패널" },
  { key: "match", label: "경기 중계" },
  { key: "matchDone", label: "경기 결과" },
  { key: "break", label: "휴식" },
  { key: "idle", label: "Idle(방 없음)" },
];

export const PREVIEW_TRANSITIONS: Record<
  string,
  {
    label: string;
    subLabel?: string;
    eyebrow?: string;
    tone?: "phase" | "match" | "result";
  }
> = {
  waiting: {
    label: "WAITING ROOM",
    subLabel: "내전 대기",
    eyebrow: "ROOM STATUS",
    tone: "phase",
  },
  auction: {
    label: "AUCTION DRAFT",
    subLabel: "경매 드래프트",
    eyebrow: "NEXT PHASE",
    tone: "phase",
  },
  auctionMulti: {
    label: "AUCTION DRAFT",
    subLabel: "멀티팀 경매",
    eyebrow: "NEXT PHASE",
    tone: "phase",
  },
  roleSelect: {
    label: "ROLE SELECTION",
    subLabel: "포지션 선택",
    eyebrow: "NEXT PHASE",
    tone: "phase",
  },
  snakeDraft: {
    label: "DRAFT PHASE",
    subLabel: "스네이크 드래프트",
    eyebrow: "NEXT PHASE",
    tone: "phase",
  },
  teamReveal4: {
    label: "TEAMS LOCKED",
    subLabel: "팀 확정",
    eyebrow: "ROSTER REVEAL",
    tone: "phase",
  },
  teamReveal6: {
    label: "TEAMS LOCKED",
    subLabel: "팀 확정",
    eyebrow: "ROSTER REVEAL",
    tone: "phase",
  },
  teamReveal8: {
    label: "TEAMS LOCKED",
    subLabel: "팀 확정",
    eyebrow: "ROSTER REVEAL",
    tone: "phase",
  },
  teamReveal: {
    label: "TEAMS LOCKED",
    subLabel: "팀 확정",
    eyebrow: "ROSTER REVEAL",
    tone: "phase",
  },
  bracket: {
    label: "BRACKET",
    subLabel: "대진표",
    eyebrow: "TOURNAMENT",
    tone: "phase",
  },
  bracketSingle: {
    label: "SINGLE BRACKET",
    subLabel: "일반 대진표",
    eyebrow: "TOURNAMENT",
    tone: "phase",
  },
  bracketSingle4: {
    label: "SINGLE BRACKET",
    subLabel: "일반 대진표 (4팀)",
    eyebrow: "TOURNAMENT",
    tone: "phase",
  },
  bracketDouble: {
    label: "DOUBLE ELIMINATION",
    subLabel: "더블 일리미네이션",
    eyebrow: "TOURNAMENT",
    tone: "phase",
  },
  bracketDouble8: {
    label: "DOUBLE ELIMINATION",
    subLabel: "더블 일리미네이션 (8팀)",
    eyebrow: "TOURNAMENT",
    tone: "phase",
  },
  match: {
    label: "MATCH READY",
    subLabel: "경기 전환",
    eyebrow: "MATCH STATUS",
    tone: "match",
  },
  matchIntro: {
    label: "MATCH INTRO",
    subLabel: "선수 소개",
    eyebrow: "STARTING LINEUP",
    tone: "match",
  },
  lineup: {
    label: "LINEUP",
    subLabel: "밴픽 라인업",
    eyebrow: "MATCH GUIDE",
    tone: "match",
  },
  matchDone: {
    label: "RESULT",
    subLabel: "경기 결과",
    eyebrow: "RESULT CONFIRMED",
    tone: "result",
  },
  idle: {
    label: "STANDBY",
    subLabel: "방송 대기",
    eyebrow: "NEXUS LIVE",
    tone: "phase",
  },
};

/**
 * 미리보기 장면 한 장 — 목업 스냅샷으로 실제 오버레이 컴포넌트를 그린다.
 * 관리자 미리보기(/broadcast/preview)와 방송 설정 화면의 실시간 미리보기
 * (/broadcast/sample, iframe)가 같이 쓴다. settings 를 넘기면 커스터마이징이 그대로 반영된다.
 */
export function PreviewStage({
  sceneKey,
  bg,
  settings,
}: {
  sceneKey: string;
  bg: "transparent" | "opaque";
  settings?: unknown;
}) {
  const baseSnapshot =
    SNAP[sceneKey] ?? (sceneKey === "break" ? SNAP.waiting : SNAP.auction);
  // 목업 스냅샷에 방송인 설정을 얹는다 — 장면들이 snapshot.settings 를 읽는다
  const snapshot = settings ? { ...baseSnapshot, settings } : baseSnapshot;
  const isMatch = sceneKey === "match" || sceneKey === "matchDone";
  const auctionLive: BroadcastAuctionData = {
    ...(sceneKey === "auctionMulti" ? MOCK_AUCTION_MULTI : MOCK_AUCTION_LIVE),
    auctionState: {
      ...(sceneKey === "auctionMulti"
        ? MOCK_AUCTION_MULTI.auctionState
        : MOCK_AUCTION_LIVE.auctionState),
      timerEnd: Date.now() + 9000,
    },
  };

  const withSettings = (snap: any) => (settings ? { ...snap, settings } : snap);
  const sceneNode = snapshot.idle ? (
    <IdleScene snapshot={snapshot} />
  ) : sceneKey === "break" ? (
    <BreakScene snapshot={snapshot} />
  ) : sceneKey === "matchDone" ? (
    <MatchResultScene snapshot={snapshot} />
  ) : sceneKey.startsWith("bracket") ? (
    <BracketScene snapshot={snapshot} />
  ) : sceneKey === "matchIntro" ? (
    <MatchIntroScene snapshot={withSettings(SNAP.match)} />
  ) : sceneKey === "lineup" ? (
    <LineupOverlayScene snapshot={withSettings(SNAP.match)} />
  ) : isMatch ? (
    <MatchScene snapshot={snapshot} />
  ) : sceneKey === "auction" || sceneKey === "auctionMulti" ? (
    <AuctionBoardView data={auctionLive} lotProfile={MOCK_LOT_PROFILE} />
  ) : sceneKey === "snakeDraft" ? (
    <SnakeDraftBoardView
      draft={{ ...MOCK_SNAKE_DRAFT, timerEnd: Date.now() + 23_000 }}
      snapshot={snapshot}
    />
  ) : sceneKey.startsWith("teamReveal") ? (
    <TeamRevealScene snapshot={snapshot} />
  ) : sceneKey === "roleSelect" ? (
    <RoleSelectionScene snapshot={snapshot} />
  ) : (
    <RoomScene snapshot={snapshot} />
  );

  return (
    <BroadcastShell
      bg={bg}
      settings={settings}
      theme={snapshot.theme}
      scene={sceneNode}
      persistent={
        // 실제 오버레이처럼 경기·경기 소개·라인업·결과 장면에는 하단바를 띄우지 않는다
        isMatch || sceneKey === "matchIntro" || sceneKey === "lineup" ? null : (
          <LowerThird snapshot={snapshot} bg={bg} />
        )
      }
      transitionKey={sceneKey}
      transition={PREVIEW_TRANSITIONS[sceneKey]}
    />
  );
}
