"use client";

import { useEffect, useRef } from "react";
import { GAME_SFX, playSfx } from "@/lib/sfx";
import { useAuctionStore } from "@/stores/auction-store";

/** 카운트다운 효과음을 내는 마지막 초 수 (5·4·3·2·1) */
const TICK_FROM_SECONDS = 5;
/** 남은 시간을 다시 읽는 간격. 초가 바뀌는 순간을 놓치지 않을 만큼 촘촘하게. */
const TICK_POLL_MS = 100;

/**
 * 경매 화면의 효과음.
 *
 * - 입찰(`bid`): 입찰 기록에 새 입찰이 붙을 때. 내 입찰·남의 입찰 구분 없이
 *   "최고 입찰자가 바뀌었다"를 알리는 소리라 모두에게 낸다.
 * - 카운트다운(`auctionTick`): 매물 마감 5·4·3·2·1초에 한 번씩.
 *   입찰로 타이머가 연장되면 다시 5초 전부터 센다.
 * - 낙찰(`auctionClose`): 매물이 팔린 순간.
 *
 * 경매 페이지에서만 부른다. `AuctionBoard` 는 방송(OBS) 화면에서도 쓰이는데,
 * 거기서 소리가 나면 방송에 그대로 섞이므로 보드 컴포넌트에 넣지 않는다.
 */
export function useAuctionSfx(): void {
  const bidCount = useAuctionStore(
    (s) => s.bidHistory.filter((entry) => !entry.isSeparator).length,
  );
  const soldAt = useAuctionStore((s) => s.lastSoldEvent?.timestamp ?? null);
  const timerEnd = useAuctionStore((s) => s.auctionState?.timerEnd ?? null);
  const running = useAuctionStore(
    (s) =>
      s.auctionState?.status === "IN_PROGRESS" &&
      !!s.auctionState?.currentPlayer,
  );

  // 입찰 — 처음 값(입장 시점까지 쌓인 기록)에는 소리를 내지 않는다.
  const prevBidCountRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevBidCountRef.current;
    prevBidCountRef.current = bidCount;
    if (prev !== null && bidCount > prev) playSfx(GAME_SFX.bid);
  }, [bidCount]);

  // 낙찰
  const prevSoldAtRef = useRef<number | null>(soldAt);
  useEffect(() => {
    if (soldAt !== null && soldAt !== prevSoldAtRef.current) {
      playSfx(GAME_SFX.auctionClose);
    }
    prevSoldAtRef.current = soldAt;
  }, [soldAt]);

  // 카운트다운 — 마감 시각이 바뀌면(새 매물·입찰 연장) 처음부터 다시 센다.
  useEffect(() => {
    if (!running || timerEnd === null) return;

    let lastTicked: number | null = null;
    const interval = window.setInterval(() => {
      const secondsLeft = Math.ceil((timerEnd - Date.now()) / 1000);
      if (secondsLeft < 1 || secondsLeft > TICK_FROM_SECONDS) return;
      // 같은 초에는 한 번만. 탭이 느려져 초를 건너뛰어도 소리를 몰아서 내지 않는다.
      if (secondsLeft === lastTicked) return;
      lastTicked = secondsLeft;
      playSfx(GAME_SFX.auctionTick);
    }, TICK_POLL_MS);

    return () => window.clearInterval(interval);
  }, [running, timerEnd]);
}
