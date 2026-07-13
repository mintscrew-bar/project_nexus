"use client";

import { useEffect, useState } from "react";
import {
  useBroadcastSnakeDraft,
  type DraftPlayer,
  type DraftTeam,
} from "../_live/useBroadcastSnakeDraft";
import { StageFrame, HudLabel, accentOf } from "./scenes";

/**
 * 라이브 스네이크 드래프트 방송 컨테이너 — 방송 토큰으로 /snake-draft를
 * read-only 구독하고 픽 진행(턴/타이머/로스터)을 실시간으로 그린다.
 * 경매의 BroadcastAuctionLive와 같은 위상: 정적 스냅샷 대신 라이브 중계.
 */

const TIER_LABELS: Record<string, string> = {
  IRON: "I",
  BRONZE: "B",
  SILVER: "S",
  GOLD: "G",
  PLATINUM: "P",
  EMERALD: "E",
  DIAMOND: "D",
  MASTER: "M",
  GRANDMASTER: "GM",
  CHALLENGER: "C",
  UNRANKED: "–",
};

function tierBadge(player: DraftPlayer) {
  const tier = (player.tier ?? "UNRANKED").toUpperCase();
  const label = TIER_LABELS[tier] ?? tier.slice(0, 2);
  return player.rank ? `${label}${player.rank}` : label;
}

/** 팀당 목표 인원 — 5인 고정(칸 수 표시용). 초과 인원도 그대로 그려진다. */
const ROSTER_SLOTS = 5;

function CountdownTimer({ timerEnd }: { timerEnd: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timerEnd) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [timerEnd]);

  if (!timerEnd) return null;
  const remaining = Math.max(0, Math.ceil((timerEnd - now) / 1000));
  const urgent = remaining <= 10;

  return (
    <p
      className="font-mono text-8xl font-black tabular-nums leading-none"
      style={{ color: urgent ? "#f87171" : "white" }}
    >
      {remaining}
    </p>
  );
}

function TeamColumn({
  team,
  isPicking,
  accent,
  lastPickPlayerId,
}: {
  team: DraftTeam;
  isPicking: boolean;
  accent: string;
  lastPickPlayerId: string | null;
}) {
  const teamColor = team.color || accent;
  const slots = Math.max(ROSTER_SLOTS, team.members.length);

  return (
    <div
      className="flex min-w-0 flex-1 flex-col border bg-black/45 px-7 py-6 transition-all duration-300"
      style={{
        borderColor: isPicking ? teamColor : "rgba(255,255,255,0.12)",
        boxShadow: isPicking ? `0 0 42px ${teamColor}55` : "none",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-8 w-1.5 flex-shrink-0"
            style={{ background: teamColor }}
          />
          <p className="truncate text-3xl font-black">{team.name}</p>
        </div>
        {isPicking && (
          <span
            className="flex-shrink-0 animate-pulse px-3 py-1 text-sm font-black uppercase tracking-[0.3em]"
            style={{ background: teamColor, color: "#05070d" }}
          >
            PICKING
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-1 flex-col gap-2.5">
        {Array.from({ length: slots }).map((_, i) => {
          const member = team.members[i];
          if (!member) {
            return (
              <div
                key={`empty-${i}`}
                className="flex h-14 items-center border border-dashed border-white/14 px-4 text-lg font-bold text-white/22"
              >
                —
              </div>
            );
          }
          const justPicked = member.id === lastPickPlayerId;
          return (
            <div
              key={member.id}
              className="flex h-14 items-center justify-between border px-4 transition-colors duration-500"
              style={{
                borderColor: justPicked ? teamColor : "rgba(255,255,255,0.14)",
                background: justPicked ? `${teamColor}26` : "rgba(255,255,255,0.05)",
              }}
            >
              <p className="truncate text-xl font-bold">
                {member.username}
                {member.id === team.captainId && (
                  <span className="ml-2 text-sm font-black" style={{ color: teamColor }}>
                    C
                  </span>
                )}
              </p>
              <span className="ml-3 flex-shrink-0 text-base font-black text-white/55">
                {tierBadge(member)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BroadcastSnakeDraftLive({
  token,
  roomId,
  snapshot,
}: {
  token: string;
  roomId: string;
  snapshot: any;
}) {
  const accent = accentOf(snapshot);
  const draft = useBroadcastSnakeDraft(token, roomId);
  const roomName = snapshot?.room?.name ?? "";

  const pickingTeam = draft.teams.find((t) => t.id === draft.currentTeamId);
  const complete = draft.status === "COMPLETED";

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col px-24 pb-36 pt-16">
        {/* 헤더: 단계 라벨 + 방 이름 + 타이머 */}
        <div className="flex items-end justify-between gap-8">
          <div className="min-w-0">
            <HudLabel color={accent}>SNAKE DRAFT</HudLabel>
            <p className="mt-2 truncate text-5xl font-black">{roomName}</p>
          </div>
          <div className="flex flex-shrink-0 items-end gap-8 text-right">
            {complete ? (
              <p
                className="text-6xl font-black uppercase tracking-[0.14em]"
                style={{ color: accent }}
              >
                Draft Complete
              </p>
            ) : draft.status === "IN_PROGRESS" ? (
              <>
                <div>
                  <HudLabel>ON THE CLOCK</HudLabel>
                  <p
                    className="mt-1 max-w-[560px] truncate text-5xl font-black"
                    style={{ color: pickingTeam?.color || accent }}
                  >
                    {pickingTeam?.name ?? "—"}
                  </p>
                </div>
                <CountdownTimer timerEnd={draft.timerEnd} />
              </>
            ) : (
              <p className="text-4xl font-black text-white/45">
                드래프트 준비 중
              </p>
            )}
          </div>
        </div>

        <div className="my-7 h-px w-full bg-white/10">
          <div className="h-px w-44" style={{ background: accent }} />
        </div>

        {/* 팀 로스터 — 픽 순서대로 정렬, 현재 픽 팀 강조 */}
        <div className="flex min-h-0 flex-1 gap-6">
          {(draft.teams.length > 0
            ? draft.teams
            : (snapshot?.teams ?? []).map((t: any) => ({
                id: t.id,
                name: t.name,
                captainId: t.captainId,
                color: t.color,
                members: (t.members ?? []).map((m: any) => ({
                  id: m.userId,
                  username: m.username ?? "—",
                  tier: m.tier ?? "UNRANKED",
                })),
              }))
          ).map((team: DraftTeam) => (
            <TeamColumn
              key={team.id}
              team={team}
              isPicking={!complete && team.id === draft.currentTeamId}
              accent={accent}
              lastPickPlayerId={draft.lastPick?.player?.id ?? null}
            />
          ))}
        </div>

        {/* 남은 선수 풀 */}
        {!complete && draft.availablePlayers.length > 0 && (
          <div className="mt-6">
            <HudLabel>{`AVAILABLE — ${String(draft.availablePlayers.length)}`}</HudLabel>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {draft.availablePlayers.slice(0, 18).map((player) => (
                <span
                  key={player.id}
                  className="flex items-center gap-2 border border-white/14 bg-white/6 px-3.5 py-1.5 text-lg font-bold"
                >
                  {player.username}
                  <span className="text-sm font-black text-white/45">
                    {tierBadge(player)}
                  </span>
                </span>
              ))}
              {draft.availablePlayers.length > 18 && (
                <span className="flex items-center px-2 text-lg font-bold text-white/45">
                  +{draft.availablePlayers.length - 18}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </StageFrame>
  );
}
