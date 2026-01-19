// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  discordId: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  nickname?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "USER" | "MODERATOR" | "ADMIN";

export interface UserProfile extends User {
  riotAccounts: RiotAccount[];
  stats: UserStats;
}

export interface UserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  participations: number;
}

// ============================================
// Riot Account Types
// ============================================

export interface RiotAccount {
  id: string;
  userId: string;
  puuid: string;
  summonerId: string;
  gameName: string;
  tagLine: string;
  tier: string;
  rank: string;
  lp: number;
  mmrPoints: number;
  isPrimary: boolean;
  verifiedAt: string | null;
  lastSyncedAt: string | null;
}

export interface VerificationStart {
  gameName: string;
  tagLine: string;
  currentIconId: number;
  requiredIconId: number;
  expiresIn: number;
}

// ============================================
// Auction Types
// ============================================

export interface Auction {
  id: string;
  name: string;
  hostId: string;
  host: User;
  status: AuctionStatus;
  maxTeams: number;
  teamBudget: number;
  minBid: number;
  bidTimeLimit: number;
  teams: Team[];
  participants: AuctionParticipant[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type AuctionStatus = "WAITING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface Team {
  id: string;
  auctionId: string;
  name: string;
  captainId: string;
  captain: User;
  budget: number;
  spentBudget: number;
  members: AuctionParticipant[];
}

export interface AuctionParticipant {
  id: string;
  auctionId: string;
  userId: string;
  user: User & { riotAccounts: RiotAccount[] };
  teamId: string | null;
  team: Team | null;
  preferredRole: PreferredRole | null;
  soldPrice: number | null;
  status: ParticipantStatus;
}

export type PreferredRole = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | "FILL";

export type ParticipantStatus = "WAITING" | "ON_AUCTION" | "SOLD" | "UNSOLD";

// ============================================
// Match Types
// ============================================

export interface Match {
  id: string;
  auctionId: string;
  teamAId: string;
  teamBId: string;
  teamA: Team;
  teamB: Team;
  winnerId: string | null;
  winner: Team | null;
  status: MatchStatus;
  tournamentCode: string | null;
  riotMatchId: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export type MatchStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

// ============================================
// WebSocket Events
// ============================================

export interface BidEvent {
  participantId: string;
  teamId: string;
  amount: number;
  timestamp: string;
}

export interface AuctionStateEvent {
  auction: Auction;
  currentParticipant: AuctionParticipant | null;
  currentBid: number;
  currentBidder: string | null;
  timeRemaining: number;
}

// ============================================
// DTO Types
// ============================================

export interface CreateAuctionDto {
  name: string;
  maxTeams: number;
  teamBudget: number;
  minBid: number;
}

export interface PlaceBidDto {
  auctionId: string;
  participantId: string;
  teamId: string;
  amount: number;
}

export interface VerifyRiotAccountDto {
  gameName: string;
  tagLine: string;
}
