"use client";

import { useState } from "react";
import { BroadcastShell } from "../[token]/_components/BroadcastShell";
import { LowerThird } from "../[token]/_components/LowerThird";
import {
  RoomScene,
  MatchScene,
  IdleScene,
} from "../[token]/_components/scenes";

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

const mkMembers = (names: [string, number][]) =>
  names.map(([username, soldPrice], i) => ({
    userId: `u${i}`,
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
  ]),
};

const common = (status: string) => ({
  room: {
    id: "room1",
    name: "제1회 넥서스 내전 리그",
    status,
    participantCount: 10,
    maxParticipants: 10,
    hostName: "스트리머",
  },
  theme: THEME,
  teams: [TEAM_BLUE, TEAM_RED],
  focusMatchId: null,
  scene: "room",
});

const SNAP: Record<string, any> = {
  waiting: { ...common("WAITING"), room: { ...common("WAITING").room, participantCount: 6 } },
  auction: common("AUCTION"),
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
      blue: TEAM_BLUE,
      red: TEAM_RED,
    },
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
  idle: { idle: true, scene: "room", room: null, theme: THEME, streamer: { name: "스트리머" }, teams: [], focusMatchId: null },
};

const SCENES: { key: string; label: string }[] = [
  { key: "waiting", label: "대기" },
  { key: "auction", label: "경매" },
  { key: "match", label: "경기 중계" },
  { key: "matchDone", label: "경기 종료(승팀)" },
  { key: "idle", label: "Idle(방 없음)" },
];

export default function BroadcastPreviewPage() {
  const [sceneKey, setSceneKey] = useState("auction");
  const [bg, setBg] = useState<"transparent" | "opaque">("opaque");

  const snapshot = SNAP[sceneKey];
  const isMatch = sceneKey === "match" || sceneKey === "matchDone";

  const sceneNode = snapshot.idle ? (
    <IdleScene snapshot={snapshot} />
  ) : isMatch ? (
    <MatchScene snapshot={snapshot} />
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
        persistent={<LowerThird snapshot={snapshot} />}
      />
    </div>
  );
}
