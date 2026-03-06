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
  lp?: number;           // 백엔드가 'lp' 필드로 반환 (이전: leaguePoints → 수정)
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
    damage?: number;  // 내전 딜량 — 백엔드 totalDamageDealtToChampions (#23)
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
  { key: "custom", label: "내전", queueId: 0 },
];

// ─── Helper Functions ────────────────────────────────

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";

export function getChampionIcon(championName: string): string {
  return `/icons/champions/${championName}.png`;
}

const CHAMPION_ID_TO_KEY: Record<number, string> = {
  1: "Annie", 2: "Olaf", 3: "Galio", 4: "TwistedFate", 5: "XinZhao",
  6: "Urgot", 7: "Leblanc", 8: "Vladimir", 9: "Fiddlesticks", 10: "Kayle",
  11: "MasterYi", 12: "Alistar", 13: "Ryze", 14: "Sion", 15: "Sivir",
  16: "Soraka", 17: "Teemo", 18: "Tristana", 19: "Warwick", 20: "Nunu",
  21: "MissFortune", 22: "Ashe", 23: "Tryndamere", 24: "Jax", 25: "Morgana",
  26: "Zilean", 27: "Singed", 28: "Evelynn", 29: "Twitch", 30: "Karthus",
  31: "Chogath", 32: "Amumu", 33: "Rammus", 34: "Anivia", 35: "Shaco",
  36: "DrMundo", 37: "Sona", 38: "Kassadin", 39: "Irelia", 40: "Janna",
  41: "Gangplank", 42: "Corki", 43: "Karma", 44: "Taric", 45: "Veigar",
  48: "Trundle", 50: "Swain", 51: "Caitlyn", 53: "Blitzcrank", 54: "Malphite",
  55: "Katarina", 56: "Nocturne", 57: "Maokai", 58: "Renekton", 59: "JarvanIV",
  60: "Elise", 61: "Orianna", 62: "MonkeyKing", 63: "Brand", 64: "LeeSin",
  67: "Vayne", 68: "Rumble", 69: "Cassiopeia", 72: "Skarner", 74: "Heimerdinger",
  75: "Nasus", 76: "Nidalee", 77: "Udyr", 78: "Poppy", 79: "Gragas",
  80: "Pantheon", 81: "Ezreal", 82: "Mordekaiser", 83: "Yorick", 84: "Akali",
  85: "Kennen", 86: "Garen", 89: "Leona", 90: "Malzahar", 91: "Talon",
  92: "Riven", 96: "KogMaw", 98: "Shen", 99: "Lux", 101: "Xerath",
  102: "Shyvana", 103: "Ahri", 104: "Graves", 105: "Fizz", 106: "Volibear",
  107: "Rengar", 110: "Varus", 111: "Nautilus", 112: "Viktor", 113: "Sejuani",
  114: "Fiora", 115: "Ziggs", 117: "Lulu", 119: "Draven", 120: "Hecarim",
  121: "Khazix", 122: "Darius", 126: "Jayce", 127: "Lissandra", 131: "Diana",
  133: "Quinn", 134: "Syndra", 136: "AurelionSol", 141: "Kayn", 142: "Zoe",
  143: "Zyra", 145: "Kaisa", 147: "Seraphine", 150: "Gnar", 154: "Zac",
  157: "Yasuo", 161: "Velkoz", 163: "Taliyah", 164: "Camille", 166: "Akshan",
  200: "Belveth", 201: "Braum", 202: "Jhin", 203: "Kindred", 221: "Zeri",
  222: "Jinx", 223: "TahmKench", 233: "Briar", 234: "Viego", 235: "Senna",
  236: "Lucian", 238: "Zed", 240: "Kled", 245: "Ekko", 246: "Qiyana",
  254: "Vi", 266: "Aatrox", 267: "Nami", 268: "Azir", 350: "Yuumi",
  360: "Samira", 412: "Thresh", 420: "Illaoi", 421: "RekSai", 427: "Ivern",
  429: "Kalista", 432: "Bard", 497: "Rakan", 498: "Xayah", 516: "Ornn",
  517: "Sylas", 518: "Neeko", 523: "Aphelios", 526: "Rell", 555: "Pyke",
  711: "Vex", 777: "Yone", 799: "Ambessa", 800: "Mel", 804: "Yunara",
  875: "Sett", 876: "Lillia", 887: "Gwen", 888: "Renata", 893: "Aurora",
  895: "Nilah", 897: "KSante", 901: "Smolder", 902: "Milio", 904: "Zaahen",
  910: "Hwei", 950: "Naafiri",
};

export function getChampionIconById(championId: number): string {
  const key = CHAMPION_ID_TO_KEY[championId];
  if (key) return `/icons/champions/${key}.png`;
  return `/icons/champions/${championId}.png`;
}

export function getProfileIconUrl(iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${iconId}.png`;
}

export function getTierImage(tier?: string): string | null {
  if (!tier) return null;
  return `/icons/tiers/${tier.toLowerCase()}.png`;
}

export function getItemIcon(itemId: number): string {
  return `/icons/items/${itemId}.png`;
}

export function getQueueTypeName(queueId: number): string {
  const queueTypes: Record<number, string> = {
    0: "내전",
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

export function getSummonerSpellIcon(spellId: number): string {
  const spellMap: Record<number, string> = {
    1: "SummonerBoost",
    3: "SummonerExhaust",
    4: "SummonerFlash",
    6: "SummonerHaste",
    7: "SummonerHeal",
    11: "SummonerSmite",
    12: "SummonerTeleport",
    13: "SummonerMana",
    14: "SummonerDot",
    21: "SummonerBarrier",
    30: "SummonerPoroRecall",
    31: "SummonerPoroThrow",
    32: "SummonerSnowball",
    39: "SummonerUltBookSmitePlaceholder",
  };
  const spellName = spellMap[spellId] || "SummonerFlash";
  return `/icons/spells/${spellName}.png`;
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
