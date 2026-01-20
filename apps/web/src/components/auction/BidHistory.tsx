"use client";

import { useAuctionStore } from "@/stores/auction-store";
import { ScrollText } from "lucide-react";

export function BidHistory() {
  const { bidHistory } = useAuctionStore();

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-ui-text-base mb-2 flex items-center">
        <ScrollText className="h-5 w-5 mr-2 text-ui-text-muted" />
        Bid History
      </h3>
      <div className="h-48 overflow-y-auto p-4 bg-ui-background border border-ui-border rounded-lg space-y-2">
        {bidHistory.length === 0 ? (
          <p className="text-ui-text-muted text-sm text-center">No bids yet.</p>
        ) : (
          bidHistory.slice().reverse().map((bid, index) => (
            <div key={index} className="flex justify-between items-center text-sm">
              <span className="font-semibold text-ui-text-base">{bid.username}</span>
              <span className="font-bold text-brand-500">{bid.amount.toLocaleString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
