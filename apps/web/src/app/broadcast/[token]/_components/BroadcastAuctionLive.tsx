"use client";

import { useEffect, useRef } from "react";
import { GAME_SFX, SFX_GAIN_BY_FILE } from "@/lib/sfx";
import { useBroadcastAuction } from "../_live/useBroadcastAuction";
import { AuctionBoardView } from "./AuctionBoardView";
import { useBroadcastLook } from "./look";

/**
 * 라이브 경매 방송 컨테이너 — 방송 토큰으로 /auction을 read-only 구독하고
 * 기존 참가자 경매 화면(AuctionBoard)을 그대로 방송에 띄운다(입찰 컨트롤 없음).
 */
export function BroadcastAuctionLive({
  token,
  roomId,
}: {
  token: string;
  roomId: string;
}) {
  const data = useBroadcastAuction(token, roomId);
  useAuctionSfx(data);
  return <AuctionBoardView data={data} token={token} />;
}

/**
 * 방송 효과음 — 방송인이 켰을 때만. 입찰이 들어오면 짧은 소리, 낙찰되면 마감 소리.
 *
 * 사이트의 효과음 설정(sfx-store)은 보는 사람 브라우저 값이라 쓰지 않는다.
 * OBS 브라우저 소스는 방송인 설정(볼륨 0~100)만 따른다.
 * 처음 연결될 때 이미 쌓여 있던 기록으로는 소리를 내지 않는다.
 */
function useAuctionSfx(data: ReturnType<typeof useBroadcastAuction>) {
  const { settings } = useBroadcastLook();
  const bidCount = data.bidHistory.filter((entry) => !entry.isSeparator).length;
  const poolCount = data.players.length;
  const seenRef = useRef<{ bids: number; pool: number } | null>(null);

  useEffect(() => {
    const prev = seenRef.current;
    seenRef.current = { bids: bidCount, pool: poolCount };
    if (!prev || !settings.sfx.enabled || settings.sfx.volume <= 0) return;

    const play = (source: string) => {
      if (typeof Audio === "undefined") return;
      const file = source.split("/").pop() ?? source;
      const audio = new Audio(source);
      audio.volume = Math.min(
        1,
        (settings.sfx.volume / 100) * (SFX_GAIN_BY_FILE[file] ?? 0.8),
      );
      void audio.play().catch(() => {
        // OBS 는 자동 재생이 허용되지만, 일반 브라우저에서 막혀도 화면은 계속 돈다
      });
    };

    if (poolCount < prev.pool) play(GAME_SFX.auctionClose);
    else if (bidCount > prev.bids) play(GAME_SFX.bid);
  }, [bidCount, poolCount, settings.sfx.enabled, settings.sfx.volume]);
}
