"use client";

import { useEffect, useRef, useState } from "react";
import { connectBroadcastAuctionSocket } from "@/lib/socket-client";

/**
 * 방송 오버레이용 라이브 경매 구독 훅(read-only).
 * 기존 /auction 게이트웨이의 라이브 이벤트를 그대로 구독해, 기존 참가자
 * 경매 화면(AuctionBoard)이 기대하는 형태(auctionState/teams/players/bidHistory)로
 * 정리한다. 액션(입찰)은 없음 — 화면만 그대로 살려 방송에 띄운다.
 */

export interface BroadcastAuctionData {
  connected: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | null;
  captainPhase: any | null;
  auctionState: any | null;
  teams: any[];
  players: any[];
  bidHistory: any[];
}

const EMPTY: BroadcastAuctionData = {
  connected: false,
  status: null,
  captainPhase: null,
  auctionState: null,
  teams: [],
  players: [],
  bidHistory: [],
};

const resolvePlayer = (state: any, players: any[]) => {
  if (
    state?.currentPlayer?.id &&
    players?.some((player) => player?.id === state.currentPlayer.id)
  ) {
    return state.currentPlayer;
  }
  const idx =
    typeof state?.currentPlayerIndex === "number"
      ? state.currentPlayerIndex
      : 0;
  return players?.[idx] ?? null;
};

// 서버 상태 → AuctionBoard가 기대하는 auctionState. timerEnd는 로컬 시각으로 보정.
const normalizeState = (s: any, players: any[]): any | null => {
  if (!s) return null;
  const offset = typeof s.serverNow === "number" ? s.serverNow - Date.now() : 0;
  return {
    currentPlayer: resolvePlayer(s, players),
    currentPlayerIndex:
      typeof s.currentPlayerIndex === "number" ? s.currentPlayerIndex : 0,
    currentHighestBid: s.currentHighestBid ?? 0,
    currentHighestBidder: s.currentHighestBidder ?? null,
    currentHighestBidderName: s.currentHighestBidderName ?? null,
    timerEnd: typeof s.timerEnd === "number" ? s.timerEnd - offset : 0,
    status: s.status ?? "IN_PROGRESS",
    yuchalCount: s.yuchalCount ?? 0,
    maxYuchalCycles: s.maxYuchalCycles ?? 0,
    bidIncrement: s.bidIncrement ?? 50,
  };
};

const renormalizeExistingState = (state: any, players: any[]) =>
  state ? normalizeState(state, players) : null;

export function useBroadcastAuction(
  token: string | undefined,
  roomId: string | undefined,
): BroadcastAuctionData {
  const [data, setData] = useState<BroadcastAuctionData>(EMPTY);
  const processedSoldPlayerIdsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<ReturnType<
    typeof connectBroadcastAuctionSocket
  > | null>(null);

  useEffect(() => {
    if (!token || !roomId) return;
    const socket = connectBroadcastAuctionSocket(token);
    socketRef.current = socket;
    processedSoldPlayerIdsRef.current = new Set();

    const join = () => {
      socket.emit("join-room", { roomId }, (ack: any) => {
        if (!ack?.success) return;
        setData((prev) => ({
          ...prev,
          connected: true,
          status:
            ack.state?.status ??
            (ack.captainSelectionPhase ? "WAITING" : prev.status),
          captainPhase: ack.captainSelectionPhase ?? null,
          teams: Array.isArray(ack.teams) ? ack.teams : prev.teams,
          players: Array.isArray(ack.players) ? ack.players : prev.players,
          auctionState: ack.state
            ? normalizeState(
                ack.state,
                Array.isArray(ack.players) ? ack.players : prev.players,
              )
            : prev.auctionState,
        }));
      });
    };

    socket.on("connect", () => {
      setData((p) => ({ ...p, connected: true }));
      join();
    });
    socket.on("disconnect", () => setData((p) => ({ ...p, connected: false })));
    if (socket.connected) join();

    // 팀장 선정 단계
    socket.on("captain-selection-phase", (d: any) =>
      setData((p) => ({ ...p, captainPhase: d, status: "WAITING" })),
    );
    socket.on("volunteer-list-updated", (d: any) =>
      setData((p) => ({
        ...p,
        captainPhase: p.captainPhase
          ? { ...p.captainPhase, volunteers: d.volunteers }
          : p.captainPhase,
      })),
    );
    socket.on("captains-confirmed", () =>
      setData((p) => ({ ...p, captainPhase: null })),
    );

    // 경매 시작 / 다음 매물
    const applyItemWithHistory = (d: any, isStart: boolean) =>
      setData((prev) => {
        const players = Array.isArray(d.players) ? d.players : prev.players;
        const teams = Array.isArray(d.teams) ? d.teams : prev.teams;
        const st = normalizeState(d.auctionState ?? d.state ?? null, players);
        const nextPlayerName = st?.currentPlayer?.username;
        if (isStart) processedSoldPlayerIdsRef.current = new Set();
        return {
          ...prev,
          status: "IN_PROGRESS",
          captainPhase: null,
          teams,
          players,
          auctionState: st,
          bidHistory: isStart
            ? []
            : nextPlayerName
              ? [
                  ...prev.bidHistory,
                  {
                    username: "",
                    amount: 0,
                    timestamp: Date.now(),
                    playerLabel: nextPlayerName,
                    isSeparator: true,
                  },
                ]
              : prev.bidHistory,
        };
      });

    socket.on("auction-started", (d: any) => applyItemWithHistory(d, true));
    socket.on("auction-item-started", (d: any) =>
      applyItemWithHistory(d, false),
    );

    // 입찰
    socket.on("bid-placed", (d: any) =>
      setData((prev) => {
        const offset =
          typeof d.serverNow === "number" ? d.serverNow - Date.now() : 0;
        return {
          ...prev,
          auctionState: prev.auctionState
            ? {
                ...prev.auctionState,
                currentHighestBid: d.amount,
                currentHighestBidder:
                  d.teamId ?? prev.auctionState.currentHighestBidder,
                currentHighestBidderName:
                  d.username ?? prev.auctionState.currentHighestBidderName,
                timerEnd:
                  typeof d.timerEnd === "number"
                    ? d.timerEnd - offset
                    : prev.auctionState.timerEnd,
              }
            : prev.auctionState,
          bidHistory: [
            ...prev.bidHistory,
            { username: d.username, amount: d.amount, timestamp: Date.now() },
          ],
        };
      }),
    );

    // 낙찰/유찰 확정: 서버가 최신 teams/players를 함께 보내므로 이 이벤트를 기준으로 목록 동기화.
    socket.on("bid-resolved", (d: any) =>
      setData((prev) => {
        const players = Array.isArray(d?.players) ? d.players : prev.players;
        const teams = Array.isArray(d?.teams) ? d.teams : prev.teams;
        if (d?.sold && d?.player?.id) {
          processedSoldPlayerIdsRef.current.add(d.player.id);
        }
        return {
          ...prev,
          teams,
          players,
          auctionState: renormalizeExistingState(prev.auctionState, players),
        };
      }),
    );

    // 낙찰
    socket.on("player-sold", (d: any) =>
      setData((prev) => {
        const playerId = d?.player?.id;
        if (playerId && processedSoldPlayerIdsRef.current.has(playerId)) {
          return prev;
        }
        if (playerId) processedSoldPlayerIdsRef.current.add(playerId);
        const teams = Array.isArray(d?.teams)
          ? d.teams
          : d?.team
            ? prev.teams.map((t) =>
                t.id === d.team.id ? { ...t, ...d.team } : t,
              )
            : prev.teams;
        const players = d?.player
          ? prev.players.filter((p) => p.id !== d.player.id)
          : prev.players;
        return {
          ...prev,
          teams,
          players,
          auctionState: renormalizeExistingState(prev.auctionState, players),
        };
      }),
    );

    // 유찰
    socket.on("player-unsold", (d: any) =>
      setData((prev) => ({
        ...prev,
        auctionState: prev.auctionState
          ? {
              ...prev.auctionState,
              yuchalCount:
                typeof d?.yuchalCount === "number"
                  ? d.yuchalCount
                  : prev.auctionState.yuchalCount,
            }
          : prev.auctionState,
      })),
    );

    // 타이머는 serverNow 기준 timerEnd로 보정한 뒤 AuctionBoard가 로컬에서 계산한다.
    socket.on("timer-update", () => {});

    socket.on("auction-complete", (d: any) =>
      setData((prev) => ({
        ...prev,
        teams: Array.isArray(d?.teams) ? d.teams : prev.teams,
        status: "COMPLETED",
        auctionState: prev.auctionState
          ? { ...prev.auctionState, status: "COMPLETED" }
          : prev.auctionState,
      })),
    );

    return () => {
      socket.emit("leave-room", { roomId });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, roomId]);

  return data;
}
