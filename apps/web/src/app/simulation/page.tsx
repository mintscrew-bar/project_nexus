"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Swords,
  Crown,
  ArrowRight,
  Hand,
  Bot,
  ChevronDown,
  Sparkles,
  Crosshair,
  Check,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────
type SimulationPhase = "SETUP" | "TEAM_FORMATION" | "ROLE_SELECTION" | "BRACKET" | "COMPLETE";
type SimulationMode = "auction" | "draft" | "random" | "balanced";

interface MockPlayer {
  id: string;
  name: string;
  tier: "IRON" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "EMERALD" | "DIAMOND" | "MASTER" | "GRANDMASTER" | "CHALLENGER";
  rank: string;
  mainPosition: string;
  secondaryPosition: string;
  mmr: number;
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
  hasReceivedBonus: boolean;
}

interface AuctionState {
  currentPlayerIndex: number;
  currentPlayer: MockPlayer | null;
  currentBid: number;
  currentBidder: Team | null;
  timeLeft: number;
  phase: "BIDDING" | "SOLD" | "UNSOLD" | "COMPLETE";
  bidHistory: { team: Team; amount: number; timestamp: number }[];
  yuchalCount: number;
  maxYuchalCycles: number;
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

interface RoleAssignment {
  playerId: string;
  assignedRole: string | null; // "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | null
}

interface RoleSelectionState {
  teamAssignments: Record<string, RoleAssignment[]>; // teamId → assignments
  currentTeamIndex: number; // 인터랙티브 모드에서 현재 편집 중인 팀
  timeLeft: number;
  phase: "SELECTING" | "COMPLETE";
}

interface BracketMatch {
  id: string;
  round: number;
  matchIndex: number;
  team1: Team | null;
  team2: Team | null;
  winner: Team | null;
  score1: number;
  score2: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETE";
}

// ─── Constants ──────────────────────────────────────────────────────────────────
const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const TIER_MMR: Record<string, number> = {
  IRON: 400, BRONZE: 600, SILVER: 800, GOLD: 1000,
  PLATINUM: 1200, EMERALD: 1400, DIAMOND: 1600,
  MASTER: 1800, GRANDMASTER: 2000, CHALLENGER: 2200,
};
const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const POSITION_LABELS: Record<string, string> = {
  TOP: "탑", JUNGLE: "정글", MID: "미드", ADC: "원딜", SUPPORT: "서포터",
};
const POSITION_ICON_URLS: Record<string, string> = {
  TOP: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-top.svg",
  JUNGLE: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-jungle.svg",
  MID: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-middle.svg",
  ADC: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-bottom.svg",
  SUPPORT: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-utility.svg",
};
const TEAM_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
const KOREAN_NAMES = [
  "정글러킹", "탑신병자", "미드갓", "원딜장인", "서폿마스터",
  "페이커팬", "제우스워너비", "오너원", "구마유시", "케리아님",
  "T1팬", "젠지팬", "DK화이팅", "KT롤스터", "한화생명",
  "드래곤장인", "바론스틸러", "타워부수기", "킬스코어왕", "CS장인",
];

const PHASE_LABELS: Record<SimulationPhase, string> = {
  SETUP: "설정",
  TEAM_FORMATION: "팀 구성",
  ROLE_SELECTION: "라인 선택",
  BRACKET: "대진표",
  COMPLETE: "결과",
};

const PHASE_ORDER: SimulationPhase[] = ["SETUP", "TEAM_FORMATION", "ROLE_SELECTION", "BRACKET", "COMPLETE"];

// ─── Helpers ────────────────────────────────────────────────────────────────────
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
    const baseMmr = TIER_MMR[tier];
    const variance = Math.floor(Math.random() * 200) - 100;

    players.push({
      id: `player-${timestamp}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      name, tier, rank,
      mainPosition: mainPos,
      secondaryPosition: secondaryPos,
      mmr: baseMmr + variance,
      isBot: true,
    });
  }
  return players.sort((a, b) => b.mmr - a.mmr);
}

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
      hasReceivedBonus: false,
    });
  }
  return teams;
}

function generateBracket(teams: Team[]): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const shuffled = [...teams].sort(() => Math.random() - 0.5);

  // Pad to power of 2
  let size = 1;
  while (size < shuffled.length) size *= 2;

  const totalRounds = Math.log2(size);

  // First round
  for (let i = 0; i < size / 2; i++) {
    matches.push({
      id: `match-r1-${i}`,
      round: 1,
      matchIndex: i,
      team1: shuffled[i * 2] || null,
      team2: shuffled[i * 2 + 1] || null,
      winner: null,
      score1: 0,
      score2: 0,
      status: shuffled[i * 2] && shuffled[i * 2 + 1] ? "PENDING" : "COMPLETE",
    });

    // If only one team, auto-advance (BYE)
    if (shuffled[i * 2] && !shuffled[i * 2 + 1]) {
      matches[matches.length - 1].winner = shuffled[i * 2];
      matches[matches.length - 1].score1 = 2;
    }
  }

  // Subsequent rounds (empty for now)
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = size / Math.pow(2, round);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        id: `match-r${round}-${i}`,
        round,
        matchIndex: i,
        team1: null,
        team2: null,
        winner: null,
        score1: 0,
        score2: 0,
        status: "PENDING",
      });
    }
  }

  return matches;
}

function simulateMatchResult(match: BracketMatch): BracketMatch {
  if (!match.team1 || !match.team2) return match;

  const mmr1 = match.team1.totalMmr;
  const mmr2 = match.team2.totalMmr;
  const total = mmr1 + mmr2;
  const winProb1 = mmr1 / total;

  // Best of 3
  let score1 = 0, score2 = 0;
  while (score1 < 2 && score2 < 2) {
    if (Math.random() < winProb1) score1++;
    else score2++;
  }

  return {
    ...match,
    score1,
    score2,
    winner: score1 > score2 ? match.team1 : match.team2,
    status: "COMPLETE",
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function StepIndicator({ phase }: { phase: SimulationPhase }) {
  const currentIdx = PHASE_ORDER.indexOf(phase);

  return (
    <div className="flex items-center gap-2 mb-6">
      {PHASE_ORDER.map((p, idx) => {
        const isActive = idx === currentIdx;
        const isDone = idx < currentIdx;
        return (
          <div key={p} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent-primary text-white"
                : isDone
                ? "bg-accent-success/20 text-accent-success"
                : "bg-bg-tertiary text-text-tertiary"
            }`}>
              {isDone ? "✓" : idx + 1}
              <span className="hidden sm:inline">{PHASE_LABELS[p]}</span>
            </div>
            {idx < PHASE_ORDER.length - 1 && (
              <ChevronRight className={`h-4 w-4 flex-shrink-0 ${isDone ? "text-accent-success" : "text-text-tertiary"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PositionIcon({ position, size = 16, className = "", opacity = 1 }: { position: string; size?: number; className?: string; opacity?: number }) {
  const iconUrl = POSITION_ICON_URLS[position];
  if (!iconUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt={POSITION_LABELS[position] || position}
      className={`brightness-0 invert flex-shrink-0 ${className}`}
      style={{ width: size, height: size, opacity }}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

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

function PlayerCard({ player, onClick, selected, disabled, interactive }: {
  player: MockPlayer;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        selected
          ? "border-accent-primary bg-accent-primary/10 ring-2 ring-accent-primary/30"
          : disabled
          ? "border-bg-tertiary bg-bg-tertiary/50 opacity-50"
          : interactive
          ? "border-bg-tertiary bg-bg-secondary hover:border-accent-primary hover:bg-accent-primary/5 cursor-pointer"
          : "border-bg-tertiary bg-bg-secondary hover:border-accent-primary/50 cursor-pointer"
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center text-lg font-bold flex-shrink-0">
          {player.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary truncate">{player.name}</span>
            <TierBadge tier={player.tier} />
          </div>
          <div className="text-xs text-text-tertiary flex items-center gap-1">
            <PositionIcon position={player.mainPosition} size={12} />
            <span>{POSITION_LABELS[player.mainPosition] || player.mainPosition}</span>
            <span>/</span>
            <PositionIcon position={player.secondaryPosition} size={12} opacity={0.6} />
            <span>{POSITION_LABELS[player.secondaryPosition] || player.secondaryPosition}</span>
            <span>• MMR: {player.mmr}</span>
          </div>
        </div>
        {interactive && !selected && !disabled && (
          <ChevronRight className="h-4 w-4 text-text-tertiary" />
        )}
      </div>
    </div>
  );
}

function TeamDisplay({ team, showBudget, highlight }: { team: Team; showBudget?: boolean; highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border transition-colors ${highlight ? "border-accent-primary bg-accent-primary/5" : "border-bg-tertiary bg-bg-secondary"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }} />
          <span className="font-bold text-text-primary">{team.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {showBudget && (
            <div className="flex items-center gap-1 px-2 py-1 bg-accent-gold/20 rounded-lg border border-accent-gold/30">
              <Coins className="h-4 w-4 text-accent-gold" />
              <span className={`font-bold ${team.budget === 0 ? "text-accent-danger" : "text-accent-gold"}`}>{team.budget}G</span>
              {team.hasReceivedBonus && (
                <span className="text-[10px] text-accent-warning ml-1" title="보너스 골드 수령됨">★</span>
              )}
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
            <PositionIcon position={member.mainPosition} size={14} />
            <span className="text-xs text-text-tertiary">{POSITION_LABELS[member.mainPosition] || member.mainPosition}</span>
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

function MatchCard({
  match,
  onSimulate,
  onSetWinner,
  isInteractive,
}: {
  match: BracketMatch;
  onSimulate: () => void;
  onSetWinner: (team: Team) => void;
  isInteractive: boolean;
}) {
  if (!match.team1 && !match.team2) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-bg-tertiary bg-bg-secondary/50 text-center">
        <p className="text-sm text-text-tertiary">대기 중</p>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      match.status === "COMPLETE"
        ? "border-accent-success/30 bg-bg-secondary"
        : "border-accent-primary/30 bg-bg-secondary"
    }`}>
      {/* Team 1 */}
      <div className={`flex items-center gap-3 p-2.5 rounded-lg mb-2 transition-colors ${
        match.winner?.id === match.team1?.id
          ? "bg-accent-success/10 border border-accent-success/30"
          : match.status === "COMPLETE" && match.winner?.id !== match.team1?.id
          ? "opacity-50"
          : "bg-bg-tertiary"
      }`}>
        {match.team1 && (
          <>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.team1.color }} />
            <span className="flex-1 text-sm font-medium text-text-primary truncate">{match.team1.name}</span>
            <span className="text-xs text-text-tertiary">MMR {match.team1.totalMmr}</span>
            {match.status === "COMPLETE" && (
              <span className="font-bold text-sm text-text-primary">{match.score1}</span>
            )}
            {match.winner?.id === match.team1.id && <Trophy className="h-4 w-4 text-accent-gold flex-shrink-0" />}
          </>
        )}
        {!match.team1 && <span className="text-sm text-text-tertiary italic">TBD</span>}
      </div>

      <div className="text-center text-xs text-text-tertiary my-1">VS</div>

      {/* Team 2 */}
      <div className={`flex items-center gap-3 p-2.5 rounded-lg mb-3 transition-colors ${
        match.winner?.id === match.team2?.id
          ? "bg-accent-success/10 border border-accent-success/30"
          : match.status === "COMPLETE" && match.winner?.id !== match.team2?.id
          ? "opacity-50"
          : "bg-bg-tertiary"
      }`}>
        {match.team2 && (
          <>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.team2.color }} />
            <span className="flex-1 text-sm font-medium text-text-primary truncate">{match.team2.name}</span>
            <span className="text-xs text-text-tertiary">MMR {match.team2.totalMmr}</span>
            {match.status === "COMPLETE" && (
              <span className="font-bold text-sm text-text-primary">{match.score2}</span>
            )}
            {match.winner?.id === match.team2.id && <Trophy className="h-4 w-4 text-accent-gold flex-shrink-0" />}
          </>
        )}
        {!match.team2 && <span className="text-sm text-text-tertiary italic">TBD</span>}
      </div>

      {/* Actions */}
      {match.status !== "COMPLETE" && match.team1 && match.team2 && (
        <div className="space-y-2">
          {isInteractive ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetWinner(match.team1!)}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-bg-tertiary hover:border-accent-primary hover:bg-accent-primary/10 transition-colors text-text-primary"
              >
                {match.team1.name} 승리
              </button>
              <button
                onClick={() => onSetWinner(match.team2!)}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-bg-tertiary hover:border-accent-primary hover:bg-accent-primary/10 transition-colors text-text-primary"
              >
                {match.team2.name} 승리
              </button>
            </div>
          ) : (
            <button
              onClick={onSimulate}
              className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-accent-primary text-white hover:bg-accent-hover transition-colors flex items-center justify-center gap-1"
            >
              <Swords className="h-3.5 w-3.5" />
              매치 시뮬레이션
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function SimulationPage() {
  // Phase
  const [phase, setPhase] = useState<SimulationPhase>("SETUP");
  const [isInteractive, setIsInteractive] = useState(false);

  // Settings
  const [playerCount, setPlayerCount] = useState(10);
  const [teamCount, setTeamCount] = useState(2);
  const [startingBudget, setStartingBudget] = useState(2000);
  const [bidTimeLimit, setBidTimeLimit] = useState(10);
  const [pickTimeLimit, setPickTimeLimit] = useState(5);
  const [botSpeed, setBotSpeed] = useState<"slow" | "normal" | "fast">("normal");

  // Chaos mode settings
  const [chaosMode, setChaosMode] = useState(false);
  const [chaosNoResponse, setChaosNoResponse] = useState(10); // % 확률로 무응답
  const [chaosDelay, setChaosDelay] = useState(20); // % 확률로 지연 반응
  const [chaosSpam, setChaosSpam] = useState(5); // % 확률로 연타

  // State
  const [players, setPlayers] = useState<MockPlayer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [simulationMode, setSimulationMode] = useState<SimulationMode | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Auction state
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [userBidAmount, setUserBidAmount] = useState(0);

  // Draft state
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [selectedDraftPlayer, setSelectedDraftPlayer] = useState<string | null>(null);

  // Available players
  const [availablePlayers, setAvailablePlayers] = useState<MockPlayer[]>([]);

  // Role selection state
  const [roleSelectionState, setRoleSelectionState] = useState<RoleSelectionState | null>(null);

  // Bracket state
  const [bracketMatches, setBracketMatches] = useState<BracketMatch[]>([]);
  const [champion, setChampion] = useState<Team | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Refs to avoid stale closures in auction/draft callbacks
  const teamsRef = useRef<Team[]>([]);
  const availablePlayersRef = useRef<MockPlayer[]>([]);
  const auctionStateRef = useRef<AuctionState | null>(null);
  const resolveGuardRef = useRef(false); // prevent double-resolve

  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { availablePlayersRef.current = availablePlayers; }, [availablePlayers]);
  useEffect(() => { auctionStateRef.current = auctionState; }, [auctionState]);

  // 새 선수가 경매에 올라오면 누적 금액 초기화
  useEffect(() => {
    setUserBidAmount(0);
  }, [auctionState?.currentPlayerIndex]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Auto-adjust team count
  useEffect(() => {
    const calc = Math.floor(playerCount / 5);
    if (calc !== teamCount && calc > 0) setTeamCount(calc);
  }, [playerCount]);

  // Initialize players
  const initializePlayers = useCallback(() => {
    const newPlayers = generateMockPlayers(playerCount);
    setPlayers(newPlayers);
    setAvailablePlayers(newPlayers.slice(teamCount));
    setLogs([`${playerCount}명의 플레이어 생성 완료 (${teamCount}팀)`]);
  }, [playerCount, teamCount]);

  // Initialize teams
  const initializeTeams = useCallback(() => {
    if (players.length === 0) return;
    const newTeams = generateTeams(teamCount, players, startingBudget);
    setTeams(newTeams);
    setLogs(prev => [...prev, `${teamCount}개의 팀 생성 완료 (캡틴 자동 배정)`]);
  }, [players, teamCount, startingBudget]);

  useEffect(() => { initializePlayers(); }, [initializePlayers]);
  useEffect(() => { if (players.length > 0) initializeTeams(); }, [players, teamCount, startingBudget]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // ─── Reset ────────────────────────────────────────────────────────────────────
  const resetSimulation = () => {
    setPhase("SETUP");
    setIsRunning(false);
    setSimulationMode(null);
    setAuctionState(null);
    setDraftState(null);
    setRoleSelectionState(null);
    setSelectedDraftPlayer(null);
    setUserBidAmount(0);
    setBracketMatches([]);
    setChampion(null);
    initializePlayers();
    setLogs(["시뮬레이션 초기화 완료"]);
  };

  // ─── Transition to Role Selection ──────────────────────────────────────────────
  const goToRoleSelection = useCallback(() => {
    // 각 팀별 멤버에 대해 초기 라인 배정 상태 생성
    const teamAssignments: Record<string, RoleAssignment[]> = {};
    for (const team of teams) {
      teamAssignments[team.id] = team.members.map(m => ({
        playerId: m.id,
        assignedRole: null, // 아직 배정 안 됨
      }));
    }
    setRoleSelectionState({
      teamAssignments,
      currentTeamIndex: 0,
      timeLeft: 120, // 2분
      phase: "SELECTING",
    });
    setPhase("ROLE_SELECTION");
    addLog("──────────────────────────");
    addLog("🎯 라인 선택 단계 시작! (2분)");
  }, [teams]);

  // ─── Transition to Bracket ────────────────────────────────────────────────────
  const goToBracket = useCallback(() => {
    const matches = generateBracket(teams);
    setBracketMatches(matches);
    setPhase("BRACKET");
    addLog("──────────────────────────");
    addLog("대진표 생성 완료! 매치를 진행하세요.");
  }, [teams]);

  // ─── Role Selection Logic ──────────────────────────────────────────────────────
  const assignRole = useCallback((teamId: string, playerId: string, role: string) => {
    setRoleSelectionState(prev => {
      if (!prev || prev.phase !== "SELECTING") return prev;
      const teamAssignment = prev.teamAssignments[teamId];
      if (!teamAssignment) return prev;

      // 이미 같은 팀에서 해당 라인을 선택한 사람이 있으면 그 사람의 라인을 해제
      const updated = teamAssignment.map(a => {
        if (a.assignedRole === role && a.playerId !== playerId) {
          return { ...a, assignedRole: null };
        }
        if (a.playerId === playerId) {
          // 이미 선택된 라인 다시 클릭 시 취소
          return { ...a, assignedRole: a.assignedRole === role ? null : role };
        }
        return a;
      });

      return {
        ...prev,
        teamAssignments: { ...prev.teamAssignments, [teamId]: updated },
      };
    });
  }, []);

  const autoAssignRoles = useCallback((teamId?: string) => {
    setRoleSelectionState(prev => {
      if (!prev || prev.phase !== "SELECTING") return prev;
      const newAssignments = { ...prev.teamAssignments };
      const teamsToProcess = teamId ? [teamId] : Object.keys(newAssignments);

      for (const tId of teamsToProcess) {
        const assignments = [...(newAssignments[tId] || [])];
        const team = teams.find(t => t.id === tId);
        if (!team) continue;

        const takenRoles = assignments.filter(a => a.assignedRole).map(a => a.assignedRole!);
        const remainingRoles = POSITIONS.filter(r => !takenRoles.includes(r));
        const unassigned = assignments.filter(a => !a.assignedRole);

        // 선호 포지션 기반 배정 (주라인 우선 → 부라인 → 랜덤)
        const shuffledRoles = [...remainingRoles];
        for (const ua of unassigned) {
          const player = team.members.find(m => m.id === ua.playerId);
          if (!player) continue;

          // 주라인이 남아있으면 배정
          if (shuffledRoles.includes(player.mainPosition)) {
            ua.assignedRole = player.mainPosition;
            shuffledRoles.splice(shuffledRoles.indexOf(player.mainPosition), 1);
          } else if (shuffledRoles.includes(player.secondaryPosition)) {
            // 부라인이 남아있으면 배정
            ua.assignedRole = player.secondaryPosition;
            shuffledRoles.splice(shuffledRoles.indexOf(player.secondaryPosition), 1);
          }
        }

        // 아직 미배정인 사람에게 남은 라인 랜덤 배정
        const stillUnassigned = assignments.filter(a => !a.assignedRole);
        const stillRemaining = POSITIONS.filter(r => !assignments.some(a => a.assignedRole === r));
        // Shuffle
        for (let i = stillRemaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [stillRemaining[i], stillRemaining[j]] = [stillRemaining[j], stillRemaining[i]];
        }
        for (let i = 0; i < stillUnassigned.length && i < stillRemaining.length; i++) {
          stillUnassigned[i].assignedRole = stillRemaining[i];
        }

        newAssignments[tId] = assignments;
      }

      // 모든 배정 완료 확인
      const allDone = Object.values(newAssignments).every(
        assignments => assignments.every(a => a.assignedRole !== null)
      );

      return {
        ...prev,
        teamAssignments: newAssignments,
        phase: allDone ? "COMPLETE" as const : prev.phase,
      };
    });
  }, [teams]);

  const autoAssignAllRoles = useCallback(() => {
    autoAssignRoles();
    addLog("🎯 모든 팀 라인 자동 배정 완료!");
  }, [autoAssignRoles]);

  const isAllRolesAssigned = roleSelectionState
    ? Object.values(roleSelectionState.teamAssignments).every(
        assignments => assignments.every(a => a.assignedRole !== null)
      )
    : false;

  const completeRoleSelection = useCallback(() => {
    if (!roleSelectionState) return;

    // 미배정 라인 자동 배정
    if (!isAllRolesAssigned) {
      autoAssignRoles();
    }

    setRoleSelectionState(prev => prev ? { ...prev, phase: "COMPLETE" } : prev);
    addLog("✅ 라인 선택 완료!");

    // 대진표로 이동
    setTimeout(() => {
      const matches = generateBracket(teams);
      setBracketMatches(matches);
      setPhase("BRACKET");
      addLog("──────────────────────────");
      addLog("대진표 생성 완료! 매치를 진행하세요.");
    }, 500);
  }, [roleSelectionState, isAllRolesAssigned, autoAssignRoles, teams]);

  // Role selection timer
  useEffect(() => {
    if (phase !== "ROLE_SELECTION" || !roleSelectionState || roleSelectionState.phase !== "SELECTING") return;
    if (!isInteractive) {
      // 자동 모드: 즉시 자동 배정
      const timer = setTimeout(() => {
        autoAssignAllRoles();
        setTimeout(() => completeRoleSelection(), 800);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // 인터랙티브 모드: 타이머 카운트다운
    const timer = setInterval(() => {
      setRoleSelectionState(prev => {
        if (!prev || prev.phase !== "SELECTING") return prev;
        if (prev.timeLeft <= 1) {
          // 시간 초과 → useEffect 밖에서 처리
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, roleSelectionState?.phase, isInteractive, autoAssignAllRoles, completeRoleSelection]);

  // 타이머 만료 시 자동 배정 후 완료
  useEffect(() => {
    if (phase !== "ROLE_SELECTION" || !roleSelectionState) return;
    if (roleSelectionState.phase === "SELECTING" && roleSelectionState.timeLeft === 0) {
      addLog("⏰ 시간 초과! 미배정 라인 자동 배정");
      autoAssignAllRoles();
      setTimeout(() => completeRoleSelection(), 500);
    }
  }, [phase, roleSelectionState?.timeLeft, roleSelectionState?.phase, autoAssignAllRoles, completeRoleSelection]);

  // Check if team formation is done
  useEffect(() => {
    if (phase !== "TEAM_FORMATION") return;
    if (!simulationMode) return;
    if (isRunning) return;

    // Check all teams are filled
    const allFilled = teams.length > 0 && teams.every(t => t.members.length >= 5);
    const auctionDone = simulationMode === "auction" && auctionState?.phase === "COMPLETE";
    const draftDone = simulationMode === "draft" && draftState?.phase === "COMPLETE";
    const instantDone = simulationMode === "random" || simulationMode === "balanced";

    if (allFilled || auctionDone || draftDone || (instantDone && !isRunning && teams.some(t => t.members.length > 1))) {
      // Don't auto-transition, show a "다음" button instead
    }
  }, [phase, simulationMode, isRunning, teams, auctionState, draftState]);

  const isTeamFormationComplete = (() => {
    if (phase !== "TEAM_FORMATION" || isRunning) return false;
    if (!simulationMode) return false;
    if (simulationMode === "auction") return auctionState?.phase === "COMPLETE";
    if (simulationMode === "draft") return draftState?.phase === "COMPLETE";
    return teams.some(t => t.members.length > 1);
  })();

  // ─── Bracket Logic ────────────────────────────────────────────────────────────
  const handleMatchResult = useCallback((matchId: string, winner: Team, score1: number, score2: number) => {
    setBracketMatches(prev => {
      const updated = prev.map(m => {
        if (m.id !== matchId) return m;
        return { ...m, winner, score1, score2, status: "COMPLETE" as const };
      });

      // Advance winner to next round
      const match = updated.find(m => m.id === matchId);
      if (!match) return updated;

      const nextRound = match.round + 1;
      const nextMatchIndex = Math.floor(match.matchIndex / 2);
      const nextMatch = updated.find(m => m.round === nextRound && m.matchIndex === nextMatchIndex);

      if (nextMatch) {
        const isFirstSlot = match.matchIndex % 2 === 0;
        if (isFirstSlot) {
          nextMatch.team1 = winner;
        } else {
          nextMatch.team2 = winner;
        }
      }

      return updated;
    });

    addLog(`${winner.name} 승리! (${score1}-${score2})`);

    // Check if tournament is over
    setTimeout(() => {
      setBracketMatches(prev => {
        const allDone = prev.every(m => m.status === "COMPLETE" || (!m.team1 && !m.team2));
        const lastRound = Math.max(...prev.map(m => m.round));
        const finalMatch = prev.find(m => m.round === lastRound);

        if (finalMatch?.winner && allDone) {
          setChampion(finalMatch.winner);
          setPhase("COMPLETE");
          addLog(`🏆 ${finalMatch.winner.name} 우승!`);
        }
        return prev;
      });
    }, 100);
  }, []);

  const handleSimulateMatch = useCallback((matchId: string) => {
    setBracketMatches(prev => {
      const match = prev.find(m => m.id === matchId);
      if (!match || !match.team1 || !match.team2) return prev;
      const result = simulateMatchResult(match);
      return prev; // We'll handle through handleMatchResult
    });

    // Use separate flow
    const match = bracketMatches.find(m => m.id === matchId);
    if (!match || !match.team1 || !match.team2) return;

    const result = simulateMatchResult(match);
    if (result.winner) {
      handleMatchResult(matchId, result.winner, result.score1, result.score2);
    }
  }, [bracketMatches, handleMatchResult]);

  const handleSetWinner = useCallback((matchId: string, winner: Team) => {
    const match = bracketMatches.find(m => m.id === matchId);
    if (!match) return;
    const isTeam1 = winner.id === match.team1?.id;
    handleMatchResult(matchId, winner, isTeam1 ? 2 : 0, isTeam1 ? 0 : 2);
  }, [bracketMatches, handleMatchResult]);

  const simulateAllMatches = useCallback(() => {
    let delay = 0;
    const pending = [...bracketMatches].filter(m => m.status === "PENDING" && m.team1 && m.team2);

    // Process round by round
    const rounds = [...new Set(bracketMatches.map(m => m.round))].sort((a, b) => a - b);

    for (const round of rounds) {
      const roundMatches = bracketMatches.filter(m => m.round === round && m.status === "PENDING" && m.team1 && m.team2);
      for (const match of roundMatches) {
        delay += 800;
        setTimeout(() => {
          handleSimulateMatch(match.id);
        }, delay);
      }
    }
  }, [bracketMatches, handleSimulateMatch]);

  // ─── AUCTION ──────────────────────────────────────────────────────────────────
  const startAuction = () => {
    setSimulationMode("auction");
    setPhase("TEAM_FORMATION");
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
      yuchalCount: 0,
      maxYuchalCycles: teamCount,
    });
    addLog("──────────────────────────");
    addLog("경매 시뮬레이션 시작!");
    addLog(`첫 번째 선수: ${remaining[0].name} (${remaining[0].tier})`);
  };

  const botBid = useCallback(() => {
    const auction = auctionStateRef.current;
    const currentTeams = teamsRef.current;
    if (!auction || auction.phase !== "BIDDING" || !auction.currentPlayer) return;

    // ── 카오스 모드: 무응답 ──
    if (chaosMode && Math.random() * 100 < chaosNoResponse) {
      addLog("🔴 [카오스] 봇 무응답 (타임아웃 시뮬레이션)");
      return;
    }

    const player = auction.currentPlayer;
    const eligibleTeams = currentTeams.filter(team => {
      const minBid = auction.currentBid + 50;
      return team.budget >= minBid && team.members.length < 5;
    });

    if (eligibleTeams.length === 0) return;

    const isOnlyBidder = eligibleTeams.length === 1;
    const bidChance = isOnlyBidder ? 0.9 : 0.7;

    if (Math.random() < bidChance) {
      const biddingTeam = eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)];
      const slotsNeeded = 5 - biddingTeam.members.length;
      const reserveAmount = Math.max(0, (slotsNeeded - 1) * 100);
      const availableToBid = biddingTeam.budget - reserveAmount;
      const tierValue = TIER_MMR[player.tier] || 1000;
      const playerWorth = tierValue * 0.3;
      const maxWilling = Math.min(availableToBid, Math.max(playerWorth * 0.5, Math.min(playerWorth * 2, availableToBid * 0.6)));
      const minBid = auction.currentBid + 50;

      if (maxWilling >= minBid) {
        let increment: number;
        if (isOnlyBidder) {
          increment = 50;
        } else {
          const increments = [50, 100, 100, 100, 500];
          increment = increments[Math.floor(Math.random() * increments.length)];
        }
        const rawBid = auction.currentBid + increment;
        const bidAmount = Math.min(Math.floor(rawBid / 50) * 50, Math.floor(maxWilling / 50) * 50);

        const executeBid = () => {
          setAuctionState(prev => {
            if (!prev || prev.phase !== "BIDDING") return prev;
            return { ...prev, currentBid: bidAmount, currentBidder: biddingTeam, timeLeft: bidTimeLimit, yuchalCount: 0, bidHistory: [...prev.bidHistory, { team: biddingTeam, amount: bidAmount, timestamp: Date.now() }] };
          });
          addLog(`${biddingTeam.name}: ${bidAmount}G 입찰!`);
        };

        // ── 카오스 모드: 지연 반응 ──
        if (chaosMode && Math.random() * 100 < chaosDelay) {
          const delayMs = 2000 + Math.random() * 4000; // 2~6초 지연
          addLog(`🟡 [카오스] ${biddingTeam.name} 지연 반응 (${(delayMs / 1000).toFixed(1)}초)`);
          setTimeout(executeBid, delayMs);
        }
        // ── 카오스 모드: 연타 (같은 입찰을 2~3번 보냄) ──
        else if (chaosMode && Math.random() * 100 < chaosSpam) {
          const spamCount = 2 + Math.floor(Math.random() * 2); // 2~3번
          addLog(`🟠 [카오스] ${biddingTeam.name} 연타! (${spamCount}회)`);
          for (let i = 0; i < spamCount; i++) {
            setTimeout(executeBid, i * 100);
          }
        } else {
          executeBid();
        }
      }
    }
  }, [bidTimeLimit, chaosMode, chaosNoResponse, chaosDelay, chaosSpam]);

  const resolveAuction = useCallback(() => {
    // Guard against double-resolve
    if (resolveGuardRef.current) return;
    resolveGuardRef.current = true;

    const auction = auctionStateRef.current;
    if (!auction || !auction.currentPlayer || auction.phase !== "BIDDING") {
      resolveGuardRef.current = false;
      return;
    }

    const player = auction.currentPlayer;
    const playerId = player.id;
    const BONUS_GOLD = 500;

    if (auction.currentBidder) {
      // ── 낙찰 ──
      const wId = auction.currentBidder.id;
      const bidAmt = auction.currentBid;
      const bidderName = auction.currentBidder.name;
      setTeams(prev => prev.map(t =>
        t.id === wId && !t.members.some(m => m.id === playerId)
          ? { ...t, members: [...t.members, player], budget: t.budget - bidAmt, totalMmr: t.totalMmr + player.mmr }
          : t
      ));
      addLog(`💰 ${player.name} 낙찰! ${bidderName} ${bidAmt}G`);
      setAuctionState(prev => prev ? { ...prev, phase: "SOLD", yuchalCount: 0 } : prev);
    } else {
      // ── 유찰 처리 (백엔드 yuchal 시스템) ──
      const newYuchalCount = auction.yuchalCount + 1;

      if (newYuchalCount < auction.maxYuchalCycles) {
        // 입찰 가능한 팀이 있는지 확인 — 없으면 유찰 순환 스킵하고 바로 강제 배정
        const currentTeams = teamsRef.current;
        const anyCanBid = currentTeams.some(t => t.budget >= 50 && t.members.length < 5);

        if (anyCanBid) {
          // 아직 모든 팀에게 기회를 안 줌 → 같은 선수로 다시 입찰
          addLog(`⚠️ ${player.name} 유찰 (${newYuchalCount}/${auction.maxYuchalCycles}) — 재경매`);
          setAuctionState(prev => prev ? {
            ...prev,
            currentBid: 0,
            currentBidder: null,
            timeLeft: bidTimeLimit,
            yuchalCount: newYuchalCount,
            bidHistory: [],
          } : prev);
          resolveGuardRef.current = false;
          return; // 다음 선수로 넘어가지 않음
        }
        // 모든 팀이 입찰 불가 → 즉시 강제 배정으로 진행
        addLog(`⚠️ 입찰 가능한 팀 없음 — 즉시 강제 배정`);
      }

      // 모든 팀이 패스함 → 예산 가장 많은 미완성 팀에 무료 배정
      setTeams(prev => {
        const incomplete = [...prev].filter(t => t.members.length < 5);
        const target = incomplete.sort((a, b) => b.budget - a.budget)[0];
        if (!target || target.members.some(m => m.id === playerId)) return prev;

        // 보너스 골드: 예산 0이고 아직 보너스를 안 받은 경우에만 1회 지급
        const needsBonus = target.budget === 0 && !target.hasReceivedBonus;
        const bonusAmount = needsBonus ? BONUS_GOLD : 0;

        if (needsBonus) {
          addLog(`💎 ${target.name} 예산 소진 → 보너스 ${BONUS_GOLD}G 지급!`);
        }
        addLog(`⚠️ ${player.name} 최종 유찰 → ${target.name} 무료 배정`);

        return prev.map(t => t.id === target.id ? {
          ...t,
          members: [...t.members, player],
          budget: t.budget + bonusAmount,
          totalMmr: t.totalMmr + player.mmr,
          hasReceivedBonus: needsBonus ? true : t.hasReceivedBonus,
        } : t);
      });
      setAuctionState(prev => prev ? { ...prev, phase: "UNSOLD", yuchalCount: 0 } : prev);
    }

    setTimeout(() => {
      // Read fresh values from refs
      const allPlayers = availablePlayersRef.current;
      const currentTeams = teamsRef.current;
      const prevAuction = auctionStateRef.current;
      if (!prevAuction || prevAuction.phase === "COMPLETE") {
        resolveGuardRef.current = false;
        return;
      }

      // 모든 팀이 꽉 찼는지 확인
      const allTeamsFull = currentTeams.every(t => t.members.length >= 5);
      if (allTeamsFull) {
        addLog("🎉 모든 팀 구성 완료! 경매 종료!");
        setIsRunning(false);
        setAuctionState(prev => prev ? { ...prev, phase: "COMPLETE", currentPlayer: null } : prev);
        resolveGuardRef.current = false;
        return;
      }

      const nextIdx = prevAuction.currentPlayerIndex + 1;
      if (nextIdx >= allPlayers.length) {
        addLog("🎉 경매 완료!");
        setIsRunning(false);
        setAuctionState(prev => prev ? { ...prev, phase: "COMPLETE", currentPlayer: null } : prev);
        resolveGuardRef.current = false;
        return;
      }

      const next = allPlayers[nextIdx];
      if (!next) {
        addLog("🎉 경매 완료!");
        setIsRunning(false);
        setAuctionState(prev => prev ? { ...prev, phase: "COMPLETE", currentPlayer: null } : prev);
        resolveGuardRef.current = false;
        return;
      }

      addLog(`📢 다음: ${next.name} (${next.tier})`);
      setAuctionState({
        currentPlayerIndex: nextIdx,
        currentPlayer: next,
        currentBid: 0,
        currentBidder: null,
        timeLeft: bidTimeLimit,
        phase: "BIDDING",
        bidHistory: [],
        yuchalCount: 0,
        maxYuchalCycles: prevAuction.maxYuchalCycles,
      });
      resolveGuardRef.current = false;
    }, 800);
  }, [bidTimeLimit]);

  // User bid (interactive auction) - 누적된 최종 금액으로 입찰
  const handleUserBid = useCallback((finalAmount: number) => {
    const auction = auctionStateRef.current;
    const currentTeams = teamsRef.current;
    if (!auction || auction.phase !== "BIDDING" || !currentTeams[0]) return;
    if (finalAmount <= auction.currentBid || finalAmount > currentTeams[0].budget) return;

    const userTeam = currentTeams[0];
    setAuctionState(prev => {
      if (!prev || prev.phase !== "BIDDING") return prev;
      return { ...prev, currentBid: finalAmount, currentBidder: userTeam, timeLeft: bidTimeLimit, bidHistory: [...prev.bidHistory, { team: userTeam, amount: finalAmount, timestamp: Date.now() }] };
    });
    addLog(`🙋 당신(${userTeam.name}): ${finalAmount}G 입찰!`);
    setUserBidAmount(0);
  }, [bidTimeLimit]);

  // Auction timer - simplified, no side effects inside state setter
  useEffect(() => {
    if (!isRunning || simulationMode !== "auction" || !auctionState || auctionState.phase !== "BIDDING") return;
    const speed = botSpeed === "slow" ? 2000 : botSpeed === "fast" ? 500 : 1000;

    const timer = setInterval(() => {
      const cur = auctionStateRef.current;
      if (!cur || cur.phase !== "BIDDING") {
        clearInterval(timer);
        return;
      }

      if (cur.timeLeft <= 0) {
        clearInterval(timer);
        resolveAuction();
        return;
      }

      // Bot bid (outside of state setter to avoid side-effect issues)
      if (Math.random() > 0.5) {
        botBid();
      }

      // Decrement timer
      setAuctionState(prev => {
        if (!prev || prev.phase !== "BIDDING") return prev;
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, speed);

    return () => clearInterval(timer);
  }, [isRunning, simulationMode, auctionState?.phase, botSpeed, botBid, resolveAuction]);

  // ─── DRAFT ────────────────────────────────────────────────────────────────────
  const startDraft = () => {
    setSimulationMode("draft");
    setPhase("TEAM_FORMATION");
    setIsRunning(true);
    const remaining = players.slice(teamCount);
    setAvailablePlayers(remaining);
    const pickOrder: Team[] = [];
    const totalPicks = remaining.length;
    const rounds = Math.ceil(totalPicks / teamCount);
    for (let r = 0; r < rounds; r++) {
      if (r % 2 === 0) pickOrder.push(...teams);
      else pickOrder.push(...[...teams].reverse());
    }
    setDraftState({
      currentTeamIndex: 0, currentRound: 1, isReverse: false,
      pickOrder: pickOrder.slice(0, totalPicks), availablePlayers: remaining,
      phase: "PICKING", timeLeft: pickTimeLimit,
    });
    addLog("──────────────────────────");
    addLog("스네이크 드래프트 시작!");
    addLog(`첫 번째 픽: ${teams[0].name}`);
  };

  const executePick = useCallback((picked: MockPlayer) => {
    if (!draftState || draftState.phase !== "PICKING") return;
    const currentTeam = draftState.pickOrder[draftState.currentTeamIndex];
    setTeams(prev => prev.map(t => t.id === currentTeam.id ? { ...t, members: [...t.members, picked], totalMmr: t.totalMmr + picked.mmr } : t));
    addLog(`${currentTeam.name}: ${picked.name} (${picked.tier} ${picked.mainPosition}) 선택!`);

    const nextIdx = draftState.currentTeamIndex + 1;
    const newAvail = draftState.availablePlayers.filter(p => p.id !== picked.id);

    if (newAvail.length === 0 || nextIdx >= draftState.pickOrder.length) {
      addLog("🎉 드래프트 완료!");
      setIsRunning(false);
      setDraftState(prev => prev ? { ...prev, phase: "COMPLETE", availablePlayers: [] } : prev);
    } else {
      const nextTeam = draftState.pickOrder[nextIdx];
      const newRound = Math.floor(nextIdx / teamCount) + 1;
      setDraftState(prev => prev ? { ...prev, currentTeamIndex: nextIdx, currentRound: newRound, isReverse: newRound % 2 === 0, availablePlayers: newAvail, timeLeft: pickTimeLimit } : prev);
      addLog(`다음 픽: ${nextTeam.name} (라운드 ${newRound})`);
    }
    setSelectedDraftPlayer(null);
  }, [draftState, teamCount, pickTimeLimit]);

  const botPick = useCallback(() => {
    if (!draftState || draftState.phase !== "PICKING" || draftState.availablePlayers.length === 0) return;

    // ── 카오스 모드: 무응답 → 타임아웃으로 자동 픽 유도 ──
    if (chaosMode && Math.random() * 100 < chaosNoResponse) {
      addLog("🔴 [카오스] 봇 픽 무응답 (타임아웃 대기)");
      return;
    }

    const currentTeam = draftState.pickOrder[draftState.currentTeamIndex];
    const available = draftState.availablePlayers;
    const teamPositions = new Set(currentTeam.members.map(m => m.mainPosition));
    const neededPositions = POSITIONS.filter(p => !teamPositions.has(p));
    let candidates = available.filter(p => neededPositions.includes(p.mainPosition) || neededPositions.includes(p.secondaryPosition));
    if (candidates.length === 0) candidates = available;
    candidates.sort((a, b) => b.mmr - a.mmr);
    const topCandidates = candidates.slice(0, Math.min(3, candidates.length));
    const picked = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    // ── 카오스 모드: 지연 ──
    if (chaosMode && Math.random() * 100 < chaosDelay) {
      const delayMs = 1500 + Math.random() * 3000;
      addLog(`🟡 [카오스] ${currentTeam.name} 픽 지연 (${(delayMs / 1000).toFixed(1)}초)`);
      setTimeout(() => executePick(picked), delayMs);
    } else {
      executePick(picked);
    }
  }, [draftState, executePick, chaosMode, chaosNoResponse, chaosDelay]);

  // User picks in interactive draft
  const handleUserPick = useCallback(() => {
    if (!selectedDraftPlayer || !draftState) return;
    const player = draftState.availablePlayers.find(p => p.id === selectedDraftPlayer);
    if (!player) return;
    executePick(player);
  }, [selectedDraftPlayer, draftState, executePick]);

  // Check if current pick is user's team (interactive mode)
  const isUserTurnDraft = isInteractive && draftState?.phase === "PICKING" && draftState.pickOrder[draftState.currentTeamIndex]?.id === teams[0]?.id;

  // Draft timer
  useEffect(() => {
    if (!isRunning || simulationMode !== "draft" || !draftState || draftState.phase !== "PICKING") return;
    if (isUserTurnDraft) return; // Wait for user in interactive mode

    const speed = botSpeed === "slow" ? 2000 : botSpeed === "fast" ? 300 : 800;
    const timer = setTimeout(() => { botPick(); }, speed);
    return () => clearTimeout(timer);
  }, [isRunning, simulationMode, draftState?.currentTeamIndex, draftState?.phase, botSpeed, botPick, isUserTurnDraft]);

  // ─── RANDOM / BALANCED ────────────────────────────────────────────────────────
  const startRandom = () => {
    setSimulationMode("random");
    setPhase("TEAM_FORMATION");
    setIsRunning(true);
    const remaining = [...players.slice(teamCount)];
    const newTeams = teams.map(t => ({ ...t, members: [...t.members] }));
    addLog("──────────────────────────");
    addLog("랜덤 팀 배정 시작!");
    for (let i = remaining.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [remaining[i], remaining[j]] = [remaining[j], remaining[i]]; }
    let idx = 0;
    for (const p of remaining) {
      if (newTeams[idx].members.length < 5) { newTeams[idx].members.push(p); newTeams[idx].totalMmr += p.mmr; addLog(`${p.name} → ${newTeams[idx].name}`); }
      idx = (idx + 1) % teamCount;
    }
    setTeams(newTeams);
    setAvailablePlayers([]);
    addLog("🎉 랜덤 팀 배정 완료!");
    setIsRunning(false);
  };

  const startBalanced = () => {
    setSimulationMode("balanced");
    setPhase("TEAM_FORMATION");
    setIsRunning(true);
    const remaining = [...players.slice(teamCount)].sort((a, b) => b.mmr - a.mmr);
    const newTeams = teams.map(t => ({ ...t, members: [...t.members] }));
    addLog("──────────────────────────");
    addLog("밸런스 팀 배정 시작!");
    let reverse = false;
    while (remaining.length > 0) {
      const order = reverse ? [...newTeams].reverse() : newTeams;
      for (const t of order) { if (remaining.length === 0) break; if (t.members.length >= 5) continue; const p = remaining.shift()!; t.members.push(p); t.totalMmr += p.mmr; addLog(`${p.name} (MMR: ${p.mmr}) → ${t.name}`); }
      reverse = !reverse;
    }
    setTeams(newTeams);
    setAvailablePlayers([]);
    const mmrs = newTeams.map(t => t.totalMmr);
    addLog(`🎉 밸런스 배정 완료! (MMR 차이: ${Math.max(...mmrs) - Math.min(...mmrs)})`);
    setIsRunning(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-text-primary mb-2">내전 시뮬레이션</h1>
          <p className="text-text-secondary">팀 구성부터 대진표, 매치 결과까지 전체 플로우를 체험합니다</p>
        </div>

        {/* Step Indicator */}
        <StepIndicator phase={phase} />

        {/* ═══ PHASE: SETUP ═══ */}
        {phase === "SETUP" && (
          <>
            {/* Settings */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
              <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-accent-primary" />
                설정
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">플레이어 수</label>
                  <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))} className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary">
                    <option value={10}>10명 (2팀)</option>
                    <option value={15}>15명 (3팀)</option>
                    <option value={20}>20명 (4팀)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">시작 예산</label>
                  <select value={startingBudget} onChange={(e) => setStartingBudget(Number(e.target.value))} className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary">
                    <option value={1000}>1000G</option>
                    <option value={2000}>2000G</option>
                    <option value={3000}>3000G</option>
                    <option value={5000}>5000G</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">봇 속도</label>
                  <select value={botSpeed} onChange={(e) => setBotSpeed(e.target.value as any)} className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary">
                    <option value="slow">느림</option>
                    <option value="normal">보통</option>
                    <option value="fast">빠름</option>
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm text-text-secondary mb-1">참여 모드</label>
                  <button
                    onClick={() => setIsInteractive(!isInteractive)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border font-medium text-sm transition-colors ${
                      isInteractive
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-bg-elevated bg-bg-tertiary text-text-secondary"
                    }`}
                  >
                    {isInteractive ? <Hand className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    {isInteractive ? "직접 참여" : "관전 모드"}
                  </button>
                </div>
                <div className="flex items-end">
                  <Button onClick={resetSimulation} variant="secondary" className="w-full">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    초기화
                  </Button>
                </div>
              </div>
              {isInteractive && (
                <div className="mt-3 p-3 bg-accent-primary/5 border border-accent-primary/20 rounded-lg">
                  <p className="text-sm text-accent-primary">
                    <Hand className="h-4 w-4 inline mr-1" />
                    직접 참여 모드: 당신은 <strong>팀 1</strong>의 캡틴으로 참가합니다. 드래프트에서 직접 선수를 픽하고, 경매에서 직접 입찰할 수 있습니다.
                  </p>
                </div>
              )}

              {/* Chaos Mode */}
              <div className="mt-3">
                <button
                  onClick={() => setChaosMode(!chaosMode)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg border font-medium text-sm transition-colors ${
                    chaosMode
                      ? "border-accent-danger/50 bg-accent-danger/10 text-accent-danger"
                      : "border-bg-elevated bg-bg-tertiary text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    카오스 모드 {chaosMode ? "ON" : "OFF"}
                  </span>
                  <span className="text-xs opacity-70">봇 예외 행동 시뮬레이션</span>
                </button>

                {chaosMode && (
                  <div className="mt-2 p-3 bg-accent-danger/5 border border-accent-danger/20 rounded-lg space-y-3">
                    <p className="text-xs text-accent-danger/80 mb-2">
                      봇이 확률적으로 비정상 행동을 합니다. 실제 유저의 예외 상황을 테스트합니다.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">🔴 무응답</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min={0} max={50} value={chaosNoResponse}
                            onChange={(e) => setChaosNoResponse(Number(e.target.value))}
                            className="flex-1 h-1.5 accent-accent-danger"
                          />
                          <span className="text-xs font-mono text-text-secondary w-8 text-right">{chaosNoResponse}%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">🟡 지연</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min={0} max={50} value={chaosDelay}
                            onChange={(e) => setChaosDelay(Number(e.target.value))}
                            className="flex-1 h-1.5 accent-accent-warning"
                          />
                          <span className="text-xs font-mono text-text-secondary w-8 text-right">{chaosDelay}%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-text-tertiary mb-1">🟠 연타</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min={0} max={30} value={chaosSpam}
                            onChange={(e) => setChaosSpam(Number(e.target.value))}
                            className="flex-1 h-1.5 accent-accent-gold"
                          />
                          <span className="text-xs font-mono text-text-secondary w-8 text-right">{chaosSpam}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mode Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <button onClick={startAuction} className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group text-left">
                <Gavel className="h-10 w-10 text-accent-gold mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-text-primary mb-1">경매 드래프트</h3>
                <p className="text-sm text-text-tertiary">포인트로 입찰하여 선수 획득</p>
              </button>
              <button onClick={startDraft} className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group text-left">
                <GitBranch className="h-10 w-10 text-accent-primary mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-text-primary mb-1">스네이크 드래프트</h3>
                <p className="text-sm text-text-tertiary">순서대로 돌아가며 선택</p>
              </button>
              <button onClick={startRandom} className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group text-left">
                <Shuffle className="h-10 w-10 text-accent-success mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-text-primary mb-1">랜덤 배정</h3>
                <p className="text-sm text-text-tertiary">무작위로 팀 배정</p>
              </button>
              <button onClick={startBalanced} className="p-6 bg-bg-secondary border border-bg-tertiary rounded-xl hover:border-accent-primary transition-colors group text-left">
                <Scale className="h-10 w-10 text-accent-primary mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-text-primary mb-1">밸런스 배정</h3>
                <p className="text-sm text-text-tertiary">MMR 기반 균형 배정</p>
              </button>
            </div>

            {/* All Players Preview */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
              <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                전체 플레이어 ({players.length}명)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                {players.map((player, idx) => (
                  <div key={player.id} className="flex items-center gap-2 p-2 rounded bg-bg-tertiary">
                    <span className="text-xs text-text-tertiary w-4">{idx + 1}</span>
                    <span className="flex-1 text-sm text-text-primary truncate">{player.name}</span>
                    <TierBadge tier={player.tier} />
                    <PositionIcon position={player.mainPosition} size={13} />
                    <span className="text-xs text-text-tertiary">{player.mmr}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ PHASE: TEAM FORMATION ═══ */}
        {phase === "TEAM_FORMATION" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* Auction Status */}
              {simulationMode === "auction" && auctionState && auctionState.currentPlayer && (
                <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                      <Gavel className="h-5 w-5 text-accent-gold" /> 현재 경매 중
                    </h3>
                    <div className="flex items-center gap-3">
                      {auctionState.yuchalCount > 0 && (
                        <span className="text-xs font-medium text-accent-warning bg-accent-warning/10 px-2 py-1 rounded-full">
                          유찰 {auctionState.yuchalCount}/{auctionState.maxYuchalCycles}
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-text-tertiary" />
                        <span className={`font-bold ${auctionState.timeLeft <= 3 ? "text-accent-danger animate-pulse" : "text-text-primary"}`}>
                          {auctionState.timeLeft}초
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex-1">
                      <PlayerCard player={auctionState.currentPlayer} />
                    </div>
                    <div className="text-center flex-shrink-0">
                      <div className="text-sm text-text-tertiary mb-1">현재 입찰가</div>
                      <div className="text-3xl font-bold text-accent-gold">{auctionState.currentBid}G</div>
                      {auctionState.currentBidder && (
                        <div className="text-sm text-text-secondary mt-1">by {auctionState.currentBidder.name}</div>
                      )}
                    </div>
                  </div>

                  {/* Interactive Bidding - 누적형 */}
                  {isInteractive && auctionState.phase === "BIDDING" && (() => {
                    const myBudget = teams[0]?.budget || 0;
                    const baseBid = auctionState.currentBid;
                    const totalBid = baseBid + userBidAmount;
                    const canBid = userBidAmount > 0 && totalBid <= myBudget;

                    return (
                      <div className="mt-4 pt-4 border-t border-bg-tertiary">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-text-secondary">
                            내 예산: <span className="font-bold text-accent-gold">{myBudget}G</span>
                          </p>
                          <p className="text-sm text-text-tertiary">
                            현재 최고가: <span className="font-medium text-text-primary">{baseBid}G</span>
                          </p>
                        </div>

                        {/* 누적 금액 표시 */}
                        <div className="bg-bg-tertiary rounded-xl p-4 mb-3 text-center">
                          <p className="text-xs text-text-tertiary mb-1">내 입찰가</p>
                          <div className="text-3xl font-bold text-accent-gold">
                            {totalBid}G
                          </div>
                          {userBidAmount > 0 && (
                            <p className="text-xs text-text-secondary mt-1">
                              {baseBid}G + <span className="text-accent-primary">{userBidAmount}G</span>
                            </p>
                          )}
                          {userBidAmount === 0 && (
                            <p className="text-xs text-text-tertiary mt-1">아래 버튼으로 금액을 추가하세요</p>
                          )}
                        </div>

                        {/* 금액 추가 버튼 */}
                        <div className="flex gap-2 mb-3">
                          {[50, 100, 500].map(inc => (
                            <button
                              key={inc}
                              onClick={() => setUserBidAmount(prev => {
                                const next = prev + inc;
                                return baseBid + next <= myBudget ? next : prev;
                              })}
                              disabled={baseBid + userBidAmount + inc > myBudget}
                              className="flex-1 px-3 py-2.5 text-sm font-bold bg-bg-secondary border border-bg-elevated rounded-lg hover:border-accent-gold hover:bg-accent-gold/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-accent-gold"
                            >
                              +{inc}G
                            </button>
                          ))}
                        </div>

                        {/* 입찰 / 초기화 버튼 */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setUserBidAmount(0)}
                            disabled={userBidAmount === 0}
                            className="px-4 py-2.5 text-sm font-medium bg-bg-tertiary border border-bg-elevated rounded-lg hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary"
                          >
                            초기화
                          </button>
                          <button
                            onClick={() => handleUserBid(totalBid)}
                            disabled={!canBid}
                            className="flex-1 px-4 py-2.5 text-sm font-bold bg-accent-gold text-black rounded-lg hover:bg-accent-gold/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {canBid ? `${totalBid}G 입찰하기` : "금액을 추가하세요"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Draft Status */}
              {simulationMode === "draft" && draftState && draftState.phase === "PICKING" && (
                <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-accent-primary" /> 드래프트 라운드 {draftState.currentRound}
                    </h3>
                    <Badge variant={draftState.isReverse ? "warning" : "primary"}>
                      {draftState.isReverse ? "역순" : "정순"}
                    </Badge>
                  </div>
                  <div className="text-center py-2">
                    <div className="text-sm text-text-tertiary mb-1">현재 픽</div>
                    <div className="text-2xl font-bold text-text-primary flex items-center justify-center gap-2">
                      {draftState.pickOrder[draftState.currentTeamIndex]?.name}
                      {isUserTurnDraft && <span className="text-sm font-normal text-accent-primary">(당신의 차례!)</span>}
                    </div>
                    <div className="text-sm text-text-tertiary mt-1">남은 선수: {draftState.availablePlayers.length}명</div>
                  </div>

                  {/* Interactive Pick: show available players to pick from */}
                  {isUserTurnDraft && (
                    <div className="mt-4 pt-4 border-t border-bg-tertiary">
                      <p className="text-sm font-medium text-accent-primary mb-3">선수를 클릭하여 선택하세요:</p>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {draftState.availablePlayers.map(player => (
                          <PlayerCard
                            key={player.id}
                            player={player}
                            onClick={() => setSelectedDraftPlayer(player.id)}
                            selected={selectedDraftPlayer === player.id}
                            interactive
                          />
                        ))}
                      </div>
                      {selectedDraftPlayer && (
                        <div className="mt-3">
                          <Button onClick={handleUserPick} className="w-full" size="lg">
                            <Sparkles className="h-4 w-4 mr-2" />
                            선택 확정
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* "Next" button after team formation is done */}
              {isTeamFormationComplete && (
                <div className="bg-accent-primary/5 border border-accent-primary/30 rounded-xl p-6 text-center">
                  <h3 className="text-lg font-bold text-text-primary mb-2">팀 구성 완료!</h3>
                  <p className="text-text-secondary mb-4">라인 선택 단계로 이동합니다.</p>
                  <Button onClick={goToRoleSelection} size="lg">
                    <ArrowRight className="h-5 w-5 mr-2" />
                    라인 선택으로 이동
                  </Button>
                </div>
              )}

              {/* Teams Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teams.map(team => (
                  <TeamDisplay
                    key={team.id}
                    team={team}
                    showBudget={simulationMode === "auction"}
                    highlight={isInteractive && team.id === teams[0]?.id}
                  />
                ))}
              </div>
            </div>

            {/* Right sidebar: logs + available players */}
            <div className="space-y-4">
              {simulationMode === "draft" && draftState?.phase === "PICKING" && !isUserTurnDraft && (
                <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
                  <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" /> 선택 가능한 선수 ({draftState.availablePlayers.length}명)
                  </h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {draftState.availablePlayers.slice(0, 10).map(player => (
                      <PlayerCard key={player.id} player={player} disabled />
                    ))}
                    {draftState.availablePlayers.length > 10 && (
                      <div className="text-center text-sm text-text-tertiary py-2">+{draftState.availablePlayers.length - 10}명 더...</div>
                    )}
                  </div>
                </div>
              )}

              {/* Logs */}
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
                <h3 className="text-sm font-bold text-text-primary mb-3">진행 로그</h3>
                <div className="space-y-1 max-h-[400px] overflow-y-auto font-mono text-xs">
                  {logs.map((log, idx) => (
                    <div key={idx} className="text-text-secondary py-1 border-b border-bg-tertiary last:border-0">{log}</div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: ROLE_SELECTION ═══ */}
        {phase === "ROLE_SELECTION" && roleSelectionState && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <Crosshair className="h-5 w-5 text-accent-primary" />
                  라인 선택
                </h3>
                <div className="flex items-center gap-3">
                  {isInteractive && roleSelectionState.phase === "SELECTING" && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-text-tertiary" />
                      <span className={`font-bold ${roleSelectionState.timeLeft <= 10 ? "text-accent-danger animate-pulse" : "text-text-primary"}`}>
                        {Math.floor(roleSelectionState.timeLeft / 60)}:{(roleSelectionState.timeLeft % 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                  )}
                  {roleSelectionState.phase === "SELECTING" && (
                    <div className="flex gap-2">
                      <Button onClick={autoAssignAllRoles} variant="secondary" size="sm">
                        <Sparkles className="h-4 w-4 mr-1" />
                        자동 배정
                      </Button>
                      <Button
                        onClick={completeRoleSelection}
                        size="sm"
                        disabled={!isAllRolesAssigned}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        완료
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {isInteractive && (
                <p className="text-sm text-text-secondary">
                  각 팀 멤버에게 라인을 배정하세요. 같은 팀에서 중복 라인은 불가합니다.
                </p>
              )}
            </div>

            {/* Teams Role Assignment Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {teams.map((team) => {
                const assignments = roleSelectionState.teamAssignments[team.id] || [];

                return (
                  <div key={team.id} className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
                    {/* Team Header */}
                    <div className="px-5 py-3 border-b border-bg-tertiary flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                      <span className="font-bold text-text-primary">{team.name}</span>
                      <span className="text-xs text-text-tertiary ml-auto">
                        {assignments.filter(a => a.assignedRole).length}/{team.members.length} 배정완료
                      </span>
                    </div>

                    {/* Members & Role Selection */}
                    <div className="divide-y divide-bg-tertiary">
                      {team.members.map((member) => {
                        const assignment = assignments.find(a => a.playerId === member.id);
                        const assignedRole = assignment?.assignedRole;
                        const takenRoles = assignments
                          .filter(a => a.assignedRole && a.playerId !== member.id)
                          .map(a => a.assignedRole!);

                        return (
                          <div key={member.id} className="px-5 py-3 flex items-center gap-4">
                            {/* Player Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-text-primary text-sm truncate">{member.name}</span>
                                <TierBadge tier={member.tier} />
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs text-text-tertiary">선호:</span>
                                <span className="inline-flex items-center gap-1">
                                  <PositionIcon position={member.mainPosition} size={12} />
                                  <span className="text-xs text-text-tertiary">{POSITION_LABELS[member.mainPosition] || member.mainPosition}</span>
                                </span>
                                {member.secondaryPosition && (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="text-xs text-text-tertiary">/</span>
                                    <PositionIcon position={member.secondaryPosition} size={12} opacity={0.6} />
                                    <span className="text-xs text-text-tertiary">{POSITION_LABELS[member.secondaryPosition] || member.secondaryPosition}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Role Selection Buttons */}
                            {isInteractive && roleSelectionState.phase === "SELECTING" ? (
                              <div className="flex gap-1">
                                {POSITIONS.map(pos => {
                                  const isSelected = assignedRole === pos;
                                  const isTaken = takenRoles.includes(pos);
                                  const isPreferred = member.mainPosition === pos || member.secondaryPosition === pos;

                                  return (
                                    <button
                                      key={pos}
                                      onClick={() => assignRole(team.id, member.id, pos)}
                                      disabled={isTaken}
                                      className={`
                                        w-10 h-10 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5
                                        ${isSelected
                                          ? "bg-accent-primary text-white ring-2 ring-accent-primary/50 scale-105"
                                          : isTaken
                                            ? "bg-bg-tertiary/50 text-text-tertiary/30 cursor-not-allowed"
                                            : isPreferred
                                              ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/20"
                                              : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
                                        }
                                      `}
                                      title={`${POSITION_LABELS[pos]}${isPreferred ? " (선호)" : ""}${isTaken ? " (선택됨)" : ""}`}
                                    >
                                      <PositionIcon position={pos} size={14} opacity={isTaken ? 0.2 : isSelected ? 1 : 0.7} />
                                      <span className="text-[9px] leading-none">{POSITION_LABELS[pos]?.[0] || pos[0]}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              /* 자동모드 또는 완료: 배정된 라인 표시 */
                              <div className="flex items-center gap-2">
                                {assignedRole ? (
                                  <div className={`
                                    px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5
                                    ${member.mainPosition === assignedRole
                                      ? "bg-accent-success/15 text-accent-success"
                                      : member.secondaryPosition === assignedRole
                                        ? "bg-accent-warning/15 text-accent-warning"
                                        : "bg-bg-tertiary text-text-secondary"
                                    }
                                  `}>
                                    <PositionIcon position={assignedRole} size={16} />
                                    <span>{POSITION_LABELS[assignedRole] || assignedRole}</span>
                                    {member.mainPosition === assignedRole && (
                                      <span className="text-[10px]">★</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-text-tertiary italic">미배정</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logs */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
              <h4 className="text-sm font-bold text-text-primary mb-3">로그</h4>
              <div className="h-32 overflow-y-auto text-xs font-mono space-y-0.5 custom-scrollbar">
                {logs.map((log, i) => (
                  <div key={i} className="text-text-secondary">{log}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: BRACKET ═══ */}
        {phase === "BRACKET" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Auto simulate button */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  <Swords className="h-5 w-5 text-accent-primary" /> 대진표
                </h2>
                {!isInteractive && (
                  <Button onClick={simulateAllMatches} variant="secondary" size="sm">
                    <Play className="h-4 w-4 mr-1" /> 전체 자동 시뮬레이션
                  </Button>
                )}
              </div>

              {/* Bracket by round */}
              {(() => {
                const rounds = [...new Set(bracketMatches.map(m => m.round))].sort((a, b) => a - b);
                return rounds.map(round => {
                  const roundMatches = bracketMatches.filter(m => m.round === round);
                  const maxRound = Math.max(...rounds);
                  const roundLabel = round === maxRound
                    ? "결승전"
                    : round === maxRound - 1
                    ? "준결승"
                    : `${round}라운드`;

                  return (
                    <div key={round}>
                      <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">{roundLabel}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {roundMatches.map(match => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isInteractive={isInteractive}
                            onSimulate={() => handleSimulateMatch(match.id)}
                            onSetWinner={(team) => handleSetWinner(match.id, team)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Right: teams + logs */}
            <div className="space-y-4">
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
                <h3 className="text-sm font-bold text-text-primary mb-3">팀 목록</h3>
                <div className="space-y-3">
                  {teams.map(team => (
                    <div key={team.id} className="p-3 bg-bg-tertiary rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="font-medium text-sm text-text-primary">{team.name}</span>
                        <span className="text-xs text-text-tertiary ml-auto">MMR {team.totalMmr}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {team.members.map(m => (
                          <span key={m.id} className="text-[10px] bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary">{m.name}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
                <h3 className="text-sm font-bold text-text-primary mb-3">진행 로그</h3>
                <div className="space-y-1 max-h-[300px] overflow-y-auto font-mono text-xs">
                  {logs.map((log, idx) => (
                    <div key={idx} className="text-text-secondary py-1 border-b border-bg-tertiary last:border-0">{log}</div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: COMPLETE ═══ */}
        {phase === "COMPLETE" && champion && (
          <div className="space-y-6">
            {/* Winner announcement */}
            <div className="bg-gradient-to-b from-accent-gold/10 to-bg-secondary border border-accent-gold/30 rounded-2xl p-8 text-center">
              <Trophy className="h-16 w-16 text-accent-gold mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-text-primary mb-2">우승!</h2>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: champion.color }} />
                <span className="text-2xl font-bold text-accent-gold">{champion.name}</span>
              </div>
              <p className="text-text-secondary mb-6">총 MMR: {champion.totalMmr}</p>

              <div className="inline-flex flex-wrap justify-center gap-2 mb-6">
                {champion.members.map(m => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary rounded-lg">
                    <span className="text-sm font-medium text-text-primary">{m.name}</span>
                    <TierBadge tier={m.tier} />
                    <PositionIcon position={m.mainPosition} size={14} />
                  </div>
                ))}
              </div>
            </div>

            {/* All teams result */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent-gold" /> 전체 결과
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {teams.map(team => (
                  <div key={team.id} className={`text-center p-4 rounded-lg border ${
                    team.id === champion.id
                      ? "bg-accent-gold/10 border-accent-gold/30"
                      : "bg-bg-tertiary border-bg-tertiary"
                  }`}>
                    <div className="w-4 h-4 rounded-full mx-auto mb-2" style={{ backgroundColor: team.color }} />
                    <div className="font-medium text-text-primary">{team.name}</div>
                    <div className="text-lg font-bold text-accent-primary">{team.totalMmr} MMR</div>
                    <div className="text-xs text-text-tertiary">{team.members.length}명</div>
                    {team.id === champion.id && <div className="text-xs text-accent-gold font-bold mt-1">🏆 우승</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Match history */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h3 className="text-lg font-bold text-text-primary mb-4">매치 히스토리</h3>
              <div className="space-y-3">
                {bracketMatches.filter(m => m.status === "COMPLETE" && m.team1 && m.team2).map(match => (
                  <div key={match.id} className="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg">
                    <div className={`flex items-center gap-2 flex-1 ${match.winner?.id === match.team1?.id ? "font-bold text-text-primary" : "text-text-tertiary"}`}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: match.team1?.color }} />
                      {match.team1?.name}
                    </div>
                    <span className="font-bold text-text-primary">{match.score1} - {match.score2}</span>
                    <div className={`flex items-center gap-2 flex-1 justify-end ${match.winner?.id === match.team2?.id ? "font-bold text-text-primary" : "text-text-tertiary"}`}>
                      {match.team2?.name}
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: match.team2?.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Restart */}
            <div className="text-center">
              <Button onClick={resetSimulation} size="lg" variant="secondary">
                <RotateCcw className="h-5 w-5 mr-2" />
                다시 시뮬레이션
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
