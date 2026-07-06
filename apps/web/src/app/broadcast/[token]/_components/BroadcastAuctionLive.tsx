"use client";

import { useBroadcastAuction } from "../_live/useBroadcastAuction";
import { AuctionBoardView } from "./AuctionBoardView";

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
  return <AuctionBoardView data={data} />;
}
