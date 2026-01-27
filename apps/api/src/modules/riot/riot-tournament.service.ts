import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../redis/redis.service";
import axios from "axios";

/**
 * Riot Tournament-Stub API Service
 *
 * 개발자용 Tournament API를 사용하여 Tournament Code를 생성합니다.
 *
 * 사용 전 필수 단계:
 * 1. Provider 생성 (앱 시작 시 1회)
 * 2. Tournament 생성 (앱 시작 시 1회)
 * 3. Tournament Code 생성 (매치마다)
 */

@Injectable()
export class RiotTournamentService {
  private readonly logger = new Logger(RiotTournamentService.name);
  private readonly apiKey: string;
  private readonly baseUrl = "https://americas.api.riotgames.com";
  private providerId: string | null = null;
  private tournamentId: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.configService.get("RIOT_API_KEY") || "";
  }

  /**
   * 초기화: 환경변수에서 Provider와 Tournament ID 로드
   * 환경변수에 ID가 설정되어 있어야 함
   */
  async initialize(): Promise<void> {
    const savedProviderId = this.configService.get(
      "RIOT_TOURNAMENT_PROVIDER_ID",
    );
    const savedTournamentId = this.configService.get("RIOT_TOURNAMENT_ID");

    if (!savedProviderId || !savedTournamentId) {
      this.logger.warn(
        "Tournament API not configured. " +
          "Set RIOT_TOURNAMENT_PROVIDER_ID and RIOT_TOURNAMENT_ID to enable Tournament Code feature.",
      );
      return;
    }

    this.providerId = savedProviderId;
    this.tournamentId = savedTournamentId;

    this.logger.log(
      `Tournament initialized with Provider: ${this.providerId}, Tournament: ${this.tournamentId}`,
    );
  }

  /**
   * Provider 생성 (수동 호출용)
   * Riot API 문서에서 직접 실행하거나 이 메서드로 생성 가능
   */
  async createProviderManually(): Promise<{ id: number }> {
    const provider = await this.createProvider();
    this.logger.log(`Created Provider: ${provider.id}`);
    return provider;
  }

  /**
   * Tournament 생성 (수동 호출용)
   * Provider ID가 필요함
   */
  async createTournamentManually(providerId: string): Promise<{ id: number }> {
    const tournament = await this.createTournament(providerId);
    this.logger.log(`Created Tournament: ${tournament.id}`);
    return tournament;
  }

  /**
   * Provider 생성
   *
   * Tournament-Stub-V5 Provider 생성 API
   * 필수 파라미터:
   * - region: 리전 코드 (예: "KR", "NA", "EUW")
   * - url: Webhook URL (토너먼트 이벤트를 받을 URL)
   */
  private async createProvider(): Promise<{ id: number }> {
    const webhookUrl = `${this.configService.get("API_URL") || "http://localhost:4000"}/api/webhooks/riot/tournament`;

    const response = await axios.post(
      `${this.baseUrl}/lol/tournament-stub/v5/providers`,
      {
        region: "KR",
        url: webhookUrl,
      },
      {
        headers: {
          "X-Riot-Token": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    return response.data;
  }

  /**
   * Tournament 생성
   *
   * Tournament-Stub-V5 Tournament 생성 API
   * 필수 파라미터:
   * - name: 토너먼트 이름
   * - providerId: Provider ID (숫자)
   */
  private async createTournament(providerId: string): Promise<{ id: number }> {
    const providerIdNum =
      typeof providerId === "string" ? parseInt(providerId, 10) : providerId;

    if (isNaN(providerIdNum)) {
      throw new BadRequestException(`Invalid providerId: ${providerId}`);
    }

    const response = await axios.post(
      `${this.baseUrl}/lol/tournament-stub/v5/tournaments`,
      {
        name: "Nexus In-House Tournament",
        providerId: providerIdNum,
      },
      {
        headers: {
          "X-Riot-Token": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    return response.data;
  }

  /**
   * Tournament Code 생성
   * 매치 생성 시 호출
   */
  async createTournamentCode(matchId: string): Promise<string> {
    if (!this.tournamentId) {
      // Redis에서 가져오기 시도
      const savedTournamentId = await this.redis.get("riot:tournament_id");
      if (savedTournamentId) {
        this.tournamentId = savedTournamentId;
      } else {
        // 환경변수에서 가져오기
        this.tournamentId =
          this.configService.get("RIOT_TOURNAMENT_ID") || null;
      }

      if (!this.tournamentId) {
        throw new BadRequestException(
          "Tournament not initialized. Please set RIOT_TOURNAMENT_ID or call initialize() first.",
        );
      }
    }

    try {
      const tournamentIdNum =
        typeof this.tournamentId === "string"
          ? parseInt(this.tournamentId, 10)
          : this.tournamentId;

      if (isNaN(tournamentIdNum)) {
        throw new BadRequestException(
          `Invalid tournamentId: ${this.tournamentId}`,
        );
      }

      const response = await axios.post(
        `${this.baseUrl}/lol/tournament-stub/v5/codes`,
        {
          count: 1,
          tournamentId: tournamentIdNum,
          metadata: matchId, // 매치 ID를 메타데이터로 저장
          teamSize: 5,
          pickType: "TOURNAMENT_DRAFT",
          mapType: "SUMMONERS_RIFT",
          spectatorType: "ALL",
        },
        {
          headers: {
            "X-Riot-Token": this.apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      const codes = response.data;
      if (!codes || codes.length === 0) {
        throw new BadRequestException("Failed to create tournament code");
      }

      return codes[0];
    } catch (error: any) {
      this.logger.error(
        "Failed to create tournament code",
        error.response?.data || error.message,
      );
      throw new BadRequestException(
        `Failed to create tournament code: ${error.response?.data?.status?.message || error.message}`,
      );
    }
  }
}
