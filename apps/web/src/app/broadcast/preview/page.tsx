"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";
import { BroadcastShell } from "../[token]/_components/BroadcastShell";
import { LowerThird } from "../[token]/_components/LowerThird";
import {
  RoomScene,
  MatchScene,
  IdleScene,
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
  members: mkMembers([
    ["탑솔러", 260],
    ["갱킹장인", 200],
    ["로밍메타", 150],
    ["와드요정", 100],
    ["막타학살", 200],
  ], 5),
};

const TEAM_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#EC4899", "#06B6D4"];

const makePreviewTeam = (index: number) => ({
  id: `team${index + 1}`,
  name: `${index + 1}팀`,
  color: TEAM_COLORS[index % TEAM_COLORS.length],
  captainId: `m${index}-0`,
  initialBudget: 1000,
  remainingBudget: 1000 - index * 80,
  members: Array.from({ length: index % 3 === 0 ? 4 : 3 }).map((_, slot) => ({
    userId: `m${index}-${slot}`,
    username: slot === 0 ? `${index + 1}팀장` : `선수${index + 1}-${slot}`,
    avatar: null,
    assignedRole: null,
    soldPrice: slot === 0 ? null : 100 + slot * 20,
    tier: ["DIAMOND", "PLATINUM", "GOLD", "EMERALD"][slot % 4],
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

const WAITING_PARTICIPANTS = Array.from({ length: 30 }).map((_, index) => ({
  userId: `p${index + 1}`,
  username: ["다이아왕", "미드갓", "정글러킹", "서포터장인", "원딜에이스"][
    index % 5
  ],
  isReady: index % 3 !== 1,
  isCaptain: index === 0 || index === 5,
}));

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

const SNAP: Record<string, any> = {
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
      withPartialAssignedRoles(TEAM_BLUE, ["MID", "JUNGLE", null, "SUPPORT", null]),
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
      blue: TEAM_BLUE,
      red: TEAM_RED,
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
      blue: TEAM_BLUE,
      red: TEAM_RED,
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
};

/** 스네이크 드래프트 프리뷰 — 3픽 진행된 중반 상태 */
const MOCK_SNAKE_DRAFT: BroadcastSnakeDraftData = {
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

const MOCK_AUCTION_LIVE: BroadcastAuctionData = {
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

const MOCK_AUCTION_MULTI: BroadcastAuctionData = {
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
    currentPlayer: { id: "mp1", username: "경매대상", tier: "EMERALD", position: "JUNGLE" },
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

const SCENES: { key: string; label: string }[] = [
  { key: "waiting", label: "대기" },
  { key: "auction", label: "경매(라이브)" },
  { key: "auctionMulti", label: "경매(6팀)" },
  { key: "snakeDraft", label: "스네이크 드래프트" },
  { key: "teamReveal", label: "팀 확정" },
  { key: "roleSelect", label: "역할선택" },
  { key: "bracketSingle4", label: "일반 대진표(4팀)" },
  { key: "bracketSingle", label: "일반 대진표(8팀)" },
  { key: "bracketDouble", label: "더블 엘림(4팀)" },
  { key: "bracketDouble8", label: "더블 엘림(8팀)" },
  { key: "match", label: "경기 중계" },
  { key: "matchDone", label: "경기 종료(승팀)" },
  { key: "idle", label: "Idle(방 없음)" },
];

const PREVIEW_TRANSITIONS: Record<
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

export default function BroadcastPreviewPage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const isProduction = process.env.NODE_ENV === "production";
  const hasPreviewAccess = user?.role === "ADMIN" || user?.role === "MODERATOR";

  const [sceneKey, setSceneKey] = useState("auction");
  const [bg, setBg] = useState<"transparent" | "opaque">("opaque");

  if (isProduction && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <LoadingSpinner />
      </div>
    );
  }

  if (isProduction && (!isAuthenticated || !hasPreviewAccess)) {
    notFound();
  }

  const snapshot = SNAP[sceneKey] ?? SNAP.auction;
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

  const sceneNode = snapshot.idle ? (
    <IdleScene snapshot={snapshot} />
  ) : sceneKey.startsWith("bracket") ? (
    <BracketScene snapshot={snapshot} />
  ) : isMatch ? (
    <MatchScene snapshot={snapshot} />
  ) : sceneKey === "auction" || sceneKey === "auctionMulti" ? (
    <AuctionBoardView data={auctionLive} />
  ) : sceneKey === "snakeDraft" ? (
    <SnakeDraftBoardView
      draft={{ ...MOCK_SNAKE_DRAFT, timerEnd: Date.now() + 23_000 }}
      snapshot={snapshot}
    />
  ) : sceneKey === "teamReveal" ? (
    <TeamRevealScene snapshot={snapshot} />
  ) : sceneKey === "roleSelect" ? (
    <RoleSelectionScene snapshot={snapshot} />
  ) : (
    <RoomScene snapshot={snapshot} />
  );

  return (
    <div className="fixed inset-0 bg-neutral-900">
      {/* 컨트롤 바 (프리뷰 전용, OBS엔 없음) */}
      <div className="pointer-events-auto fixed left-3 top-3 z-50 flex flex-wrap items-center gap-2 rounded-xl bg-black/80 p-2 text-sm text-white shadow-lg">
        {SCENES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSceneKey(s.key)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              sceneKey === s.key
                ? "bg-violet-500 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/20" />
        <button
          onClick={() =>
            setBg((b) => (b === "opaque" ? "transparent" : "opaque"))
          }
          className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white/70 hover:bg-white/20"
        >
          배경: {bg === "opaque" ? "풀씬" : "투명(체커)"}
        </button>
      </div>

      {/* 투명 배경일 때 실제 합성 느낌을 주는 체커보드 */}
      {bg === "transparent" && (
        <div
          className="fixed inset-0"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)",
            backgroundSize: "40px 40px",
            backgroundPosition: "0 0, 0 20px, 20px -20px, -20px 0px",
          }}
        />
      )}

      <BroadcastShell
        bg={bg}
        theme={snapshot.theme}
        scene={sceneNode}
        persistent={isMatch ? null : <LowerThird snapshot={snapshot} />}
        transitionKey={sceneKey}
        transition={PREVIEW_TRANSITIONS[sceneKey]}
      />
    </div>
  );
}
