"use client";

import type { ReactNode } from "react";
import { getTierIcon } from "@/lib/tier-icon";
import { getRoleIcon, normalizeRole } from "@/lib/role-icon";

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

/**
 * 티어별 강조색. globals.css의 --color-tier-* 와 동일한 값을 hex로 둔다.
 * (오버레이는 인라인 색상 위주로 그려지므로 tailwind 클래스 대신 hex를 쓴다)
 */
const TIER_COLORS: Record<string, string> = {
  challenger: "#f4c430",
  grandmaster: "#ff4500",
  master: "#9b30ff",
  diamond: "#b9f2ff",
  emerald: "#50c878",
  platinum: "#40e0d0",
  gold: "#ffd700",
  silver: "#c0c0c0",
  bronze: "#cd7f32",
  iron: "#8b8b8b",
};

/** 랭크(I~IV)가 의미 없는 상위 티어 — 표기에서 제외한다. */
const APEX_TIERS = new Set(["master", "grandmaster", "challenger"]);

/** 미연동·언랭 표기용 무채색 — 실제 티어 색과 확실히 구분된다. */
const NO_TIER_COLOR = "#7b7b83";

interface TierBadge {
  text: string;
  color: string;
  /** 언랭/미연동은 대응하는 엠블럼이 없어 null */
  icon: string | null;
  /** 실제 티어가 아님 — 카드 좌측 보더에는 색을 입히지 않는다 */
  dim: boolean;
}

/**
 * 티어/랭크/LP를 오버레이 표기 문자열과 색상으로 변환.
 * 참가자마다 항상 한 줄을 반환해 카드 높이를 균일하게 유지한다.
 * - tier === null  → 라이엇 계정 미연동
 * - tier === "UNRANKED" → 연동했으나 배치 전/언랭
 */
function tierBadge(
  tier?: string | null,
  rank?: string | null,
  lp?: number | null,
): TierBadge {
  const key = (tier ?? "").toLowerCase();
  if (!key) {
    return { text: "미연동", color: NO_TIER_COLOR, icon: null, dim: true };
  }

  const matched = Object.keys(TIER_COLORS).find((t) => key.includes(t));
  if (!matched) {
    // "UNRANKED" 및 예상 못 한 값 전부 여기로 떨어진다
    return { text: "UNRANKED", color: NO_TIER_COLOR, icon: null, dim: true };
  }

  // 티어명은 축약 없이 전체로 표기한다 (GOLD, PLATINUM ...)
  const parts = [matched.toUpperCase()];
  if (rank && !APEX_TIERS.has(matched)) parts.push(rank);
  if (typeof lp === "number") parts.push(`${lp}LP`);

  return {
    text: parts.join(" "),
    color: TIER_COLORS[matched],
    icon: getTierIcon(matched),
    dim: false,
  };
}

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
  // 티어 줄은 이름보다 한 단계 작게 — 40인 그리드에서도 두 줄이 안정적으로 들어간다
  const tierText =
    participants.length > 36
      ? "text-[9px]"
      : participants.length > 25
        ? "text-[10px]"
        : "text-[11px]";
  const tierIconSize =
    participants.length > 36 ? 11 : participants.length > 25 ? 13 : 15;

  return (
    <StageFrame accent={accent}>
      <div className="flex h-full w-full flex-col justify-center gap-12 px-28 py-24">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_420px] items-center gap-16">
          <div className="min-w-0">
            <HudLabel color={accent}>WAITING ROOM</HudLabel>
            <h1 className="mt-6 max-w-[1180px] text-[82px] font-black leading-[0.96] tracking-normal text-white">
              {room.name ?? "내전 대기 중"}
            </h1>
            <p className="mt-8 text-2xl font-black uppercase tracking-[0.32em] text-white/38">
              Nexus Custom Match
            </p>
          </div>

          <div className="bg-black/20 px-7 py-8">
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
          <div className="bg-black/18 px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
              <HudLabel color={accent}>WAITING PLAYERS</HudLabel>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-white/32">
                {participants.length} Players
              </p>
            </div>
            <div className={`grid ${participantColumns} gap-2.5`}>
              {participants.map((participant, index) => {
                const badge = tierBadge(
                  participant.tier,
                  participant.rank,
                  participant.lp,
                );
                return (
                  <div
                    key={participant.userId ?? index}
                    className={`flex min-w-0 items-center border-l border-white/12 bg-white/[0.035] ${participantCell}`}
                    // 티어 색을 좌측 보더로도 흘려 한눈에 티어 분포가 보이게 한다
                    // (언랭·미연동은 기본 보더 유지)
                    style={
                      badge.dim ? undefined : { borderLeftColor: badge.color }
                    }
                  >
                    <span className="w-5 shrink-0 text-xs font-black text-white/28">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate font-black text-white/84">
                        {participant.username ?? "대기자"}
                      </span>
                      <span
                        className={`flex min-w-0 items-center gap-1 font-black tracking-wide ${tierText}`}
                        style={{ color: badge.color }}
                      >
                        {badge.icon ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={badge.icon}
                            alt=""
                            width={tierIconSize}
                            height={tierIconSize}
                            className="shrink-0"
                          />
                        ) : (
                          /* 엠블럼이 없는 경우에도 자리를 잡아 텍스트 시작점을 맞춘다 */
                          <span
                            className="shrink-0"
                            style={{
                              width: tierIconSize,
                              height: tierIconSize,
                            }}
                          />
                        )}
                        <span className="truncate">{badge.text}</span>
                      </span>
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
                );
              })}
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
        </>
      ) : (
        <>
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

      {/*
        경기 중 오버레이는 양옆 플랭킹(팀명 + 세트 스코어)만 남긴다.
        상단 중앙에 라운드/Match/Live 캡션이 있었는데, 롤 자체 점수창 바로 아래에
        붙어 관전 화면을 가렸다. 이 씬에서는 하단 바(LowerThird)도 띄우지 않으므로
        (page.tsx 의 persistent 참고) 화면을 최대한 비워 두는 쪽이 맞다.
      */}
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

function roleKeyOf(member: any) {
  return normalizeRole(member?.assignedRole);
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
        src={getRoleIcon(role) ?? undefined}
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
  const roleTier = member?.roleTiers?.find(
    (entry: any) => normalizeRole(entry.role) === role,
  );
  const badge = member
    ? tierBadge(
        roleTier?.tier ?? member.tier,
        roleTier?.rank ?? member.rank,
        roleTier?.lp ?? member.lp,
      )
    : null;

  return (
    <div
      className={`grid min-w-0 ${compact ? "grid-cols-[44px_minmax(0,1fr)]" : "grid-cols-[52px_minmax(0,1fr)]"} items-center bg-white/[0.045] ${
        compact ? "gap-2 px-2.5 py-2" : "gap-3 px-3.5 py-3"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getRoleIcon(role) ?? undefined}
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
          <span className="min-w-0 flex-1">
            <p
              className={`truncate font-black text-white ${compact ? "text-sm" : "text-base"}`}
            >
              {member.username}
            </p>
            {badge && (
              <p
                className={`truncate font-black ${compact ? "text-[9px]" : "text-[10px]"}`}
                style={{ color: badge.color }}
              >
                {badge.text}
              </p>
            )}
          </span>
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
      className="min-w-0 overflow-hidden border-t-2 bg-black/34"
      style={{ borderTopColor: color }}
    >
      <div
        className={`flex items-center justify-between px-5 ${compact ? "py-2" : "py-3"}`}
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
          <div className="flex min-w-0 flex-wrap gap-1.5 pt-1">
            {waitingMembers.map((member) => (
              <span
                key={member.id ?? member.userId ?? member.username}
                className="max-w-[150px] truncate bg-white/[0.04] px-2 py-1 text-[10px] font-black text-white/36"
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
  // 대기화면과 같은 배지 규칙을 써서 방송 전체의 티어 표기를 통일한다
  const badge = tierBadge(member.tier, member.rank, member.lp);

  return (
    // 프레임리스: 테두리·배경 없이, 행 자체를 실하게 만들어 내용이 곧 블록이 되게 한다.
    // 아바타를 키우고 이름/티어를 2행으로 쌓으면 행 하나가 덩어리로 읽혀서
    // 세로를 꽉 채워도 흩어져 보이지 않는다.
    <div className="flex h-full min-h-0 w-full items-center gap-4">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={member.avatar || "/images/placeholders/non-avatar-64.png"}
          alt=""
          className="h-14 w-14 rounded-full object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <p className="truncate text-2xl font-black text-white">
          {member.username}
          {isCaptain && (
            <span
              className="ml-2 align-middle text-sm font-black"
              style={{ color: teamColor }}
            >
              C
            </span>
          )}
        </p>
        <span
          className="mt-0.5 flex items-center gap-1.5 text-sm font-black"
          style={{ color: badge.color }}
        >
          {badge.icon && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={badge.icon}
              alt=""
              width={18}
              height={18}
              className="shrink-0"
            />
          )}
          <span className="truncate">{badge.text}</span>
        </span>
      </div>
      <div className="flex flex-shrink-0 items-center">
        {member.soldPrice != null && (
          <span className="text-2xl font-black" style={{ color: teamColor }}>
            {member.soldPrice}
            <span className="ml-0.5 text-sm opacity-60">P</span>
          </span>
        )}
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
  // 팀마다 인원이 달라도 행 높이를 맞추기 위해 최대 인원 기준으로 트랙을 잡는다.
  // (1fr 트랙이라 남는 세로 공간 없이 패널을 꽉 채운다)
  const maxMembers = Math.max(
    1,
    ...teams.map((team) => (team.members ?? []).length),
  );

  // 팀이 늘어나면 한 줄로는 패널 폭이 모자라 행 내용이 밖으로 넘친다.
  // 4팀부터 2줄로 개행해 폭을 확보한다.
  const columns =
    teams.length <= 3 ? Math.max(teams.length, 1) : Math.ceil(teams.length / 2);
  const rows = Math.ceil(teams.length / Math.max(columns, 1));

  // 확보한 칸에 맞춰 패널을 통째로 축소한다. 개별 요소를 따로 줄이지 않고
  // transform 으로 비율을 유지한 채 줄여야 여백·테두리까지 같이 작아진다.
  // 기준(scale 1)은 3열 1행 — 이때 패널 폭이 원래 디자인 폭과 같다.
  const panelScale = Math.min(1, (3 / columns) * (rows > 1 ? 0.62 : 1));

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

        <div
          className="grid min-h-0 flex-1 gap-x-14 gap-y-10"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {teams.map((team) => {
            const teamColor = team.color || accent;
            // 소개 순서: 팀장 → 라인 순(탑·정글·미드·원딜·서포) → 역할 미정
            // 기존에는 DB가 돌려주는 순서(경매 낙찰 순 등)를 그대로 써서
            // orderBy 가 없는 만큼 조회마다 순서가 달라질 수 있었다.
            const roleRank = (member: any) => {
              const index = ROLE_ORDER.indexOf(member.assignedRole);
              return index === -1 ? ROLE_ORDER.length : index;
            };
            const members = [...(team.members ?? [])].sort((a, b) => {
              const aCaptain = a.userId === team.captainId ? 0 : 1;
              const bCaptain = b.userId === team.captainId ? 0 : 1;
              if (aCaptain !== bCaptain) return aCaptain - bCaptain;

              const byRole = roleRank(a) - roleRank(b);
              if (byRole !== 0) return byRole;

              // 라인까지 같으면 닉네임으로 고정해 순서가 흔들리지 않게 한다
              return String(a.username ?? "").localeCompare(
                String(b.username ?? ""),
                "ko",
              );
            });
            return (
              <div key={team.id} className="min-w-0 overflow-hidden">
                {/* 축소 레이어: 실제 칸보다 1/scale 만큼 크게 그린 뒤 통째로 줄인다.
                    폰트·아바타·여백·테두리가 같은 비율로 작아진다. */}
                <div
                  className="flex"
                  style={{
                    width: `${100 / panelScale}%`,
                    height: `${100 / panelScale}%`,
                    transform: `scale(${panelScale})`,
                    transformOrigin: "top left",
                  }}
                >
                  {/* 색 면·스파인이 로스터보다 넓으면 오른쪽이 비어 보인다.
                      축소율과 무관하게 화면상 폭이 일정하도록 상한을 보정한다. */}
                  <div
                    className="relative flex w-full min-w-0 flex-col py-2 pl-6 pr-5"
                    style={{ maxWidth: `${Math.round(520 / panelScale)}px` }}
                  >
                    {/* 팀 스파인: 블록의 세로 범위를 팀 컬러로 잡아준다.
                        테두리 대신 이 한 줄이 "여기부터 여기까지 한 팀"을 말한다. */}
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{
                        background: `linear-gradient(180deg, ${teamColor}, ${teamColor}33)`,
                      }}
                    />
                    {/* 팀명을 로스터와 같은 좌측 정렬선에 붙여 제목이 뜨지 않게 한다 */}
                    <p
                      className="truncate text-3xl font-black tracking-wide text-white"
                      style={{ textShadow: `0 0 24px ${teamColor}55` }}
                    >
                      {team.name}
                    </p>
                    <div
                      // 행이 덩어리로 읽히므로 1fr 로 세로를 꽉 채운다
                      className="mt-4 grid min-h-0 flex-1 gap-3"
                      style={{
                        gridTemplateRows: `repeat(${maxMembers}, minmax(0, 1fr))`,
                      }}
                    >
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
