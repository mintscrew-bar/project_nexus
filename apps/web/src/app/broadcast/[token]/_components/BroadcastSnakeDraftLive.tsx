"use client";

import { useBroadcastSnakeDraft } from "../_live/useBroadcastSnakeDraft";
import { SnakeDraftBoardView } from "./SnakeDraftBoardView";

/**
 * 라이브 스네이크 드래프트 방송 컨테이너 — 방송 토큰으로 /snake-draft를
 * read-only 구독하고 픽 진행을 SnakeDraftBoardView로 그린다.
 * (경매의 BroadcastAuctionLive와 같은 위상)
 */
export function BroadcastSnakeDraftLive({
  token,
  roomId,
  snapshot,
}: {
  token: string;
  roomId: string;
  snapshot: any;
}) {
  const draft = useBroadcastSnakeDraft(token, roomId);
  return <SnakeDraftBoardView draft={draft} snapshot={snapshot} />;
}
