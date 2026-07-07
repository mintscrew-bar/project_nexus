"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { BroadcastAuctionData } from "../_live/useBroadcastAuction";

/**
 * 방송용 경매 화면.
 * 앱 화면을 그대로 복제하기보다 OBS에서 바로 읽히는 중계 그래픽으로 재구성한다.
 */

const ROLE_ICON: Record<string, string> = {
  TOP: "/icons/positions/position-top.svg",
  JUNGLE: "/icons/positions/position-jungle.svg",
  MID: "/icons/positions/position-middle.svg",
  MIDDLE: "/icons/positions/position-middle.svg",
  ADC: "/icons/positions/position-bottom.svg",
  BOTTOM: "/icons/positions/position-bottom.svg",
  SUPPORT: "/icons/positions/position-utility.svg",
  UTILITY: "/icons/positions/position-utility.svg",
};

const ROLE_LABELS: Record<string, string> = {
  TOP: "TOP",
  JUNGLE: "JGL",
  MID: "MID",
  MIDDLE: "MID",
  ADC: "ADC",
  BOTTOM: "ADC",
  SUPPORT: "SUP",
  UTILITY: "SUP",
};

const liveBgCss = `
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
`;

const glass =
  "border border-white/12 bg-black/36 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur";
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")
  .replace(/\/api$/, "")
  .replace(/\/$/, "");
// 무프로필 placeholder — 다크 무채색 N 마크. 렌더 크기에 맞는 걸 써서 다운스케일 뭉개짐을 줄인다.
const AVATAR_PLACEHOLDER = {
  sm: "/images/placeholders/non-avatar-64.png", // 멤버 슬롯 등 ~48px 이하
  md: "/images/placeholders/non-avatar-128.png", // LOT 초상화 등 ~128px
  lg: "/images/placeholders/non-avatar-256.png", // 대형/기본
} as const;
const DEFAULT_AVATAR_SRC = AVATAR_PLACEHOLDER.lg;

const userIdOf = (value: any) => value?.id ?? value?.userId;

const tierIconUrl = (tier?: string | null) => {
  const t = String(tier ?? "").toUpperCase();
  return t && t !== "UNRANKED" ? `/icons/tiers/${t.toLowerCase()}.png` : null;
};

const roleLabel = (role?: string | null) => {
  if (!role) return null;
  return ROLE_LABELS[role.toUpperCase()] ?? role.toUpperCase();
};

const normalizeAvatarSrc = (
  src?: string | null,
  fallback: string = DEFAULT_AVATAR_SRC,
) => {
  const value = src?.trim();
  if (!value) return fallback;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("/uploads/")) return `${API_ORIGIN}${value}`;
  if (value.startsWith("/")) return value;
  if (/^[\w.-]+\.(?:png|jpe?g|gif|webp|avif)$/i.test(value)) {
    return `${API_ORIGIN}/uploads/${value}`;
  }
  return fallback;
};

const parseTeamOrder = (name: string): number => {
  const match = name.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
};

const sortTeams = (teams: any[]) =>
  [...(teams ?? [])].sort((a, b) => {
    const na = String(a?.name ?? "");
    const nb = String(b?.name ?? "");
    const oa = parseTeamOrder(na);
    const ob = parseTeamOrder(nb);
    if (oa !== ob) return oa - ob;
    return na.localeCompare(nb);
  });

function RoleIcon({ role, dim }: { role?: string | null; dim?: boolean }) {
  if (!role) return null;
  const url = ROLE_ICON[role.toUpperCase()];
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={role}
      width={22}
      height={22}
      className={cn("object-contain brightness-0 invert", dim && "opacity-45")}
    />
  );
}

function PlayerPortrait({
  src,
  alt,
  className,
  placeholder = DEFAULT_AVATAR_SRC,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  placeholder?: string;
}) {
  const normalizedSrc = normalizeAvatarSrc(src, placeholder);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalizedSrc}
      alt={alt}
      className={cn("object-cover", className)}
      onError={(event) => {
        if (event.currentTarget.src.endsWith(placeholder)) return;
        event.currentTarget.src = placeholder;
      }}
    />
  );
}

function TeamRail({
  teams,
  auctionState,
  side,
}: {
  teams: any[];
  auctionState: any;
  side: "left" | "right";
}) {
  const stretchCards = teams.length <= 1;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
      {teams.map((team, index) => (
        <TeamCard
          key={team.id ?? `${side}-${index}`}
          team={team}
          auctionState={auctionState}
          align={side}
          index={index}
          stretch={stretchCards}
        />
      ))}
    </div>
  );
}

function TeamCard({
  team,
  auctionState,
  align,
  index,
  stretch,
}: {
  team: any;
  auctionState: any;
  align: "left" | "right";
  index: number;
  stretch?: boolean;
}) {
  const members = team.members ?? [];
  const budget = team.remainingGold ?? team.remainingBudget ?? 0;
  const color = team.color ?? (align === "left" ? "#3B82F6" : "#EF4444");
  const isCurrentBidder =
    auctionState?.currentHighestBidder === team.id ||
    auctionState?.currentHighestBidder === team.captainId;
  const captain = members.find((m: any) => userIdOf(m) === team.captainId);
  const captainName = captain?.username ?? team.captainName ?? team.name;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl p-[1px]",
        stretch && "min-h-0 flex-1",
        isCurrentBidder && "shadow-[0_0_34px_rgba(245,158,11,0.25)]",
      )}
      style={{
        background: `linear-gradient(135deg, ${color}, rgba(255,255,255,0.08) 48%, ${
          isCurrentBidder ? "#F59E0B" : "rgba(255,255,255,0.08)"
        })`,
      }}
    >
      <div
        className={cn(
          "relative h-full rounded-xl bg-[#101116]/95 px-4 py-3",
          stretch && "grid min-h-0 grid-rows-[auto_1fr]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-y-0 w-1"
          style={{
            [align === "left" ? "left" : "right"]: 0,
            background: color,
            boxShadow: `0 0 22px ${color}`,
          }}
        />

        <div className="mb-3 flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/10 text-sm font-black text-white"
            style={{ color }}
          >
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-lg font-black tracking-tight text-white">
                {captainName}
              </p>
              {isCurrentBidder && (
                <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-black text-black">
                  LEADING
                </span>
              )}
            </div>
            <p className="truncate text-xs font-semibold text-white/40">
              {team.name} · {members.length}/5
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
              Budget
            </p>
            <p className="text-lg font-black tabular-nums text-amber-300">
              {budget.toLocaleString()}
            </p>
          </div>
        </div>

        <div
          className={cn(
            "min-h-0",
            stretch
              ? "grid grid-rows-5 gap-2 overflow-hidden"
              : "grid grid-cols-5 gap-1.5",
          )}
        >
          {Array.from({ length: 5 }).map((_, slotIndex) => {
            const member = members[slotIndex];
            if (!member) {
              return (
                <div
                  key={`empty-${slotIndex}`}
                  className={cn(
                    "rounded-lg border border-dashed border-white/10 bg-white/[0.03]",
                    stretch ? "min-h-0" : "h-[72px]",
                  )}
                />
              );
            }

            const memberId = userIdOf(member);
            const isCaptain = memberId === team.captainId;
            const tierIcon = tierIconUrl(member.tier);

            return (
              <div
                key={memberId ?? `${team.id}-${slotIndex}`}
                className={cn(
                  "min-w-0 rounded-lg border bg-white/[0.055]",
                  stretch
                    ? "grid min-h-0 grid-cols-[42px_minmax(0,1fr)_44px] items-center gap-3 px-3"
                    : "p-1.5 text-center",
                  isCaptain ? "border-amber-300/45" : "border-white/8",
                )}
              >
                <div className={cn("relative h-8 w-8", !stretch && "mx-auto")}>
                  <Avatar
                    src={normalizeAvatarSrc(member.avatar, AVATAR_PLACEHOLDER.sm)}
                    alt={member.username}
                    fallback={member.username?.[0] ?? "?"}
                    size="sm"
                  />
                  {isCaptain && (
                    <span className="absolute -bottom-1 -right-1 rounded bg-amber-300 px-1 text-[9px] font-black text-black">
                      C
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-1",
                    stretch ? "justify-start" : "mt-1 justify-center",
                  )}
                >
                  {tierIcon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tierIcon}
                      alt=""
                      width={12}
                      height={12}
                      className="shrink-0"
                    />
                  )}
                  <span className="truncate text-[10px] font-bold text-white/78">
                    {member.username}
                  </span>
                </div>
                {stretch && (
                  <span className="justify-self-end text-[10px] font-black uppercase text-white/28">
                    {isCaptain ? "CAP" : `P${slotIndex + 1}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MultiTeamBoard({
  teams,
  auctionState,
}: {
  teams: any[];
  auctionState: any;
}) {
  const columns = teams.length <= 4 ? "grid-cols-2" : "grid-cols-2";

  return (
    <section className="flex min-h-0 flex-col py-1">
      {/* 입찰(최고가) 팀 강조 애니메이션 — 글로우 대신 미세한 움직임 */}
      <style>{`
        @keyframes nexus-lead-badge {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.14); opacity: 1; }
        }
        @keyframes nexus-lead-bar {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div
        className={cn(
          "grid min-h-0 flex-1 content-center gap-6",
          columns,
        )}
      >
        {teams.map((team, index) => (
          <div
            key={team.id ?? index}
            className={cn("min-w-0", index % 2 === 1 && "translate-y-5")}
          >
            <CompactTeamCard
              team={team}
              auctionState={auctionState}
              index={index}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactTeamCard({
  team,
  auctionState,
  index,
}: {
  team: any;
  auctionState: any;
  index: number;
}) {
  const members = team.members ?? [];
  const budget = team.remainingGold ?? team.remainingBudget ?? 0;
  const color = team.color ?? "#8B5CF6";
  const isCurrentBidder =
    auctionState?.currentHighestBidder === team.id ||
    auctionState?.currentHighestBidder === team.captainId;
  const captain = members.find((m: any) => userIdOf(m) === team.captainId);
  const captainName = captain?.username ?? team.captainName ?? team.name;

  // 리더 팀이 한 번 "또잉!" 튀는 스프링 바운스.
  // - 실제 입찰(최고가 변동) 시마다
  // - preview/오버레이엔 입찰 이벤트가 없으니 화면이 뜰 때(마운트) 한 번도
  const cardRef = useRef<HTMLDivElement>(null);
  const prevBidRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(false);
  useEffect(() => {
    const bid = auctionState?.currentHighestBid;
    const changed = bid !== prevBidRef.current;
    prevBidRef.current = bid;
    const first = !mountedRef.current;
    mountedRef.current = true;

    if (!isCurrentBidder || !cardRef.current?.animate) return;
    if (!first && !changed) return; // 마운트 이후엔 실제 입찰 변동시에만

    const play = () =>
      cardRef.current?.animate(
        [
          {
            transform: "scale(1)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            easing: "cubic-bezier(0.22, 0.8, 0.3, 1)", // 떠오르는 구간
            offset: 0,
          },
          {
            transform: "scale(1.05)",
            boxShadow: "0 28px 60px rgba(0,0,0,0.5)",
            easing: "linear", // 정점 유지
            offset: 0.18,
          },
          {
            transform: "scale(1.05)",
            boxShadow: "0 28px 60px rgba(0,0,0,0.5)",
            easing: "cubic-bezier(0.4, 0, 0.3, 1)", // 내려가는 구간
            offset: 0.66,
          },
          {
            transform: "scale(1)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            offset: 1,
          },
        ],
        { duration: 850 },
      );

    if (first) {
      // 씬 전환 암전이 걷힌 뒤 보이도록 약간 지연
      const t = setTimeout(play, 480);
      return () => clearTimeout(t);
    }
    play();
  }, [auctionState?.currentHighestBid, isCurrentBidder]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.3)]",
      )}
      style={{
        background: `linear-gradient(135deg, ${color}10 0%, transparent 50%), rgba(8,8,14,0.94)`,
        border: isCurrentBidder
          ? "1px solid rgba(245,158,11,0.55)"
          : `1px solid ${color}20`,
      }}
    >
      {/* 팀 컬러 상단 줄 — 입찰 팀은 앰버 라인이 좌우로 흐름 */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={
          isCurrentBidder
            ? {
                background:
                  "linear-gradient(90deg, rgba(245,158,11,0) 0%, rgba(245,158,11,0.95) 50%, rgba(245,158,11,0) 100%)",
                backgroundSize: "200% 100%",
                animation: "nexus-lead-bar 2.2s linear infinite",
              }
            : { background: `linear-gradient(90deg, ${color}bb, ${color}00)` }
        }
      />

      <div className="px-1.5 pb-3 pt-3.5">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-black text-black"
            style={{ background: color }}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-black text-white">
                {captainName}
              </p>
              {isCurrentBidder && (
                <span
                  className="rounded bg-amber-300/18 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-300"
                  style={{ animation: "nexus-lead-badge 1.1s ease-in-out infinite" }}
                >
                  LEAD
                </span>
              )}
            </div>
            <p className="truncate text-[10px] font-semibold text-white/30">
              {team.name} · {members.length}/5
            </p>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
              Gold
            </p>
            <p className="text-sm font-black tabular-nums text-amber-300">
              {budget.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2.5">
          {Array.from({ length: 5 }).map((_, slotIndex) => {
            const member = members[slotIndex];
            const isCaptain = member && userIdOf(member) === team.captainId;
            const tierIcon = tierIconUrl(member?.tier);

            return (
              <div
                key={member ? userIdOf(member) ?? slotIndex : `empty-${slotIndex}`}
                className={cn(
                  "grid h-[78px] min-w-0 place-items-center rounded-md px-1 py-2",
                  member
                    ? isCaptain
                      ? "bg-amber-300/8 ring-1 ring-amber-300/30"
                      : "bg-white/[0.04] ring-1 ring-white/[0.07]"
                    : "border border-dashed border-white/[0.06]",
                )}
              >
                {member ? (
                  <>
                    <div className="relative h-10 w-10">
                      <PlayerPortrait
                        src={member.avatar}
                        alt={member.username ?? "member"}
                        placeholder={AVATAR_PLACEHOLDER.sm}
                        className="h-10 w-10 rounded-full ring-1 ring-white/16"
                      />
                      {isCaptain && (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
                      )}
                      {tierIcon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tierIcon}
                          alt=""
                          width={14}
                          height={14}
                          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-black/70"
                        />
                      )}
                    </div>
                    <span className="mt-1.5 w-full truncate text-center text-[10px] font-black leading-none text-white/88">
                      {member.username}
                    </span>
                    <span className="sr-only">
                        {member.username}
                      </span>
                  </>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-white/12" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CurrentLot({
  auctionState,
  teams,
  compact = false,
}: {
  auctionState: any;
  teams: any[];
  compact?: boolean;
}) {
  const player = auctionState.currentPlayer;
  const [timeLeft, setTimeLeft] = useState(0);
  // 카운트다운 각 초마다 "딱!" 하고 튀는 플래시 상태
  const [tick, setTick] = useState(false);

  useEffect(() => {
    const update = () =>
      setTimeLeft(
        Math.max(0, Math.ceil(((auctionState.timerEnd ?? 0) - Date.now()) / 1000)),
      );
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [auctionState.timerEnd]);

  // 남은 시간(정수 초)이 바뀔 때마다 짧게 플래시를 켰다 끈다 → 초 단위로 반짝
  useEffect(() => {
    if (timeLeft <= 0 || timeLeft > 5) {
      setTick(false);
      return;
    }
    setTick(true);
    const t = setTimeout(() => setTick(false), 200);
    return () => clearTimeout(t);
  }, [timeLeft]);

  const bidderTeam = teams.find(
    (team) =>
      team.id === auctionState.currentHighestBidder ||
      team.captainId === auctionState.currentHighestBidder,
  );
  const bidderName =
    auctionState.currentHighestBidderName ??
    bidderTeam?.captainName ??
    bidderTeam?.name ??
    "입찰 대기";
  const tierIcon = tierIconUrl(player?.tier);
  const mainRole = roleLabel(player?.mainRole ?? player?.position);
  const subRole = roleLabel(player?.subRole);
  const timerDanger = timeLeft <= 5;

  return (
    <section
      className={cn(
        "relative min-h-0 overflow-hidden rounded-lg border border-white/10 bg-black/44 shadow-[0_20px_70px_rgba(0,0,0,0.42)]",
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(139,92,246,0.24),transparent_46%),radial-gradient(circle_at_78%_18%,rgba(245,158,11,0.22),transparent_30%)]" />
      <div className="absolute inset-x-0 top-0 h-1 bg-violet-400/80" />
      <div
        className={cn(
          "relative grid",
          compact ? "grid-rows-[auto_auto]" : "h-full grid-rows-[1fr_auto]",
        )}
      >
        {compact ? (
          <div className="flex flex-col gap-4 p-7">
            {/* 윗줄: 포트레이트 + [이름·타이머·뱃지] */}
            <div className="flex min-w-0 items-center gap-5">
              <div className="relative shrink-0">
                <PlayerPortrait
                  src={player?.avatar}
                  alt={player?.username ?? "player"}
                  placeholder={AVATAR_PLACEHOLDER.md}
                  className="h-24 w-24 rounded-full ring-2 ring-violet-400/70"
                />
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-violet-400 px-2 py-0.5 text-[10px] font-black text-black">
                  LOT
                </span>
              </div>
              <div className="min-w-0 flex-1">
                {/* 이름 + 타이머 한 줄 */}
                <div className="flex min-w-0 items-center gap-3">
                  <h1 className="min-w-0 flex-1 truncate text-5xl font-black leading-none text-white">
                    {player?.username ?? "대기 중"}
                  </h1>
                  <span
                    className={cn(
                      "flex shrink-0 items-baseline gap-0.5 rounded-xl px-4 py-2 font-black tabular-nums leading-none ring-1 transition-all duration-150 will-change-transform",
                      timerDanger
                        ? tick
                          ? "scale-110 bg-red-500/70 text-white ring-red-300/90 shadow-[0_0_46px_rgba(239,68,68,0.8)]"
                          : "scale-100 bg-red-500/20 text-red-300 ring-red-400/50 shadow-[0_0_18px_rgba(239,68,68,0.32)]"
                        : "bg-violet-500/30 text-white ring-violet-300/60 shadow-[0_0_26px_rgba(139,92,246,0.4)]",
                    )}
                  >
                    <span className="text-5xl">{timeLeft}</span>
                    <span className="text-lg opacity-70">s</span>
                  </span>
                </div>
                {/* 뱃지 */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1.5 rounded bg-white/[0.07] px-2.5 py-1 text-sm font-black text-white ring-1 ring-white/10">
                    {tierIcon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tierIcon} alt="" width={15} height={15} />
                    )}
                    {player?.tier ?? "UNRANKED"}
                  </span>
                  {mainRole && (
                    <span className="flex shrink-0 items-center gap-1.5 rounded bg-violet-500/15 px-2.5 py-1 text-sm font-black text-violet-100 ring-1 ring-violet-300/25">
                      <RoleIcon role={player?.mainRole ?? player?.position} />
                      {mainRole}
                    </span>
                  )}
                  {subRole && (
                    <span className="shrink-0 rounded bg-white/[0.04] px-2.5 py-1 text-sm font-bold text-white/50 ring-1 ring-white/8">
                      {subRole}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* 아랫줄: 금액 + 리딩팀 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-black/36 px-4 py-3.5 ring-1 ring-amber-300/22">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Current Bid</p>
                <div className="mt-1.5 flex items-end gap-1.5">
                  <span className="text-5xl font-black tabular-nums leading-none text-amber-300">
                    {(auctionState.currentHighestBid ?? 0).toLocaleString()}
                  </span>
                  <span className="mb-0.5 text-lg font-black text-amber-300/60">G</span>
                </div>
              </div>
              <div className="rounded-md bg-black/30 px-4 py-3.5 ring-1 ring-white/8">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Leading Team</p>
                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                  {bidderTeam?.color && (
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: bidderTeam.color }} />
                  )}
                  <span className="truncate text-3xl font-black text-white">{bidderName}</span>
                </div>
              </div>
            </div>
            {auctionState.yuchalCount > 0 && (
              <p className="rounded bg-amber-300/10 px-2 py-1 text-xs font-black text-amber-200">
                유찰 {auctionState.yuchalCount}/{auctionState.maxYuchalCycles}
              </p>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "grid min-h-0 items-start",
              "grid-cols-[minmax(0,1fr)_260px] gap-8 p-8",
            )}
          >
          <div className="min-w-0">
            <div className="mb-6 flex items-center gap-4">
              <div className="relative shrink-0">
                <PlayerPortrait
                  src={player?.avatar}
                  alt={player?.username ?? "player"}
                  placeholder={AVATAR_PLACEHOLDER.md}
                  className="h-28 w-28 rounded-full ring-2 ring-violet-400/70"
                />
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-violet-400 px-2 py-0.5 text-[11px] font-black text-black">
                  LOT
                </span>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-sm font-black uppercase tracking-[0.35em] text-violet-300">
                  Current Player
                </p>
                <h1 className="truncate text-7xl font-black leading-none text-white">
                  {player?.username ?? "대기 중"}
                  </h1>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-2 rounded-md bg-white/[0.07] px-4 py-1.5 text-base font-black text-white ring-1 ring-white/10">
                      {tierIcon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tierIcon} alt="" width={22} height={22} />
                      )}
                      {player?.tier ?? "UNRANKED"}
                    </span>
                  {mainRole && (
                    <span className="flex items-center gap-2 rounded-md bg-violet-500/15 px-4 py-1.5 text-base font-black text-violet-100 ring-1 ring-violet-300/25">
                      <RoleIcon role={player?.mainRole ?? player?.position} />
                      {mainRole}
                    </span>
                  )}
                  {subRole && (
                    <span className="rounded-md bg-white/[0.04] px-3 py-1 text-sm font-bold text-white/50 ring-1 ring-white/8">
                      {subRole}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-md bg-black/36 px-5 py-4 ring-1 ring-amber-300/25">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">Current Bid</p>
                <div className="mt-2 flex items-end gap-3">
                  <span className="text-6xl font-black tabular-nums leading-none text-amber-300">
                    {(auctionState.currentHighestBid ?? 0).toLocaleString()}
                  </span>
                  <span className="mb-1 text-xl font-black text-amber-300/60">G</span>
                </div>
              </div>
              <div className="rounded-md bg-black/30 px-5 py-4 ring-1 ring-white/8">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">Leading Team</p>
                <div className="mt-3 flex min-w-0 items-center gap-3">
                  {bidderTeam?.color && (
                    <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: bidderTeam.color }} />
                  )}
                  <span className="truncate text-3xl font-black text-white">{bidderName}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center border-y border-white/12 bg-black/24">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.32em] text-white/38">
              Time Left
            </p>
            <div
              className={cn(
                "flex h-44 w-44 items-center justify-center rounded-full border-[10px] bg-black/42",
                timerDanger
                  ? "border-rose-500 text-rose-400 shadow-[0_0_46px_rgba(244,63,94,0.38)]"
                  : "border-violet-400 text-white shadow-[0_0_46px_rgba(139,92,246,0.25)]",
              )}
            >
              <span className="text-8xl font-black tabular-nums leading-none">
                {timeLeft}
              </span>
            </div>
            {auctionState.yuchalCount > 0 && (
              <p className="mt-5 rounded bg-amber-300/14 px-3 py-1 text-sm font-black text-amber-200">
                유찰 {auctionState.yuchalCount}/{auctionState.maxYuchalCycles}
              </p>
            )}
          </div>
        </div>
        )}

        {!compact && <CurrentLotTeamStrip teams={teams} />}
      </div>
    </section>
  );
}

function CurrentLotTeamStrip({
  teams,
  compact = false,
}: {
  teams: any[];
  compact?: boolean;
}) {
  if (teams.length <= 2) {
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-white/10 bg-black/42 px-8 py-4">
        <TeamMiniStat team={teams[0]} />
        <span className="px-8 text-sm font-black uppercase tracking-[0.45em] text-white/30">
          Auction Draft
        </span>
        <TeamMiniStat team={teams[1]} align="right" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] items-center border-t border-white/10 bg-black/42",
        compact ? "gap-4 px-6 py-3" : "gap-5 px-8 py-4",
      )}
    >
      <span
        className={cn(
          "font-black uppercase tracking-[0.45em] text-white/30",
          compact ? "text-xs" : "text-sm",
        )}
      >
        Auction Draft
      </span>
      <div className="grid min-w-0 grid-cols-4 gap-2">
        {teams.slice(0, 4).map((team) => (
          <TeamMiniStat key={team.id} team={team} compact />
        ))}
      </div>
    </div>
  );
}

function TeamMiniStat({
  team,
  align = "left",
  compact = false,
}: {
  team?: any;
  align?: "left" | "right";
  compact?: boolean;
}) {
  if (!team) return <div />;
  const budget = team.remainingGold ?? team.remainingBudget ?? 0;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        align === "right" && "justify-end",
      )}
    >
      <span
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: team.color ?? "#8B5CF6" }}
      />
      <span
        className={cn(
          "truncate font-black text-white",
          compact ? "text-sm" : "max-w-[260px] text-lg",
        )}
      >
        {team.name}
      </span>
      <span
        className={cn(
          "font-black tabular-nums text-amber-300",
          compact ? "text-sm" : "text-base",
        )}
      >
        {budget.toLocaleString()}G
      </span>
    </div>
  );
}

function BroadcastHeader({
  teams,
  players,
  connected,
}: {
  teams: any[];
  players: any[];
  connected: boolean;
}) {
  const filledSlots = teams.reduce(
    (sum, team) => sum + (team.members?.length ?? 0),
    0,
  );
  const totalSlots = teams.length * 5;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/50 px-7 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="border border-violet-300/35 bg-violet-500/60 px-3 py-1.5 text-lg font-black text-white">
          NX
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-rose-500 shadow-[0_0_10px_#f43f5e]" : "bg-amber-300",
            )}
          />
          <span className="text-[11px] font-black uppercase tracking-[0.35em] text-rose-300">
            Live Auction
          </span>
          <span className="text-white/20">·</span>
          <h2 className="text-base font-black tracking-tight text-white/80">
            경매 드래프트
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <HeaderStat label="Teams" value={teams.length} />
        <HeaderStat label="Slots" value={`${filledSlots}/${totalSlots}`} />
        <HeaderStat label="Pool" value={players.length} />
      </div>
    </header>
  );
}

function HeaderStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-black tabular-nums text-white">{value}</p>
    </div>
  );
}

function BottomDeck({
  players,
  currentPlayerId,
  bidHistory,
  compact = false,
}: {
  players: any[];
  currentPlayerId?: string;
  bidHistory: any[];
  compact?: boolean;
}) {
  const recentBids = bidHistory.filter((entry) => !entry.isSeparator).slice(-5).reverse();

  return (
    <section
      className={cn(
        "grid shrink-0 gap-4",
        compact
          ? "h-[142px] grid-cols-[minmax(0,1fr)_240px]"
          : "h-40 grid-cols-[minmax(0,1fr)_520px]",
      )}
    >
      <div className={cn("min-w-0", compact ? "px-4 py-3" : "px-5 py-4", glass)}>
        <div className={cn("flex items-center justify-between", compact ? "mb-2" : "mb-3")}>
          <p
            className={cn(
              "font-black uppercase tracking-[0.28em] text-violet-200",
              compact ? "text-xs" : "text-sm",
            )}
          >
            Remaining Pool
          </p>
          <span
            className={cn(
              "font-black text-white/40",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {players.length} players
          </span>
        </div>
        <div className="flex min-w-0 gap-2 overflow-hidden">
          {players.slice(0, compact ? 5 : 10).map((player, index) => {
            const playerId = userIdOf(player);
            const active = playerId === currentPlayerId;
            const tierIcon = tierIconUrl(player.tier);
            return (
              <div
                key={playerId ?? index}
                className={cn(
                  "flex items-center gap-2 border bg-white/[0.04] px-3",
                  compact ? "h-14 min-w-[116px]" : "h-16 min-w-[148px]",
                  active ? "border-violet-300 bg-violet-300/[0.08]" : "border-white/10",
                )}
              >
                <span className="text-xs font-black tabular-nums text-white/30">
                  {index + 1}
                </span>
                {tierIcon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tierIcon}
                    alt=""
                    width={compact ? 16 : 20}
                    height={compact ? 16 : 20}
                  />
                )}
                <span
                  className={cn(
                    "min-w-0 truncate font-black text-white",
                    compact ? "text-xs" : "text-sm",
                  )}
                >
                  {player.username}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={cn(compact ? "px-4 py-3" : "px-5 py-4", glass)}>
        <p
          className={cn(
            "font-black uppercase tracking-[0.28em] text-amber-200",
            compact ? "mb-2 text-xs" : "mb-3 text-sm",
          )}
        >
          Bid Log
        </p>
        <div className={cn(compact ? "space-y-1" : "space-y-1.5")}>
          {recentBids.length === 0 ? (
            <div
              className={cn(
                "rounded-lg border border-dashed border-white/10 text-center font-bold text-white/35",
                compact ? "py-5 text-xs" : "py-7 text-sm",
              )}
            >
              아직 입찰 없음
            </div>
          ) : (
            recentBids.slice(0, compact ? 3 : 5).map((bid, index) => (
              <div
                key={`${bid.timestamp}-${index}`}
              className={cn(
                  "grid items-center gap-2 border border-white/10 bg-black/28 px-3",
                  compact
                    ? "grid-cols-[minmax(0,1fr)_72px] py-1.5"
                    : "grid-cols-[minmax(0,1fr)_110px] py-2",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 truncate font-black text-white",
                    compact ? "text-xs" : "text-sm",
                  )}
                >
                  {bid.username}
                </span>
                <span
                  className={cn(
                    "text-right font-black tabular-nums text-amber-300",
                    compact ? "text-xs" : "text-sm",
                  )}
                >
                  {Number(bid.amount ?? 0).toLocaleString()}G
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function MultiAuxDeck({
  players,
  currentPlayerId,
  bidHistory,
}: {
  players: any[];
  currentPlayerId?: string;
  bidHistory: any[];
}) {
  // 최신순(위가 최신). 영역보다 많으면 영역 안에서 스크롤되도록 넉넉히 보관.
  const recentBids = bidHistory.filter((entry) => !entry.isSeparator).slice(-40).reverse();

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 px-1">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between px-1">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-200">
            Pool
          </p>
          <span className="text-xs font-black text-white/35">
            {players.length} left
          </span>
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 content-start gap-2.5 overflow-y-auto rounded-md bg-white/[0.02] p-1.5 ring-1 ring-white/[0.05] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {players.map((player, index) => {
            const playerId = userIdOf(player);
            const active = playerId === currentPlayerId;
            const tierIcon = tierIconUrl(player.tier);
            return (
              <div
                key={playerId ?? index}
              className={cn(
                  "grid h-10 min-w-0 grid-cols-[18px_18px_minmax(0,1fr)] items-center gap-2 rounded-md px-2.5",
                  active
                    ? "bg-violet-300/[0.09] ring-1 ring-violet-300/50"
                    : "bg-white/[0.03] ring-1 ring-white/[0.07]",
                )}
              >
                <span className="text-[10px] font-black tabular-nums text-white/28">
                  {index + 1}
                </span>
                {tierIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tierIcon} alt="" width={16} height={16} />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-white/18" />
                )}
                <span className="min-w-0 truncate text-xs font-black text-white/82">
                  {player.username}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-white/8 pt-4">
        <div className="mb-2 flex shrink-0 items-center justify-between px-1">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-200">
            Bid Log
          </p>
          <span className="text-xs font-black text-white/28">recent</span>
        </div>
        {recentBids.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-white/10 text-center text-xs font-bold text-white/35">
            아직 입찰 없음
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto rounded-md bg-white/[0.02] p-1.5 ring-1 ring-white/[0.05] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {recentBids.map((bid, index) => (
              <div
                key={`${bid.timestamp}-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.06]"
              >
                <span className="min-w-0 truncate text-sm font-black text-white">
                  {bid.username}
                </span>
                <span className="text-right text-sm font-black tabular-nums text-amber-300">
                  {Number(bid.amount ?? 0).toLocaleString()}G
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function AuctionBoardView({ data }: { data: BroadcastAuctionData }) {
  const { auctionState, teams, players, captainPhase, status, bidHistory } = data;
  const sortedTeams = useMemo(() => sortTeams(teams), [teams]);
  const currentPlayerId =
    auctionState?.currentPlayer?.id ?? auctionState?.currentPlayer?.userId;

  return (
    <div
      className="relative flex h-full w-full flex-col gap-5 overflow-hidden bg-[#05070d] px-10 pb-36 pt-8 text-white"
    >
      <style>{liveBgCss}</style>
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
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5">
        {auctionState ? (
          <>
          <BroadcastHeader
            teams={sortedTeams}
            players={players}
            connected={data.connected}
          />

          <main className="grid min-h-0 flex-1 grid-cols-[600px_minmax(0,1fr)] gap-5">
            <div className="flex min-h-0 flex-col gap-4">
              <CurrentLot auctionState={auctionState} teams={sortedTeams} compact />
              <MultiAuxDeck
                players={players}
                currentPlayerId={currentPlayerId}
                bidHistory={bidHistory}
              />
            </div>
            <MultiTeamBoard teams={sortedTeams} auctionState={auctionState} />
          </main>
          </>
        ) : (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col items-center justify-center gap-5",
              glass,
            )}
          >
            <span className="text-5xl font-black uppercase tracking-[0.24em] text-white/60">
              {status === "WAITING" || captainPhase
                ? "팀장 선정 중"
                : "경매 준비 중"}
            </span>
            {captainPhase && (
              <span className="text-2xl font-black text-violet-200">
                지원자 {captainPhase.volunteers?.length ?? 0}명
              </span>
            )}
            {!data.connected && (
              <span className="text-lg font-black text-amber-200">
                경매 서버에 연결 중
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
