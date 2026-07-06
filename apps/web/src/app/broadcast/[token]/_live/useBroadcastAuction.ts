"use client";

import { useEffect, useRef, useState } from "react";
import { connectBroadcastAuctionSocket } from "@/lib/socket-client";

/**
 * 방송 오버레이용 라이브 경매 구독 훅(read-only).
 * 기존 /auction 게이트웨이의 라이브 이벤트(입찰/낙찰/유찰/타이머)를 그대로
 * 구독해 방송 표시 상태로 정리한다. 참가자 스토어와 독립(액션 없음).
 */

export interface AuctionFeedEntry {
  id: string;
  type: "sold" | "unsold" | "bid" | "info";
  playerName?: string;
  teamName?: string;
  teamColor?: string;
  amount?: number;
  text?: string;
  ts: number;
}

export interface BroadcastAuctionState {
  connected: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | null;
  captainPhase: any | null;
  current: {
    player: any | null;
    bid: number;
    bidderTeamId: string | null;
    bidderName: string | null;
    timerEnd: number | null;
    clockOffset: number; // serverNow - localNow (드리프트 보정)
  };
  teams: any[];
  remainingCount: number;
  feed: AuctionFeedEntry[];
}

const EMPTY: BroadcastAuctionState = {
  connected: false,
  status: null,
  captainPhase: null,
  current: {
    player: null,
    bid: 0,
    bidderTeamId: null,
    bidderName: null,
    timerEnd: null,
    clockOffset: 0,
  },
  teams: [],
  remainingCount: 0,
  feed: [],
};

let feedSeq = 0;
const pushFeed = (
  feed: AuctionFeedEntry[],
  entry: Omit<AuctionFeedEntry, "id" | "ts">,
) => [{ ...entry, id: `f${++feedSeq}`, ts: Date.now() }, ...feed].slice(0, 6);

const resolvePlayer = (state: any, players: any[]) => {
  if (state?.currentPlayer?.id) return state.currentPlayer;
  const idx =
    typeof state?.currentPlayerIndex === "number"
      ? state.currentPlayerIndex
      : 0;
  return players?.[idx] ?? null;
};

const teamName = (teams: any[], id: string | null) =>
  teams.find((t) => t.id === id)?.name ?? "";
const teamColor = (teams: any[], id: string | null) =>
  teams.find((t) => t.id === id)?.color ?? undefined;

export function useBroadcastAuction(
  token: string | undefined,
  roomId: string | undefined,
): BroadcastAuctionState {
  const [state, setState] = useState<BroadcastAuctionState>(EMPTY);
  const socketRef = useRef<ReturnType<
    typeof connectBroadcastAuctionSocket
  > | null>(null);

  useEffect(() => {
    if (!token || !roomId) return;
    const socket = connectBroadcastAuctionSocket(token);
    socketRef.current = socket;

    const offsetFrom = (data: any) =>
      typeof data?.serverNow === "number" ? data.serverNow - Date.now() : 0;

    const join = () => {
      socket.emit("join-room", { roomId }, (ack: any) => {
        if (!ack?.success) return;
        const players = ack.players ?? [];
        const s = ack.state ?? null;
        setState((prev) => ({
          ...prev,
          connected: true,
          status:
            s?.status ?? (ack.captainSelectionPhase ? "WAITING" : prev.status),
          captainPhase: ack.captainSelectionPhase ?? null,
          teams: ack.teams ?? [],
          remainingCount: players.length,
          current: {
            player: resolvePlayer(s, players),
            bid: s?.currentHighestBid ?? 0,
            bidderTeamId: s?.currentHighestBidder ?? null,
            bidderName: s?.currentHighestBidderName ?? null,
            timerEnd: s?.timerEnd ?? null,
            clockOffset: offsetFrom(s),
          },
        }));
      });
    };

    socket.on("connect", () => {
      setState((p) => ({ ...p, connected: true }));
      join();
    });
    socket.on("disconnect", () =>
      setState((p) => ({ ...p, connected: false })),
    );
    if (socket.connected) join();

    // 팀장 선정 단계
    socket.on("captain-selection-phase", (data: any) =>
      setState((p) => ({ ...p, captainPhase: data, status: "WAITING" })),
    );
    socket.on("volunteer-list-updated", (data: any) =>
      setState((p) => ({
        ...p,
        captainPhase: p.captainPhase
          ? { ...p.captainPhase, volunteers: data.volunteers }
          : p.captainPhase,
      })),
    );
    socket.on("captains-confirmed", () =>
      setState((p) => ({ ...p, captainPhase: null })),
    );

    // 경매 시작 / 다음 매물
    const applyItem = (data: any, isStart: boolean) =>
      setState((prev) => {
        const players = Array.isArray(data.players) ? data.players : [];
        const teams = Array.isArray(data.teams) ? data.teams : prev.teams;
        const s = data.auctionState ?? data.state ?? null;
        const player = resolvePlayer(s, players);
        return {
          ...prev,
          status: "IN_PROGRESS",
          captainPhase: null,
          teams,
          remainingCount: players.length,
          current: {
            player,
            bid: s?.currentHighestBid ?? 0,
            bidderTeamId: s?.currentHighestBidder ?? null,
            bidderName: s?.currentHighestBidderName ?? null,
            timerEnd: s?.timerEnd ?? null,
            clockOffset: offsetFrom(s),
          },
          feed:
            !isStart && player?.username
              ? pushFeed(prev.feed, {
                  type: "info",
                  text: `▶ ${player.username} 매물 시작`,
                })
              : prev.feed,
        };
      });

    socket.on("auction-started", (data: any) => applyItem(data, true));
    socket.on("auction-item-started", (data: any) => applyItem(data, false));

    // 입찰
    socket.on("bid-placed", (data: any) =>
      setState((prev) => ({
        ...prev,
        current: {
          ...prev.current,
          bid: data.amount,
          bidderTeamId: data.teamId ?? prev.current.bidderTeamId,
          bidderName: data.username ?? prev.current.bidderName,
          timerEnd: data.timerEnd ?? prev.current.timerEnd,
          clockOffset: offsetFrom(data),
        },
        feed: pushFeed(prev.feed, {
          type: "bid",
          teamName: teamName(prev.teams, data.teamId),
          teamColor: teamColor(prev.teams, data.teamId),
          amount: data.amount,
        }),
      })),
    );

    // 낙찰
    socket.on("player-sold", (data: any) =>
      setState((prev) => {
        const teams = Array.isArray(data?.teams)
          ? data.teams
          : data?.team
            ? prev.teams.map((t) =>
                t.id === data.team.id ? { ...t, ...data.team } : t,
              )
            : prev.teams;
        return {
          ...prev,
          teams,
          remainingCount: Math.max(0, prev.remainingCount - 1),
          current: {
            ...prev.current,
            player: null,
            bid: 0,
            bidderTeamId: null,
            bidderName: null,
          },
          feed: pushFeed(prev.feed, {
            type: "sold",
            playerName: data?.player?.username,
            teamName: data?.team?.name ?? teamName(teams, data?.team?.id),
            teamColor: data?.team?.color ?? teamColor(teams, data?.team?.id),
            amount: data?.price,
          }),
        };
      }),
    );

    // 유찰
    socket.on("player-unsold", (data: any) =>
      setState((prev) => ({
        ...prev,
        current: {
          ...prev.current,
          player: null,
          bid: 0,
          bidderTeamId: null,
          bidderName: null,
        },
        feed: pushFeed(prev.feed, {
          type: "unsold",
          playerName: data?.player?.username,
        }),
      })),
    );

    // 타이머 갱신(서버 500ms 주기)
    socket.on("timer-update", (data: any) =>
      setState((prev) =>
        typeof data?.timeLeft === "number"
          ? {
              ...prev,
              current: {
                ...prev.current,
                timerEnd:
                  Date.now() + prev.current.clockOffset + data.timeLeft * 1000,
              },
            }
          : prev,
      ),
    );

    socket.on("auction-complete", () =>
      setState((prev) => ({
        ...prev,
        status: "COMPLETED",
        current: { ...prev.current, player: null, timerEnd: null },
        feed: pushFeed(prev.feed, { type: "info", text: "경매 종료" }),
      })),
    );

    return () => {
      socket.emit("leave-room", { roomId });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, roomId]);

  return state;
}
