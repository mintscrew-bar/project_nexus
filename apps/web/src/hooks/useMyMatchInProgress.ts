"use client";

import { useEffect, useMemo, useState } from "react";
import { matchApi, scrimApi } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useLobbyStore } from "@/stores/lobby-store";
import { useMatchStore } from "@/stores/match-store";

/** 진행 중 방에서 내 경기 상태를 다시 확인하는 주기 */
const POLL_INTERVAL_MS = 30_000;

/**
 * 지금 내가 실제 경기를 하고 있는가.
 *
 * 배경음악을 끄는 기준이다. 방 상태(`IN_PROGRESS`)만 보면 대진표가 끝날 때까지
 * 계속 "진행 중"이라, 경기 사이에 대진표를 보는 동안에도 음악이 꺼진다.
 * 그래서 방 단위가 아니라 **내가 속한 경기** 단위로 판단한다.
 *
 * - 롤·배그 킬내기: 내가 팀원인 Match 가 `IN_PROGRESS` 인가
 *   (서버의 `/matches/my` 가 팀원·로스터 스냅샷 기준으로 걸러준다)
 * - 배그 배틀로얄: 스크림 라운드가 진행 중이고 내가 관전자가 아닌가
 *   (라운드는 방 전체가 같이 뛰므로 참가자면 곧 내 경기다)
 *
 * 관전자는 경기에 속하지 않으니 음악이 계속 나온다.
 *
 * 방이 `IN_PROGRESS` 일 때만 조회한다. 그 밖에는 경기가 있을 수 없어서
 * 요청을 보내지 않는다. 대진표 화면에서는 소켓으로 갱신되는 `roomMatches` 가
 * 바뀔 때마다 즉시 다시 확인해서, 경기 시작·결과 입력에 바로 반응한다.
 */
export function useMyMatchInProgress(): boolean {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const room = useLobbyStore((s) => s.room);
  const roomMatches = useMatchStore((s) => s.roomMatches);
  const [inMatch, setInMatch] = useState(false);

  const roomId = room?.id;
  const watching = isAuthenticated && room?.status === "IN_PROGRESS";
  const isBattleRoyale =
    room?.gameTitle === "PUBG" && room?.pubgGameMode === "BATTLE_ROYALE";
  const isPlayer =
    room?.participants.some(
      (p) => p.userId === userId && p.role !== "SPECTATOR",
    ) ?? false;

  // 대진표 소켓 갱신 신호. 매치 상태가 바뀔 때만 문자열이 달라진다.
  // 이 값 자체로 판단하지 않는 이유 — 대진표 화면을 떠나면 갱신이 멈춰
  // 오래된 "진행 중"이 남을 수 있다. 판단은 항상 서버 조회로 한다.
  const roomMatchesSignal = useMemo(
    () =>
      roomMatches
        .filter((m) => m.roomId === roomId)
        .map((m) => `${m.id}:${m.status}`)
        .join(","),
    [roomMatches, roomId],
  );

  useEffect(() => {
    if (!watching || !roomId) {
      setInMatch(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        let next: boolean;
        if (isBattleRoyale) {
          const scrim = (await scrimApi.getScrim(roomId)) as {
            rounds?: Array<{ status: string }>;
          } | null;
          next =
            isPlayer &&
            (scrim?.rounds?.some((r) => r.status === "IN_PROGRESS") ?? false);
        } else {
          // 호스트가 결과를 안 넣고 버린 옛 방의 매치가 "진행 중"으로 남아 있을 수
          // 있다. 그런 매치 때문에 음악이 영영 꺼지지 않도록 지금 방 것만 본다.
          const matches = (await matchApi.getUserMatches({
            status: "IN_PROGRESS",
            limit: 10,
          })) as Array<{ roomId?: string | null }>;
          next = matches.some((m) => m.roomId === roomId);
        }
        if (!cancelled) setInMatch(next);
      } catch {
        // 조회 실패 시 직전 판단을 유지한다. 네트워크가 흔들릴 때마다 음악이
        // 켜졌다 꺼졌다 하는 것보다 낫다.
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);

    // 롤 클라이언트에 있다가 돌아왔을 때 30초를 기다리지 않게 한다.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [watching, roomId, isBattleRoyale, isPlayer, roomMatchesSignal]);

  return inMatch;
}
