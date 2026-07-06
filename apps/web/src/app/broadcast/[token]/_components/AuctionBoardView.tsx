"use client";

import { AuctionBoard } from "@/components/domain";
import type { BroadcastAuctionData } from "../_live/useBroadcastAuction";

/**
 * 방송용 경매 화면 — 기존 AuctionBoard를 read-only로 그대로 렌더한다.
 * 데이터는 라이브 훅(useBroadcastAuction) 또는 프리뷰 목업에서 주입.
 */
const noop = () => {};

export function AuctionBoardView({ data }: { data: BroadcastAuctionData }) {
  const { auctionState, teams, players, bidHistory, captainPhase, status } =
    data;

  return (
    <div className="flex h-full w-full flex-col bg-bg-primary px-10 py-8">
      {auctionState ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <AuctionBoard
            auctionState={auctionState}
            teams={teams}
            players={players}
            bidHistory={bidHistory}
            onPlaceBid={noop}
            disabled
            hideBidPanel
            className="h-full"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="text-3xl font-black uppercase tracking-[0.3em] text-white/50">
            {status === "WAITING" || captainPhase
              ? "팀장 선정 중"
              : "경매 준비 중"}
          </span>
          {captainPhase && (
            <span className="text-lg text-white/40">
              지원자 {captainPhase.volunteers?.length ?? 0}명
            </span>
          )}
        </div>
      )}
    </div>
  );
}
