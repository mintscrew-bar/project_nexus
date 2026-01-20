"use client";

import { useAuctionStore } from "@/stores/auction-store";
import { ScrollText } from "lucide-react";

export function BidHistory() {
  const { bidHistory } = useAuctionStore();

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-text-primary mb-2 flex items-center">
        <ScrollText className="h-5 w-5 mr-2 text-text-secondary" />
        Bid History
      </h3>
      <div className="h-48 overflow-y-auto p-4 bg-bg-tertiary border border-text-muted rounded-lg space-y-2">
        {bidHistory.length === 0 ? (
          <p className="text-text-secondary text-sm text-center">No bids yet.</p>
        ) : (
          bidHistory.slice().reverse().map((bid, index) => (
            <div key={index} className="flex justify-between items-center text-sm">
              <span className="font-semibold text-text-primary">{bid.username}</span>
              <span className="font-bold text-accent-primary">{bid.amount.toLocaleString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
