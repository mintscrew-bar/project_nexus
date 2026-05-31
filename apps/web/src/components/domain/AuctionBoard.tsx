"use client";

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, Button, Badge, Avatar } from "@/components/ui";
import { TierBadge } from "./TierBadge";
import { PlayerHoverCard } from "./PlayerHoverCard";
import { PlayerProfileModal } from "./PlayerProfileModal";
import { cn } from "@/lib/utils";
import { Coins, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface Player {
  id: string;
  username: string;
  tier: string;
  rank?: string;
  mmr?: number;
  position?: string;
  mainRole?: string;
  subRole?: string;
  avatar?: string;
  champions?: string[];
}

interface Team {
  id: string;
  name: string;
  captainId: string;
  captainName?: string;
  color?: string;
  members?: Player[];
  remainingGold?: number;
  remainingBudget?: number;
}

interface AuctionState {
  currentPlayer: Player | null;
  currentPlayerIndex: number;
  currentHighestBid: number;
  currentHighestBidder: string | null;
  currentHighestBidderName?: string | null;
  timerEnd: number;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED";
  yuchalCount: number;
  maxYuchalCycles: number;
  bidIncrement?: number;
}

interface BidHistoryEntry {
  username: string;
  amount: number;
  timestamp: number;
  playerLabel?: string;
  isSeparator?: boolean;
}

interface AuctionBoardProps {
  auctionState: AuctionState;
  teams: Team[];
  players: Player[];
  currentUserId?: string;
  onPlaceBid: (amount: number) => void | Promise<void>;
  disabled?: boolean;
  bidHistory?: BidHistoryEntry[];
  className?: string;
  /** 모바일에서 입찰 패널을 숨김 (하단 고정 패널로 분리 시) */
  hideBidPanel?: boolean;
  /** 팀 그리드를 숨김 (데스크톱 3열 레이아웃에서 팀을 외부 사이드 컬럼으로 분리할 때) */
  hideTeams?: boolean;
}

const POSITION_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
  FLEX: "플렉스",
};

const parseTeamOrder = (name: string): number => {
  const m = name.match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
};

/** Player 객체를 PlayerHoverCard가 받는 participant 형태로 변환 */
function toHoverParticipant(player: Player) {
  return {
    userId: player.id,
    username: player.username,
    avatar: player.avatar,
    riotAccount: player.tier && player.tier !== "UNRANKED"
      ? { tier: player.tier, rank: player.rank, mainRole: player.mainRole, subRole: player.subRole }
      : null,
    clanMemberships: [],
  };
}

export const AuctionBoard: React.FC<AuctionBoardProps> = ({
  auctionState,
  teams,
  players: _players,
  currentUserId,
  onPlaceBid,
  disabled = false,
  bidHistory = [],
  className,
  hideBidPanel = false,
  hideTeams = false,
}) => {
  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) => {
        const oa = parseTeamOrder(a.name);
        const ob = parseTeamOrder(b.name);
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name);
      }),
    [teams],
  );

  const getTeamBudget = (team?: Team | null) =>
    team?.remainingGold ?? team?.remainingBudget ?? 0;

  const [accumulatedBid, setAccumulatedBid] = useState<number>(0);
  const [isBidding, setIsBidding] = useState(false);
  const currentTeam = sortedTeams.find((t) => t.captainId === currentUserId);
  const isCurrentUserTurn =
    Boolean(currentTeam) && auctionState.status === "IN_PROGRESS";
  const isAlreadyHighestBidder =
    !!auctionState.currentHighestBidder &&
    (auctionState.currentHighestBidder === currentUserId ||
      auctionState.currentHighestBidder === currentTeam?.id);
  const myBudget = getTeamBudget(currentTeam);
  const bidIncrement = auctionState.bidIncrement ?? 50;
  const bidSteps = [bidIncrement, bidIncrement * 2, bidIncrement * 5];
  // 서버와 동일한 예비금 계산: 남은 빈자리당 최소 입찰 단위를 확보
  const memberCount = currentTeam?.members?.length ?? 0;
  const slotsNeeded = Math.max(0, 5 - memberCount);
  const reserveAmount = Math.max(0, (slotsNeeded - 1) * bidIncrement);
  const availableBudget = Math.max(0, myBudget - reserveAmount);
  const totalBid = auctionState.currentHighestBid + accumulatedBid;
  const canPlaceBid = accumulatedBid > 0 && totalBid <= availableBudget && !isBidding;

  const [hoveredPlayer, setHoveredPlayer] = useState<{ player: Player; rect: DOMRect } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const scheduleHoverClose = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);

  const handlePlayerHover = useCallback((player: Player, el: HTMLElement) => {
    cancelHoverClose();
    setHoveredPlayer({ player, rect: el.getBoundingClientRect() });
  }, [cancelHoverClose]);

  const [teamsExpanded, setTeamsExpanded] = useState(true);
  // 모바일 아코디언: 개별 팀 접기/펼치기 (lg 미만에서만 사용)
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());
  const toggleTeam = useCallback((teamId: string) => {
    setExpandedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);
  const [timeLeft, setTimeLeft] = useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((auctionState.timerEnd - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
    }, 100);
    return () => clearInterval(interval);
  }, [auctionState.timerEnd]);

  // 경매 대상 선수가 바뀔 때만 accumulated 리셋 (다른 사람 입찰 시에는 유지)
  React.useEffect(() => {
    setAccumulatedBid(0);
  }, [auctionState.currentPlayer?.id]);

  // 예산 초과 시 accumulated를 자동 클램핑 (예비금 반영)
  React.useEffect(() => {
    const maxAccumulated = Math.max(0, availableBudget - auctionState.currentHighestBid);
    setAccumulatedBid((prev) => Math.min(prev, maxAccumulated));
  }, [auctionState.currentHighestBid, availableBudget]);

  const handleBid = async () => {
    if (!canPlaceBid || isBidding) return;
    setIsBidding(true);
    try {
      await onPlaceBid(totalBid);
    } finally {
      setAccumulatedBid(0);
      setIsBidding(false);
    }
  };

  const addToBid = (increment: number) => {
    setAccumulatedBid((prev) => {
      const next = prev + increment;
      return auctionState.currentHighestBid + next <= availableBudget ? next : prev;
    });
  };

  const getPlayerPosition = (player: Player) => {
    const role = player.mainRole ?? player.position ?? "";
    return POSITION_LABELS[role] ?? role;
  };

  const highestBidderName = useMemo(() => {
    if (auctionState.currentHighestBidderName) {
      return auctionState.currentHighestBidderName;
    }

    const bidderId = auctionState.currentHighestBidder;
    if (!bidderId) return "없음";

    const matchedTeam = sortedTeams.find(
      (t) => t.id === bidderId || t.captainId === bidderId,
    );
    if (!matchedTeam) return "없음";
    if (matchedTeam.captainName) return matchedTeam.captainName;

    const captainMember = (matchedTeam.members ?? []).find(
      (m) => m.id === matchedTeam.captainId,
    );
    if (captainMember?.username) return captainMember.username;

    const lastBidder = [...bidHistory]
      .reverse()
      .find((b) => b.amount === auctionState.currentHighestBid)?.username;
    return lastBidder ?? "없음";
  }, [
    auctionState.currentHighestBid,
    auctionState.currentHighestBidder,
    auctionState.currentHighestBidderName,
    bidHistory,
    sortedTeams,
  ]);

  // ── 실시간 피드백 애니메이션 상태 ──
  // 입찰 flash: 최고입찰가가 변경될 때 트리거
  const [bidFlash, setBidFlash] = useState(false);
  const prevBidRef = useRef(auctionState.currentHighestBid);
  useEffect(() => {
    const changed = auctionState.currentHighestBid !== prevBidRef.current && prevBidRef.current > 0;
    prevBidRef.current = auctionState.currentHighestBid;
    if (changed) {
      setBidFlash(true);
      const timer = setTimeout(() => setBidFlash(false), 400);
      return () => clearTimeout(timer);
    }
  }, [auctionState.currentHighestBid]);

  // 유찰 shake: yuchalCount가 증가할 때 트리거
  const [yuchalShake, setYuchalShake] = useState(false);
  const prevYuchalRef = useRef(auctionState.yuchalCount);
  useEffect(() => {
    const increased = auctionState.yuchalCount > prevYuchalRef.current;
    prevYuchalRef.current = auctionState.yuchalCount;
    if (increased) {
      setYuchalShake(true);
      const timer = setTimeout(() => setYuchalShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [auctionState.yuchalCount]);

  // 매물 전환 fade: currentPlayer가 바뀔 때 트리거
  const [playerTransition, setPlayerTransition] = useState(false);
  const prevPlayerIdRef = useRef(auctionState.currentPlayer?.id);
  useEffect(() => {
    const changed = auctionState.currentPlayer?.id !== prevPlayerIdRef.current && prevPlayerIdRef.current;
    prevPlayerIdRef.current = auctionState.currentPlayer?.id;
    if (changed) {
      setPlayerTransition(true);
      const timer = setTimeout(() => setPlayerTransition(false), 300);
      return () => clearTimeout(timer);
    }
  }, [auctionState.currentPlayer?.id]);

  return (
    <div className={cn("space-y-4", className)}>
      {auctionState.currentPlayer && (
        <>
          {/* ── 모바일 compact sticky 헤더 (lg 미만) ── */}
          <div className={cn(
            "lg:hidden sticky top-0 z-20 -mx-4 px-4 py-2 bg-bg-primary/95 backdrop-blur-sm border-b border-bg-tertiary",
            yuchalShake && "animate-shake",
          )}>
            {/* 1줄: 선수 정보 */}
            <div className="flex items-center gap-2 mb-1.5">
              <Avatar
                src={auctionState.currentPlayer.avatar}
                alt={auctionState.currentPlayer.username}
                fallback={auctionState.currentPlayer.username[0]}
                size="sm"
                className="ring-2 ring-accent-primary/50 flex-shrink-0"
              />
              <span className="font-bold text-text-primary truncate">
                {auctionState.currentPlayer.username}
              </span>
              <TierBadge tier={auctionState.currentPlayer.tier} size="sm" showIcon={false} />
              <Badge variant="primary" className="text-[10px] px-1.5 py-0.5">
                {getPlayerPosition(auctionState.currentPlayer)}
              </Badge>
              {auctionState.yuchalCount > 0 && (
                <div className="flex items-center gap-0.5 text-accent-warning text-[10px] font-medium ml-auto flex-shrink-0">
                  <AlertTriangle className="w-3 h-3" />
                  {auctionState.yuchalCount}/{auctionState.maxYuchalCycles}
                </div>
              )}
            </div>
            {/* 2줄: 타이머 + 최고입찰가 + 최고입찰자 */}
            <div className="flex items-center gap-3">
              <div className={cn(
                "text-xl md:text-2xl font-bold flex-shrink-0",
                timeLeft <= 5 ? "text-accent-danger animate-pulse" : "text-text-primary",
              )}>
                {timeLeft}초
              </div>
              <div className={cn("flex items-center gap-1.5 flex-1 min-w-0 rounded px-1 -mx-1", bidFlash && "animate-bid-flash")}>
                <Coins className="w-4 h-4 text-accent-gold flex-shrink-0" />
                <span className="text-lg font-bold text-accent-gold">
                  {auctionState.currentHighestBid.toLocaleString()}G
                </span>
              </div>
              {auctionState.currentHighestBidder && (() => {
                const bidderTeam = sortedTeams.find(
                  (t) => t.id === auctionState.currentHighestBidder || t.captainId === auctionState.currentHighestBidder,
                );
                return (
                  <div className="flex items-center gap-1.5 flex-shrink-0 text-sm">
                    {bidderTeam?.color && (
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bidderTeam.color }} />
                    )}
                    <span className="font-medium text-text-primary">{highestBidderName}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── 데스크톱 현재 선수 카드 (lg 이상) ── */}
          <Card variant="elevated" className={cn(
            "hidden lg:block overflow-hidden border-bg-tertiary bg-bg-secondary p-0 shadow-none",
            playerTransition && "animate-fade-in",
            yuchalShake && "animate-shake",
          )}>
            <CardContent className="p-0">
              {/* 상단: 선수 정보 + 타이머 */}
              <div className="flex items-center gap-5 p-6">
                <Avatar
                  src={auctionState.currentPlayer.avatar}
                  alt={auctionState.currentPlayer.username}
                  fallback={auctionState.currentPlayer.username[0]}
                  size="xl"
                  className="ring-2 ring-accent-primary/60 flex-shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold text-text-primary mb-2 truncate">
                    {auctionState.currentPlayer.username}
                  </h2>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <TierBadge
                      tier={auctionState.currentPlayer.tier}
                      rank={auctionState.currentPlayer.rank}
                    />
                    <Badge variant="primary">
                      {getPlayerPosition(auctionState.currentPlayer)}
                    </Badge>
                    {auctionState.currentPlayer.mmr !== undefined && (
                      <span className="text-xs font-mono font-semibold text-text-muted">
                        MMR {auctionState.currentPlayer.mmr}
                      </span>
                    )}
                  </div>
                </div>

                {/* 타이머 — 큰 숫자 하나로 집중 */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={cn(
                      "text-5xl font-bold tabular-nums leading-none",
                      timeLeft <= 5
                        ? "text-accent-danger animate-pulse"
                        : "text-text-primary",
                    )}
                  >
                    {timeLeft}
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-1.5">남은 시간(초)</p>
                  {auctionState.yuchalCount > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 text-accent-warning text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      유찰 {auctionState.yuchalCount}/{auctionState.maxYuchalCycles}
                    </div>
                  )}
                </div>
              </div>

              {/* 하단: 최고 입찰 바 — 별도 박스 대신 카드 하단 띠로 분리 */}
              <div className={cn(
                "flex items-center justify-between px-6 py-4 bg-bg-secondary/60 border-t border-bg-tertiary transition-colors",
                bidFlash && "animate-bid-flash",
              )}>
                <div className="flex items-center gap-2.5">
                  <Coins className="w-6 h-6 text-accent-gold" />
                  <span className="text-3xl font-bold text-accent-gold tabular-nums">
                    {auctionState.currentHighestBid.toLocaleString()}
                  </span>
                  <span className="text-sm text-text-tertiary self-end mb-1">G</span>
                </div>
                {auctionState.currentHighestBidder ? (() => {
                  const bidderTeam = sortedTeams.find(
                    (t) => t.id === auctionState.currentHighestBidder || t.captainId === auctionState.currentHighestBidder,
                  );
                  return (
                    <div className="flex items-center gap-2">
                      {bidderTeam?.color && (
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: bidderTeam.color }}
                        />
                      )}
                      <span className="text-base font-semibold text-text-primary">
                        {highestBidderName}
                      </span>
                      {bidderTeam && (
                        <span className="text-xs text-text-muted">· {bidderTeam.name}</span>
                      )}
                    </div>
                  );
                })() : (
                  <span className="text-sm text-text-tertiary">아직 입찰 없음</span>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* 팀별 예산 요약 바 — 스크롤 없이 한눈에 확인 */}
      {auctionState.currentPlayer && sortedTeams.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-bg-tertiary bg-bg-secondary/60 px-3 py-2.5">
          <span className="hidden xl:inline text-xs font-medium text-text-tertiary mr-1">
            팀 현황
          </span>
          {sortedTeams.map((team) => {
            const budget = getTeamBudget(team);
            const isMine = team.captainId === currentUserId;
            const isHighest = team.id === auctionState.currentHighestBidder || team.captainId === auctionState.currentHighestBidder;
            // 팀장 포함 5명이면 만석 — 더 이상 입찰에 참여할 수 없음을 시각적으로 표시
            const isFull = (team.members?.length ?? 0) >= 5;
            return (
              <div
                key={team.id}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                  isFull
                    ? "text-text-muted opacity-60"
                    : isMine
                    ? "bg-accent-primary/10"
                    : isHighest
                    ? "bg-accent-gold/10"
                    : "text-text-secondary",
                )}
              >
                {team.color && (
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                )}
                <span className={cn(
                  "truncate max-w-[60px]",
                  isFull ? "text-text-muted line-through" : isMine ? "text-accent-primary" : "text-text-secondary",
                )}>
                  {team.name}
                </span>
                {isFull ? (
                  <span className="font-bold px-1.5 py-0.5 rounded bg-text-muted/20 text-text-muted">
                    꽉 참
                  </span>
                ) : (
                  <>
                    <span className={cn(
                      "font-bold flex items-center gap-0.5",
                      budget === 0
                        ? "text-accent-danger"
                        : isHighest
                          ? "text-accent-gold"
                          : "text-text-secondary",
                    )}>
                      <Coins className="w-3 h-3" />
                      {budget.toLocaleString()}
                    </span>
                    <span className="text-text-muted">
                      ({(team.members?.length ?? 0)}/5)
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 비캡틴/관전자 관전 안내 */}
      {!isCurrentUserTurn && auctionState.currentPlayer && !hideBidPanel && (
        <div className="py-3 px-4 rounded-lg bg-bg-secondary border border-bg-tertiary text-center text-sm text-text-secondary">
          {currentTeam
            ? "다른 팀의 입찰 차례입니다. 경매를 관전 중입니다."
            : "관전 모드 — 팀장만 입찰에 참여할 수 있습니다."}
        </div>
      )}

      {isCurrentUserTurn && auctionState.currentPlayer && !hideBidPanel && (
        <Card className="overflow-hidden p-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-text-tertiary">
                사용 가능:{" "}
                <span className="text-accent-gold font-bold">
                  <Coins className="w-3.5 h-3.5 inline mr-0.5" />
                  {availableBudget.toLocaleString()}G
                </span>
                {reserveAmount > 0 && (
                  <span className="text-text-muted text-xs ml-1.5">
                    (예비 {reserveAmount.toLocaleString()}G)
                  </span>
                )}
              </p>
            </div>

            <div className="border-y border-bg-tertiary py-4 mb-4 text-center">
              <p className="text-xs text-text-tertiary mb-1">입찰가</p>
              <p
                className={cn(
                  "text-2xl md:text-3xl font-bold",
                  accumulatedBid > 0 ? "text-accent-gold" : "text-text-tertiary",
                )}
              >
                {totalBid.toLocaleString()}G
              </p>
              {accumulatedBid > 0 && (
                <p className="text-xs text-text-secondary mt-1">
                  {auctionState.currentHighestBid.toLocaleString()}G +
                  <span className="text-accent-primary">
                    {" "}
                    {accumulatedBid.toLocaleString()}G
                  </span>
                </p>
              )}
              {accumulatedBid === 0 && (
                <p className="text-xs text-text-tertiary mt-1">
                  아래 버튼으로 입찰액을 올리세요
                </p>
              )}
            </div>

            {isAlreadyHighestBidder && (
              <div className="mb-3 py-2 px-3 rounded-lg bg-accent-primary/10 border border-accent-primary/30 text-sm text-accent-primary text-center font-medium">
                현재 최고 입찰자입니다
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mb-4">
              {bidSteps.map((inc) => (
                <Button
                  key={inc}
                  variant="secondary"
                  size="sm"
                  onClick={() => addToBid(inc)}
                  disabled={
                    disabled ||
                    isBidding ||
                    isAlreadyHighestBidder ||
                    auctionState.currentHighestBid + accumulatedBid + inc > availableBudget
                  }
                >
                  +{inc}G
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setAccumulatedBid(0)}
                disabled={disabled || accumulatedBid === 0}
                className="flex-shrink-0"
              >
                초기화
              </Button>
              <Button
                variant="primary"
                onClick={handleBid}
                disabled={disabled || !canPlaceBid || isAlreadyHighestBidder}
                isLoading={isBidding}
                className="flex-1"
              >
                {isBidding ? "입찰 중..." : isAlreadyHighestBidder ? "최고 입찰 중" : canPlaceBid ? `${totalBid.toLocaleString()}G 입찰` : "금액을 먼저 추가하세요"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 팀 상세 — 데스크톱: 접기/펼치기, 모바일: 개별 아코디언 (hideTeams=true 시 숨김) ── */}
      {!hideTeams && (
        <div>
          <button
            onClick={() => setTeamsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors mb-2"
          >
            <span className="text-sm font-semibold text-text-secondary">
              팀 구성 ({sortedTeams.length}팀)
            </span>
            {teamsExpanded ? (
              <ChevronUp className="w-4 h-4 text-text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-muted" />
            )}
          </button>
        </div>
      )}

      {/* 데스크톱: 기존 그리드 (lg 이상, hideTeams=false 일 때만) */}
      {!hideTeams && teamsExpanded && <div className="hidden lg:grid grid-cols-2 gap-3">
        {sortedTeams.map((team) => {
          const members = team.members ?? [];
          const teamBudget = getTeamBudget(team);
          const isFull = members.length >= 5;
          return (
            <Card
              key={team.id}
              className={cn(
                "overflow-hidden p-0",
                team.captainId === currentUserId && "border-accent-primary/40",
              )}
            >
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-bg-tertiary/70 bg-bg-tertiary/20 px-4 py-3">
                  <div className="flex items-center gap-2">
                    {team.color && (
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                    )}
                    <h3 className="text-lg font-semibold text-text-primary">{team.name}</h3>
                    {/* 만석 팀 — 더 이상 입찰 불가 */}
                    {isFull && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-success/15 text-accent-success border border-accent-success/30">
                        꽉 참
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-text-secondary">
                    <Coins className="h-4 w-4" />
                    <span className={cn("font-bold text-sm", teamBudget === 0 && "text-accent-danger")}>
                      {teamBudget.toLocaleString()}G
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5 p-3">
                  {members.length === 0 ? (
                    <p className="text-sm text-text-tertiary text-center py-4">배정된 선수가 없습니다</p>
                  ) : (
                    members.map((player, idx) => {
                      const isCaptain = player.id === team.captainId;
                      return (
                        <div
                          key={player.id}
                          className={cn("flex items-center gap-2 px-2 py-1.5 rounded cursor-default", isCaptain ? "bg-accent-gold/5" : "bg-bg-tertiary/60")}
                          onMouseEnter={(e) => handlePlayerHover(player, e.currentTarget)}
                          onMouseLeave={scheduleHoverClose}
                        >
                          <span className="text-xs text-text-tertiary w-4 text-center flex-shrink-0">{isCaptain ? "C" : idx}</span>
                          <Avatar src={player.avatar} alt={player.username} fallback={player.username[0]} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{player.username}</p>
                            <p className="text-xs text-text-secondary">{getPlayerPosition(player)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {player.mmr !== undefined && <span className="text-[10px] font-mono text-text-muted">{player.mmr}</span>}
                            <TierBadge tier={player.tier} size="sm" showIcon={false} />
                          </div>
                        </div>
                      );
                    })
                  )}
                  {Array.from({ length: Math.max(0, 5 - members.length) }).map((_, idx) => (
                    <div key={`empty-${idx}`} className="flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-bg-tertiary/80">
                      <span className="text-xs text-text-tertiary w-4 text-center">{members.length + idx}</span>
                      <span className="flex-1 text-sm text-text-tertiary">빈 슬롯</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>}

      {hoveredPlayer && (
        <PlayerHoverCard
          participant={toHoverParticipant(hoveredPlayer.player)}
          anchorRect={hoveredPlayer.rect}
          onOpenProfile={(userId) => { setProfileUserId(userId); setHoveredPlayer(null); }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
      <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />

      {/* 모바일: 개별 팀 아코디언 (lg 미만, hideTeams=false 일 때만) */}
      {!hideTeams && teamsExpanded && <div className="lg:hidden space-y-2">
        {sortedTeams.map((team) => {
          const members = team.members ?? [];
          const teamBudget = getTeamBudget(team);
          const isExpanded = expandedTeamIds.has(team.id);
          const isFull = members.length >= 5;
          return (
            <div key={team.id} className={cn("rounded-xl border overflow-hidden", team.captainId === currentUserId ? "border-accent-primary" : "border-bg-tertiary", isFull && "opacity-60")}>
              {/* 아코디언 헤더 — 항상 표시 */}
              <button
                onClick={() => toggleTeam(team.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-bg-secondary hover:bg-bg-tertiary transition-colors"
              >
                {team.color && (
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                )}
                <span className="font-semibold text-sm text-text-primary">{team.name}</span>
                {isFull ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent-success/15 text-accent-success border border-accent-success/30">
                    꽉 참
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">({members.length}/5)</span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-accent-gold" />
                  <span className={cn("font-bold text-xs", teamBudget === 0 ? "text-accent-danger" : "text-accent-gold")}>
                    {teamBudget.toLocaleString()}G
                  </span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
                </div>
              </button>
              {/* 아코디언 본문 — 펼쳤을 때만 표시 */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 space-y-1.5">
                  {members.length === 0 ? (
                    <p className="text-xs text-text-tertiary text-center py-2">배정된 선수가 없습니다</p>
                  ) : (
                    members.map((player, idx) => {
                      const isCaptain = player.id === team.captainId;
                      return (
                        <div
                          key={player.id}
                          className={cn("flex items-center gap-2 p-1.5 rounded text-sm cursor-default", isCaptain ? "bg-accent-gold/10 border border-accent-gold/30" : "bg-bg-tertiary")}
                          onMouseEnter={(e) => handlePlayerHover(player, e.currentTarget)}
                          onMouseLeave={scheduleHoverClose}
                        >
                          <span className="text-[10px] text-text-tertiary w-3 text-center flex-shrink-0">{isCaptain ? "C" : idx}</span>
                          <Avatar src={player.avatar} alt={player.username} fallback={player.username[0]} size="sm" />
                          <span className="font-medium text-text-primary truncate flex-1">{player.username}</span>
                          <TierBadge tier={player.tier} size="sm" showIcon={false} />
                        </div>
                      );
                    })
                  )}
                  {Array.from({ length: Math.max(0, 5 - members.length) }).map((_, idx) => (
                    <div key={`empty-${idx}`} className="flex items-center gap-2 p-1.5 rounded bg-bg-tertiary/50 border border-dashed border-bg-tertiary text-sm">
                      <span className="text-[10px] text-text-tertiary w-3 text-center">{members.length + idx}</span>
                      <span className="text-text-tertiary">빈 슬롯</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
};
