"use client";

import { sideColor, teamDisplayName, useBroadcastLook } from "./look";
import { StageBackground } from "./scenes";

/**
 * 1세트 진영 결정(팀장 가위바위보) 중계 장면.
 *
 * 흐름: 양 팀장 제출 대기 → 손 공개(무승부면 다시) → 이긴 팀이 진영 고르는 중 → 블루/레드 확정.
 * 서버 match 게이트웨이가 bracket 방에 "broadcast-rps" 로 흘려 주는 상태를 그대로 그린다.
 * 손은 공개(reveal) 이벤트에만 실려 오므로 제출 단계에서는 "제출 완료"만 보인다.
 *
 * 2세트부터는 가위바위보 없이 직전 세트와 진영이 자동 교대된다 — 그건 SideSwapScene.
 */

export interface BroadcastRpsLive {
  state: {
    matchId: string;
    phase: "throw" | "side" | "done";
    teamAId: string;
    teamBId: string;
    captainAId: string;
    captainBId: string;
    submitted: string[];
    winnerTeamId: string | null;
    blueSideTeamId: string | null;
  } | null;
  reveal: {
    handA: "rock" | "paper" | "scissors";
    handB: "rock" | "paper" | "scissors";
    tie: boolean;
    winnerTeamId: string | null;
  } | null;
  done: { blueSideTeamId: string; redSideTeamId: string } | null;
}

const HAND: Record<string, { emoji: string; label: string }> = {
  scissors: { emoji: "✌️", label: "가위" },
  rock: { emoji: "✊", label: "바위" },
  paper: { emoji: "✋", label: "보" },
};

const CSS = `
@keyframes rps-pop { 0% { opacity: 0; transform: scale(0.4) rotate(-12deg); } 70% { opacity: 1; transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes rps-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
@keyframes rps-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
`;

export function RpsBroadcastScene({
  snapshot,
  rps,
}: {
  snapshot: any;
  rps: BroadcastRpsLive;
}) {
  const look = useBroadcastLook();
  const state = rps.state;
  if (!state) return null;
  const teams: any[] = snapshot?.teams ?? [];
  const teamA = teams.find((t) => t.id === state.teamAId) ?? null;
  const teamB = teams.find((t) => t.id === state.teamBId) ?? null;
  const title = look.settings.title ?? snapshot?.room?.name ?? null;

  // 확정 — 블루/레드를 크게 공개
  const blueId = rps.done?.blueSideTeamId ?? state.blueSideTeamId;
  if (blueId) {
    const blueTeam = blueId === state.teamAId ? teamA : teamB;
    const redTeam = blueId === state.teamAId ? teamB : teamA;
    return (
      <Frame accent={look.accent} title={title} label="진영 확정">
        <div className="mt-14 grid w-full max-w-[1500px] grid-cols-2 gap-10">
          {[
            { side: "블루", team: blueTeam, color: sideColor(look, "blue") },
            { side: "레드", team: redTeam, color: sideColor(look, "red") },
          ].map((item, i) => (
            <div
              key={item.side}
              className="rounded-2xl px-10 py-12 text-center"
              style={{
                background: `${item.color}22`,
                boxShadow: `inset 0 0 0 3px ${item.color}`,
                animation: `rps-rise 600ms ease-out ${i * 150}ms both`,
              }}
            >
              <p
                className="text-[40px] font-black"
                style={{ color: item.color }}
              >
                {item.side}
              </p>
              <p className="mt-4 truncate text-[96px] font-black leading-none text-white">
                {teamDisplayName(item.team, look.settings.teamLabel) || "—"}
              </p>
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  const revealed = rps.reveal;
  const winnerTeamId = state.winnerTeamId ?? revealed?.winnerTeamId ?? null;
  const picking = state.phase === "side" && winnerTeamId;
  const pickerTeam = winnerTeamId === state.teamAId ? teamA : teamB;

  return (
    <Frame
      accent={look.accent}
      title={title}
      label={picking ? "진영 선택 중" : "진영 결정 · 가위바위보"}
    >
      <div className="mt-14 grid w-full max-w-[1500px] grid-cols-[1fr_auto_1fr] items-center gap-12">
        <CaptainCard
          team={teamA}
          captainId={state.captainAId}
          submitted={state.submitted.includes(state.captainAId)}
          hand={revealed?.handA ?? null}
          won={!!winnerTeamId && winnerTeamId === state.teamAId}
          lost={!!winnerTeamId && winnerTeamId !== state.teamAId}
        />
        <p className="text-[72px] font-black text-white/25">VS</p>
        <CaptainCard
          team={teamB}
          captainId={state.captainBId}
          submitted={state.submitted.includes(state.captainBId)}
          hand={revealed?.handB ?? null}
          won={!!winnerTeamId && winnerTeamId === state.teamBId}
          lost={!!winnerTeamId && winnerTeamId !== state.teamBId}
        />
      </div>
      <p
        className="mt-14 text-[40px] font-black text-white/80"
        style={{ animation: "rps-rise 500ms ease-out both" }}
        key={`${state.phase}-${revealed?.tie ? "tie" : "go"}`}
      >
        {picking
          ? `${teamDisplayName(pickerTeam, look.settings.teamLabel)} 팀장이 블루·레드 중 고르는 중`
          : revealed?.tie
            ? "무승부 — 다시 냅니다"
            : "양 팀장이 가위바위보로 진영 선택권을 가립니다"}
      </p>
    </Frame>
  );
}

function Frame({
  accent,
  title,
  label,
  children,
}: {
  accent: string;
  title: string | null;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <style>{CSS}</style>
      <StageBackground accent={accent} />
      <div className="relative flex h-full flex-col items-center justify-center px-24 pb-16 text-center">
        {title && (
          <p className="max-w-[1400px] truncate text-[32px] font-black text-white/75">
            {title}
          </p>
        )}
        <h1 className="mt-4 text-[72px] font-black leading-none text-white">
          {label}
        </h1>
        {children}
      </div>
    </div>
  );
}

function CaptainCard({
  team,
  captainId,
  submitted,
  hand,
  won,
  lost,
}: {
  team: any;
  captainId: string;
  submitted: boolean;
  hand: string | null;
  won: boolean;
  lost: boolean;
}) {
  const look = useBroadcastLook();
  const color = team?.color ?? look.accent;
  const captain =
    team?.members?.find((m: any) => m.userId === captainId)?.username ??
    team?.captainName ??
    "팀장";
  return (
    <div
      className={`rounded-2xl bg-black/40 px-8 py-10 text-center transition-opacity ${
        lost ? "opacity-45" : ""
      }`}
      style={{
        boxShadow: won
          ? `inset 0 0 0 4px ${color}`
          : "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <p
        className="truncate text-[52px] font-black leading-none"
        style={{ color }}
      >
        {teamDisplayName(team, look.settings.teamLabel) || "팀"}
      </p>
      <p className="mt-3 truncate text-2xl font-black text-white/55">
        팀장 {captain}
      </p>
      <div className="mt-8 flex h-[150px] items-center justify-center">
        {hand ? (
          <span
            className="text-[130px] leading-none"
            style={{
              // 시스템마다 기본 글꼴이 이모지를 못 그릴 수 있어 이모지 글꼴을 직접 고른다
              fontFamily:
                "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif",
              animation: "rps-pop 600ms cubic-bezier(.2,.8,.2,1) both",
            }}
          >
            {HAND[hand]?.emoji}
          </span>
        ) : (
          <span
            className={`text-[34px] font-black ${submitted ? "text-white" : "text-white/40"}`}
            style={
              submitted
                ? undefined
                : { animation: "rps-pulse 1.4s ease-in-out infinite" }
            }
          >
            {submitted ? "제출 완료" : "고르는 중…"}
          </span>
        )}
      </div>
      {hand && (
        <p className="mt-2 text-2xl font-black text-white/60">
          {HAND[hand]?.label}
        </p>
      )}
      {won && (
        <p className="mt-4 text-3xl font-black" style={{ color }}>
          진영 선택권
        </p>
      )}
    </div>
  );
}
