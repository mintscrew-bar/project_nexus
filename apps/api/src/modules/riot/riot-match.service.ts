import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

// Riot Match-V5 API Response Types
export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[]; // puuids
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp: number;
    gameId: number;
    gameMode: string;
    gameName: string;
    gameStartTimestamp: number;
    gameType: string;
    gameVersion: string;
    mapId: number;
    platformId: string;
    queueId: number;
    tournamentCode?: string;
    participants: ParticipantDto[];
    teams: TeamDto[];
  };
}

export interface ParticipantDto {
  puuid: string;
  participantId: number;
  teamId: number;
  championId: number;
  championName: string;
  teamPosition: string;

  // Summoner Spells
  summoner1Id: number;
  summoner2Id: number;

  // KDA
  kills: number;
  deaths: number;
  assists: number;

  // Farm & Gold
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  goldSpent: number;

  // Damage
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  totalHeal: number;
  damageSelfMitigated: number;

  // Vision
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  detectorWardsPlaced: number;

  // Items
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;

  // Perks
  perks: {
    statPerks: {
      defense: number;
      flex: number;
      offense: number;
    };
    styles: {
      description: string;
      selections: {
        perk: number;
        var1: number;
        var2: number;
        var3: number;
      }[];
      style: number;
    }[];
  };

  // Stats
  champLevel: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  totalTimeSpentDead: number;

  // Objectives
  turretKills: number;
  inhibitorKills: number;
  dragonKills: number;
  baronKills: number;

  // Performance
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  firstBloodKill: boolean;
  firstTowerKill: boolean;

  // Result
  win: boolean;
}

export interface TeamDto {
  teamId: number;
  win: boolean;
  bans: {
    championId: number;
    pickTurn: number;
  }[];
  objectives: {
    baron: { first: boolean; kills: number };
    champion: { first: boolean; kills: number };
    dragon: { first: boolean; kills: number };
    inhibitor: { first: boolean; kills: number };
    riftHerald: { first: boolean; kills: number };
    tower: { first: boolean; kills: number };
  };
}

@Injectable()
export class RiotMatchService {
  private readonly logger = new Logger(RiotMatchService.name);
  private readonly apiKey: string;
  private readonly baseUrl = "https://asia.api.riotgames.com";

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get("RIOT_API_KEY") || "";
    if (!this.apiKey) {
      this.logger.warn("RIOT_API_KEY not configured");
    }
  }

  /**
   * Get match data by match ID
   */
  async getMatchById(matchId: string): Promise<MatchDto | null> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return null;
    }

    try {
      const url = `${this.baseUrl}/lol/match/v5/matches/${matchId}`;

      this.logger.log(`Fetching match data: ${matchId}`);

      const response = await axios.get<MatchDto>(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`Match not found: ${matchId}`);
        return null;
      }

      if (error.response?.status === 429) {
        this.logger.error("Rate limit exceeded");
        throw new Error("Riot API rate limit exceeded");
      }

      this.logger.error(`Error fetching match ${matchId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get matches by tournament code
   */
  async getMatchIdsByTournamentCode(
    tournamentCode: string
  ): Promise<string[]> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return [];
    }

    try {
      const url = `${this.baseUrl}/lol/match/v5/matches/by-tournament-code/${tournamentCode}/ids`;

      this.logger.log(`Fetching matches for tournament code: ${tournamentCode}`);

      const response = await axios.get<string[]>(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`No matches found for tournament code: ${tournamentCode}`);
        return [];
      }

      this.logger.error(
        `Error fetching matches for tournament code ${tournamentCode}:`,
        error.message
      );
      return [];
    }
  }

  /**
   * Get match timeline (detailed events)
   */
  async getMatchTimeline(matchId: string): Promise<any> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return null;
    }

    try {
      const url = `${this.baseUrl}/lol/match/v5/matches/${matchId}/timeline`;

      this.logger.log(`Fetching match timeline: ${matchId}`);

      const response = await axios.get(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`Match timeline not found: ${matchId}`);
        return null;
      }

      this.logger.error(
        `Error fetching match timeline ${matchId}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Check if match exists and is completed
   */
  async isMatchCompleted(matchId: string): Promise<boolean> {
    const match = await this.getMatchById(matchId);
    return match !== null && match.info.gameEndTimestamp > 0;
  }

  /**
   * Wait for match to be available in Riot API
   * Riot API can take a few minutes to process match data after game ends
   */
  async waitForMatchData(
    matchId: string,
    maxAttempts: number = 10,
    delayMs: number = 30000
  ): Promise<MatchDto | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.log(
        `Attempt ${attempt}/${maxAttempts} to fetch match ${matchId}`
      );

      const match = await this.getMatchById(matchId);
      if (match) {
        return match;
      }

      if (attempt < maxAttempts) {
        this.logger.log(`Waiting ${delayMs}ms before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.logger.error(`Failed to fetch match ${matchId} after ${maxAttempts} attempts`);
    return null;
  }

  /**
   * Get match IDs for a player by PUUID
   * @param puuid - Player's PUUID
   * @param start - Starting index (default: 0)
   * @param count - Number of match IDs to return (default: 20, max: 100)
   * @param queueId - Filter by queue ID (optional)
   * @param type - Filter by match type: ranked, normal, tourney, tutorial (optional)
   * @returns Array of match IDs
   */
  async getMatchIdsByPuuid(
    puuid: string,
    start: number = 0,
    count: number = 20,
    queueId?: number,
    type?: string
  ): Promise<string[]> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return [];
    }

    try {
      const params = new URLSearchParams({
        start: start.toString(),
        count: Math.min(count, 100).toString(), // Max 100 per request
      });

      if (queueId !== undefined) {
        params.append("queue", queueId.toString());
      }

      if (type) {
        params.append("type", type);
      }

      const url = `${this.baseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`;

      this.logger.log(`Fetching match IDs for PUUID: ${puuid}`);

      const response = await axios.get<string[]>(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`No matches found for PUUID: ${puuid}`);
        return [];
      }

      if (error.response?.status === 429) {
        this.logger.error("Rate limit exceeded");
        throw new Error("Riot API rate limit exceeded");
      }

      this.logger.error(
        `Error fetching match IDs for PUUID ${puuid}:`,
        error.message
      );
      return [];
    }
  }

  /**
   * Get detailed match history for a player
   * @param puuid - Player's PUUID
   * @param count - Number of matches to fetch (default: 20)
   * @param queueId - Filter by queue ID (optional)
   * @returns Array of detailed match data
   */
  async getMatchHistoryByPuuid(
    puuid: string,
    count: number = 20,
    queueId?: number
  ): Promise<MatchDto[]> {
    const matchIds = await this.getMatchIdsByPuuid(puuid, 0, count, queueId);

    if (matchIds.length === 0) {
      return [];
    }

    // Fetch detailed data for each match with rate limiting
    // Process in batches of 10 to avoid rate limits
    const matches: MatchDto[] = [];
    const batchSize = 10;

    for (let i = 0; i < matchIds.length; i += batchSize) {
      const batch = matchIds.slice(i, i + batchSize);
      const batchPromises = batch.map((matchId) => this.getMatchById(matchId));
      const batchResults = await Promise.all(batchPromises);

      // Add non-null results
      matches.push(...batchResults.filter((match): match is MatchDto => match !== null));

      // Add delay between batches (1.2 seconds to stay under rate limit)
      if (i + batchSize < matchIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }

    return matches;
  }
}
