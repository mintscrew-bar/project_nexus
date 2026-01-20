"use client";

import { useAuctionStore } from "@/stores/auction-store";
import { Shield, Coins } from "lucide-react";

export function TeamList() {
  const { teams } = useAuctionStore();

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-ui-text-base mb-2 flex items-center">
        <Shield className="h-5 w-5 mr-2 text-ui-text-muted" />
        Teams
      </h3>
      <div className="space-y-4">
        {teams.length === 0 ? (
          <div className="p-4 bg-ui-card border border-ui-border rounded-lg text-center">
            <p className="text-ui-text-muted text-sm">Teams will be formed soon.</p>
          </div>
        ) : (
          teams.map((team) => (
            <div key={team.id} className="p-4 bg-ui-card border border-ui-border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-ui-text-base">{team.name}</h4>
                <div className="flex items-center text-sm font-semibold text-lol-accent-gold">
                  <Coins className="h-4 w-4 mr-1" />
                  {team.remainingBudget.toLocaleString()}
                </div>
              </div>
              <ul className="space-y-1 text-sm text-ui-text-muted">
                {team.members.map((member, index) => (
                  <li key={member.id} className="flex items-center">
                    <span className="font-semibold">{member.username}</span>
                    {index === 0 && <span className="ml-2 px-2 py-0.5 bg-brand-purple text-white text-xs font-bold rounded-full">C</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
