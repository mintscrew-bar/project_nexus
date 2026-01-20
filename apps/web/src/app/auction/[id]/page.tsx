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

  const { connectToAuction, disconnectFromAuction, isConnected, error, auctionState } = useAuctionStore();

  useEffect(() => {
    if (auctionId) {
      connectToAuction(auctionId);
    }

    return () => {
      disconnectFromAuction();
    };
  }, [auctionId, connectToAuction, disconnectFromAuction]);

  const ConnectionStatus = () => (
    <div className="absolute top-4 right-4 text-sm">
      {isConnected ? (
        <span className="text-accent-success">● Connected</span>
      ) : (
        <span className="text-accent-danger">● Disconnected</span>
      )}
    </div>
  );

  return (
    <div className="flex-grow p-8 relative">
      <ConnectionStatus />
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-text-primary">
          Auction Room: <span className="text-accent-primary">{auctionId}</span>
        </h1>

        {error && <div className="text-accent-danger mb-4">Error: {error}</div>}

        {auctionState ? (
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
          <div className="text-text-secondary text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary mx-auto mb-4"></div>
            <p>Waiting for auction state...</p>
          </div>
        )}
      </div>
    </div>
  );
}
