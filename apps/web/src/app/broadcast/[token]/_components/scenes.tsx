"use client";

import type { ReactNode } from "react";

/**
 * Nexus Broadcast HUD scenes.
 * 공통 언어: 검정 기반, 얇은 라인, 큰 숫자, 팀 컬러 포인트.
 */

const DEFAULT_ACCENT = "#8B5CF6";

const broadcastBgCss = `
@keyframes nexus-live-bg-pan {
  0% { transform: translate3d(-3%, -2%, 0) scale(1.04); }
  50% { transform: translate3d(3%, 2%, 0) scale(1.08); }
  100% { transform: translate3d(-3%, -2%, 0) scale(1.04); }
}
@keyframes nexus-live-scan {
  0% { transform: translateX(-22%); opacity: 0.18; }
  50% { opacity: 0.34; }
  100% { transform: translateX(22%); opacity: 0.18; }
}
@keyframes nexus-roster-in-left {
  from { opacity: 0; transform: translate3d(-44px, 0, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes nexus-roster-in-right {
  from { opacity: 0; transform: translate3d(44px, 0, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes nexus-result-rise {
  from { opacity: 0; transform: translate3d(0, 24px, 0) scale(0.98); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
`;

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

export function HudLabel({
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

export function StageFrame({
  children,
  accent,
  showTopRule = true,
}: {
  children: ReactNode;
  accent: string;
  showTopRule?: boolean;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d] text-white">
      <style>{broadcastBgCss}</style>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -inset-[12%]"
          style={{
            animation: "nexus-live-bg-pan 16s ease-in-out infinite",
            background:
              "radial-gradient(circle at 18% 20%, rgba(0,177,255,0.18), transparent 28%), radial-gradient(circle at 76% 28%, rgba(245,158,11,0.14), transparent 24%), radial-gradient(circle at 54% 82%, rgba(139,92,246,0.18), transparent 32%), linear-gradient(135deg, #061018 0%, #070812 45%, #120816 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          className="absolute -inset-y-20 left-0 w-full"
          style={{
            animation: "nexus-live-scan 9s ease-in-out infinite",
            background:
              "linear-gradient(100deg, transparent 0%, rgba(0,177,255,0.08) 36%, rgba(255,255,255,0.07) 50%, rgba(245,158,11,0.06) 64%, transparent 100%)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.42)_72%,rgba(0,0,0,0.72)_100%)]" />
      </div>
      {showTopRule && (
        <div
          className="absolute left-24 right-24 top-24 z-10 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}aa, transparent)`,
          }}
        />
      )}
      <div className="absolute bottom-28 left-24 right-24 z-10 h-px bg-white/8" />
      <div className="relative z-10 h-full w-full">{children}</div>
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

/** 경기 사이 휴식(브레이크) 화면 — 대기(Idle)와 구분되는 별도 장면. */
export function BreakScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const theme = snapshot?.theme;
  const title = theme?.clanName || snapshot?.room?.name || "NEXUS";

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
              <HudLabel color={accent}>BREAK TIME</HudLabel>
              <p className="mt-2 text-2xl font-black text-white/72">{title}</p>
            </div>
          </div>
          <HudRule color={accent} />
          <h1 className="text-[86px] font-black leading-[0.96] tracking-normal text-white">
            잠시 후 계속됩니다
          </h1>
          <p className="mt-8 text-2xl font-black uppercase tracking-[0.34em] text-white/36">
            Be Right Back
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
  const participants: any[] = room.participants ?? [];
  const progress = Math.max(0, Math.min(100, (count / Math.max(max, 1)) * 100));
  const participantColumns =
    participants.length > 36
      ? "grid-cols-8"
      : participants.length > 25
        ? "grid-cols-6"
        : "grid-cols-5";
  const participantCell =
    participants.length > 36
      ? "gap-1 px-2 py-1.5 text-[11px]"
      : participants.length > 25
        ? "gap-1.5 px-2.5 py-2 text-xs"
        : "gap-2 px-3 py-2.5 text-sm";
  const badgeText =
    participants.length > 36
      ? "text-[8px]"
      : participants.length > 25
        ? "text-[9px]"
        : "text-[10px]";

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col justify-center gap-12 px-28 py-24">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_420px] items-center gap-16">
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

        {participants.length > 0 && (
          <div className="border-y border-white/10 py-6">
            <div className="mb-4 flex items-center justify-between">
              <HudLabel color={accent}>WAITING PLAYERS</HudLabel>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-white/32">
                {participants.length} Players
              </p>
            </div>
            <div className={`grid ${participantColumns} gap-2.5`}>
              {participants.map((participant, index) => (
                <div
                  key={participant.userId ?? index}
                  className={`flex min-w-0 items-center border-l border-white/12 bg-white/[0.035] ${participantCell}`}
                >
                  <span className="w-5 shrink-0 text-xs font-black text-white/28">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-black text-white/84">
                    {participant.username ?? "대기자"}
                  </span>
                  {participant.isCaptain && (
                    <span
                      className={`shrink-0 font-black uppercase ${badgeText}`}
                      style={{ color: accent }}
                    >
                      CAP
                    </span>
                  )}
                  {participant.isReady && !participant.isCaptain && (
                    <span
                      className={`shrink-0 font-black uppercase text-emerald-300 ${badgeText}`}
                    >
                      READY
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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

// 롤 관전 오버레이용: 상단 게임 점수창 양옆에 붙는 팀 플랭크
function MatchFlank({
  team,
  side,
  score,
  win,
  lose,
  align,
}: {
  team: any;
  side: "BLUE" | "RED";
  score: number;
  win: boolean;
  lose: boolean;
  align: "left" | "right";
}) {
  const sideColor = side === "BLUE" ? "#3B82F6" : "#EF4444";
  const teamColor = team?.color || sideColor;
  const right = align === "right";

  const bar = (
    <span
      className="h-16 w-1.5 shrink-0 rounded-full"
      style={{ background: sideColor, boxShadow: `0 0 18px ${sideColor}` }}
    />
  );
  const scoreEl = (
    <span
      className="text-[64px] font-black tabular-nums leading-none"
      style={{ color: win ? teamColor : "#FFFFFF" }}
    >
      {score}
    </span>
  );
  const info = (
    <div className={right ? "min-w-0 text-right" : "min-w-0 text-left"}>
      <div
        className="flex items-center gap-2"
        style={{ justifyContent: right ? "flex-end" : "flex-start" }}
      >
        <span className="text-[11px] font-black uppercase tracking-[0.34em] text-white/45">
          {side} SIDE
        </span>
        {win && (
          <span
            className="text-[11px] font-black uppercase tracking-[0.24em]"
            style={{ color: teamColor }}
          >
            WIN
          </span>
        )}
      </div>
      <p className="max-w-[440px] truncate text-[34px] font-black leading-tight text-white">
        {team?.name ?? "미정"}
      </p>
    </div>
  );

  return (
    <div
      className="flex items-center gap-5 transition-all duration-500"
      style={{
        opacity: lose ? 0.45 : 1,
        filter: lose ? "grayscale(0.65)" : "none",
      }}
    >
      {right ? (
        <>
          {info}
          {scoreEl}
          {bar}
        </>
      ) : (
        <>
          {bar}
          {scoreEl}
          {info}
        </>
      )}
    </div>
  );
}

export function MatchScene({ snapshot }: { snapshot: any }) {
  const match = snapshot?.match;
  const accent = accentOf(snapshot);

  if (!match) {
    return (
      <StageFrame accent={accent} showTopRule={false}>
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
  // 시리즈 스코어 필드가 있으면 사용, 없으면 승패 기반 폴백
  const blueScore = match.blueScore ?? (blueWin ? 1 : 0);
  const redScore = match.redScore ?? (redWin ? 1 : 0);
  const roundLabel =
    match.bracketRound ||
    (match.round != null ? `${match.round}라운드` : "경기");

  return (
    // 롤 관전 위에 합성되는 오버레이라 배경 없이 투명하게 띄운다.
    <div className="relative h-full w-full text-white">
      {/* 상단: 게임 점수창 양옆 플랭킹 — 중앙(게임 점수·타이머)은 비운다 */}
      <div className="absolute inset-x-0 top-7 flex justify-center">
        <div className="flex items-center gap-[600px]">
          <MatchFlank
            team={match.blue}
            side="BLUE"
            score={blueScore}
            win={!!blueWin}
            lose={!!redWin}
            align="right"
          />
          <MatchFlank
            team={match.red}
            side="RED"
            score={redScore}
            win={!!redWin}
            lose={!!blueWin}
            align="left"
          />
        </div>
      </div>

      {/* 라운드/경기 캡션 — 상단 중앙, 게임 점수창 아래 (위치는 조정 가능) */}
      <div className="absolute inset-x-0 top-[150px] flex justify-center">
        <div className="flex items-center gap-3 border-y border-white/12 bg-black/60 px-6 py-2 backdrop-blur">
          <span className="text-sm font-black uppercase tracking-[0.3em] text-white/72">
            {roundLabel}
          </span>
          {match.matchNumber != null && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-sm font-black uppercase tracking-[0.2em] text-white/40">
                Match {match.matchNumber}
              </span>
            </>
          )}
          <span className="text-white/20">·</span>
          <span
            className="text-sm font-black uppercase tracking-[0.28em]"
            style={{ color: done ? "#9CA3AF" : "#F87171" }}
          >
            {done ? "Final" : "Live"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MatchResultScene({ snapshot }: { snapshot: any }) {
  const match = snapshot?.match;
  const accent = accentOf(snapshot);
  if (!match) return <MatchScene snapshot={snapshot} />;

  const winner =
    match.winnerId === match.blue?.id
      ? match.blue
      : match.winnerId === match.red?.id
        ? match.red
        : null;
  const loser = winner?.id === match.blue?.id ? match.red : match.blue;
  const roundLabel =
    match.bracketRound ||
    (match.round != null ? `${match.round}라운드` : "경기");

  return (
    <StageFrame accent={winner?.color ?? accent}>
      <div className="flex h-full w-full flex-col items-center justify-center px-24 text-center">
        <div style={{ animation: "nexus-result-rise 700ms ease-out both" }}>
          <HudLabel color={winner?.color ?? accent}>MATCH RESULT</HudLabel>
          <p className="mt-4 text-xl font-black uppercase tracking-[0.26em] text-white/40">
            {roundLabel}
            {match.matchNumber != null ? ` · MATCH ${match.matchNumber}` : ""}
          </p>
          <div className="mt-12 flex items-center justify-center gap-14">
            <div className="min-w-[520px] border-y border-white/18 py-10">
              <p className="text-sm font-black uppercase tracking-[0.34em] text-amber-300">
                Winner
              </p>
              <h1
                className="mt-5 truncate text-[82px] font-black leading-none"
                style={{ color: winner?.color ?? accent }}
              >
                {winner?.name ?? "결과 확인 중"}
              </h1>
              <div className="mt-8 flex justify-center -space-x-2">
                {(winner?.members ?? []).slice(0, 5).map((member: any) => (
                  // 방송 토큰 스냅샷의 외부 아바타 URL을 그대로 표시한다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={member.userId}
                    src={
                      member.avatar || "/images/placeholders/non-avatar-64.png"
                    }
                    alt=""
                    className="h-16 w-16 rounded-full border-2 border-[#05070d] object-cover"
                  />
                ))}
              </div>
            </div>
            <div className="text-5xl font-black text-white/18">VS</div>
            <div className="min-w-[420px] py-10 opacity-45">
              <p className="text-sm font-black uppercase tracking-[0.34em] text-white/40">
                Match Complete
              </p>
              <p className="mt-5 truncate text-[54px] font-black leading-none text-white">
                {loser?.name ?? "상대 팀"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const ROLE_NAMES: Record<string, string> = {
  TOP: "TOP",
  JUNGLE: "JGL",
  MID: "MID",
  MIDDLE: "MID",
  ADC: "ADC",
  BOTTOM: "ADC",
  SUPPORT: "SUP",
  UTILITY: "SUP",
};

const ROLE_ICON: Record<string, string> = {
  TOP: "/icons/positions/position-top.svg",
  JUNGLE: "/icons/positions/position-jungle.svg",
  MID: "/icons/positions/position-middle.svg",
  ADC: "/icons/positions/position-bottom.svg",
  SUPPORT: "/icons/positions/position-utility.svg",
};

function roleKeyOf(member: any) {
  const role = String(member?.assignedRole ?? "").toUpperCase();
  if (role === "MIDDLE") return "MID";
  if (role === "BOTTOM") return "ADC";
  if (role === "UTILITY") return "SUPPORT";
  return role || null;
}

function introRosterOf(team: any) {
  const members: any[] = team?.members ?? [];
  const byRole = new Map<string, any>();
  const unassigned: any[] = [];
  for (const member of members) {
    const role = roleKeyOf(member);
    if (role && ROLE_ORDER.includes(role) && !byRole.has(role)) {
      byRole.set(role, member);
    } else {
      unassigned.push(member);
    }
  }
  return ROLE_ORDER.map((role) => ({
    role,
    member: byRole.get(role) ?? unassigned.shift(),
  }));
}

function MatchIntroTeam({ team, side }: { team: any; side: "left" | "right" }) {
  const roster = introRosterOf(team);
  const color = team?.color ?? (side === "left" ? "#3B82F6" : "#EF4444");

  return (
    <section className="min-w-0">
      <div className={side === "right" ? "text-right" : "text-left"}>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/36">
          {side === "left" ? "Blue Side" : "Red Side"}
        </p>
        <h2
          className="mt-2 truncate text-[46px] font-black leading-none"
          style={{ color }}
        >
          {team?.name ?? "팀 미정"}
        </h2>
      </div>
      <div className="mt-7 grid gap-2.5">
        {roster.map(({ role, member }, index) => (
          <div
            key={role}
            className={`grid h-[82px] items-center gap-4 border-y border-white/12 bg-black/28 px-5 ${
              side === "left"
                ? "grid-cols-[54px_64px_minmax(0,1fr)]"
                : "grid-cols-[minmax(0,1fr)_64px_54px] text-right"
            }`}
            style={{
              animation: `nexus-roster-in-${side} 520ms ease-out ${220 + index * 360}ms both`,
              borderColor: `${color}66`,
            }}
          >
            {side === "left" ? (
              <>
                <IntroRole role={role} />
                <IntroAvatar member={member} />
                <IntroMember member={member} />
              </>
            ) : (
              <>
                <IntroMember member={member} />
                <IntroAvatar member={member} />
                <IntroRole role={role} />
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function IntroRole({ role }: { role: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ROLE_ICON[role]}
        alt=""
        className="h-5 w-5 brightness-0 invert opacity-70"
      />
      <span className="text-[10px] font-black tracking-[0.12em] text-white/48">
        {ROLE_NAMES[role]}
      </span>
    </div>
  );
}

function IntroAvatar({ member }: { member?: any }) {
  return (
    // 방송 토큰 스냅샷의 외부 아바타 URL을 그대로 표시한다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={member?.avatar || "/images/placeholders/non-avatar-64.png"}
      alt=""
      className="h-14 w-14 rounded-full border-2 border-white/16 object-cover"
    />
  );
}

function IntroMember({ member }: { member?: any }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xl font-black text-white">
        {member?.username ?? "미정"}
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-white/34">
        {member?.tier ?? "NEXUS PLAYER"}
      </p>
    </div>
  );
}

export function MatchIntroScene({ snapshot }: { snapshot: any }) {
  const match = snapshot?.match;
  const accent = accentOf(snapshot);
  if (!match) return <MatchScene snapshot={snapshot} />;

  const roundLabel =
    match.bracketRound ||
    (match.round != null ? `${match.round}라운드` : "경기");

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col px-20 py-14">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <HudLabel color={accent}>STARTING LINEUP</HudLabel>
            <h1 className="mt-2 text-[58px] font-black uppercase leading-none text-white">
              Match Intro
            </h1>
          </div>
          <p className="text-right text-lg font-black uppercase tracking-[0.22em] text-white/42">
            {roundLabel}
            {match.matchNumber != null ? ` · MATCH ${match.matchNumber}` : ""}
          </p>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] items-center gap-7">
          <MatchIntroTeam team={match.blue} side="left" />
          <div className="flex h-full items-center justify-center">
            <span className="text-[58px] font-black italic text-white/22">
              VS
            </span>
          </div>
          <MatchIntroTeam team={match.red} side="right" />
        </div>
      </div>
    </StageFrame>
  );
}

function filledRoleCount(members: any[]) {
  const roles = new Set<string>();
  for (const member of members) {
    const role = roleKeyOf(member);
    if (role && ROLE_ORDER.includes(role)) roles.add(role);
  }
  return roles.size;
}

function RoleSlot({
  role,
  member,
  compact = false,
}: {
  role: string;
  member?: any;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid min-w-0 ${compact ? "grid-cols-[44px_minmax(0,1fr)]" : "grid-cols-[52px_minmax(0,1fr)]"} items-center border bg-white/[0.035] ${
        compact ? "gap-2 px-2.5 py-2" : "gap-3 px-3.5 py-3"
      } border-white/8`}
    >
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ROLE_ICON[role]}
          alt=""
          width={compact ? 16 : 20}
          height={compact ? 16 : 20}
          className={`brightness-0 invert ${member ? "opacity-90" : "opacity-28"}`}
        />
        <span
          className={`font-black uppercase text-white/62 ${compact ? "text-[10px]" : "text-xs"}`}
        >
          {ROLE_NAMES[role]}
        </span>
      </div>

      {member ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`${compact ? "h-7 w-7" : "h-9 w-9"} shrink-0 overflow-hidden rounded-full bg-white/10`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={member.avatar || "/images/placeholders/non-avatar-64.png"}
              alt=""
              className={`${compact ? "h-7 w-7" : "h-9 w-9"} rounded-full object-cover`}
            />
          </div>
          <p
            className={`min-w-0 flex-1 truncate font-black text-white ${compact ? "text-sm" : "text-base"}`}
          >
            {member.username}
          </p>
        </div>
      ) : (
        <p
          className={`truncate font-black uppercase tracking-[0.12em] text-white/24 ${compact ? "text-[10px]" : "text-xs"}`}
        >
          Waiting
        </p>
      )}
    </div>
  );
}

function RoleSelectionTeam({
  team,
  accent,
  compact = false,
}: {
  team: any;
  accent: string;
  compact?: boolean;
}) {
  const members: any[] = team?.members ?? [];
  const color = team?.color ?? accent;
  const memberByRole = new Map<string, any>();
  const waitingMembers: any[] = [];

  for (const member of members) {
    const role = roleKeyOf(member);
    if (role && ROLE_ORDER.includes(role) && !memberByRole.has(role)) {
      memberByRole.set(role, member);
    } else {
      waitingMembers.push(member);
    }
  }

  const filledRoles = ROLE_ORDER.filter((role) => memberByRole.has(role));

  return (
    <section
      className="min-w-0 overflow-hidden border bg-black/38"
      style={{ borderColor: `${color}55` }}
    >
      <div
        className={`flex items-center justify-between border-b border-white/10 px-5 ${compact ? "py-2" : "py-3"}`}
        style={{ background: `${color}12` }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-3 w-3 shrink-0" style={{ background: color }} />
          <p className="truncate text-xl font-black text-white">
            {team?.name ?? "팀"}
          </p>
        </div>
        <span className="text-xs font-black text-white/42">
          {filledRoles.length}/5 선택 완료
        </span>
      </div>

      <div className={`grid ${compact ? "gap-2 p-3" : "gap-3 p-4"}`}>
        {ROLE_ORDER.map((role) => (
          <RoleSlot
            key={role}
            role={role}
            member={memberByRole.get(role)}
            compact={compact}
          />
        ))}

        {waitingMembers.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1.5 border-t border-white/10 pt-2">
            {waitingMembers.map((member) => (
              <span
                key={member.id ?? member.userId ?? member.username}
                className="max-w-[150px] truncate border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black text-white/36"
              >
                {member.username}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function RoleSelectionScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const teams: any[] = snapshot?.teams ?? [];
  const assigned = teams.reduce(
    (sum, team) => sum + filledRoleCount(team.members ?? []),
    0,
  );
  const total = teams.length * ROLE_ORDER.length;
  const progress = Math.max(
    0,
    Math.min(100, (assigned / Math.max(total, 1)) * 100),
  );
  const teamColumns = Math.min(Math.max(teams.length, 1), 4);
  const compactTeams =
    teams.length > 2 || teams.some((team) => (team.members ?? []).length >= 5);

  return (
    <StageFrame accent={accent}>
      <div
        className={`flex h-full w-full flex-col px-24 ${compactTeams ? "py-14" : "py-24"}`}
      >
        <div
          className={`${compactTeams ? "mb-5" : "mb-8"} flex items-end justify-between`}
        >
          <div>
            <HudLabel color={accent}>ROLE SELECTION</HudLabel>
            <h1 className="mt-2 text-[68px] font-black uppercase leading-none text-white">
              역할 선택
            </h1>
            <p className="mt-3 text-lg font-black text-white/42">
              원하는 포지션을 선택하세요. 선택된 포지션은 팀 내에서 잠깁니다.
            </p>
          </div>
          <div className="w-[360px] text-right">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-white/34">
              Locked
            </p>
            <p className="mt-1 text-4xl font-black text-white">
              {assigned}/{total}
            </p>
            <div className="mt-3 h-1.5 bg-white/10">
              <div
                className="h-full"
                style={{ width: `${progress}%`, background: accent }}
              />
            </div>
          </div>
        </div>

        <div
          className={`grid min-h-0 flex-1 content-center ${compactTeams ? "gap-3" : "gap-5"}`}
          style={{
            gridTemplateColumns: `repeat(${teamColumns}, minmax(0, 1fr))`,
          }}
        >
          {teams.map((team) => (
            <RoleSelectionTeam
              key={team.id ?? team.name}
              team={team}
              accent={accent}
              compact={compactTeams}
            />
          ))}
        </div>
      </div>
    </StageFrame>
  );
}

function bracketStatusOf(match: any) {
  if (match?.status === "COMPLETED") {
    return {
      label: "FINAL",
      color: "#FDE68A",
      background: "rgba(253,230,138,0.1)",
    };
  }
  if (match?.blueSideTeamId) {
    return {
      label: "SIDE SET",
      color: "#86EFAC",
      background: "rgba(134,239,172,0.1)",
    };
  }
  return {
    label: "RPS WAIT",
    color: "#F6C945",
    background: "rgba(246,201,69,0.1)",
  };
}

function BracketMatchCard({
  match,
  accent,
  focused,
  compact = false,
  dense = false,
}: {
  match: any;
  accent: string;
  focused: boolean;
  compact?: boolean;
  dense?: boolean;
}) {
  const blue = match?.blue ?? null;
  const red = match?.red ?? null;
  const hasSides = !!match?.blueSideTeamId;
  const winnerId = match?.winnerId;
  const blueWin = winnerId && winnerId === blue?.id;
  const redWin = winnerId && winnerId === red?.id;
  const status = bracketStatusOf(match);

  return (
    <div className="relative min-w-0">
      <div
        className={
          dense
            ? "h-[84px] overflow-hidden border-y px-3 py-2"
            : compact
              ? "h-[108px] overflow-hidden border-y px-3.5 py-2.5"
              : "h-[128px] overflow-hidden border-y px-4 py-3.5"
        }
        style={{
          borderColor: focused ? accent : "rgba(255,255,255,0.22)",
          background: focused
            ? "linear-gradient(90deg, rgba(139,92,246,0.18), rgba(5,6,10,0.42))"
            : "rgba(5,6,10,0.28)",
        }}
      >
        <div
          className={
            dense
              ? "mb-1.5 flex h-[14px] items-center justify-between gap-2"
              : compact
                ? "mb-2.5 flex items-center justify-between gap-2"
                : "mb-3 flex items-center justify-between gap-3"
          }
        >
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/44">
            M{match?.matchNumber ?? "-"}
          </span>
          <span
            className="text-[10px] font-black uppercase tracking-[0.08em]"
            style={{
              color: status.color,
            }}
          >
            {status.label}
          </span>
        </div>

        <div
          className={
            dense ? "grid gap-1" : compact ? "grid gap-2" : "grid gap-2.5"
          }
        >
          <BracketTeamRow
            team={blue}
            side={hasSides ? "BLUE" : "A"}
            color="#3B82F6"
            win={!!blueWin}
            pending={!blue || !hasSides}
            dense={dense}
          />
          <BracketTeamRow
            team={red}
            side={hasSides ? "RED" : "B"}
            color="#EF4444"
            win={!!redWin}
            pending={!red || !hasSides}
            dense={dense}
          />
        </div>
      </div>
    </div>
  );
}

function BracketTeamRow({
  team,
  side,
  color,
  win,
  pending,
  dense = false,
}: {
  team: any;
  side: string;
  color: string;
  win: boolean;
  pending: boolean;
  dense?: boolean;
}) {
  return (
    <div
      className={
        dense
          ? "grid h-[26px] grid-cols-[30px_minmax(0,1fr)_30px] items-center gap-1.5"
          : "grid h-[30px] grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2"
      }
      style={{ opacity: team ? 1 : 0.38 }}
    >
      <span
        className={
          dense
            ? "text-[11px] font-black uppercase tracking-[0.08em]"
            : "text-[12px] font-black uppercase tracking-[0.08em]"
        }
        style={{ color: pending ? "rgba(255,255,255,0.38)" : color }}
      >
        {side}
      </span>
      <span
        className={
          dense
            ? "truncate text-[15px] font-black leading-none text-white"
            : "truncate text-[18px] font-black leading-none text-white"
        }
      >
        {team?.name ?? "미정"}
      </span>
      {win && (
        <span className="text-right text-[12px] font-black uppercase text-amber-300">
          WIN
        </span>
      )}
    </div>
  );
}

const SECTION_LABELS: Record<string, string> = {
  WB_R1: "UPPER R1",
  WB_R2: "UPPER R2",
  WB_F: "UPPER FINAL",
  LB_R1: "LOWER R1",
  LB_R2: "LOWER R2",
  LB_SEMI: "LOWER SEMI",
  LB_F: "LOWER FINAL",
  GF: "GRAND FINALS",
};

type BracketLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  viaX?: number;
};

function sectionMatches(matches: any[], section: string) {
  return matches
    .filter((match) => (match.bracketSection ?? match.bracketRound) === section)
    .sort((a, b) => Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0));
}

function roundMatches(matches: any[], round: number) {
  return matches
    .filter((match) => Number(match.round ?? 1) === round)
    .sort((a, b) => Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0));
}

function BracketLines({ lines }: { lines: BracketLine[] }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lines.map((line, index) => (
        <path
          key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}-${index}`}
          d={
            line.viaX == null
              ? `M ${line.x1} ${line.y1} H ${line.x2} V ${line.y2}`
              : `M ${line.x1} ${line.y1} H ${line.viaX} V ${line.y2} H ${line.x2}`
          }
          fill="none"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function BracketSlot({
  match,
  accent,
  focusMatchId,
  x,
  y,
  width = 25,
  dense = false,
}: {
  match?: any;
  accent: string;
  focusMatchId?: string | null;
  x: number;
  y: number;
  width?: number;
  dense?: boolean;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        transform: "translateY(-50%)",
      }}
    >
      {match ? (
        <BracketMatchCard
          match={match}
          accent={accent}
          focused={match.id === focusMatchId}
          compact
          dense={dense}
        />
      ) : (
        <div
          className={
            dense
              ? "flex h-[84px] items-center overflow-hidden border-y border-white/14 px-3 text-sm font-black text-white/26"
              : "flex h-[108px] items-center border-y border-white/14 px-3 text-sm font-black text-white/26"
          }
        >
          대기
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  title,
  matches,
  accent,
  focusMatchId,
  className = "",
  dense = false,
}: {
  title: string;
  matches: any[];
  accent: string;
  focusMatchId?: string | null;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="mb-3 flex items-center justify-between border-b border-white/14 pb-2">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-white/50">
          {title}
        </p>
        <span className="text-[10px] font-black text-white/24">
          {matches.length || "-"}
        </span>
      </div>
      <div className={`grid ${dense ? "gap-2" : "gap-3"}`}>
        {matches.length > 0 ? (
          matches.map((match) => (
            <BracketMatchCard
              key={match.id}
              match={match}
              accent={accent}
              focused={match.id === focusMatchId}
              compact
              dense={dense}
            />
          ))
        ) : (
          <div
            className={`flex items-center border-y border-white/14 px-3 text-sm font-black text-white/26 ${
              dense ? "h-[84px]" : "h-[108px]"
            }`}
          >
            대기
          </div>
        )}
      </div>
    </section>
  );
}

function DoubleElimBoard({
  matches,
  accent,
  focusMatchId,
}: {
  matches: any[];
  accent: string;
  focusMatchId?: string | null;
}) {
  // 섹션 순서는 고정하되, 실제 매치가 있는 섹션만 컬럼으로 그린다.
  // (기존에는 3/4컬럼 고정이라 4팀 브래킷에서 빈 "대기" 컬럼이 남았다)
  const upperOrder = ["WB_R1", "WB_R2", "WB_F"];
  const lowerOrder = ["LB_R1", "LB_R2", "LB_SEMI", "LB_F"];
  const upper = upperOrder.filter(
    (section) => sectionMatches(matches, section).length > 0,
  );
  const lower = lowerOrder.filter(
    (section) => sectionMatches(matches, section).length > 0,
  );
  const upperMaxMatches = Math.max(
    1,
    ...upper.map((section) => sectionMatches(matches, section).length),
  );
  const lowerMaxMatches = Math.max(
    1,
    ...lower.map((section) => sectionMatches(matches, section).length),
  );
  const denseColumns = Math.max(upperMaxMatches, lowerMaxMatches) >= 4;
  const wbRoundOne = sectionMatches(matches, "WB_R1");
  const wbRoundTwo = sectionMatches(matches, "WB_R2");
  const upperFinal = sectionMatches(matches, "WB_F")[0] ?? null;
  const lowerRoundOne = sectionMatches(matches, "LB_R1")[0] ?? null;
  const lowerFinal = sectionMatches(matches, "LB_F")[0] ?? null;
  const grandFinal = sectionMatches(matches, "GF")[0] ?? null;
  // 고정 트리는 4팀 표준형(WB_R1 2 + WB_F + LB_R1 + LB_F + GF)에만 맞는 레이아웃이다.
  // 그 외 팀 수는 섹션 컬럼 모드가 매치 수에 맞춰 그린다.
  const canUseTree =
    wbRoundOne.length === 2 &&
    wbRoundTwo.length === 0 &&
    sectionMatches(matches, "LB_R2").length === 0 &&
    sectionMatches(matches, "LB_SEMI").length === 0 &&
    matches.length <= 6 &&
    Boolean(upperFinal || lowerFinal || grandFinal);
  const upperFirst = wbRoundOne[0] ?? wbRoundTwo[0] ?? null;
  const upperSecond = wbRoundOne[1] ?? wbRoundTwo[1] ?? null;
  const champion =
    grandFinal && grandFinal.winnerId === grandFinal.blue?.id
      ? grandFinal.blue
      : grandFinal && grandFinal.winnerId === grandFinal.red?.id
        ? grandFinal.red
        : null;

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden border border-white/10 px-8 py-7"
      style={{
        background:
          "radial-gradient(circle at 18% 14%, rgba(139,92,246,0.18), transparent 34%), linear-gradient(135deg, rgba(20,12,34,0.92), rgba(4,5,10,0.96) 58%, rgba(20,12,34,0.84))",
      }}
    >
      {canUseTree ? (
        <>
          <div className="absolute left-8 top-6 z-10 flex items-end gap-5">
            <p className="text-[38px] font-black uppercase leading-none tracking-normal text-white">
              Bracket Stage
            </p>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.3em] text-white/34">
              Double Elimination
            </p>
          </div>
          <div className="absolute left-8 top-[13%] z-10">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-red-300">
              Upper Bracket
            </p>
          </div>
          <div className="absolute left-8 top-[57%] z-10">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-red-300">
              Lower Bracket
            </p>
          </div>

          <BracketLines
            lines={[
              { x1: 25, y1: 25, x2: 26, y2: 35 },
              { x1: 25, y1: 45, x2: 26, y2: 35 },
              { x1: 48, y1: 35, x2: 52, y2: 43, viaX: 50 },
              { x1: 25, y1: 70, x2: 26, y2: 70 },
              { x1: 48, y1: 70, x2: 52, y2: 57, viaX: 50 },
              { x1: 74, y1: 50, x2: 75, y2: 50 },
            ]}
          />

          <BracketSlot
            match={upperFirst}
            accent={accent}
            focusMatchId={focusMatchId}
            x={3}
            y={25}
            width={22}
            dense
          />
          <BracketSlot
            match={upperSecond}
            accent={accent}
            focusMatchId={focusMatchId}
            x={3}
            y={45}
            width={22}
            dense
          />
          <BracketSlot
            match={upperFinal}
            accent={accent}
            focusMatchId={focusMatchId}
            x={26}
            y={35}
            width={22}
            dense
          />
          <BracketSlot
            match={lowerRoundOne}
            accent={accent}
            focusMatchId={focusMatchId}
            x={3}
            y={70}
            width={22}
            dense
          />
          <BracketSlot
            match={lowerFinal}
            accent={accent}
            focusMatchId={focusMatchId}
            x={26}
            y={70}
            width={22}
            dense
          />
          <BracketSlot
            match={grandFinal}
            accent={accent}
            focusMatchId={focusMatchId}
            x={52}
            y={50}
            width={22}
            dense
          />
          <div className="absolute left-[75%] top-1/2 w-[19%] -translate-y-1/2 border border-red-400/50 bg-red-500/10 px-4 py-5 text-center">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-300">
              Champion
            </p>
            <p className="mt-2 truncate text-xl font-black text-white">
              {champion?.name ?? "승자"}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-x-10 top-[46%] h-px bg-white/12" />
          <div className="pointer-events-none absolute right-[365px] top-[28%] h-[36%] w-px bg-white/14" />
          <div className="pointer-events-none absolute right-[320px] top-[46%] h-px w-12 bg-white/14" />

          <div className="relative grid h-full grid-cols-[minmax(0,1fr)_330px] gap-10">
            <div
              className={`grid min-h-0 ${denseColumns ? "gap-5" : "gap-7"}`}
              style={{
                gridTemplateRows: denseColumns
                  ? "auto auto"
                  : `${upperMaxMatches}fr ${lowerMaxMatches}fr`,
              }}
            >
              <div className="min-h-0">
                <div className="mb-4 flex items-end justify-between">
                  <p className="text-2xl font-black uppercase tracking-[0.06em] text-white/82">
                    Upper
                  </p>
                  <p className="text-[11px] font-black uppercase tracking-[0.26em] text-white/28">
                    Winner Bracket
                  </p>
                </div>
                <div
                  className="grid gap-5"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(upper.length, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {upper.map((section) => (
                    <BoardColumn
                      key={section}
                      title={SECTION_LABELS[section]}
                      matches={sectionMatches(matches, section)}
                      accent={accent}
                      focusMatchId={focusMatchId}
                      dense={denseColumns}
                    />
                  ))}
                </div>
              </div>

              <div className="min-h-0">
                <div className="mb-4 flex items-end justify-between">
                  <p className="text-2xl font-black uppercase tracking-[0.06em] text-white/82">
                    Lower
                  </p>
                  <p className="text-[11px] font-black uppercase tracking-[0.26em] text-white/28">
                    Elimination Bracket
                  </p>
                </div>
                <div
                  className="grid gap-5"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(lower.length, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {lower.map((section) => (
                    <BoardColumn
                      key={section}
                      title={SECTION_LABELS[section]}
                      matches={sectionMatches(matches, section)}
                      accent={accent}
                      focusMatchId={focusMatchId}
                      dense={denseColumns}
                    />
                  ))}
                </div>
              </div>
            </div>

            <section className="flex min-h-0 flex-col justify-center">
              <div className="mb-5 border-b border-white/14 pb-4">
                <p className="text-3xl font-black uppercase tracking-[0.04em] text-white">
                  Grand Finals
                </p>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.28em] text-white/34">
                  Final Stage
                </p>
              </div>
              {grandFinal ? (
                <BracketMatchCard
                  match={grandFinal}
                  accent={accent}
                  focused={grandFinal.id === focusMatchId}
                />
              ) : (
                <div className="grid gap-3">
                  <div className="border border-white/10 px-4 py-4 text-base font-black text-white/42">
                    승자조 경기 승자
                  </div>
                  <div className="border border-white/10 px-4 py-4 text-base font-black text-white/42">
                    패자조 최종 승자
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SingleElimBoard({
  matches,
  accent,
  focusMatchId,
}: {
  matches: any[];
  accent: string;
  focusMatchId?: string | null;
}) {
  const rounds = [...new Set(matches.map((match) => match.round ?? 1))].sort(
    (a, b) => Number(a) - Number(b),
  );
  // 라운드별 실제 매치 — 트리는 이 데이터에서 위치를 계산한다.
  // (기존에는 4강 고정 슬롯이라 팀 수가 다르면 빈 "대기" 칸이 생기거나 잘렸다)
  const layoutRounds = rounds.map((round) =>
    roundMatches(matches, Number(round)),
  );
  const canUseTree =
    rounds.length >= 1 &&
    rounds.length <= 3 &&
    (layoutRounds[0]?.length ?? 0) <= 4 &&
    matches.length <= 7;

  if (canUseTree) {
    // 라운드 수에 따른 컬럼 배치(%): 결승 컬럼은 넓게
    const COLUMN_PRESETS: Record<number, { x: number; width: number }[]> = {
      1: [{ x: 36, width: 28 }],
      2: [
        { x: 6, width: 27 },
        { x: 60, width: 30 },
      ],
      3: [
        { x: 2, width: 25 },
        { x: 31, width: 25 },
        { x: 67, width: 28 },
      ],
    };
    const columns = COLUMN_PRESETS[rounds.length];
    // 제목이 상단을 차지하므로 트리는 그 아래 세로 대역에 고르게 분포
    const Y_TOP = 20;
    const Y_BOTTOM = 92;
    const yOf = (count: number, index: number) =>
      Y_TOP + ((index + 0.5) / Math.max(count, 1)) * (Y_BOTTOM - Y_TOP);

    // 인접 라운드 연결선: i번 매치 → 다음 라운드 floor(i/2)번 매치
    const lines: BracketLine[] = [];
    for (let r = 0; r + 1 < layoutRounds.length; r++) {
      const from = columns[r];
      const to = columns[r + 1];
      const fromCount = layoutRounds[r].length;
      const toCount = layoutRounds[r + 1].length;
      if (toCount === 0) continue;
      layoutRounds[r].forEach((_, i) => {
        const target = Math.min(Math.floor(i / 2), toCount - 1);
        lines.push({
          x1: from.x + from.width,
          y1: yOf(fromCount, i),
          x2: to.x,
          y2: yOf(toCount, target),
          viaX: (from.x + from.width + to.x) / 2,
        });
      });
    }

    return (
      <div
        className="relative min-h-0 flex-1 overflow-hidden border border-white/10 px-8 py-7"
        style={{
          background:
            "radial-gradient(circle at 18% 14%, rgba(139,92,246,0.18), transparent 34%), linear-gradient(135deg, rgba(20,12,34,0.9), rgba(4,5,10,0.96) 58%, rgba(18,12,30,0.82))",
        }}
      >
        <div className="absolute left-8 top-7 z-10">
          <p className="text-2xl font-black uppercase tracking-[0.06em] text-white/82">
            Single Elimination
          </p>
          <p className="mt-1 text-[11px] font-black uppercase tracking-[0.26em] text-white/28">
            Winners advance through the bracket
          </p>
        </div>
        <div className="absolute right-8 top-7 z-10 text-right">
          <p className="text-3xl font-black uppercase tracking-[0.04em] text-white">
            Finals
          </p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.28em] text-white/34">
            Final Stage
          </p>
        </div>

        <BracketLines lines={lines} />

        {layoutRounds.map((roundList, r) =>
          roundList.map((match, i) => (
            <BracketSlot
              key={match.id}
              match={match}
              accent={accent}
              focusMatchId={focusMatchId}
              x={columns[r].x}
              y={yOf(roundList.length, i)}
              width={columns[r].width}
            />
          )),
        )}
      </div>
    );
  }

  return (
    <div
      className="grid min-h-0 flex-1 gap-8 border border-white/10 bg-black/28 px-7 py-6"
      style={{
        gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))`,
      }}
    >
      {rounds.map((round) => {
        const roundMatches = matches.filter(
          (match) => (match.round ?? 1) === round,
        );
        const label =
          roundMatches[0]?.bracketRound ??
          (roundMatches.length === 1 ? "GRAND FINALS" : `ROUND ${round}`);
        return (
          <BoardColumn
            key={round}
            title={label}
            matches={roundMatches}
            accent={accent}
            focusMatchId={focusMatchId}
          />
        );
      })}
    </div>
  );
}

export function BracketScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const matches: any[] = snapshot?.matches ?? [];
  const focusMatchId = snapshot?.focusMatchId ?? null;
  const isDoubleElim = matches.some(
    (match) => match.bracketType === "DOUBLE_ELIMINATION",
  );

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col px-16 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <HudLabel color={accent}>PLAYOFFS</HudLabel>
            <h1 className="mt-2 text-[72px] font-black uppercase leading-none text-white">
              Bracket
            </h1>
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
        ) : isDoubleElim ? (
          <DoubleElimBoard
            matches={matches}
            accent={accent}
            focusMatchId={focusMatchId}
          />
        ) : (
          <SingleElimBoard
            matches={matches}
            accent={accent}
            focusMatchId={focusMatchId}
          />
        )}
      </div>
    </StageFrame>
  );
}

/** 토너먼트 종료 후: 마지막 한 경기 대신 우승 팀과 완료된 전체 대진을 유지한다. */
export function TournamentSummaryScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const matches: any[] = snapshot?.matches ?? [];
  const isDoubleElim = matches.some(
    (match) => match.bracketType === "DOUBLE_ELIMINATION",
  );
  const completed = matches.filter((match) => match.winnerId);
  const finalMatch =
    completed.find((match) => match.bracketRound === "GF") ??
    [...completed].sort(
      (a, b) =>
        Number(b.round ?? 0) - Number(a.round ?? 0) ||
        Number(b.matchNumber ?? 0) - Number(a.matchNumber ?? 0),
    )[0];
  const winner =
    finalMatch?.winnerId === finalMatch?.blue?.id
      ? finalMatch.blue
      : finalMatch?.winnerId === finalMatch?.red?.id
        ? finalMatch.red
        : null;

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col px-16 py-14">
        <div className="mb-6 flex items-end justify-between gap-8">
          <div>
            <HudLabel color={accent}>TOURNAMENT COMPLETE</HudLabel>
            <h1 className="mt-2 text-[64px] font-black uppercase leading-none text-white">
              Final Standings
            </h1>
          </div>
          <div className="min-w-[360px] border-y border-white/18 py-4 text-right">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-white/40">
              Champion
            </p>
            <p
              className="mt-2 truncate text-4xl font-black"
              style={{ color: winner?.color ?? accent }}
            >
              {winner?.name ?? "결과 집계 중"}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {matches.length === 0 ? (
            <div className="flex h-full items-center justify-center border-y border-white/10">
              <p className="text-3xl font-black text-white/32">
                완료된 대진이 없습니다
              </p>
            </div>
          ) : isDoubleElim ? (
            <DoubleElimBoard
              matches={matches}
              accent={accent}
              focusMatchId={finalMatch?.id ?? null}
            />
          ) : (
            <SingleElimBoard
              matches={matches}
              accent={accent}
              focusMatchId={finalMatch?.id ?? null}
            />
          )}
        </div>
      </div>
    </StageFrame>
  );
}

function RevealMemberRow({
  member,
  teamColor,
  isCaptain,
}: {
  member: any;
  teamColor: string;
  isCaptain: boolean;
}) {
  return (
    <div className="flex h-14 items-center justify-between border border-white/12 bg-white/[0.05] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={member.avatar || "/images/placeholders/non-avatar-64.png"}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        </div>
        <p className="truncate text-xl font-bold text-white">
          {member.username}
          {isCaptain && (
            <span
              className="ml-2 text-sm font-black"
              style={{ color: teamColor }}
            >
              C
            </span>
          )}
        </p>
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-3">
        {member.soldPrice != null && (
          <span className="text-base font-black" style={{ color: teamColor }}>
            {member.soldPrice}P
          </span>
        )}
        <span className="text-base font-black text-white/50">
          {member.tier ?? "–"}
        </span>
      </div>
    </div>
  );
}

/**
 * 팀 공개(reveal) 장면 — 팀 확정(DRAFT_COMPLETED) 시점의 최종 로스터 소개.
 * 자동배정/수동편성 모드에서는 드래프트 과정이 없어 이 장면이 유일한 팀 소개다.
 * 경매 방이면 낙찰가를 함께 표시한다.
 */
export function TeamRevealScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const teams: any[] = snapshot?.teams ?? [];
  const roomName = snapshot?.room?.name ?? "";

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col px-24 pb-36 pt-16">
        <div className="flex items-end justify-between gap-8">
          <div className="min-w-0">
            <HudLabel color={accent}>TEAMS LOCKED IN</HudLabel>
            <p className="mt-2 truncate text-5xl font-black">{roomName}</p>
          </div>
          <p className="flex-shrink-0 text-3xl font-black text-white/45">
            {teams.length} TEAMS
          </p>
        </div>

        <HudRule color={accent} />

        <div className="flex min-h-0 flex-1 gap-6">
          {teams.map((team) => {
            const teamColor = team.color || accent;
            // 팀장을 맨 위로 정렬해 소개 순서를 고정한다
            const members = [...(team.members ?? [])].sort((a, b) =>
              a.userId === team.captainId
                ? -1
                : b.userId === team.captainId
                  ? 1
                  : 0,
            );
            return (
              <div
                key={team.id}
                className="flex min-w-0 flex-1 flex-col border border-white/12 bg-black/45 px-7 py-6"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-1.5 flex-shrink-0"
                    style={{ background: teamColor }}
                  />
                  <p className="truncate text-3xl font-black">{team.name}</p>
                </div>
                <div className="mt-5 flex flex-1 flex-col gap-2.5">
                  {members.map((member) => (
                    <RevealMemberRow
                      key={member.userId}
                      member={member}
                      teamColor={teamColor}
                      isCaptain={member.userId === team.captainId}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </StageFrame>
  );
}

export function RoomScene({ snapshot }: { snapshot: any }) {
  const status = snapshot?.room?.status;
  const teamMode = snapshot?.room?.teamMode;
  // "AUCTION"은 RoomStatus enum에 없는 값 — 경매 단계는 DRAFT + teamMode로 판별한다.
  if (status === "DRAFT" && teamMode === "AUCTION") {
    return <AuctionScene snapshot={snapshot} />;
  }
  return <WaitingScene snapshot={snapshot} />;
}
