"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useAuctionStore } from "@/stores/auction-store";

import { AuctionStatus } from "@/components/auction/AuctionStatus";
import { BiddingPanel } from "@/components/auction/BiddingPanel";
import { BidHistory } from "@/components/auction/BidHistory";
import { TeamList } from "@/components/auction/TeamList";

export default function AuctionRoomPage() {
  const params = useParams();
  const auctionId = params.id as string;

  const { connect, disconnect, isConnected, error, liveState } = useAuctionStore();

  useEffect(() => {
    if (auctionId) {
      connect(auctionId);
    }
    
    return () => {
      disconnect();
    };
  }, [auctionId, connect, disconnect]);

  const ConnectionStatus = () => (
    <div className="absolute top-4 right-4 text-sm">
      {isConnected ? (
        <span className="text-lol-accent-green">● Connected</span>
      ) : (
        <span className="text-lol-accent-red">● Disconnected</span>
      )}
    </div>
  );

  return (
    <div className="flex-grow p-8 relative">
      <ConnectionStatus />
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-ui-text-base">
          Auction Room: <span className="text-brand-500">{auctionId}</span>
        </h1>

        {error && <div className="text-lol-accent-red mb-4">Error: {error}</div>}

        {liveState ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Column */}
            <div className="lg:col-span-2 space-y-6">
              <AuctionStatus />
              <BiddingPanel />
            </div>
            
            {/* Right Sidebar Column */}
            <div className="lg:col-span-1 space-y-6">
              <BidHistory />
              <TeamList />
            </div>
          </div>
        ) : (
          <div className="text-ui-text-muted text-center py-10">
            <p>Waiting for auction state...</p>
          </div>
        )}
      </div>
    </div>
  );
}
