"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Badge, LoadingSpinner } from "@/components/ui";
import {
  Users,
  Play,
  RotateCcw,
  Shuffle,
  Scale,
  Gavel,
  GitBranch,
  ChevronRight,
  Trophy,
  Zap,
  Clock,
  Coins,
} from "lucide-react";

// Types
interface MockPlayer {
  id: string;
  name: string;
  tier: "IRON" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "EMERALD" | "DIAMOND" | "MASTER" | "GRANDMASTER" | "CHALLENGER";
  rank: string;
  mainPosition: string;
  secondaryPosition: string;
  mmr: number; // Internal rating for balancing
  isBot: boolean;
}

interface Team {
  id: string;
  name: string;
  color: string;
  captain: MockPlayer | null;
  members: MockPlayer[];
  budget: number;
  totalMmr: number;
}

interface AuctionState {
  currentPlayerIndex: number;
  currentPlayer: MockPlayer | null;
  currentBid: number;
  currentBidder: Team | null;
  timeLeft: number;
  phase: "BIDDING" | "SOLD" | "UNSOLD" | "COMPLETE";
  bidHistory: { team: Team; amount: number; timestamp: number }[];
}

interface DraftState {
  currentTeamIndex: number;
  currentRound: number;
  isReverse: boolean;
  pickOrder: Team[];
  availablePlayers: MockPlayer[];
  phase: "PICKING" | "COMPLETE";
  timeLeft: number;
}

// Constants
const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const TIER_MMR: Record<string, number> = {
  IRON: 400, BRONZE: 600, SILVER: 800, GOLD: 1000,
  PLATINUM: 1200, EMERALD: 1400, DIAMOND: 1600,
  MASTER: 1800, GRANDMASTER: 2000, CHALLENGER: 2200,
};
const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const TEAM_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
const KOREAN_NAMES = [
  "정글러킹", "탑신병자", "미드갓", "원딜장인", "서폿마스터",
  "페이커팬", "제우스워너비", "오너원", "구마유시", "케리아님",
  "T1팬", "젠지팬", "DK화이팅", "KT롤스터", "한화생명",
  "드래곤장인", "바론스틸러", "타워부수기", "킬스코어왕", "CS장인",
];

// Generate mock players
function generateMockPlayers(count: number): MockPlayer[] {
  const players: MockPlayer[] = [];
  const usedNames = new Set<string>();
  const timestamp = Date.now();

  for (let i = 0; i < count; i++) {
    let name = KOREAN_NAMES[Math.floor(Math.random() * KOREAN_NAMES.length)];
    let suffix = 1;
    while (usedNames.has(name)) {
      name = `${KOREAN_NAMES[Math.floor(Math.random() * KOREAN_NAMES.length)]}${suffix++}`;
    }
    usedNames.add(name);

    const tierIndex = Math.floor(Math.random() * TIERS.length);
    const tier = TIERS[tierIndex];
    const ranks = ["IV", "III", "II", "I"];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    const mainPos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
    const secondaryPos = POSITIONS.filter(p => p !== mainPos)[Math.floor(Math.random() * 4)];

    // MMR with some variance
    const baseMmr = TIER_MMR[tier];
    const variance = Math.floor(Math.random() * 200) - 100;

    players.push({
      id: `player-${timestamp}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      tier,
      rank,
      mainPosition: mainPos,
      secondaryPosition: secondaryPos,
      mmr: baseMmr + variance,
      isBot: true,
    });
  }

  return players.sort((a, b) => b.mmr - a.mmr);
}

// Generate teams
function generateTeams(count: number, players: MockPlayer[], budget: number): Team[] {
  const teams: Team[] = [];
  const captains = players.slice(0, count);
  const timestamp = Date.now();

  for (let i = 0; i < count; i++) {
    teams.push({
      id: `team-${timestamp}-${i}`,
      name: `팀 ${i + 1}`,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
      captain: captains[i],
      members: [captains[i]],
      budget,
      totalMmr: captains[i].mmr,
    });
  }

  return teams;
}

// Tier badge component
function TierBadge({ tier }: { tier: string }) {
  const tierColors: Record<string, string> = {
    IRON: "bg-tier-iron text-white",
    BRONZE: "bg-tier-bronze text-white",
    SILVER: "bg-tier-silver text-white",
    GOLD: "bg-tier-gold text-white",
    PLATINUM: "bg-tier-platinum text-white",
    EMERALD: "bg-tier-emerald text-white",
    DIAMOND: "bg-tier-diamond text-white",
    MASTER: "bg-tier-master text-white",
    GRANDMASTER: "bg-tier-grandmaster text-white",
    CHALLENGER: "bg-tier-challenger text-white",
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tierColors[tier] || "bg-bg-tertiary text-text-secondary"}`}>
      {tier}
    </span>
  );
}

// Player card component
function PlayerCard({ player, onClick, selected, disabled }: {
  player: MockPlayer;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        selected
          ? "border-accent-primary bg-accent-primary/10"
          : disabled
          ? "border-bg-tertiary bg-bg-tertiary/50 opacity-50"
          : "border-bg-tertiary bg-bg-secondary hover:border-accent-primary/50 cursor-pointer"
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center text-lg font-bold">
          {player.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary truncate">{player.name}</span>
            <TierBadge tier={player.tier} />
          </div>
          <div className="text-xs text-text-tertiary">
            {player.mainPosition} / {player.secondaryPosition} • MMR: {player.mmr}
          </div>
        </div>
      </div>
    </div>
  );
}

// Team display component
function TeamDisplay({ team, showBudget }: { team: Team; showBudget?: boolean }) {
  return (
    <div className="p-4 rounded-lg border border-bg-tertiary bg-bg-secondary">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }} />
          <span className="font-bold text-text-primary">{team.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {showBudget && (
            <div className="flex items-center gap-1 px-2 py-1 bg-accent-gold/20 rounded-lg border border-accent-gold/30">
              <Coins className="h-4 w-4 text-accent-gold" />
              <span className="font-bold text-accent-gold">{team.budget}G</span>
            </div>
          )}
          <span className="text-text-tertiary">MMR: {team.totalMmr}</span>
        </div>
      </div>
      <div className="space-y-2">
        {team.members.map((member, idx) => (
          <div
            key={member.id}
            className={`flex items-center gap-2 p-2 rounded ${
              idx === 0 ? "bg-accent-gold/10 border border-accent-gold/30" : "bg-bg-tertiary"
            }`}
          >
            <span className="text-xs text-text-tertiary w-4">{idx === 0 ? "C" : idx}</span>
            <span className="flex-1 text-sm text-text-primary truncate">{member.name}</span>
            <TierBadge tier={member.tier} />
            <span className="text-xs text-text-tertiary">{member.mainPosition}</span>
          </div>
        ))}
        {Array.from({ length: 5 - team.members.length }).map((_, idx) => (
          <div key={`empty-${idx}`} className="flex items-center gap-2 p-2 rounded bg-bg-tertiary/50 border border-dashed border-bg-tertiary">
            <span className="text-xs text-text-tertiary w-4">{team.members.length + idx + 1}</span>
            <span className="flex-1 text-sm text-text-tertiary">빈 슬롯</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SimulationPage() {
  // Settings
  const [playerCount, setPlayerCount] = useState(10);
  const [teamCount, setTeamCount] = useState(2);
  const [startingBudget, setStartingBudget] = useState(2000);
  const [bidTimeLimit, setBidTimeLimit] = useState(10);
  const [pickTimeLimit, setPickTimeLimit] = useState(5);
  const [botSpeed, setBotSpeed] = useState<"slow" | "normal" | "fast">("normal");

  // State
  const [players, setPlayers] = useState<MockPlayer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [simulationMode, setSimulationMode] = useState<"auction" | "draft" | "random" | "balanced" | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Auction state
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);

  // Draft state
  const [draftState, setDraftState] = useState<DraftState | null>(null);

  // Available players (not yet assigned)
  const [availablePlayers, setAvailablePlayers] = useState<MockPlayer[]>([]);

  // Auto-adjust team count based on player count (5 players per team)
  useEffect(() => {
    const calculatedTeamCount = Math.floor(playerCount / 5);
    if (calculatedTeamCount !== teamCount && calculatedTeamCount > 0) {
      setTeamCount(calculatedTeamCount);
    }
  }, [playerCount]);

  // Initialize players
  const initializePlayers = useCallback(() => {
    const newPlayers = generateMockPlayers(playerCount);
    setPlayers(newPlayers);
    setAvailablePlayers(newPlayers.slice(teamCount)); // Captains are pre-assigned
    setLogs([`${playerCount}명의 플레이어 생성 완료 (${teamCount}팀)`]);
  }, [playerCount, teamCount]);

  // Initialize teams
  const initializeTeams = useCallback(() => {
    if (players.length === 0) return;
    const newTeams = generateTeams(teamCount, players, startingBudget);
    setTeams(newTeams);
    setLogs(prev => [...prev, `${teamCount}개의 팀 생성 완료 (캡틴 자동 배정)`]);
  }, [players, teamCount, startingBudget]);

  useEffect(() => {
    initializePlayers();
  }, []);

  useEffect(() => {
    if (players.length > 0) {
      initializeTeams();
    }
  }, [players, teamCount, startingBudget]);

  // Add log
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Reset simulation
  const resetSimulation = () => {
    setIsRunning(false);
    setSimulationMode(null);
    setAuctionState(null);
    setDraftState(null);
    initializePlayers();
    setLogs(["시뮬레이션 초기화 완료"]);
  };

  // ==================== AUCTION SIMULATION ====================
  const startAuctionSimulation = () => {
    setSimulationMode("auction");
    setIsRunning(true);
    const remaining = players.slice(teamCount);
    setAvailablePlayers(remaining);

    setAuctionState({
      currentPlayerIndex: 0,
      currentPlayer: remaining[0],
      currentBid: 0,
      currentBidder: null,
      timeLeft: bidTimeLimit,
      phase: "BIDDING",
      bidHistory: [],
    });

    addLog("경매 시뮬레이션 시작!");
    addLog(`첫 번째 선수: ${remaining[0].name} (${remaining[0].tier})`);
  };

  // Bot bidding logic
  const botBid = useCallback(() => {
    if (!auctionState || auctionState.phase !== "BIDDING" || !auctionState.currentPlayer) return;

    const player = auctionState.currentPlayer;
    const remainingPlayers = availablePlayers.length - auctionState.currentPlayerIndex;

    // Find eligible teams (have budget and need players)
    const eligibleTeams = teams.filter(team => {
      const minBid = auctionState.currentBid + 50;
      return team.budget >= minBid && team.members.length < 5;
    });

    if (eligibleTeams.length === 0) {
      // No one can bid, resolve
      setTimeout(() => resolveAuctionBid(), 500);
      return;
    }

    // Random team decides to bid (70% chance to participate)
    if (Math.random() > 0.3) {
      const biddingTeam = eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)];

      // Calculate how much they can afford to spend
      const slotsNeeded = 5 - biddingTeam.members.length;
      const playersLeft = remainingPlayers;

      // More aggressive bidding - willing to spend more of their budget
      // Reserve minimum 100G per remaining slot
      const reserveAmount = Math.max(0, (slotsNeeded - 1) * 100);
      const availableToBid = biddingTeam.budget - reserveAmount;

      // Base bid on tier and randomness
      const tierValue = TIER_MMR[player.tier] || 1000;
      const playerWorth = tierValue * 0.3; // 30% of tier MMR as base

      // Calculate max willing to pay (between player worth and available budget)
      const maxWillingToPay = Math.min(
        availableToBid,
        Math.max(
          playerWorth * 0.5,
          Math.min(playerWorth * 2, availableToBid * 0.6) // Willing to spend up to 60% of available
        )
      );

      const minBid = auctionState.currentBid + 50;

      if (maxWillingToPay >= minBid) {
        // Place bid - increment by 50-200G
        const increment = 50 + Math.floor(Math.random() * 150);
        const bidAmount = Math.min(
          Math.floor(minBid + increment),
          Math.floor(maxWillingToPay)
        );

        setAuctionState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            currentBid: bidAmount,
            currentBidder: biddingTeam,
            timeLeft: bidTimeLimit,
            bidHistory: [...prev.bidHistory, { team: biddingTeam, amount: bidAmount, timestamp: Date.now() }],
          };
        });

        addLog(`${biddingTeam.name}이(가) ${bidAmount}G 입찰! (남은 예산: ${biddingTeam.budget}G → ${biddingTeam.budget}G)`);
      }
    }

    // If timer is low and no one bid, resolve
    if (auctionState.timeLeft <= 1) {
      resolveAuctionBid();
    }
  }, [auctionState, teams, bidTimeLimit, availablePlayers]);

  // Resolve auction bid
  const resolveAuctionBid = useCallback(() => {
    if (!auctionState || !auctionState.currentPlayer) return;

    // Prevent duplicate processing
    if (auctionState.phase !== "BIDDING") return;

    const player = auctionState.currentPlayer;
    const playerId = player.id;

    if (auctionState.currentBidder) {
      // Player sold
      const winningTeamId = auctionState.currentBidder.id;
      const bidAmount = auctionState.currentBid;

      setTeams(prev => {
        const team = prev.find(t => t.id === winningTeamId);
        if (!team) return prev;

        // Check if player already exists in team (prevent duplicates)
        if (team.members.some(m => m.id === playerId)) {
          console.warn("Player already in team, skipping");
          return prev;
        }

        return prev.map(t =>
          t.id === winningTeamId
            ? {
                ...t,
                members: [...t.members, player],
                budget: t.budget - bidAmount,
                totalMmr: t.totalMmr + player.mmr,
              }
            : t
        );
      });

      const winningTeamName = teams.find(t => t.id === winningTeamId)?.name || "팀";
      const newBudget = (teams.find(t => t.id === winningTeamId)?.budget || 0) - bidAmount;
      addLog(`💰 ${player.name} (${player.tier}) 낙찰! ${winningTeamName} ${bidAmount}G 지불 (잔액: ${newBudget}G)`);

      setAuctionState(prev => {
        if (!prev) return prev;
        return { ...prev, phase: "SOLD" };
      });
    } else {
      // Player unsold - assign to team with most budget
      setTeams(prev => {
        const teamWithMostBudget = [...prev]
          .filter(t => t.members.length < 5)
          .sort((a, b) => b.budget - a.budget)[0];

        if (!teamWithMostBudget) return prev;

        // Check if player already exists in team (prevent duplicates)
        if (teamWithMostBudget.members.some(m => m.id === playerId)) {
          console.warn("Player already in team, skipping");
          return prev;
        }

        const newBudget = teamWithMostBudget.budget + 500;
        addLog(`⚠️ ${player.name} 유찰! ${teamWithMostBudget.name}에 무료 배정 (+500G 보너스, 잔액: ${newBudget}G)`);

        return prev.map(team =>
          team.id === teamWithMostBudget.id
            ? {
                ...team,
                members: [...team.members, player],
                budget: newBudget,
                totalMmr: team.totalMmr + player.mmr,
              }
            : team
        );
      });

      setAuctionState(prev => {
        if (!prev) return prev;
        return { ...prev, phase: "UNSOLD" };
      });
    }

    // Move to next player after delay
    setTimeout(() => {
      setAuctionState(prev => {
        if (!prev || prev.phase === "COMPLETE") return prev;

        const nextIndex = prev.currentPlayerIndex + 1;
        const remaining = availablePlayers;

        if (nextIndex >= remaining.length) {
          addLog("🎉 경매 완료!");
          setIsRunning(false);
          return { ...prev, phase: "COMPLETE", currentPlayer: null };
        }

        const nextPlayer = remaining[nextIndex];

        // Validate next player
        if (!nextPlayer) {
          addLog("🎉 경매 완료!");
          setIsRunning(false);
          return { ...prev, phase: "COMPLETE", currentPlayer: null };
        }

        addLog(`📢 다음 선수: ${nextPlayer.name} (${nextPlayer.tier})`);

        return {
          ...prev,
          currentPlayerIndex: nextIndex,
          currentPlayer: nextPlayer,
          currentBid: 0,
          currentBidder: null,
          timeLeft: bidTimeLimit,
          phase: "BIDDING",
          bidHistory: [],
        };
      });
    }, 1000);
  }, [auctionState, teams, availablePlayers, bidTimeLimit]);

  // Auction timer
  useEffect(() => {
    if (!isRunning || simulationMode !== "auction" || !auctionState || auctionState.phase !== "BIDDING") return;

    const speed = botSpeed === "slow" ? 2000 : botSpeed === "fast" ? 500 : 1000;

    const timer = setInterval(() => {
      setAuctionState(prev => {
        if (!prev || prev.phase !== "BIDDING") {
          clearInterval(timer);
          return prev;
        }

        if (prev.timeLeft <= 0) {
          clearInterval(timer);
          // Only resolve if still in BIDDING phase
          if (prev.phase === "BIDDING") {
            setTimeout(() => resolveAuctionBid(), 100);
          }
          return prev;
        }

        // Bot might bid (only if in BIDDING phase)
        if (prev.phase === "BIDDING" && Math.random() > 0.5) {
          botBid();
        }

        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, speed);

    return () => clearInterval(timer);
  }, [isRunning, simulationMode, auctionState?.phase, botSpeed, botBid, resolveAuctionBid]);

  // ==================== SNAKE DRAFT SIMULATION ====================
  const startDraftSimulation = () => {
    setSimulationMode("draft");
    setIsRunning(true);
    const remaining = players.slice(teamCount);
    setAvailablePlayers(remaining);

    // Generate snake draft order
    const pickOrder: Team[] = [];
    const totalPicks = remaining.length;
    const rounds = Math.ceil(totalPicks / teamCount);

    for (let round = 0; round < rounds; round++) {
      if (round % 2 === 0) {
        pickOrder.push(...teams);
      } else {
        pickOrder.push(...[...teams].reverse());
      }
    }

    setDraftState({
      currentTeamIndex: 0,
      currentRound: 1,
      isReverse: false,
      pickOrder: pickOrder.slice(0, totalPicks),
      availablePlayers: remaining,
      phase: "PICKING",
      timeLeft: pickTimeLimit,
    });

    addLog("스네이크 드래프트 시뮬레이션 시작!");
    addLog(`첫 번째 픽: ${teams[0].name}`);
  };

  // Bot pick logic
  const botPick = useCallback(() => {
    if (!draftState || draftState.phase !== "PICKING" || draftState.availablePlayers.length === 0) return;

    const currentTeam = draftState.pickOrder[draftState.currentTeamIndex];
    const available = draftState.availablePlayers;

    // Bot picks based on:
    // 1. Position needs
    // 2. Player MMR
    // 3. Some randomness

    const teamPositions = new Set(currentTeam.members.map(m => m.mainPosition));
    const neededPositions = POSITIONS.filter(p => !teamPositions.has(p));

    // Prioritize needed positions
    let candidates = available.filter(p =>
      neededPositions.includes(p.mainPosition) || neededPositions.includes(p.secondaryPosition)
    );

    if (candidates.length === 0) {
      candidates = available;
    }

    // Sort by MMR and pick from top 3 randomly
    candidates.sort((a, b) => b.mmr - a.mmr);
    const topCandidates = candidates.slice(0, Math.min(3, candidates.length));
    const picked = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    // Update team
    setTeams(prev =>
      prev.map(team =>
        team.id === currentTeam.id
          ? {
              ...team,
              members: [...team.members, picked],
              totalMmr: team.totalMmr + picked.mmr,
            }
          : team
      )
    );

    addLog(`${currentTeam.name}이(가) ${picked.name} (${picked.tier} ${picked.mainPosition}) 선택!`);

    // Move to next pick
    const nextIndex = draftState.currentTeamIndex + 1;
    const newAvailable = available.filter(p => p.id !== picked.id);

    if (newAvailable.length === 0 || nextIndex >= draftState.pickOrder.length) {
      addLog("드래프트 완료!");
      setIsRunning(false);
      setDraftState(prev => prev ? { ...prev, phase: "COMPLETE", availablePlayers: [] } : prev);
    } else {
      const nextTeam = draftState.pickOrder[nextIndex];
      const newRound = Math.floor(nextIndex / teamCount) + 1;

      setDraftState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          currentTeamIndex: nextIndex,
          currentRound: newRound,
          isReverse: newRound % 2 === 0,
          availablePlayers: newAvailable,
          timeLeft: pickTimeLimit,
        };
      });

      addLog(`다음 픽: ${nextTeam.name} (라운드 ${newRound})`);
    }
  }, [draftState, teams, teamCount, pickTimeLimit]);

  // Draft timer
  useEffect(() => {
    if (!isRunning || simulationMode !== "draft" || !draftState || draftState.phase !== "PICKING") return;

    const speed = botSpeed === "slow" ? 2000 : botSpeed === "fast" ? 300 : 800;

    const timer = setTimeout(() => {
      botPick();
    }, speed);

    return () => clearTimeout(timer);
  }, [isRunning, simulationMode, draftState?.currentTeamIndex, botSpeed, botPick]);

  // ==================== RANDOM TEAM SIMULATION ====================
  const startRandomSimulation = () => {
    setSimulationMode("random");
    setIsRunning(true);

    const remaining = [...players.slice(teamCount)];
    const newTeams = [...teams];

    addLog("랜덤 팀 배정 시작!");

    // Shuffle remaining players
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    // Distribute evenly
    let teamIndex = 0;
    for (const player of remaining) {
      if (newTeams[teamIndex].members.length < 5) {
        newTeams[teamIndex].members.push(player);
        newTeams[teamIndex].totalMmr += player.mmr;
        addLog(`${player.name} -> ${newTeams[teamIndex].name}`);
      }
      teamIndex = (teamIndex + 1) % teamCount;
    }

    setTeams(newTeams);
    setAvailablePlayers([]);
    addLog("랜덤 팀 배정 완료!");
    setIsRunning(false);
  };

  // ==================== BALANCED TEAM SIMULATION ====================
  const startBalancedSimulation = () => {
    setSimulationMode("balanced");
    setIsRunning(true);

    const remaining = [...players.slice(teamCount)].sort((a, b) => b.mmr - a.mmr);
    const newTeams = teams.map(t => ({ ...t, members: [...t.members] }));

    addLog("밸런스 팀 배정 시작!");

    // Snake draft style for balance
    let reverse = false;
    while (remaining.length > 0) {
      const order = reverse ? [...newTeams].reverse() : newTeams;
      for (const team of order) {
        if (remaining.length === 0) break;
        if (team.members.length >= 5) continue;

        const player = remaining.shift()!;
        team.members.push(player);
        team.totalMmr += player.mmr;
        addLog(`${player.name} (MMR: ${player.mmr}) -> ${team.name}`);
      }
      reverse = !reverse;
    }

    setTeams(newTeams);
    setAvailablePlayers([]);
    addLog("밸런스 팀 배정 완료!");

    // Show MMR comparison
    const mmrs = newTeams.map(t => t.totalMmr);
    const avgMmr = mmrs.reduce((a, b) => a + b, 0) / mmrs.length;
    const maxDiff = Math.max(...mmrs) - Math.min(...mmrs);
    addLog(`평균 MMR: ${Math.round(avgMmr)}, 최대 차이: ${maxDiff}`);

    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">팀 구성 시뮬레이션</h1>
          <p className="text-text-secondary">경매, 드래프트, 랜덤, 밸런스 팀 구성을 테스트합니다</p>
        </div>

        {/* Settings Panel */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
          <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-accent-primary" />
            설정
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">플레이어 수</label>
              <select
                value={playerCount}
                onChange={(e) => setPlayerCount(Number(e.target.value))}
                disabled={isRunning}
                className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary"
              >
                <option value={10}>10명 (2팀)</option>
                <option value={15}>15명 (3팀)</option>
                <option value={20}>20명 (4팀)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">팀 수</label>
              <select
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                disabled={isRunning}
                className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary"
              >
                <option value={2}>2팀</option>
                <option value={3}>3팀</option>
                <option value={4}>4팀</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">시작 예산 (경매)</label>
              <select
                value={startingBudget}
                onChange={(e) => setStartingBudget(Number(e.target.value))}
                disabled={isRunning}
                className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary"
              >
                <option value={1000}>1000G</option>
                <option value={1500}>1500G</option>
                <option value={2000}>2000G (기본)</option>
                <option value={3000}>3000G</option>
                <option value={5000}>5000G</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">봇 속도</label>
              <select
                value={botSpeed}
                onChange={(e) => setBotSpeed(e.target.value as "slow" | "normal" | "fast")}
                disabled={isRunning}
                className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary"
              >
                <option value="slow">느림</option>
                <option value="normal">보통</option>
                <option value="fast">빠름</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={resetSimulation} variant="secondary" className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" />
                초기화
              </Button>
            </div>
          </div>
        </div>

        {/* Simulation Mode Buttons */}
        {!simulationMode && !isRunning && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <button
              onClick={startAuctionSimulation}
              className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group"
            >
              <Gavel className="h-10 w-10 text-accent-gold mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-text-primary mb-1">경매 드래프트</h3>
              <p className="text-sm text-text-tertiary">포인트로 입찰하여 선수 획득</p>
            </button>
            <button
              onClick={startDraftSimulation}
              className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group"
            >
              <GitBranch className="h-10 w-10 text-accent-primary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-text-primary mb-1">스네이크 드래프트</h3>
              <p className="text-sm text-text-tertiary">순서대로 돌아가며 선택</p>
            </button>
            <button
              onClick={startRandomSimulation}
              className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group"
            >
              <Shuffle className="h-10 w-10 text-accent-success mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-text-primary mb-1">랜덤 배정</h3>
              <p className="text-sm text-text-tertiary">무작위로 팀 배정</p>
            </button>
            <button
              onClick={startBalancedSimulation}
              className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group"
            >
              <Scale className="h-10 w-10 text-accent-primary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-text-primary mb-1">밸런스 배정</h3>
              <p className="text-sm text-text-tertiary">MMR 기반 균형 배정</p>
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Teams */}
          <div className="lg:col-span-2 space-y-4">
            {/* Current Auction/Draft Status */}
            {simulationMode === "auction" && auctionState && auctionState.currentPlayer && (
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <Gavel className="h-5 w-5 text-accent-gold" />
                    현재 경매 중
                  </h3>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-text-tertiary" />
                    <span className={`font-bold ${auctionState.timeLeft <= 3 ? "text-accent-danger" : "text-text-primary"}`}>
                      {auctionState.timeLeft}초
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex-1">
                    <PlayerCard player={auctionState.currentPlayer} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-text-tertiary mb-1">현재 입찰가</div>
                    <div className="text-3xl font-bold text-accent-gold">
                      {auctionState.currentBid}G
                    </div>
                    {auctionState.currentBidder && (
                      <div className="text-sm text-text-secondary mt-1">
                        by {auctionState.currentBidder.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {simulationMode === "draft" && draftState && draftState.phase === "PICKING" && (
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-accent-primary" />
                    드래프트 진행 중 - 라운드 {draftState.currentRound}
                  </h3>
                  <Badge variant={draftState.isReverse ? "warning" : "primary"}>
                    {draftState.isReverse ? "역순" : "정순"}
                  </Badge>
                </div>
                <div className="text-center py-4">
                  <div className="text-sm text-text-tertiary mb-2">현재 픽</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {draftState.pickOrder[draftState.currentTeamIndex]?.name}
                  </div>
                  <div className="text-sm text-text-tertiary mt-2">
                    남은 선수: {draftState.availablePlayers.length}명
                  </div>
                </div>
              </div>
            )}

            {/* Teams Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map(team => (
                <TeamDisplay key={team.id} team={team} showBudget={simulationMode === "auction"} />
              ))}
            </div>

            {/* Results Summary */}
            {!isRunning && simulationMode && (
              <div className="bg-bg-secondary border border-accent-primary/30 rounded-xl p-6">
                <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-accent-gold" />
                  결과 요약
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {teams.map(team => (
                    <div key={team.id} className="text-center p-3 bg-bg-tertiary rounded-lg">
                      <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: team.color }} />
                      <div className="font-medium text-text-primary">{team.name}</div>
                      <div className="text-lg font-bold text-accent-primary">{team.totalMmr} MMR</div>
                      <div className="text-xs text-text-tertiary">{team.members.length}명</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-bg-tertiary">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-tertiary">MMR 차이:</span>
                    <span className="font-bold text-text-primary">
                      {Math.max(...teams.map(t => t.totalMmr)) - Math.min(...teams.map(t => t.totalMmr))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Logs & Available Players */}
          <div className="space-y-4">
            {/* Available Players */}
            {(simulationMode === "draft" && draftState?.phase === "PICKING") && (
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
                <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  선택 가능한 선수 ({draftState.availablePlayers.length}명)
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {draftState.availablePlayers.slice(0, 10).map(player => (
                    <PlayerCard key={player.id} player={player} disabled />
                  ))}
                  {draftState.availablePlayers.length > 10 && (
                    <div className="text-center text-sm text-text-tertiary py-2">
                      +{draftState.availablePlayers.length - 10}명 더...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Logs */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
              <h3 className="text-sm font-bold text-text-primary mb-3">진행 로그</h3>
              <div className="space-y-1 max-h-[400px] overflow-y-auto font-mono text-xs">
                {logs.map((log, idx) => (
                  <div key={idx} className="text-text-secondary py-1 border-b border-bg-tertiary last:border-0">
                    {log}
                  </div>
                ))}
              </div>
            </div>

            {/* All Players Reference */}
            {!simulationMode && (
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
                <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  전체 플레이어 ({players.length}명)
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {players.map((player, idx) => (
                    <div key={player.id} className="flex items-center gap-2 p-2 rounded bg-bg-tertiary">
                      <span className="text-xs text-text-tertiary w-4">{idx + 1}</span>
                      <span className="flex-1 text-sm text-text-primary truncate">{player.name}</span>
                      <TierBadge tier={player.tier} />
                      <span className="text-xs text-text-tertiary">{player.mmr}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
