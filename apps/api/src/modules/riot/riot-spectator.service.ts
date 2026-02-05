import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

// Spectator-V5 API Response Types
export interface CurrentGameParticipant {
  puuid: string;
  championId: number;
  teamId: number;
  spell1Id: number;
  spell2Id: number;
  bot: boolean;
  summonerName?: string;
  riotId?: string;
}

export interface CurrentGameInfo {
  gameId: number;
  gameType: string;
  gameStartTime: number; // epoch milliseconds
  mapId: number;
  gameLength: number; // seconds
  platformId: string;
  gameMode: string;
  bannedChampions: {
    championId: number;
    teamId: number;
    pickTurn: number;
  }[];
  gameQueueConfigId: number;
  participants: CurrentGameParticipant[];
}

export interface LiveGameStatus {
  isLive: boolean;
  gameInfo?: CurrentGameInfo;
  gameLength?: number; // in seconds
  participants?: {
    puuid: string;
    championId: number;
    teamId: number;
    summonerName?: string;
  }[];
  gameStartTime?: number;
}

@Injectable()
export class RiotSpectatorService {
  private readonly logger = new Logger(RiotSpectatorService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get("RIOT_API_KEY") || "";
    const region = this.configService.get("RIOT_REGION") || "kr";
    this.baseUrl = `https://${region}.api.riotgames.com`;

    if (!this.apiKey) {
      this.logger.warn("RIOT_API_KEY not configured");
    }
  }

  /**
   * Get active game by summoner PUUID
   */
  async getActiveGameByPUUID(puuid: string): Promise<CurrentGameInfo | null> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return null;
    }

    try {
      const url = `${this.baseUrl}/lol/spectator/v5/active-games/by-summoner/${puuid}`;

      this.logger.log(`Fetching active game for PUUID: ${puuid}`);

      const response = await axios.get<CurrentGameInfo>(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // No game in progress - this is normal
        this.logger.debug(`No active game for PUUID: ${puuid}`);
        return null;
      }

      if (error.response?.status === 429) {
        this.logger.error("Rate limit exceeded");
        throw new Error("Riot API rate limit exceeded");
      }

      this.logger.error(
        `Error fetching active game for ${puuid}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Check if any of the participants are in an active game
   * Returns the first active game found
   */
  async findActiveGameByPUUIDs(
    puuids: string[]
  ): Promise<LiveGameStatus> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return { isLive: false };
    }

    // Try each PUUID until we find an active game
    for (const puuid of puuids) {
      try {
        const gameInfo = await this.getActiveGameByPUUID(puuid);

        if (gameInfo) {
          // Found an active game
          return {
            isLive: true,
            gameInfo,
            gameLength: gameInfo.gameLength,
            gameStartTime: gameInfo.gameStartTime,
            participants: gameInfo.participants.map((p) => ({
              puuid: p.puuid,
              championId: p.championId,
              teamId: p.teamId,
              summonerName: p.summonerName,
            })),
          };
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`Error checking PUUID ${puuid}:`, error);
        // Continue to next PUUID
      }
    }

    // No active game found
    return { isLive: false };
  }

  /**
   * Format game length to MM:SS
   */
  formatGameLength(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Get game mode display name
   */
  getGameModeDisplayName(gameMode: string): string {
    const modeMap: Record<string, string> = {
      CLASSIC: "소환사의 협곡",
      ARAM: "칼바람 나락",
      TUTORIAL: "튜토리얼",
      URF: "우르프 모드",
      DOOMBOTSTEEMO: "둠봇",
      ONEFORALL: "단일 챔피언",
      ASCENSION: "승천",
      FIRSTBLOOD: "스노우다운",
      KINGPORO: "포로왕",
      SIEGE: "넥서스 공성전",
      ASSASSINATE: "암살",
      ARSR: "무한의 대결",
      DARKSTAR: "다크 스타",
      STARGUARDIAN: "별 수호자",
      PROJECT: "프로젝트",
      GAMEMODEX: "넥서스 블리츠",
      ODYSSEY: "오디세이",
      NEXUSBLITZ: "넥서스 블리츠",
      ULTBOOK: "궁극기 주문서",
    };

    return modeMap[gameMode] || gameMode;
  }
}
