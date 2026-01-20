"use client";

import { useAuctionStore } from "@/stores/auction-store";
import { Timer } from "lucide-react";
import { useState, useEffect } from "react"; // Import useState and useEffect

export function AuctionStatus() {
  const { liveState, players } = useAuctionStore();
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!liveState?.timerEnd) {
      setTimeLeft(0);
      return;
    }

    const calculateTimeLeft = () => {
      const now = Date.now();
      const difference = liveState.timerEnd - now;
      setTimeLeft(Math.max(0, Math.floor(difference / 1000)));
    };

    calculateTimeLeft(); // Initial calculation
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer); // Cleanup on unmount
  }, [liveState?.timerEnd]);

  if (!liveState) {
    return (
      <div className="p-4 bg-bg-secondary border border-bg-tertiary rounded-lg text-center">
        <p className="text-text-secondary">Waiting for auction to start...</p>
      </div>
    );
  }

  const currentPlayer = players[liveState.currentPlayerIndex];
  const timerColor = timeLeft <= 5 ? "text-accent-danger" : "text-accent-primary"; // Red when time is low

  return (
    <div className="p-6 bg-bg-secondary border-2 border-accent-primary rounded-2xl shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-text-primary">Live Auction</h2>
        <div className="flex items-center space-x-2 text-lg font-semibold text-text-primary">
          <Timer className={`h-6 w-6 ${timerColor}`} />
          <span className={timerColor}>{timeLeft}s</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Player Info */}
        <div className="space-y-2">
            <p className="text-sm text-text-secondary">Now Bidding:</p>
            <p className="text-3xl font-bold text-text-primary">{currentPlayer?.username || 'N/A'}</p>
            <div className="flex space-x-2">
                <span className="px-2 py-1 bg-accent-primary/20 text-accent-primary text-xs font-semibold rounded-full">{currentPlayer?.tier || 'UNRANKED'}</span>
                <span className="px-2 py-1 bg-bg-tertiary text-text-secondary text-xs font-semibold rounded-full">{currentPlayer?.mainRole || 'FILL'}</span>
            </div>
        </div>
        
        {/* Current Bid Info */}
        <div className="space-y-2 text-right">
            <p className="text-sm text-text-secondary">Current Bid:</p>
            <p className="text-4xl font-bold text-accent-primary">{liveState.currentHighestBid.toLocaleString()}</p>
            <p className="text-sm text-text-secondary">
                by {liveState.currentHighestBidder || 'No one yet'}
            </p>
        </div>
      </div>
    </div>
  );
}
