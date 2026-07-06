"use client";

import { useBroadcastAuction } from "../_live/useBroadcastAuction";
import { AuctionLiveView } from "./AuctionLiveView";

/**
 * 라이브 경매 방송 컨테이너 — 방송 토큰으로 /auction을 read-only 구독하고
 * 프레젠테이션 뷰에 상태를 주입한다. (프리뷰는 AuctionLiveView에 목업 직접 주입)
 */
export function BroadcastAuctionLive({
  token,
  roomId,
  accent,
}: {
  token: string;
  roomId: string;
  accent?: string;
}) {
  const state = useBroadcastAuction(token, roomId);
  return <AuctionLiveView state={state} accent={accent} />;
}
