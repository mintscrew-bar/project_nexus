"use client";

import { useEffect, useMemo, useState } from "react";
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

const stageBg =
  "radial-gradient(circle at 50% 24%, rgba(139,92,246,0.18), transparent 34%), linear-gradient(180deg, rgba(18,18,24,0.98), rgba(7,7,10,0.98))";

const glass =
  "border border-white/10 bg-black/42 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur";
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")
  .replace(/\/api$/, "")
  .replace(/\/$/, "");
const DEFAULT_AVATAR_SRC = "/images/N-avatar.png";

const userIdOf = (value: any) => value?.id ?? value?.userId;

const tierIconUrl = (tier?: string | null) => {
  const t = String(tier ?? "").toUpperCase();
  return t && t !== "UNRANKED" ? `/icons/tiers/${t.toLowerCase()}.png` : null;
};

const roleLabel = (role?: string | null) => {
  if (!role) return null;
  return ROLE_LABELS[role.toUpperCase()] ?? role.toUpperCase();
};

const normalizeAvatarSrc = (src?: string | null) => {
  const value = src?.trim();
  if (!value) return DEFAULT_AVATAR_SRC;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("/uploads/")) return `${API_ORIGIN}${value}`;
  if (value.startsWith("/")) return value;
  if (/^[\w.-]+\.(?:png|jpe?g|gif|webp|avif)$/i.test(value)) {
    return `${API_ORIGIN}/uploads/${value}`;
  }
  return DEFAULT_AVATAR_SRC;
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
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const normalizedSrc = normalizeAvatarSrc(src);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalizedSrc}
      alt={alt}
      className={cn("object-cover", className)}
      onError={(event) => {
        if (event.currentTarget.src.endsWith(DEFAULT_AVATAR_SRC)) return;
        event.currentTarget.src = DEFAULT_AVATAR_SRC;
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
                    src={normalizeAvatarSrc(member.avatar)}
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
    <section className="flex min-h-0 flex-col overflow-hidden px-2 py-1">
      <div className="mb-5 flex shrink-0 items-center justify-between px-1">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-violet-200">
            Team Board
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            팀 현황
          </h3>
        </div>
        <span className="rounded bg-white/8 px-3 py-1 text-sm font-black text-white/55">
          {teams.length} Teams
        </span>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1 content-center gap-4 overflow-hidden",
          columns,
        )}
      >
        {teams.map((team, index) => (
          <CompactTeamCard
            key={team.id ?? index}
            team={team}
            auctionState={auctionState}
            index={index}
          />
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

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-3",
        isCurrentBidder
          ? "border-amber-300/60 bg-amber-300/[0.055] shadow-[0_0_24px_rgba(245,158,11,0.16)]"
          : "border-white/8 bg-white/[0.032]",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-black text-black"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-black text-white">
              {captainName}
            </p>
            {isCurrentBidder && (
              <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[9px] font-black text-black">
                TOP
              </span>
            )}
          </div>
          <p className="truncate text-[10px] font-bold text-white/35">
            {team.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
            Gold
          </p>
          <p className="text-sm font-black tabular-nums text-amber-300">
            {budget.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 5 }).map((_, slotIndex) => {
          const member = members[slotIndex];
          const isCaptain = member && userIdOf(member) === team.captainId;
          const tierIcon = tierIconUrl(member?.tier);

          return (
            <div
              key={member ? userIdOf(member) ?? slotIndex : `empty-${slotIndex}`}
              className={cn(
                "flex h-12 min-w-0 items-center justify-center rounded-lg border bg-black/22",
                member ? "border-white/10" : "border-dashed border-white/8",
                isCaptain && "border-amber-300/55",
              )}
              title={member?.username}
            >
              {member ? (
                <div className="relative">
                  {tierIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tierIcon}
                      alt=""
                      width={22}
                      height={22}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-xs font-black text-white/70">
                      {member.username?.[0] ?? "?"}
                    </span>
                  )}
                  {isCaptain && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-300" />
                  )}
                </div>
              ) : (
                <span className="h-2 w-2 rounded-full bg-white/10" />
              )}
            </div>
          );
        })}
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

  useEffect(() => {
    const update = () =>
      setTimeLeft(
        Math.max(0, Math.ceil(((auctionState.timerEnd ?? 0) - Date.now()) / 1000)),
      );
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [auctionState.timerEnd]);

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
        "relative min-h-0 overflow-hidden rounded-2xl",
        compact && "self-start",
        glass,
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(139,92,246,0.22),transparent_45%),radial-gradient(circle_at_80%_20%,rgba(245,158,11,0.18),transparent_28%)]" />
      <div
        className={cn(
          "relative grid",
          compact ? "grid-rows-[auto_auto]" : "h-full grid-rows-[1fr_auto]",
        )}
      >
        <div
          className={cn(
            "grid min-h-0 items-start",
            compact
              ? "grid-cols-[minmax(0,1fr)_150px] gap-4 p-5"
              : "grid-cols-[minmax(0,1fr)_260px] gap-8 p-8",
          )}
        >
          <div className="min-w-0">
            <div className={cn("flex items-center gap-4", compact ? "mb-4" : "mb-6")}>
              <div className="relative">
                <PlayerPortrait
                  src={player?.avatar}
                  alt={player?.username ?? "player"}
                  className={cn(
                    "rounded-2xl border border-white/10 ring-2 ring-violet-400/80",
                    compact ? "h-20 w-20" : "h-28 w-28",
                  )}
                />
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-violet-400 px-2 py-0.5 text-[11px] font-black text-black">
                  LOT
                </span>
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "mb-1 font-black uppercase tracking-[0.35em] text-violet-300",
                    compact ? "text-xs" : "text-sm",
                  )}
                >
                  Current Player
                </p>
                <h1
                  className={cn(
                    "truncate font-black leading-none tracking-normal text-white",
                    compact ? "text-5xl" : "text-7xl",
                  )}
                >
                  {player?.username ?? "대기 중"}
                </h1>
                <div
                  className={cn(
                    "flex flex-wrap items-center",
                    compact ? "mt-3 gap-2" : "mt-4 gap-3",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-2 rounded-full bg-white/10 font-black text-white",
                      compact ? "px-3 py-1 text-sm" : "px-4 py-1.5 text-base",
                    )}
                  >
                    {tierIcon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tierIcon}
                        alt=""
                        width={compact ? 18 : 22}
                        height={compact ? 18 : 22}
                      />
                    )}
                    {player?.tier ?? "UNRANKED"}
                  </span>
                  {mainRole && (
                    <span
                      className={cn(
                        "flex items-center gap-2 rounded-full bg-violet-500/24 font-black text-violet-100",
                        compact ? "px-3 py-1 text-sm" : "px-4 py-1.5 text-base",
                      )}
                    >
                      <RoleIcon role={player?.mainRole ?? player?.position} />
                      {mainRole}
                    </span>
                  )}
                  {subRole && (
                    <span className="rounded-full bg-white/8 px-3 py-1 text-sm font-bold text-white/55">
                      {subRole}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
                compact ? "gap-3" : "gap-4",
              )}
            >
              <div
                className={cn(
                  "rounded-xl border border-amber-300/20 bg-black/36",
                  compact ? "px-4 py-3" : "px-5 py-4",
                )}
              >
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">
                  Current Bid
                </p>
                <div className="mt-2 flex items-end gap-3">
                  <span
                    className={cn(
                      "font-black tabular-nums leading-none text-amber-300",
                      compact ? "text-5xl" : "text-6xl",
                    )}
                  >
                    {(auctionState.currentHighestBid ?? 0).toLocaleString()}
                  </span>
                  <span className="mb-1 text-xl font-black text-amber-300/60">G</span>
                </div>
              </div>
              <div
                className={cn(
                  "rounded-xl border border-white/10 bg-black/30",
                  compact ? "px-4 py-3" : "px-5 py-4",
                )}
              >
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/40">
                  Leading Team
                </p>
                <div className={cn("flex min-w-0 items-center gap-3", compact ? "mt-2" : "mt-3")}>
                  {bidderTeam?.color && (
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: bidderTeam.color }}
                    />
                  )}
                  <span
                    className={cn(
                      "truncate font-black text-white",
                      compact ? "text-2xl" : "text-3xl",
                    )}
                  >
                    {bidderName}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {compact ? (
            <div
              className={cn(
                "rounded-xl border bg-black/40 px-4 py-3",
                timerDanger
                  ? "border-rose-400/55 shadow-[0_0_32px_rgba(244,63,94,0.22)]"
                  : "border-white/10 shadow-[0_0_28px_rgba(139,92,246,0.14)]",
              )}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/38">
                Time
              </p>
              <div className="mt-2 flex items-end gap-1">
                <span
                  className={cn(
                    "text-6xl font-black tabular-nums leading-none",
                    timerDanger ? "text-rose-400" : "text-white",
                  )}
                >
                  {timeLeft}
                </span>
                <span className="mb-1 text-sm font-black text-white/32">sec</span>
              </div>
              <div
                className={cn(
                  "mt-3 h-1.5 rounded-full",
                  timerDanger ? "bg-rose-400" : "bg-violet-400",
                )}
              />
              {auctionState.yuchalCount > 0 && (
                <p className="mt-3 rounded bg-amber-300/14 px-2 py-1 text-xs font-black text-amber-200">
                  유찰 {auctionState.yuchalCount}/{auctionState.maxYuchalCycles}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/38">
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
          )}
        </div>

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
    <header className="flex h-20 shrink-0 items-center justify-between rounded-2xl border border-white/10 bg-black/50 px-7 backdrop-blur">
      <div className="flex items-center gap-5">
        <div className="rounded bg-violet-500 px-4 py-2 text-2xl font-black text-white">
          NX
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                connected ? "bg-rose-500 shadow-[0_0_12px_#f43f5e]" : "bg-amber-300",
              )}
            />
            <span className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
              Live Auction
            </span>
          </div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
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
      <p className="mt-1 text-3xl font-black tabular-nums text-white">{value}</p>
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
      <div className={cn("min-w-0 rounded-2xl", compact ? "px-4 py-3" : "px-5 py-4", glass)}>
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
                  "flex items-center gap-2 rounded-xl border bg-white/[0.045] px-3",
                  compact ? "h-[72px] min-w-[116px]" : "h-20 min-w-[148px]",
                  active ? "border-violet-300" : "border-white/8",
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

      <div className={cn("rounded-2xl", compact ? "px-4 py-3" : "px-5 py-4", glass)}>
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
                  "grid items-center gap-2 rounded-lg bg-black/34 px-3",
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
  const recentBids = bidHistory.filter((entry) => !entry.isSeparator).slice(-5).reverse();

  return (
    <section className="grid gap-4 px-1">
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-200">
            Pool
          </p>
          <span className="text-xs font-black text-white/35">
            {players.length} left
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {players.slice(0, 4).map((player, index) => {
            const playerId = userIdOf(player);
            const active = playerId === currentPlayerId;
            const tierIcon = tierIconUrl(player.tier);
            return (
              <div
                key={playerId ?? index}
                className={cn(
                  "grid h-11 min-w-0 grid-cols-[18px_18px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2.5",
                  active
                    ? "border-violet-300/85 bg-violet-300/[0.08]"
                    : "border-white/8 bg-white/[0.028]",
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

      <div className="border-t border-white/8 pt-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-200">
            Bid Log
          </p>
          <span className="text-xs font-black text-white/28">recent</span>
        </div>
        {recentBids.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 py-5 text-center text-xs font-bold text-white/35">
            아직 입찰 없음
          </div>
        ) : (
          <div className="grid gap-1.5">
            {recentBids.map((bid, index) => (
              <div
                key={`${bid.timestamp}-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 rounded-lg bg-black/24 px-2.5 py-2"
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
      className="flex h-full w-full flex-col gap-5 overflow-hidden px-10 pb-36 pt-8 text-white"
      style={{ background: stageBg }}
    >
      {auctionState ? (
        <>
          <BroadcastHeader
            teams={sortedTeams}
            players={players}
            connected={data.connected}
          />

          <main className="grid min-h-0 flex-1 grid-cols-[520px_minmax(0,1fr)] gap-6">
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
            "flex min-h-0 flex-1 flex-col items-center justify-center gap-5 rounded-2xl",
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
  );
}
