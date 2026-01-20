"use client";

import { useAuctionStore } from "@/stores/auction-store";
import { useState, useEffect } from "react";
import { Gavel } from "lucide-react";

const BID_INCREMENT = 100; // Should come from backend or a shared constant

export function BiddingPanel() {
  const { placeBid, liveState, currentUserIsCaptain, currentUserTeam } = useAuctionStore();
  const [bidAmount, setBidAmount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (liveState) {
      // Set a default bid amount when a new player is up
      const suggestedBid = liveState.currentHighestBid > 0 
        ? liveState.currentHighestBid + BID_INCREMENT 
        : BID_INCREMENT;
      setBidAmount(suggestedBid);
      setErrorMessage(""); // Clear error on new player/bid state
    }
  }, [liveState?.currentPlayerIndex, liveState?.currentHighestBid]);

  if (!currentUserIsCaptain || !liveState || !currentUserTeam) {
    return null; // Don't show panel if not a captain or auction is not live
  }

  const currentBudget = currentUserTeam.remainingBudget;
  const minBid = liveState.currentHighestBid + BID_INCREMENT;

  // Client-side validation
  const isBidValid = bidAmount >= minBid && bidAmount <= currentBudget && bidAmount % BID_INCREMENT === 0;
  
  const handlePlaceBid = () => {
    setErrorMessage(""); // Clear previous errors
    if (!isBidValid) {
      if (bidAmount < minBid) {
        setErrorMessage(`Bid must be at least ${minBid.toLocaleString()}`);
      } else if (bidAmount > currentBudget) {
        setErrorMessage(`Insufficient budget. You have ${currentBudget.toLocaleString()}`);
      } else if (bidAmount % BID_INCREMENT !== 0) {
        setErrorMessage(`Bid must be a multiple of ${BID_INCREMENT}`);
      }
      return;
    }
    placeBid(bidAmount);
    setErrorMessage(""); // Clear error on successful bid attempt
  };

  return (
    <div className="mt-6 p-6 bg-bg-secondary border border-bg-tertiary rounded-2xl shadow-lg">
      <h3 className="text-xl font-bold text-text-primary mb-4">Place Your Bid</h3>
      <div className="flex items-center space-x-4 mb-2">
        <input
          type="number"
          step={BID_INCREMENT}
          min={minBid}
          value={bidAmount}
          onChange={(e) => setBidAmount(parseInt(e.target.value, 10))}
          className="flex-grow p-3 bg-bg-tertiary border border-text-muted rounded-lg text-lg font-semibold text-text-primary focus:ring-2 focus:ring-accent-primary focus:outline-none"
        />
        <button
          onClick={handlePlaceBid}
          disabled={!isBidValid} // Disable based on validation
          className="px-8 py-3 bg-accent-primary hover:bg-accent-hover text-white font-bold rounded-lg flex items-center space-x-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Gavel className="h-5 w-5" />
          <span>Place Bid</span>
        </button>
      </div>
      {errorMessage && <p className="text-accent-danger text-sm mt-2">{errorMessage}</p>}
      {currentUserIsCaptain && currentUserTeam && (
        <p className="text-text-secondary text-sm text-right">
          Your budget: <span className="font-semibold text-accent-gold">{currentBudget.toLocaleString()}</span>
        </p>
      )}
    </div>
  );
}
