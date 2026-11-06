"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api-client";
import { TeamGoldChart } from "@/components/matches/internal-match/TeamGoldChart";
import { getRoleIcon } from "@/lib/role-icon";
import {
  playerDisplayName,
  sideColor,
  teamDisplayName,
  useBroadcastLook,
} from "./look";

/**
 * 경기 결과 — 타이포그래피 영상처럼 순서대로 재생한다(Riot 기록이 수집된 판).
 *
 *   승리(3s) → 게임 흐름(4.8s) → MVP(3s) → ACE(3s) → 전체 스코어보드(멈춤)
 *
 * 자동 모드는 결과 장면을 22초 띄운다(api broadcast.service RESULT_SCENE_MS).
 * 단계마다 큰 글자가 가려졌다 드러나고(clip-path), 숫자는 0부터 올라간다.
 * 방송인이 전환 효과를 "없음"으로 두면 움직임 없이 마지막 스코어보드만 보여 준다.
 *
 * 꾸밈 원칙(2026-11-06 운영자 피드백): 두껍고 힘 있는 글씨, 단색. 유리판·빛 번짐·그라데이션
 * 글자는 오히려 싸 보여서 쓰지 않는다. 강조는 꾸밈이 아니라 대비(크기·색·밝기)로 준다.
 */

type Stage = "win" | "flow" | "mvp" | "ace" | "board";
const TIMELINE: { stage: Stage; at: number }[] = [
  { stage: "win", at: 0 },
  { stage: "flow", at: 3000 },
  { stage: "mvp", at: 7800 },
  { stage: "ace", at: 10800 },
  { stage: "board", at: 13800 },
];

const CSS = `
@keyframes rs-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes rs-rise { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: none; } }
@keyframes rs-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes rs-stamp { 0% { opacity: 0; transform: scale(1.8); letter-spacing: 0.4em; } 60% { opacity: 1; } 100% { opacity: 1; transform: scale(1); letter-spacing: 0.02em; } }
@keyframes rs-zoom { from { transform: scale(1.1); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes rs-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes rs-line-center { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes rs-reveal-center { from { clip-path: inset(0 50% 0 50%); } to { clip-path: inset(0 0 0 0); } }
@keyframes rs-stamp-wide { 0% { opacity: 0; transform: scale(1.6); letter-spacing: calc(var(--rs-ls, 0.5em) * 2.4); } 60% { opacity: 1; } 100% { opacity: 1; transform: scale(1); letter-spacing: var(--rs-ls, 0.5em); } }
@keyframes rs-row { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes rs-wash { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
`;

/** 작은 머리글 — 넓은 자간의 얇은 라벨. 큰 제목과 대비를 만든다 */
const LABEL = "text-lg font-black text-white/45";

/** 0 → target 으로 올라가는 숫자. delay 뒤 시작 */
function useCountUp(target: number, duration = 900, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const startAt = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startAt) / duration));
      // 끝에서 감속
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, delay]);
  return value;
}

function Count({
  value,
  delay = 0,
  format,
}: {
  value: number;
  delay?: number;
  format?: (n: number) => string;
}) {
  const n = useCountUp(value, 900, delay);
  return <>{format ? format(n) : n.toLocaleString()}</>;
}

/**
 * 외곽선 글자. -webkit-text-stroke 만 쓰면 A 처럼 획이 겹치는 글자의 안쪽 겹침선까지
 * 그려진다(ACE 의 A 가 이상해 보이던 원인). 굵은 외곽선 사본을 깔고 같은 자리에
 * 어두운 글자를 덮어 바깥 테두리만 남긴다.
 */
function OutlineText({
  children,
  color,
  className,
  style,
}: {
  children: ReactNode;
  color: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`relative inline-block ${className ?? ""}`} style={style}>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ color: "transparent", WebkitTextStroke: `8px ${color}` }}
      >
        {children}
      </span>
      <span className="relative" style={{ color: "#06070c" }}>
        {children}
      </span>
    </span>
  );
}

const SPLASH = (champion: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion}_0.jpg`;

/**
 * 다전제 세트 스코어(진영 기준, 서버 matchDetail 의 blueScore/redScore). 단판이면 null —
 * 단판은 세트가 늘 1:0 이라 보여 줄 의미가 없다.
 */
const seriesScore = (match: any) => {
  if (!match?.bestOf || match.bestOf <= 1) return null;
  const bestOf = match.bestOf as number;
  const blue = (match.blueScore ?? 0) as number;
  const red = (match.redScore ?? 0) as number;
  return {
    bestOf,
    blue,
    red,
    /** 이번 세트 번호 */
    game: (match.currentGameNumber ?? blue + red) as number,
    /** 시리즈가 끝났는지 — 한쪽이 과반 승을 채웠다 */
    decided: Math.max(blue, red) >= Math.ceil(bestOf / 2),
  };
};

/** 라운드 줄 — "결승 · 1경기 · 3세트" */
const roundLine = (match: any, roundLabel: string) => {
  const series = seriesScore(match);
  return [
    roundLabel,
    match.matchNumber != null ? `${match.matchNumber}경기` : null,
    series ? `${series.game}세트` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const fmtDuration = (seconds?: number | null) =>
  seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : null;

export function ResultSequence({
  match,
  winner,
  loser,
  roundLabel,
  roomName,
}: {
  match: any;
  winner: any;
  loser: any;
  roundLabel: string;
  /** 방 제목 — 승리 화면 맨 위에 둔다 */
  roomName?: string | null;
}) {
  const look = useBroadcastLook();
  const animate = look.settings.transition.style !== "none";
  const [stage, setStage] = useState<Stage>(animate ? "win" : "board");

  // 경기가 바뀌면 처음부터 다시 재생
  useEffect(() => {
    if (!animate) {
      setStage("board");
      return;
    }
    setStage("win");
    const timers = TIMELINE.slice(1).map(({ stage: next, at }) =>
      setTimeout(() => setStage(next), at),
    );
    return () => timers.forEach(clearTimeout);
  }, [match.id, animate]);

  const winnerIsRed = winner?.id === match.red?.id;
  const winColor = winnerIsRed
    ? sideColor(look, "red", match.red?.color)
    : sideColor(look, "blue", match.blue?.color);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <style>{CSS}</style>
      {/* key 로 단계마다 새로 마운트해 애니메이션을 처음부터 돌린다 */}
      <div key={stage} className="absolute inset-0">
        {stage === "win" && (
          <WinStage
            match={match}
            winner={winner}
            loser={loser}
            roundLabel={roundLabel}
            roomName={look.settings.title ?? roomName ?? null}
            color={winColor}
            winnerIsRed={winnerIsRed}
          />
        )}
        {stage === "flow" && <FlowStage match={match} />}
        {stage === "mvp" && (
          <SpotlightStage
            label="MVP"
            caption="이긴 팀 최고 활약"
            player={match.riot.mvp}
            color="#F6C945"
            team={winner}
          />
        )}
        {stage === "ace" && (
          <SpotlightStage
            label="ACE"
            caption="진 팀 최고 활약"
            player={match.riot.ace}
            color="#A78BFA"
            team={loser}
            mirror
          />
        )}
        {stage === "board" && (
          <BoardStage
            match={match}
            winner={winner}
            roundLabel={roundLabel}
            roomName={look.settings.title ?? roomName ?? null}
            animate={animate}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 1. 승리 — 가운데 정렬. 위에서부터 방 제목 → 라운드 → "승리" → 팀 이름 → 킬 스코어.
 * 팀 색 띠가 한 번 쓸고 지나가고, "승리"가 찍힌 뒤 팀 이름이 가운데서 양옆으로 드러난다.
 */
function WinStage({
  match,
  winner,
  loser,
  roundLabel,
  roomName,
  color,
  winnerIsRed,
}: {
  match: any;
  winner: any;
  loser: any;
  roundLabel: string;
  roomName: string | null;
  color: string;
  winnerIsRed: boolean;
}) {
  const { settings } = useBroadcastLook();
  const riot = match.riot;
  const duration = fmtDuration(riot?.gameDuration);
  const series = seriesScore(match);
  const winKills = winnerIsRed ? riot?.red.kills : riot?.blue.kills;
  const loseKills = winnerIsRed ? riot?.blue.kills : riot?.red.kills;
  return (
    <div className="flex h-full flex-col items-center justify-center px-32 pb-16 text-center">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-full opacity-30"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animation: "rs-wash 1400ms cubic-bezier(.7,0,.2,1) both",
        }}
      />
      {roomName && (
        <p
          className="max-w-[1440px] truncate text-[36px] font-black text-white/85"
          style={{ animation: "rs-rise 500ms ease-out both" }}
        >
          {roomName}
        </p>
      )}
      <p
        className="mt-3 pl-[0.3em] text-2xl font-black tracking-[0.3em] text-white/55"
        style={{ animation: "rs-rise 500ms ease-out 100ms both" }}
      >
        {roundLine(match, roundLabel)}
      </p>
      {/* 다전제: 시리즈가 끝났으면 "최종 승리", 아직이면 "N세트 승리".
          글자가 많으면 자간을 줄인다 — 띄어쓰기 자리가 지나치게 벌어진다.
          자간은 마지막 글자 뒤에도 붙어 가운데에서 밀리므로 같은 만큼 왼쪽 여백을 준다. */}
      {(() => {
        const stamp = series
          ? series.decided
            ? "최종 승리"
            : `${series.game}세트 승리`
          : "승리";
        const ls = stamp.length > 2 ? "0.22em" : "0.5em";
        return (
          <p
            className="mt-11 text-[56px] font-black leading-none text-white"
            style={{
              ["--rs-ls" as any]: ls,
              paddingLeft: ls,
              animation:
                "rs-stamp-wide 700ms cubic-bezier(.2,.8,.2,1) 300ms both",
            }}
          >
            {stamp}
          </p>
        );
      })()}
      <h1
        className="mt-6 max-w-[1500px] truncate text-[clamp(112px,10vw,190px)] font-black leading-[1]"
        style={{
          color,
          animation:
            "rs-reveal-center 800ms cubic-bezier(.7,0,.2,1) 700ms both",
        }}
      >
        {teamDisplayName(winner, settings.teamLabel) || "승리 팀"}
      </h1>
      <div
        className="mt-10 h-[2px] w-[900px] bg-white/25"
        style={{ animation: "rs-line-center 700ms ease-out 1300ms both" }}
      />
      <p
        className="mt-7 flex items-center gap-5 text-[28px] font-black text-white/65"
        style={{ animation: "rs-rise 500ms ease-out 1500ms both" }}
      >
        <span>
          vs {teamDisplayName(loser, settings.teamLabel) || "상대 팀"}
        </span>
        {series && (
          <span className="border-l border-white/20 pl-5 tabular-nums">
            <span className="mr-2 text-lg text-white/50">세트</span>
            <span style={{ color }}>
              {winnerIsRed ? series.red : series.blue}
            </span>
            <span className="mx-2 text-white/30">:</span>
            <span className="text-white/70">
              {winnerIsRed ? series.blue : series.red}
            </span>
          </span>
        )}
        {riot && (
          <span className="border-l border-white/20 pl-5 tabular-nums">
            <span className="mr-2 text-lg text-white/50">킬</span>
            <span style={{ color }}>{winKills}</span>
            <span className="mx-2 text-white/30">:</span>
            <span className="text-white/70">{loseKills}</span>
          </span>
        )}
        {duration && (
          <span className="border-l border-white/20 pl-5 tabular-nums text-white/55">
            {duration}
          </span>
        )}
      </p>
    </div>
  );
}

/** 2. 게임 흐름 — 골드 차이 그래프 + 진영 비교 수치가 차오른다 */
function FlowStage({ match }: { match: any }) {
  const look = useBroadcastLook();
  const riot = match.riot;
  const blue = sideColor(look, "blue", match.blue?.color);
  const red = sideColor(look, "red", match.red?.color);
  const { data: timeline } = useQuery({
    queryKey: ["broadcastTimeline", riot?.riotMatchId],
    queryFn: () => statsApi.getMatchTimeline(riot.riotMatchId),
    enabled: Boolean(riot?.riotMatchId),
    staleTime: Infinity,
    retry: false,
  });
  const rows: {
    label: string;
    b: number;
    r: number;
    fmt?: (n: number) => string;
  }[] = [
    { label: "킬", b: riot.blue.kills, r: riot.red.kills },
    {
      label: "골드",
      b: riot.blue.gold,
      r: riot.red.gold,
      fmt: (n) => `${(n / 1000).toFixed(1)}k`,
    },
    { label: "포탑", b: riot.blue.towers, r: riot.red.towers },
    { label: "드래곤", b: riot.blue.dragons, r: riot.red.dragons },
    { label: "내셔 남작", b: riot.blue.barons, r: riot.red.barons },
  ];

  return (
    <div className="flex h-full flex-col px-24 pb-32 pt-20">
      <div className="flex items-end justify-between">
        <h2
          className="text-[64px] font-black leading-none text-white"
          style={{ animation: "rs-reveal 700ms cubic-bezier(.7,0,.2,1) both" }}
        >
          게임 흐름
        </h2>
        <div
          className="flex items-center gap-8 text-2xl font-black"
          style={{ animation: "rs-fade 500ms ease-out 300ms both" }}
        >
          <span className="flex items-center gap-2.5" style={{ color: blue }}>
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: blue }}
            />
            {teamDisplayName(match.blue, look.settings.teamLabel)}
          </span>
          <span className="flex items-center gap-2.5" style={{ color: red }}>
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: red }}
            />
            {teamDisplayName(match.red, look.settings.teamLabel)}
          </span>
        </div>
      </div>
      <div
        className="mt-8 min-h-0 flex-1 [&>*]:h-full"
        style={{ animation: "rs-zoom 700ms ease-out 250ms both" }}
      >
        {timeline ? (
          <TeamGoldChart
            timeline={timeline}
            teams={[
              {
                name: teamDisplayName(match.blue, look.settings.teamLabel),
                color: blue,
                puuids: riot.blue.puuids,
                riotTeamId: riot.blue.riotTeamId,
              },
              {
                name: teamDisplayName(match.red, look.settings.teamLabel),
                color: red,
                puuids: riot.red.puuids,
                riotTeamId: riot.red.riotTeamId,
              },
            ]}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl font-black text-white/30">
            {riot?.riotMatchId ? "골드 그래프 불러오는 중" : "골드 그래프 없음"}
          </div>
        )}
      </div>
      <div className="mt-6 grid grid-cols-5 gap-4">
        {rows.map((row, i) => {
          const total = row.b + row.r;
          const bluePct = total > 0 ? (row.b / total) * 100 : 50;
          const delay = 600 + i * 160;
          return (
            <div
              key={row.label}
              style={{ animation: `rs-rise 500ms ease-out ${delay}ms both` }}
            >
              <p className={`text-center ${LABEL}`}>{row.label}</p>
              <div className="mt-2 flex items-baseline justify-between text-[40px] font-black leading-none tabular-nums">
                <span style={{ color: blue }}>
                  <Count value={row.b} delay={delay} format={row.fmt} />
                </span>
                <span style={{ color: red }}>
                  <Count value={row.r} delay={delay} format={row.fmt} />
                </span>
              </div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="origin-left"
                  style={{
                    width: `${bluePct}%`,
                    background: blue,
                    animation: `rs-line 800ms ease-out ${delay}ms both`,
                  }}
                />
                <div
                  className="origin-right"
                  style={{
                    width: `${100 - bluePct}%`,
                    background: red,
                    animation: `rs-line 800ms ease-out ${delay}ms both`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 3·4. MVP / ACE — 챔피언 일러스트를 깔고 큰 글자로 비춘다 */
function SpotlightStage({
  label,
  caption,
  player,
  color,
  team,
  mirror = false,
}: {
  label: string;
  caption: string;
  player: any;
  color: string;
  team: any;
  mirror?: boolean;
}) {
  const { settings } = useBroadcastLook();
  if (!player) {
    return (
      <div className="flex h-full items-center justify-center text-5xl font-black text-white/30">
        {label} 기록 없음
      </div>
    );
  }
  const kda = (
    (player.kills + player.assists) /
    Math.max(1, player.deaths)
  ).toFixed(2);
  const fadeMask = mirror
    ? "linear-gradient(270deg, black 25%, transparent 75%)"
    : "linear-gradient(90deg, black 25%, transparent 75%)";
  return (
    <div className="relative h-full w-full">
      {/* 챔피언 일러스트 — 한쪽으로 밀어 두고 반대쪽으로 사라지게 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SPLASH(player.championName)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          animation: "rs-zoom 1400ms ease-out both",
          maskImage: fadeMask,
          WebkitMaskImage: fadeMask,
          opacity: 0.85,
        }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div
        className={`relative flex h-full flex-col justify-center px-32 ${
          mirror ? "items-start text-left" : "items-end text-right"
        }`}
      >
        <OutlineText
          color={color}
          className="text-[220px] font-black leading-none"
          style={{
            animation: "rs-stamp 800ms cubic-bezier(.2,.8,.2,1) both",
          }}
        >
          {label}
        </OutlineText>
        <p
          className="mt-3 text-2xl font-black"
          style={{ color, animation: "rs-rise 500ms ease-out 400ms both" }}
        >
          {caption}
          {team ? ` · ${teamDisplayName(team, settings.teamLabel)}` : ""}
        </p>
        <h2
          className="mt-4 max-w-[900px] truncate text-[96px] font-black leading-none text-white"
          style={{
            animation: "rs-reveal 700ms cubic-bezier(.7,0,.2,1) 500ms both",
          }}
        >
          {playerDisplayName(player, settings.nameDisplay) || "선수"}
        </h2>
        <div
          className="mt-8 flex gap-12"
          style={{ animation: "rs-rise 500ms ease-out 900ms both" }}
        >
          <SpotStat
            label="K / D / A"
            value={`${player.kills} / ${player.deaths} / ${player.assists}`}
          />
          <SpotStat label="KDA" value={kda} />
          <SpotStat
            label="챔피언 피해량"
            value={<Count value={player.damage} delay={900} />}
          />
        </div>
      </div>
    </div>
  );
}

function SpotStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className="mt-1.5 text-5xl font-black tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}

const LANE_KO: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

/**
 * 5. 전체 스코어보드 — 라인별로 마주본다(탑 vs 탑 …, 대회 중계식). 이 화면에서 멈춘다.
 * 머리는 승리 화면처럼 가운데 정렬: 방 제목 · 라운드, 그 아래 두 팀 이름과 킬 스코어.
 * 이긴 쪽은 그대로 밝게 + 바깥쪽 팀 색 띠, 진 쪽은 한 톤 어둡게 — 꾸밈 없이 대비로 가른다.
 */
function BoardStage({
  match,
  winner,
  roundLabel,
  roomName,
  animate,
}: {
  match: any;
  winner: any;
  roundLabel: string;
  roomName: string | null;
  animate: boolean;
}) {
  const look = useBroadcastLook();
  const riot = match.riot;
  const blue = sideColor(look, "blue", match.blue?.color);
  const red = sideColor(look, "red", match.red?.color);
  const blueWon = winner?.id === match.blue?.id;
  const redWon = winner?.id === match.red?.id;
  const maxDamage = Math.max(
    1,
    ...[...riot.blue.players, ...riot.red.players].map((p: any) => p.damage),
  );
  const lanes = Math.max(riot.blue.players.length, riot.red.players.length);
  const series = seriesScore(match);
  const duration = fmtDuration(riot.gameDuration);
  const rise = (delay: number) =>
    animate
      ? { animation: `rs-rise 500ms ease-out ${delay}ms both` }
      : undefined;

  return (
    <div className="flex h-full flex-col px-20 pb-32 pt-[120px]">
      {/* 머리 — 승리 화면과 같은 가운데 정렬 */}
      <div className="text-center" style={rise(0)}>
        {roomName && (
          <p className="truncate text-[28px] font-black text-white/80">
            {roomName}
          </p>
        )}
        <p className="mt-1 pl-[0.3em] text-xl font-black tracking-[0.3em] text-white/45">
          {roundLine(match, roundLabel)}
          {duration ? ` · ${duration}` : ""}
        </p>
      </div>
      <div
        className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-10"
        style={rise(120)}
      >
        <TeamHead
          name={teamDisplayName(match.blue, look.settings.teamLabel)}
          color={blue}
          won={blueWon}
          align="right"
        />
        {/* 다전제면 세트 스코어가 큰 숫자, 킬은 아래 작게. 단판은 세트가 늘 1:0 이라 킬을 크게 */}
        <div className="text-center">
          <p className="text-[96px] font-black leading-none tabular-nums">
            <span style={{ color: blueWon ? blue : "rgba(255,255,255,0.55)" }}>
              {series ? series.blue : riot.blue.kills}
            </span>
            <span className="mx-5 text-white/25">:</span>
            <span style={{ color: redWon ? red : "rgba(255,255,255,0.55)" }}>
              {series ? series.red : riot.red.kills}
            </span>
          </p>
          {series ? (
            <>
              <p className="mt-2 text-lg font-black text-white/50">
                {series.bestOf}판 {Math.ceil(series.bestOf / 2)}선승 · 세트
                스코어
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white/70">
                이번 세트 {riot.blue.kills} : {riot.red.kills} 킬
              </p>
            </>
          ) : (
            <p className="mt-2 text-xl font-black text-white/55">킬</p>
          )}
        </div>
        <TeamHead
          name={teamDisplayName(match.red, look.settings.teamLabel)}
          color={red}
          won={redWon}
          align="left"
        />
      </div>

      {/* 라인별 마주보기 */}
      <div className="mt-7 grid min-h-0 flex-1 content-center gap-2">
        {Array.from({ length: lanes }).map((_, i) => {
          const b = riot.blue.players[i];
          const r = riot.red.players[i];
          const lane = b?.position ?? r?.position ?? null;
          const roleIcon = lane ? getRoleIcon(lane) : null;
          return (
            <div
              key={i}
              className="grid h-[96px] grid-cols-[minmax(0,1fr)_76px_minmax(0,1fr)] items-stretch gap-4"
              style={
                animate
                  ? {
                      animation: `rs-row 450ms ease-out ${300 + i * 110}ms both`,
                    }
                  : undefined
              }
            >
              <LanePlayer
                player={b}
                color={blue}
                won={blueWon}
                side="left"
                maxDamage={maxDamage}
                riot={riot}
              />
              <div className="flex flex-col items-center justify-center border-x border-white/10">
                {roleIcon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={roleIcon}
                    alt=""
                    className="h-7 w-7 brightness-0 invert opacity-80"
                  />
                )}
                <span className="mt-1 text-sm font-black text-white/50">
                  {(lane && LANE_KO[lane]) ?? ""}
                </span>
              </div>
              <LanePlayer
                player={r}
                color={red}
                won={redWon}
                side="right"
                maxDamage={maxDamage}
                riot={riot}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamHead({
  name,
  color,
  won,
  align,
}: {
  name: string;
  color: string;
  won: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-4 ${
        align === "right" ? "flex-row-reverse text-right" : "text-left"
      }`}
    >
      <p
        className="min-w-0 truncate text-[52px] font-black leading-none"
        style={{ color: won ? color : "rgba(255,255,255,0.7)" }}
      >
        {name}
      </p>
      <span
        className="shrink-0 rounded-md px-3 py-1 text-xl font-black"
        style={
          won
            ? { background: color, color: "#fff" }
            : {
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.7)",
              }
        }
      >
        {won ? "승리" : "패배"}
      </span>
    </div>
  );
}

/** 한 라인의 한쪽 선수 — 왼쪽(블루)은 바깥→가운데, 오른쪽(레드)은 거울처럼 */
function LanePlayer({
  player,
  color,
  won,
  side,
  maxDamage,
  riot,
}: {
  player: any;
  color: string;
  won: boolean;
  side: "left" | "right";
  maxDamage: number;
  riot: any;
}) {
  const look = useBroadcastLook();
  if (!player) return <div className="rounded-xl bg-black/20" />;
  const isMvp = riot.mvp?.userId && player.userId === riot.mvp.userId;
  const isAce = riot.ace?.userId && player.userId === riot.ace.userId;
  const left = side === "left";
  const damagePct = (player.damage / maxDamage) * 100;

  const icon = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/champions/${player.championName}.png`}
      alt=""
      className="h-16 w-16 shrink-0 rounded-lg"
    />
  );
  const name = (
    <p
      className={`flex min-w-0 items-center gap-2 text-[26px] font-black text-white ${
        left ? "" : "flex-row-reverse"
      }`}
    >
      <span className="truncate">
        {playerDisplayName(player, look.settings.nameDisplay) || "—"}
      </span>
      {isMvp && (
        <span className="shrink-0 rounded bg-[#F6C945] px-2 py-0.5 text-sm font-black text-black">
          MVP
        </span>
      )}
      {isAce && (
        <span className="shrink-0 rounded bg-[#A78BFA] px-2 py-0.5 text-sm font-black text-black">
          ACE
        </span>
      )}
    </p>
  );
  const kda = (
    <p className="shrink-0 text-[28px] font-black tabular-nums text-white">
      {player.kills}/{player.deaths}/{player.assists}
    </p>
  );
  // 피해량 막대는 가운데(라인 칸) 쪽으로 자란다
  const damage = (
    <div className="w-[210px] shrink-0">
      <div
        className={`flex h-2 overflow-hidden rounded-full bg-white/10 ${
          left ? "justify-end" : "justify-start"
        }`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${damagePct}%`, background: color }}
        />
      </div>
      <p
        className={`mt-1 text-base font-black tabular-nums text-white/70 ${
          left ? "text-right" : "text-left"
        }`}
      >
        피해 {player.damage.toLocaleString()} · CS {player.cs}
      </p>
    </div>
  );

  return (
    <div
      className={`flex items-center gap-5 rounded-xl bg-black/35 px-5 ${
        won ? "" : "opacity-75"
      } ${left ? "" : "flex-row-reverse"}`}
    >
      {icon}
      <div className="min-w-0 flex-1">{name}</div>
      {kda}
      {damage}
    </div>
  );
}
