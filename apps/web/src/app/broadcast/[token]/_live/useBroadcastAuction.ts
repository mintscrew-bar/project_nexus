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
  if (state?.currentPlayer?.id) return state.currentPlayer;
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

export function useBroadcastAuction(
  token: string | undefined,
  roomId: string | undefined,
): BroadcastAuctionData {
  const [data, setData] = useState<BroadcastAuctionData>(EMPTY);
  const socketRef = useRef<ReturnType<
    typeof connectBroadcastAuctionSocket
  > | null>(null);

  useEffect(() => {
    if (!token || !roomId) return;
    const socket = connectBroadcastAuctionSocket(token);
    socketRef.current = socket;

    const join = () => {
      socket.emit("join-room", { roomId }, (ack: any) => {
        if (!ack?.success) return;
        const players = ack.players ?? [];
        setData((prev) => ({
          ...prev,
          connected: true,
          status:
            ack.state?.status ??
            (ack.captainSelectionPhase ? "WAITING" : prev.status),
          captainPhase: ack.captainSelectionPhase ?? null,
          teams: ack.teams ?? [],
          players,
          auctionState: normalizeState(ack.state, players),
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
    const applyItem = (d: any, isStart: boolean) =>
      setData((prev) => {
        const players = Array.isArray(d.players) ? d.players : prev.players;
        const teams = Array.isArray(d.teams) ? d.teams : prev.teams;
        const st = normalizeState(d.auctionState ?? d.state ?? null, players);
        const nextPlayerName = st?.currentPlayer?.username;
        return {
          ...prev,
          status: "IN_PROGRESS",
          captainPhase: null,
          teams,
          players,
          auctionState: st,
          bidHistory:
            !isStart && nextPlayerName
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

    socket.on("auction-started", (d: any) => applyItem(d, true));
    socket.on("auction-item-started", (d: any) => applyItem(d, false));

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

    // 낙찰
    socket.on("player-sold", (d: any) =>
      setData((prev) => {
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
        return { ...prev, teams, players };
      }),
    );

    // 유찰
    socket.on("player-unsold", (d: any) =>
      setData((prev) => ({
        ...prev,
        players: d?.player
          ? prev.players.filter((p) => p.id !== d.player.id)
          : prev.players,
      })),
    );

    // 타이머 갱신(서버 500ms 주기) — timeLeft(초)로 로컬 timerEnd 재계산
    socket.on("timer-update", (d: any) =>
      setData((prev) =>
        prev.auctionState && typeof d?.timeLeft === "number"
          ? {
              ...prev,
              auctionState: {
                ...prev.auctionState,
                timerEnd: Date.now() + d.timeLeft * 1000,
              },
            }
          : prev,
      ),
    );

    socket.on("auction-complete", () =>
      setData((prev) => ({
        ...prev,
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
