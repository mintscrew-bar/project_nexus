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
  profileBanner?: string | null;
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
  peakTier?: string | null;
  peakRank?: string | null;
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

// ============================================
// LoL Game Element Mappings (EN ↔ KO)
// ============================================

export {
  CHAMPION_MAPPINGS,
  ITEM_MAPPINGS,
  RUNE_MAPPINGS,
  SUMMONER_SPELL_MAPPINGS,
  getChampionKoreanName,
  getItemKoreanName,
  getRuneKoreanName,
  getSummonerSpellKoreanName,
  getChampionEnglishName,
  getItemEnglishName,
  getRuneEnglishName,
  getAllChampionNames,
  getAllChampionKoreanNames,
  getAllItemNames,
  getAllItemKoreanNames,
  getAllRuneNames,
  getAllRuneKoreanNames,
  searchChampionsByQuery,
  searchItemsByQuery,
} from './lol-mappings';

export {
  CONFIDENCE_THRESHOLDS,
  TIER_BASE,
  RANK_BONUS,
  wilsonLower,
  wilsonUpper,
  getConfidenceLevel,
  calculateTierScore,
  tierScore,
  isTierAbove,
} from './stats-utils';

export type { ConfidenceLevel } from './stats-utils';

export {
  getDoubleElimFeeders,
  FEEDER_SOURCE_LABEL,
} from './bracket-topology';

export type { BracketSlot, FeederTarget, MatchFeeders } from './bracket-topology';

export {
  DEFAULT_SERIES_PRESET,
  getEliminationRoundSizes,
  resolveSeriesBestOf,
  winsNeededFor,
  estimateSeriesGames,
  getSeriesPresetsForTeamCount,
  isSeriesPresetAllowed,
  normalizeSeriesPreset,
} from './series-preset';

export {
  GAMES,
  GAME_TITLES,
  DEFAULT_GAME,
  getGame,
  gameFromSlug,
  enabledGames,
  teamCountForRoomSize,
  teamCountForParticipants,
  teamSizeForGame,
  minDraftParticipants,
  isValidRoomSize,
  isSectionReady,
} from './games';

export {
  PUBG_PLATFORMS,
  PUBG_PLATFORM_LABELS,
  PUBG_GAME_MODES,
  DEFAULT_PUBG_GAME_MODE,
  getPubgGameMode,
  pubgGameModes,
  allPubgGameModes,
  isSelectablePubgGameMode,
  isValidPubgRoomSize,
  pubgRoomTitle,
  stripPubgTitlePrefix,
  teamSizeForRoom,
  teamCountForRoom,
  teamCountForRoster,
  isSplitSquadTeam,
  squadCountForRoom,
  squadSizeForRoom,
} from './pubg';

export type {
  PubgPlatform,
  PubgGameMode,
  PubgGameModeDefinition,
  RoomTeamShape,
} from './pubg';

export {
  DEFAULT_PUBG_POINT_RULE,
  KILL_ONLY_POINT_RULE,
  KILL_MATCH_POINT_RULE,
  PUBG_POINT_RULE_PRESETS,
  calculateScrimPoints,
  defaultPointRuleForMode,
  defaultPresetKeyForMode,
  isValidPointRule,
  sortScrimLeaderboard,
} from './pubg-scrim';

export type {
  PubgPointRule,
  PubgPointRulePreset,
  ScrimLeaderboardRow,
} from './pubg-scrim';

export {
  PUBG_BALANCE_VERSION,
  MIN_ROUNDS_FOR_BALANCE,
  calculateAutoBalanceScore,
} from './pubg-balance';

export type {
  PubgBalanceInput,
  PubgBalanceResult,
} from './pubg-balance';

export {
  afterTeamsPath,
  getTeamModeStagePath,
  getRoomStagePath,
} from './lobby-stage-path';

export type { StageRoom } from './lobby-stage-path';

export {
  traceLadder,
  buildRandomRungs,
  buildLadderDraw,
  resolveLadderOrder,
} from './ladder';

export type { LadderRung, LadderDraw } from './ladder';

export {
  identifyRoundMatch,
  rosterOverlap,
} from './pubg-match-identify';

export type {
  MatchCandidate,
  IdentifyOptions,
  IdentifyResult,
} from './pubg-match-identify';

export type {
  GameTitle,
  GameDefinition,
  GameTeamMode,
  GameResultShape,
  GameSection,
} from './games';

export type { SeriesPreset, SeriesPresetInfo } from './series-preset';

export {
  ROLE_SELECTION_TIME_SECONDS,
  ROLE_SELECTION_EXTENSION_SECONDS,
  ROLE_SELECTION_MAX_EXTENSIONS_PER_USER,
  ROLE_SELECTION_TIME_MS,
  ROLE_SELECTION_EXTENSION_MS,
} from './role-selection';
