"use client";

import type { ReactNode } from "react";

/**
 * Nexus Broadcast HUD scenes.
 * 공통 언어: 검정 기반, 얇은 라인, 큰 숫자, 팀 컬러 포인트.
 */

const DEFAULT_ACCENT = "#8B5CF6";

const STATUS_LABELS: Record<string, string> = {
  WAITING: "대기 중",
  AUCTION: "경매 중",
  DRAFTING: "드래프트 중",
  DRAFT: "드래프트 중",
  ROLE_SELECTION: "역할 선택",
  ROLE_SELECT: "역할 선택",
  IN_PROGRESS: "경기 중",
  COMPLETED: "종료",
};

export function statusLabel(status?: string): string {
  if (!status) return "진행 중";
  return STATUS_LABELS[status] ?? status;
}

export function accentOf(snapshot: any): string {
  return snapshot?.theme?.accentColor || DEFAULT_ACCENT;
}

function HudLabel({
  children,
  color,
}: {
  children: string;
  color?: string;
}) {
  return (
    <p
      className="text-sm font-black uppercase tracking-[0.42em]"
      style={{ color: color ?? "rgba(255,255,255,0.42)" }}
    >
      {children}
    </p>
  );
}

function HudRule({ color }: { color: string }) {
  return (
    <div className="my-7 h-px w-full bg-white/10">
      <div className="h-px w-44" style={{ background: color }} />
    </div>
  );
}

function StageFrame({
  children,
  accent,
  showTopRule = true,
}: {
  children: ReactNode;
  accent: string;
  showTopRule?: boolean;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden text-white">
      {showTopRule && (
        <div
          className="absolute left-24 right-24 top-24 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}aa, transparent)`,
          }}
        />
      )}
      <div className="absolute bottom-28 left-24 right-24 h-px bg-white/8" />
      {children}
    </div>
  );
}

export function IdleScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const theme = snapshot?.theme;
  const title = theme?.clanName || snapshot?.streamer?.name || "NEXUS";

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full items-center px-28">
        <div className="w-full max-w-[1320px]">
          <div className="mb-8 flex items-center gap-5">
            {theme?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={theme.logo}
                alt=""
                className="h-16 w-16 rounded-sm object-cover"
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center border-y text-2xl font-black"
                style={{ borderColor: accent }}
              >
                NX
              </div>
            )}
            <div>
              <HudLabel color={accent}>NEXUS LIVE</HudLabel>
              <p className="mt-2 text-2xl font-black text-white/72">{title}</p>
            </div>
          </div>
          <HudRule color={accent} />
          <h1 className="text-[86px] font-black leading-[0.96] tracking-normal text-white">
            곧 방송을 시작합니다
          </h1>
          <p className="mt-8 text-2xl font-black uppercase tracking-[0.34em] text-white/36">
            Standby
          </p>
        </div>
      </div>
    </StageFrame>
  );
}

export function WaitingScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const room = snapshot?.room ?? {};
  const count = room.participantCount ?? 0;
  const max = room.maxParticipants ?? 10;
  const progress = Math.max(0, Math.min(100, (count / Math.max(max, 1)) * 100));

  return (
    <StageFrame accent={accent}>
      <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_420px] items-center gap-16 px-28">
        <div className="min-w-0">
          <HudLabel color={accent}>WAITING ROOM</HudLabel>
          <h1 className="mt-6 max-w-[1180px] text-[82px] font-black leading-[0.96] tracking-normal text-white">
            {room.name ?? "내전 대기 중"}
          </h1>
          <HudRule color={accent} />
          <p className="text-2xl font-black uppercase tracking-[0.32em] text-white/38">
            Nexus Custom Match
          </p>
        </div>

        <div className="border-y border-white/12 py-9">
          <HudLabel color={accent}>PLAYERS</HudLabel>
          <div className="mt-5 flex items-end gap-4">
            <span className="text-[132px] font-black leading-none text-white">
              {count}
            </span>
            <span className="mb-4 text-[44px] font-black leading-none text-white/35">
              / {max}
            </span>
          </div>
          <div className="mt-7 h-2 bg-white/10">
            <div
              className="h-full"
              style={{ width: `${progress}%`, background: accent }}
            />
          </div>
          <p className="mt-5 text-lg font-black text-white/44">모이는 중</p>
        </div>
      </div>
    </StageFrame>
  );
}

export function AuctionScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const teams: any[] = snapshot?.teams ?? [];

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col px-24 py-24">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <HudLabel color={accent}>AUCTION DRAFT</HudLabel>
            <h1 className="mt-3 text-6xl font-black text-white">경매 진행</h1>
          </div>
          <p className="max-w-[720px] truncate text-right text-2xl font-black text-white/54">
            {snapshot?.room?.name ?? ""}
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 content-center gap-x-12 gap-y-5 xl:grid-cols-4">
          {teams.map((team, index) => {
            const teamColor = team.color || accent;
            const budget = team.remainingBudget ?? team.remainingGold ?? 0;
            const members = team.members ?? [];
            return (
              <div
                key={team.id ?? index}
                className="min-w-0 border-t border-white/12 px-1 py-5"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: teamColor }}
                  />
                  <p className="min-w-0 flex-1 truncate text-2xl font-black text-white">
                    {team.name}
                  </p>
                </div>
                <p className="mb-4 text-xl font-black tabular-nums text-amber-300">
                  {Number(budget).toLocaleString()}G
                </p>
                <div className="grid gap-1.5">
                  {members.slice(0, 5).map((member: any) => (
                    <div
                      key={member.userId ?? member.id ?? member.username}
                      className="grid grid-cols-[minmax(0,1fr)_64px] gap-2 text-sm font-bold text-white/72"
                    >
                      <span className="truncate">{member.username ?? "-"}</span>
                      <span className="text-right text-white/34">
                        {member.soldPrice != null ? `${member.soldPrice}G` : ""}
                      </span>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <p className="text-sm font-bold text-white/26">영입 대기</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </StageFrame>
  );
}

function TeamPlate({
  team,
  side,
  win,
  lose,
}: {
  team: any;
  side: "BLUE" | "RED";
  win: boolean;
  lose: boolean;
}) {
  const sideColor = side === "BLUE" ? "#3B82F6" : "#EF4444";
  const teamColor = team?.color || sideColor;

  return (
    <div
      className="min-w-[500px] border-y px-8 py-5 transition-all duration-500"
      style={{
        borderColor: win ? teamColor : "rgba(255,255,255,0.12)",
        opacity: lose ? 0.42 : 1,
        filter: lose ? "grayscale(0.7)" : "none",
        background: "rgba(5,6,10,0.72)",
      }}
    >
      <div className="mb-2 flex items-center gap-3">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: sideColor }}
        />
        <span className="text-xs font-black uppercase tracking-[0.34em] text-white/38">
          {side} SIDE
        </span>
        {win && (
          <span
            className="text-xs font-black uppercase tracking-[0.24em]"
            style={{ color: teamColor }}
          >
            WIN
          </span>
        )}
      </div>
      <p className="truncate text-[46px] font-black leading-none text-white">
        {team?.name ?? "미정"}
      </p>
    </div>
  );
}

export function MatchScene({ snapshot }: { snapshot: any }) {
  const match = snapshot?.match;
  const accent = accentOf(snapshot);

  if (!match) {
    return (
      <StageFrame accent={accent}>
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-4xl font-black uppercase tracking-widest text-white/30">
            No Live Match
          </p>
        </div>
      </StageFrame>
    );
  }

  const done = match.status === "COMPLETED";
  const blueWin = done && match.winnerId && match.winnerId === match.blue?.id;
  const redWin = done && match.winnerId && match.winnerId === match.red?.id;
  const roundLabel =
    match.bracketRound ||
    (match.round != null ? `${match.round}라운드` : "경기");

  return (
    <StageFrame accent={accent} showTopRule={false}>
      <div className="flex w-full justify-center pt-10">
        <div className="flex items-center gap-6">
          <TeamPlate
            team={match.blue}
            side="BLUE"
            win={!!blueWin}
            lose={!!redWin}
          />

          <div className="flex min-w-[160px] flex-col items-center">
            <span className="text-xs font-black uppercase tracking-[0.34em] text-white/38">
              {roundLabel}
            </span>
            <span className="mt-2 text-5xl font-black italic leading-none text-white">
              VS
            </span>
            <span
              className="mt-2 text-xs font-black uppercase tracking-[0.28em]"
              style={{ color: done ? "#9CA3AF" : "#F87171" }}
            >
              {done ? "FINAL" : "LIVE"}
            </span>
          </div>

          <TeamPlate
            team={match.red}
            side="RED"
            win={!!redWin}
            lose={!!blueWin}
          />
        </div>
      </div>
    </StageFrame>
  );
}

function rpsStatusOf(match: any) {
  if (match?.status === "COMPLETED") return "완료";
  if (match?.blueSideTeamId) return "진영 결정 완료";
  return "RPS 대기";
}

function BracketMatchCard({
  match,
  accent,
  focused,
}: {
  match: any;
  accent: string;
  focused: boolean;
}) {
  const blue = match?.blue ?? null;
  const red = match?.red ?? null;
  const hasSides = !!match?.blueSideTeamId;
  const winnerId = match?.winnerId;
  const blueWin = winnerId && winnerId === blue?.id;
  const redWin = winnerId && winnerId === red?.id;

  return (
    <div
      className="border-y px-4 py-3"
      style={{
        borderColor: focused ? accent : "rgba(255,255,255,0.1)",
        background: focused ? "rgba(255,255,255,0.055)" : "rgba(5,6,10,0.58)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-[0.28em] text-white/34">
          Match {match?.matchNumber ?? "-"}
        </span>
        <span
          className="text-[11px] font-black uppercase tracking-[0.18em]"
          style={{ color: hasSides ? "#86EFAC" : "#F6C945" }}
        >
          {rpsStatusOf(match)}
        </span>
      </div>

      <div className="grid gap-2">
        <BracketTeamRow
          team={blue}
          side={hasSides ? "BLUE" : "A"}
          color="#3B82F6"
          win={!!blueWin}
        />
        <BracketTeamRow
          team={red}
          side={hasSides ? "RED" : "B"}
          color="#EF4444"
          win={!!redWin}
        />
      </div>
    </div>
  );
}

function BracketTeamRow({
  team,
  side,
  color,
  win,
}: {
  team: any;
  side: string;
  color: string;
  win: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[52px_minmax(0,1fr)_42px] items-center gap-3"
      style={{ opacity: team ? 1 : 0.38 }}
    >
      <span
        className="text-[11px] font-black uppercase tracking-[0.16em]"
        style={{ color }}
      >
        {side}
      </span>
      <span className="truncate text-base font-black text-white">
        {team?.name ?? "미정"}
      </span>
      {win && (
        <span className="text-right text-[11px] font-black uppercase text-amber-300">
          WIN
        </span>
      )}
    </div>
  );
}

export function BracketScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const matches: any[] = snapshot?.matches ?? [];
  const focusMatchId = snapshot?.focusMatchId ?? null;
  const rounds = [...new Set(matches.map((match) => match.round ?? 1))].sort(
    (a, b) => Number(a) - Number(b),
  );

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col px-24 py-24">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <HudLabel color={accent}>TOURNAMENT BRACKET</HudLabel>
            <h1 className="mt-3 text-6xl font-black text-white">대진표</h1>
          </div>
          <div className="text-right">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-white/34">
              Side Selection
            </p>
            <p className="mt-2 text-2xl font-black text-white/58">
              RPS 현황 포함
            </p>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="flex flex-1 items-center justify-center border-y border-white/10">
            <p className="text-3xl font-black text-white/32">
              대진표가 아직 생성되지 않았습니다
            </p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-6 overflow-hidden">
            {rounds.map((round) => {
              const roundMatches = matches.filter(
                (match) => (match.round ?? 1) === round,
              );
              const label =
                roundMatches[0]?.bracketRound ??
                (roundMatches.length === 1 ? "결승" : `${round}라운드`);

              return (
                <section key={round} className="flex min-w-0 flex-col">
                  <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                    <p className="text-sm font-black uppercase tracking-[0.28em] text-white/42">
                      {label}
                    </p>
                    <span className="text-xs font-black text-white/28">
                      {roundMatches.length} MATCH
                    </span>
                  </div>
                  <div className="grid flex-1 content-center gap-4">
                    {roundMatches.map((match) => (
                      <BracketMatchCard
                        key={match.id}
                        match={match}
                        accent={accent}
                        focused={match.id === focusMatchId}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </StageFrame>
  );
}

export function RoomScene({ snapshot }: { snapshot: any }) {
  const status = snapshot?.room?.status;
  const teamMode = snapshot?.room?.teamMode;
  if (status === "AUCTION" || (status === "DRAFT" && teamMode === "AUCTION")) {
    return <AuctionScene snapshot={snapshot} />;
  }
  return <WaitingScene snapshot={snapshot} />;
}
