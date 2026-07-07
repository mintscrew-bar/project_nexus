"use client";

import { Coins, ScrollText, Users } from "lucide-react";
import { Card } from "@/components/ui";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * 방송용 경매 사이드 패널(read-only) — 기존 경매 페이지의 팀 요약/남은 매물
 * 패널을 넥서스 디자인 그대로 재현하되, 호버·프로필 모달 등 상호작용은 제거.
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

function RoleIcon({ role, dim }: { role?: string | null; dim?: boolean }) {
  if (!role) return null;
  const url = ROLE_ICON[role.toUpperCase()];
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={role}
      width={14}
      height={14}
      className={cn("object-contain brightness-0 invert", dim && "opacity-40")}
    />
  );
}

const tierIconUrl = (tier?: string) => {
  const t = String(tier ?? "").toUpperCase();
  return t && t !== "UNRANKED" ? `/icons/tiers/${t.toLowerCase()}.png` : null;
};

const userIdOf = (value: any) => value?.id ?? value?.userId;

// ─── 팀 요약 패널 (좌측) ──────────────────────────────────────
export function BroadcastTeamSummary({
  teams,
  auctionState,
}: {
  teams: any[];
  auctionState: any;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-2 flex h-10 shrink-0 items-center justify-between rounded-lg border border-bg-tertiary bg-bg-secondary px-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">팀 요약</span>
        </div>
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
          {teams.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {teams.map((team) => {
          const members = team.members ?? [];
          const budget = team.remainingGold ?? team.remainingBudget ?? 0;
          const captain = members.find(
            (m: any) => userIdOf(m) === team.captainId,
          );
          const captainName = captain?.username ?? team.captainName ?? team.name;
          const isCurrentBidder =
            auctionState?.currentHighestBidder === team.id ||
            auctionState?.currentHighestBidder === team.captainId;
          const isFull = members.length >= 5;

          return (
            <Card
              key={team.id}
              className={cn(
                "overflow-hidden p-0",
                isCurrentBidder &&
                  "border-accent-gold/50 shadow-sm shadow-accent-gold/10",
                isFull && "opacity-80",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-2 border-b border-bg-tertiary/70 px-3 py-2.5",
                  isCurrentBidder ? "bg-accent-gold/10" : "bg-bg-tertiary/20",
                )}
              >
                <div className="relative shrink-0">
                  <Avatar
                    src={captain?.avatar}
                    alt={captainName}
                    fallback={captainName?.[0] ?? "?"}
                    size="sm"
                    className={cn(
                      isCurrentBidder
                        ? "ring-2 ring-accent-gold/60"
                        : "ring-1 ring-bg-elevated",
                    )}
                  />
                  <span className="absolute -bottom-1 -right-1 rounded bg-accent-gold px-1 text-[9px] font-bold text-bg-primary">
                    C
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {team.color && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                    )}
                    <span className="truncate text-sm font-bold text-text-primary">
                      {captainName}
                    </span>
                    {isCurrentBidder && (
                      <span className="shrink-0 rounded bg-accent-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-gold">
                        최고
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-text-tertiary">
                    {team.name} · {members.length}/5
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      "flex items-center justify-end gap-0.5 text-xs font-bold",
                      budget === 0 ? "text-accent-danger" : "text-accent-gold",
                    )}
                  >
                    <Coins className="h-3 w-3" />
                    {budget.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-text-muted">
                    {isFull ? "만석" : `${5 - members.length}자리`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1 p-2">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const member = members[idx];
                  if (!member) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="min-w-0 rounded-lg border border-dashed border-bg-tertiary/70 bg-bg-tertiary/20 px-1 py-1.5 text-center"
                      >
                        <div className="mx-auto h-8 w-8 rounded-full bg-bg-elevated/70" />
                        <p className="mt-1 truncate text-[10px] text-text-muted">
                          빈 슬롯
                        </p>
                      </div>
                    );
                  }
                  const memberId = userIdOf(member);
                  const isCaptain = memberId === team.captainId;
                  const icon = tierIconUrl(member.tier);
                  return (
                    <div
                      key={memberId ?? `${team.id}-${idx}`}
                      className={cn(
                        "min-w-0 rounded-lg border px-1 py-1.5 text-center",
                        isCaptain
                          ? "border-accent-gold/30 bg-accent-gold/10"
                          : "border-transparent bg-bg-tertiary/50",
                      )}
                    >
                      <div className="relative mx-auto h-8 w-8">
                        <Avatar
                          src={member.avatar}
                          alt={member.username}
                          fallback={member.username[0]}
                          size="sm"
                        />
                        {isCaptain && (
                          <span className="absolute -bottom-1 -right-1 rounded bg-accent-gold px-1 text-[9px] font-bold text-bg-primary">
                            C
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center justify-center gap-0.5">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={icon}
                            alt=""
                            width={12}
                            height={12}
                            className="shrink-0 object-contain"
                          />
                        ) : (
                          <span className="h-3 w-3 shrink-0 rounded-full bg-bg-elevated" />
                        )}
                        <span className="min-w-0 truncate text-[10px] font-medium text-text-secondary">
                          {member.username}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── 남은 매물 패널 (우측) ────────────────────────────────────
export function BroadcastRemainingPlayers({
  players,
  currentPlayerId,
  className,
}: {
  players: any[];
  currentPlayerId?: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden p-0", className)}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-bg-tertiary/70 bg-bg-tertiary/20 px-3">
        <Users className="h-3.5 w-3.5 text-accent-primary" />
        <span className="flex-1 text-sm font-semibold text-text-primary">
          남은 매물
        </span>
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
          {players.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {players.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-tertiary">
            모든 선수가 배정되었습니다
          </p>
        ) : (
          players.map((player, idx) => {
            const playerId = userIdOf(player);
            const isCurrent = currentPlayerId === playerId;
            const icon = tierIconUrl(player.tier);
            return (
              <div
                key={playerId ?? idx}
                className={cn(
                  "flex items-center gap-2 rounded-lg p-2",
                  isCurrent
                    ? "border border-accent-primary/30 bg-accent-primary/10"
                    : "bg-bg-secondary",
                )}
              >
                <span className="w-4 shrink-0 text-center text-[10px] text-text-tertiary">
                  {idx + 1}
                </span>
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={icon}
                    alt=""
                    width={18}
                    height={18}
                    className="shrink-0 object-contain"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-xs font-bold text-text-primary">
                    {player.username[0]}
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                  {player.username}
                </span>
                {(player.mainRole || player.subRole) && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <RoleIcon role={player.mainRole} />
                    <RoleIcon role={player.subRole} dim />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

// ─── 입찰 내역 패널 (중앙 하단) ────────────────────────────────
export function BroadcastBidHistory({
  bidHistory,
  currentBid,
  remainingCount,
}: {
  bidHistory: any[];
  currentBid: number;
  remainingCount: number;
}) {
  const entries = bidHistory.slice(-14).reverse();

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-bg-tertiary/70 bg-bg-tertiary/20 px-3">
        <ScrollText className="h-3.5 w-3.5 text-accent-primary" />
        <span className="flex-1 text-sm font-semibold text-text-primary">
          입찰 흐름
        </span>
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
          남은 매물 {remainingCount}
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-bg-tertiary/60 p-3">
        <div className="rounded-lg bg-bg-primary px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-text-tertiary">
            현재 최고가
          </p>
          <p className="mt-1 flex items-center gap-1 text-2xl font-black tabular-nums text-accent-gold">
            <Coins className="h-4 w-4" />
            {currentBid.toLocaleString()}
            <span className="text-xs text-text-muted">G</span>
          </p>
        </div>
        <div className="rounded-lg bg-bg-primary px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-text-tertiary">
            로그
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-text-primary">
            {bidHistory.filter((entry) => !entry.isSeparator).length}
            <span className="ml-1 text-xs text-text-muted">건</span>
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-[140px] items-center justify-center rounded-lg border border-dashed border-bg-tertiary/70 bg-bg-primary/60 text-sm font-medium text-text-tertiary">
            아직 입찰 내역이 없습니다
          </div>
        ) : (
          entries.map((entry, idx) =>
            entry.isSeparator ? (
              <div key={`${entry.playerLabel}-${idx}`} className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-bg-tertiary" />
                <span className="rounded bg-accent-primary/10 px-2 py-0.5 text-[10px] font-bold text-accent-primary">
                  {entry.playerLabel}
                </span>
                <div className="h-px flex-1 bg-bg-tertiary" />
              </div>
            ) : (
              <div
                key={`${entry.timestamp}-${idx}`}
                className="grid grid-cols-[92px_minmax(0,1fr)_120px] items-center gap-2 rounded-lg bg-bg-primary px-3 py-2"
              >
                <span className="font-mono text-[11px] text-text-tertiary">
                  {new Date(entry.timestamp).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
                  {entry.username}
                </span>
                <span className="flex items-center justify-end gap-1 text-sm font-black tabular-nums text-accent-gold">
                  <Coins className="h-3.5 w-3.5" />
                  {Number(entry.amount ?? 0).toLocaleString()}G
                </span>
              </div>
            ),
          )
        )}
      </div>
    </Card>
  );
}
