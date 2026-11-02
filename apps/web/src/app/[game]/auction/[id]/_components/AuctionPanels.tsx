"use client";

/**
 * 경매 화면 데스크톱 패널 — 팀 요약·남은 매물·입찰 기록.
 *
 * 경매 페이지(page.tsx)와 레이아웃 미리보기(/dev/auction-layout)가 같은 컴포넌트를
 * 쓰도록 페이지 파일에서 분리했다. Next 페이지 파일은 default 외 export 를 둘 수 없다.
 */
import Image from "next/image";
import React, { useRef, useState, useCallback } from "react";
import {
  TierBadge,
  PlayerHoverCard,
  PlayerProfileModal,
} from "@/components/domain";
import { Card, Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getTierIcon } from "@/lib/tier-icon";
import { Users, Coins, ScrollText, Maximize2 } from "lucide-react";
import { getRoleIcon } from "@/lib/role-icon";

function RoleIcon({ role, dim }: { role?: string; dim?: boolean }) {
  if (!role) return null;
  const url = getRoleIcon(role.toUpperCase());
  if (!url) return null;
  return (
    <Image
      src={url}
      alt={role}
      width={14}
      height={14}
      unoptimized
      className="h-3.5 w-3.5 shrink-0 brightness-0 invert"
      style={{ opacity: dim ? 0.35 : 0.8 }}
    />
  );
}

/** 대기 선수 목록 (데스크톱 사이드바 & 모바일 탭에서 공유) */
export function PlayersList({
  players,
  currentPlayerId,
  onExpand,
  compact = false,
}: {
  players: any[];
  currentPlayerId?: string;
  onExpand?: () => void;
  compact?: boolean;
}) {
  const [hoveredPlayer, setHoveredPlayer] = useState<{
    userId: string;
    rect: DOMRect;
  } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);
  const scheduleHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);
  const handleHover = useCallback(
    (userId: string, el: HTMLElement) => {
      cancelHoverClose();
      const rect = el.getBoundingClientRect();
      hoverTimerRef.current = setTimeout(
        () => setHoveredPlayer({ userId, rect }),
        300,
      );
    },
    [cancelHoverClose],
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* compact 모드에서는 카드 헤더가 대신하므로 내부 헤더 생략 */}
      {!compact && (
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            대기 선수 ({players.length})
          </h3>
          {onExpand && (
            <button
              onClick={onExpand}
              className="text-text-tertiary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-tertiary transition-colors"
              title="전체 보기"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {compact ? (
        /* compact: 2열 그리드로 한눈에 보기 */
        <div className="flex-1 min-h-0 overflow-y-auto">
          {players.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">
              모든 선수가 배정되었습니다
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1 p-0.5">
              {players.map((player, idx) => {
                const isCurrentTarget = currentPlayerId === player.id;
                const tierIcon = getTierIcon(player.tier);
                return (
                  <div
                    key={player.id}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors cursor-pointer",
                      isCurrentTarget
                        ? "bg-accent-primary/15 ring-1 ring-accent-primary/40"
                        : "bg-bg-secondary hover:bg-bg-tertiary",
                    )}
                    onMouseEnter={(e) =>
                      handleHover(player.id, e.currentTarget)
                    }
                    onMouseLeave={scheduleHoverClose}
                    onClick={() => setProfileUserId(player.id)}
                  >
                    <span className="w-3.5 shrink-0 text-center text-[9px] text-text-muted">
                      {idx + 1}
                    </span>
                    {tierIcon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tierIcon}
                        alt={player.tier}
                        width={13}
                        height={13}
                        className="shrink-0 object-contain"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-text-primary">
                      {player.username}
                    </span>
                    {(player.mainRole || player.subRole) && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        {player.mainRole && <RoleIcon role={player.mainRole} />}
                        {player.subRole && (
                          <RoleIcon role={player.subRole} dim />
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* 일반 모드: 1열 상세 목록 */
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
          {players.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">
              모든 선수가 배정되었습니다
            </p>
          ) : (
            players.map((player, idx) => {
              const isCurrentTarget = currentPlayerId === player.id;
              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                    isCurrentTarget
                      ? "bg-accent-primary/10 border border-accent-primary/30"
                      : "bg-bg-secondary hover:bg-bg-tertiary"
                  }`}
                  onMouseEnter={(e) => handleHover(player.id, e.currentTarget)}
                  onMouseLeave={scheduleHoverClose}
                  onClick={() => setProfileUserId(player.id)}
                >
                  <span className="text-[10px] text-text-tertiary w-4 text-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-bold text-text-primary flex-shrink-0">
                    {player.username[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {player.username}
                    </p>
                    {/* 배그는 인게임 닉네임으로 서로를 알아본다. */}
                    {player.pubgName && (
                      <p className="truncate text-[10px] text-text-tertiary">
                        {player.pubgName}
                      </p>
                    )}
                    <div className="flex items-center gap-1">
                      {/*
                        배그에는 라이엇 티어가 없다. 서버가 tier 를 비워 보내고
                        NEXUS 편성 등급을 대신 싣는다. 롤 배지를 그대로 그리면
                        전원 "UNRANKED" 가 된다.
                      */}
                      {player.tier ? (
                        <TierBadge
                          tier={player.tier}
                          size="sm"
                          showIcon={false}
                        />
                      ) : (
                        <span className="rounded bg-bg-elevated px-1 text-[10px] font-bold text-text-secondary">
                          {player.nexusTier
                            ? `${player.nexusTier}티어`
                            : "등급 산정 전"}
                        </span>
                      )}
                      {player.mmr !== undefined && (
                        <span className="text-[10px] font-mono text-text-muted">
                          {player.mmr}
                        </span>
                      )}
                      {(player.mainRole || player.subRole) && (
                        <span className="flex items-center gap-0.5 ml-auto">
                          {player.mainRole && (
                            <RoleIcon role={player.mainRole} />
                          )}
                          {player.subRole && (
                            <RoleIcon role={player.subRole} dim />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 호버 카드 */}
      {hoveredPlayer && (
        <PlayerHoverCard
          userId={hoveredPlayer.userId}
          anchorRect={hoveredPlayer.rect}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          onOpenProfile={(uid) => {
            setProfileUserId(uid);
            setHoveredPlayer(null);
          }}
        />
      )}
      {profileUserId && (
        <PlayerProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </div>
  );
}

/** 입찰 로그 (데스크톱 사이드바 & 모바일 탭에서 공유) */
export function BidLog({
  bidHistory,
  logEndRef,
}: {
  bidHistory: any[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1.5 flex-shrink-0">
        <ScrollText className="w-4 h-4" />
        입찰 내역
      </h3>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
        {bidHistory.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-4">
            아직 입찰이 없습니다
          </p>
        ) : (
          bidHistory.map((entry, idx) =>
            entry.isSeparator ? (
              <div key={idx} className="flex items-center gap-2 py-1.5 my-1">
                <div className="flex-1 h-px bg-bg-tertiary" />
                <span className="text-[10px] font-medium text-accent-primary px-1.5">
                  {entry.playerLabel}
                </span>
                <div className="flex-1 h-px bg-bg-tertiary" />
              </div>
            ) : (
              <div key={idx} className="flex items-center gap-2 p-1.5 text-xs">
                <span className="text-text-tertiary font-mono text-[10px] flex-shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="text-text-primary font-medium truncate">
                  {entry.username}
                </span>
                <span className="text-text-tertiary">→</span>
                <span className="text-accent-gold font-bold flex items-center gap-0.5 flex-shrink-0">
                  <Coins className="w-3 h-3" />
                  {entry.amount.toLocaleString()}G
                </span>
              </div>
            ),
          )
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

/** 방송/운영용 팀 요약 패널 — 팀장, 예산, 5인 슬롯을 압축 표시 */
export function TeamSummaryPanel({
  teams,
  currentUserId,
  auctionState,
}: {
  teams: any[];
  currentUserId?: string;
  auctionState: any;
}) {
  const [hoveredPlayer, setHoveredPlayer] = useState<{
    userId: string;
    rect: DOMRect;
  } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const scheduleHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);

  const handleHover = useCallback(
    (userId: string, el: HTMLElement) => {
      cancelHoverClose();
      const rect = el.getBoundingClientRect();
      hoverTimerRef.current = setTimeout(
        () => setHoveredPlayer({ userId, rect }),
        300,
      );
    },
    [cancelHoverClose],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-2 flex h-10 shrink-0 items-center justify-between rounded-lg border border-bg-tertiary bg-bg-secondary px-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">
            팀 요약
          </span>
        </div>
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
          {teams.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {teams.map((team) => {
          const members = team.members ?? [];
          const budget = team.remainingGold ?? team.remainingBudget ?? 0;
          const captain = members.find((m: any) => m.id === team.captainId);
          const captainName =
            captain?.username ?? team.captainName ?? team.name;
          const isMine =
            team.captainId === currentUserId ||
            members.some((m: any) => m.id === currentUserId);
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
                isMine && !isCurrentBidder && "border-accent-primary/40",
                isFull && "opacity-80",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-2 border-b border-bg-tertiary/70 px-3 py-2.5",
                  isCurrentBidder ? "bg-accent-gold/10" : "bg-bg-tertiary/20",
                )}
              >
                <div
                  className="relative shrink-0"
                  onMouseEnter={(e) =>
                    captain && handleHover(captain.id, e.currentTarget)
                  }
                  onMouseLeave={scheduleHoverClose}
                  onClick={() => captain && setProfileUserId(captain.id)}
                >
                  <Avatar
                    src={captain?.avatar}
                    alt={captainName}
                    fallback={captainName?.[0] ?? "?"}
                    size="sm"
                    className={cn(
                      "cursor-pointer",
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
                    <span
                      className={cn(
                        "truncate text-sm font-bold",
                        isMine ? "text-accent-primary" : "text-text-primary",
                      )}
                    >
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
                        className="min-w-0 px-1 py-1.5 text-center"
                      >
                        <div className="mx-auto h-8 w-8 rounded-full border border-dashed border-bg-tertiary/70 bg-bg-tertiary/20" />
                        <p className="mt-1 truncate text-[10px] text-text-muted">
                          빈 슬롯
                        </p>
                      </div>
                    );
                  }
                  const isCaptain = member.id === team.captainId;
                  const tier = String(member.tier ?? "").toUpperCase();
                  const tierIcon = getTierIcon(tier);
                  return (
                    <div
                      key={member.id}
                      className="min-w-0 cursor-pointer rounded-lg px-1 py-1.5 text-center transition-colors hover:bg-bg-elevated/60"
                      onMouseEnter={(e) =>
                        handleHover(member.id, e.currentTarget)
                      }
                      onMouseLeave={scheduleHoverClose}
                      onClick={() => setProfileUserId(member.id)}
                    >
                      <div className="relative mx-auto h-8 w-8">
                        <Avatar
                          src={member.avatar}
                          alt={member.username}
                          fallback={member.username[0]}
                          size="sm"
                          className={cn(
                            isCaptain
                              ? "ring-2 ring-accent-gold/60"
                              : "ring-1 ring-bg-elevated",
                          )}
                        />
                        {isCaptain && (
                          <span className="absolute -bottom-1 -right-1 rounded bg-accent-gold px-1 text-[9px] font-bold text-bg-primary">
                            C
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center justify-center gap-0.5">
                        {tierIcon ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={tierIcon}
                              alt={tier}
                              width={12}
                              height={12}
                              className="shrink-0 object-contain"
                            />
                          </>
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

      {hoveredPlayer && (
        <PlayerHoverCard
          userId={hoveredPlayer.userId}
          anchorRect={hoveredPlayer.rect}
          onOpenProfile={(uid) => {
            setProfileUserId(uid);
            setHoveredPlayer(null);
          }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
      <PlayerProfileModal
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
      />
    </div>
  );
}

/** 데스크톱 우측 남은 매물 패널 */
export function RemainingPlayersPanel({
  players,
  currentPlayerId,
  onExpandPlayers,
}: {
  players: any[];
  currentPlayerId?: string;
  onExpandPlayers: () => void;
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-bg-tertiary/70 bg-bg-tertiary/20 px-3">
        <Users className="h-3.5 w-3.5 text-accent-primary" />
        <span className="flex-1 text-sm font-semibold text-text-primary">
          남은 매물
        </span>
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
          {players.length}
        </span>
        <button
          onClick={onExpandPlayers}
          className="ml-1 rounded p-1.5 text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          title="전체 보기"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <PlayersList players={players} currentPlayerId={currentPlayerId} />
      </div>
    </Card>
  );
}

/**
 * 데스크톱(lg 이상) 3열: 팀 요약 | 경매 | 남은 매물 + 채팅.
 *
 * 채팅은 오른쪽 남은 매물 아래에 둔다. 왼쪽에 채팅이 고정 높이로 붙어 있으면
 * FHD 에서 팀이 4개만 돼도 팀 요약이 스크롤 안으로 숨었다. 왼쪽 열을 팀 요약에
 * 통째로 주고, 길던 남은 매물 목록이 채팅과 높이를 나눈다(2026-11-02 운영자 요청).
 */
export function AuctionDesktopLayout({
  teams,
  board,
  players,
  chat,
}: {
  teams: React.ReactNode;
  board: React.ReactNode;
  players: React.ReactNode;
  chat: React.ReactNode;
}) {
  return (
    <div className="hidden min-h-0 flex-1 gap-3 lg:grid lg:grid-rows-1 lg:grid-cols-[300px_minmax(0,1fr)_280px] xl:grid-cols-[340px_minmax(0,1fr)_320px] 2xl:grid-cols-[380px_minmax(0,1fr)_360px]">
      <div className="min-h-0 overflow-hidden">{teams}</div>

      {/*
        가운데 열은 세로 flex — 매물 카드가 남는 높이를 채우고 입찰 패널은 바닥에
        붙는다. 고해상도에서 카드 아래가 통째로 비던 문제(2026-10-06 운영자 제보).
      */}
      <div className="flex min-h-0 flex-col overflow-y-auto pr-1">{board}</div>

      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_240px] gap-3 overflow-hidden">
        {players}
        <div className="min-h-0">{chat}</div>
      </div>
    </div>
  );
}
