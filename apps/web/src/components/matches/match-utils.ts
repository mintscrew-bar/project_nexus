// Shared utilities and types for match pages

// ─── Types ───────────────────────────────────────────

export interface SummonerData {
  puuid: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
}

export interface MatchParticipant {
  id: string;
  matchId: string;
  userId: string;
  championId: number;
  championName: string;
  position: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  win: boolean;
  createdAt: string;
  match: {
    id: string;
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    winner: { id: string; name: string };
    completedAt: string;
  };
  team: {
    id: string;
    name: string;
    color: string;
  };
}

export interface ChampionStats {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  cs?: number;
}

export interface RiotAccount {
  id: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
  isPrimary: boolean;
}

export interface NexusMatchHistory {
  matchId: string;
  match: {
    id: string;
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    winner: { id: string; name: string };
    completedAt: string;
  };
  participant: {
    championId: number;
    championName: string;
    position: string;
    kills: number;
    deaths: number;
    assists: number;
    win: boolean;
    kda: number;
  };
  team: {
    id: string;
    name: string;
    color: string;
  };
}

// ─── Queue Tabs ──────────────────────────────────────

export interface QueueTab {
  key: string;
  label: string;
  queueId?: number;
}

export const QUEUE_TABS: QueueTab[] = [
  { key: "all", label: "전체" },
  { key: "solo", label: "솔로 랭크", queueId: 420 },
  { key: "flex", label: "자유 랭크", queueId: 440 },
  { key: "normal", label: "일반 게임", queueId: 400 },
  { key: "aram", label: "칼바람 나락", queueId: 450 },
];

// ─── Helper Functions ────────────────────────────────

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";

export function getChampionIcon(championName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${championName}.png`;
}

export function getProfileIconUrl(iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${iconId}.png`;
}

export function getTierImage(tier?: string): string | null {
  if (!tier) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/${tier.toLowerCase()}.png`;
}

export function getItemIcon(itemId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${itemId}.png`;
}

export function getQueueTypeName(queueId: number): string {
  const queueTypes: Record<number, string> = {
    420: "솔로 랭크",
    440: "자유 랭크",
    450: "칼바람 나락",
    400: "일반 게임",
    430: "일반 게임",
    900: "URF",
    1020: "단일 챔피언",
    1700: "아레나",
  };
  return queueTypes[queueId] || "기타 게임";
}

export function getSummonerSpellName(spellId: number): string {
  const spellMap: Record<number, string> = {
    1: "Boost",
    3: "Exhaust",
    4: "Flash",
    6: "Haste",
    7: "Heal",
    11: "Smite",
    12: "Teleport",
    13: "Mana",
    14: "Dot",
    21: "Barrier",
    30: "PoroRecall",
    31: "PoroThrow",
    32: "Mark",
    39: "UltBook",
    54: "Summoner_UltBookSmitePlaceholder",
    55: "Summoner_UltBookFlashPlaceholder",
  };
  return spellMap[spellId] || "Flash";
}

export function calculateTimeAgo(timestamp: number): string {
  const now = Date.now();
  const hoursAgo = Math.floor((now - timestamp) / (1000 * 60 * 60));
  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo > 0) return `${daysAgo}일 전`;
  if (hoursAgo > 0) return `${hoursAgo}시간 전`;
  return "방금 전";
}

export function formatKDA(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}
