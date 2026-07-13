"use client";

import { useEffect, useState } from "react";
import { connectBroadcastDraftSocket } from "@/lib/socket-client";

/**
 * 방송 오버레이용 라이브 스네이크 드래프트 구독 훅(read-only).
 * /snake-draft 게이트웨이에 방송 토큰으로 접속해 픽 진행을 실시간 반영한다.
 * 액션(픽)은 없음 — 화면 표시용 상태만 유지한다.
 */

export interface DraftPlayer {
  id: string;
  username: string;
  tier?: string;
  rank?: string;
  mmr?: number;
  position?: string;
}

export interface DraftTeam {
  id: string;
  name: string;
  captainId?: string | null;
  color?: string | null;
  members: DraftPlayer[];
}

export interface BroadcastSnakeDraftData {
  connected: boolean;
  /** null이면 아직 드래프트 시작 전(서버 in-memory 상태 없음) */
  status: "IN_PROGRESS" | "COMPLETED" | null;
  teams: DraftTeam[];
  availablePlayers: DraftPlayer[];
  pickOrder: string[];
  currentTeamId: string | null;
  timerEnd: number | null;
  /** 방송 연출용 — 직전 픽 (팀/선수) */
  lastPick: { teamId: string; player: DraftPlayer } | null;
}

const EMPTY: BroadcastSnakeDraftData = {
  connected: false,
  status: null,
  teams: [],
  availablePlayers: [],
  pickOrder: [],
  currentTeamId: null,
  timerEnd: null,
  lastPick: null,
};

/** join ack / draft-started가 주는 전체 상태를 표시용 상태로 정규화 */
function applyFullState(
  prev: BroadcastSnakeDraftData,
  state: any,
): BroadcastSnakeDraftData {
  if (!state) return prev;
  return {
    ...prev,
    status: state.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
    teams: Array.isArray(state.teams) ? state.teams : prev.teams,
    availablePlayers: Array.isArray(state.availablePlayers)
      ? state.availablePlayers
      : prev.availablePlayers,
    pickOrder: Array.isArray(state.pickOrder)
      ? state.pickOrder
      : prev.pickOrder,
    currentTeamId: state.currentTeamId ?? null,
    timerEnd: typeof state.timerEnd === "number" ? state.timerEnd : null,
  };
}

export function useBroadcastSnakeDraft(
  token: string | undefined,
  roomId: string | undefined,
): BroadcastSnakeDraftData {
  const [data, setData] = useState<BroadcastSnakeDraftData>(EMPTY);

  useEffect(() => {
    if (!token || !roomId) return;
    const socket = connectBroadcastDraftSocket(token);

    const join = () => {
      socket.emit("join-draft-room", { roomId }, (ack: any) => {
        if (!ack?.success) return;
        // 드래프트 시작 전이면 state가 null — connected만 표시하고 대기
        setData((prev) => applyFullState({ ...prev, connected: true }, ack.state));
      });
    };

    socket.on("connect", () => {
      setData((p) => ({ ...p, connected: true }));
      join();
    });
    socket.on("disconnect", () =>
      setData((p) => ({ ...p, connected: false })),
    );
    if (socket.connected) join();

    // 드래프트 시작 — 전체 상태로 초기화
    socket.on("draft-started", (d: any) =>
      setData((prev) =>
        applyFullState({ ...prev, lastPick: null }, d?.state ?? d),
      ),
    );

    // 픽 확정(수동/자동 동일 형태) — 풀에서 빼서 해당 팀에 넣는다
    socket.on(
      "pick-made",
      (d: { teamId: string; player: DraftPlayer; nextTeamId: string | null; timerEnd: number }) =>
        setData((prev) => {
          const picked =
            prev.availablePlayers.find((p) => p.id === d.player?.id) ??
            d.player;
          if (!picked?.id) return prev;
          return {
            ...prev,
            availablePlayers: prev.availablePlayers.filter(
              (p) => p.id !== picked.id,
            ),
            teams: prev.teams.map((team) =>
              team.id === d.teamId
                ? // 재연결 직후 중복 이벤트 대비 — 이미 있으면 추가하지 않음
                  team.members.some((m) => m.id === picked.id)
                  ? team
                  : { ...team, members: [...team.members, picked] }
                : team,
            ),
            currentTeamId: d.nextTeamId ?? null,
            timerEnd: typeof d.timerEnd === "number" ? d.timerEnd : prev.timerEnd,
            lastPick: { teamId: d.teamId, player: picked },
          };
        }),
    );

    // 턴 전환(타이머 연장 포함)
    socket.on(
      "next-pick",
      (d: { currentTeamId: string | null; timerEnd: number }) =>
        setData((prev) => ({
          ...prev,
          currentTeamId: d.currentTeamId ?? prev.currentTeamId,
          timerEnd: typeof d.timerEnd === "number" ? d.timerEnd : prev.timerEnd,
        })),
    );

    // 완료 — 최종 팀 확정. 이후 스냅샷 폴링이 role-selection 장면으로 넘긴다.
    socket.on("draft-complete", (d: { teams?: DraftTeam[] }) =>
      setData((prev) => ({
        ...prev,
        status: "COMPLETED",
        teams: Array.isArray(d?.teams) ? d.teams : prev.teams,
        availablePlayers: [],
        currentTeamId: null,
        timerEnd: null,
      })),
    );

    // 세션 중단(호스트 이탈 등) — 시작 전 상태로 되돌린다
    socket.on("session-aborted", () =>
      setData((prev) => ({ ...EMPTY, connected: prev.connected })),
    );

    return () => {
      socket.emit("leave-draft-room", { roomId });
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, roomId]);

  return data;
}
