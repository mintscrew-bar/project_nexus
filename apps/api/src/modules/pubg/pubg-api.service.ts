import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PubgPlatform } from "@nexus/database";
import { RedisService } from "../redis/redis.service";
import { PubgRateLimiterService } from "./pubg-rate-limiter.service";

const API_BASE = "https://api.pubg.com/shards";

/** 샤드 이름은 API 경로에 그대로 들어간다. */
const SHARD_PATH: Record<PubgPlatform, string> = {
  STEAM: "steam",
  KAKAO: "kakao",
};

/**
 * 닉네임 → 계정 조회 결과를 캐시하는 시간.
 *
 * 10 req/분이 앱 전체 예산이라 같은 닉네임을 반복 조회할 여유가 없다.
 * 계정 ID 는 닉네임을 바꿔도 유지되므로 길게 잡아도 안전하다.
 */
const PLAYER_CACHE_TTL_SEC = 6 * 60 * 60;
/** 못 찾은 닉네임도 캐시한다. 오타를 계속 두드려 예산을 태우는 걸 막는다. */
const PLAYER_MISS_CACHE_TTL_SEC = 10 * 60;
/**
 * 현재 시즌 ID 캐시.
 *
 * 시즌은 몇 달에 한 번 바뀌는데 조회는 1콜을 그대로 먹는다.
 * 랭크를 볼 때마다 시즌 목록을 다시 받으면 예산의 절반이 여기로 샌다.
 */
const SEASON_CACHE_TTL_SEC = 12 * 60 * 60;
/** 랭크 스냅샷 캐시. 랭크는 자주 바뀌지 않고, 프로필을 열 때마다 조회할 수 없다. */
const RANKED_CACHE_TTL_SEC = 60 * 60;

/** 공식 PUBG 랭크 한 줄. NEXUS 편성 등급과는 다른 값이다. */
export interface PubgRankedSnapshot {
  seasonId: string;
  /** 어떤 모드 기준인지 (squad / squad-fpp …). 모드가 다르면 티어도 다르다. */
  mode: string;
  tier: string | null;
  subTier: string | null;
  rankPoint: number | null;
  roundsPlayed: number;
}

export interface PubgPlayerLookup {
  /** `account.xxx` — 닉네임이 바뀌어도 유지되는 고유 ID */
  playerId: string;
  /** API 가 돌려준 표기 그대로의 닉네임 (대소문자 포함) */
  playerName: string;
  /**
   * 매치 기록이 나온 샤드. 닉네임 조회 자체는 샤드와 무관해서
   * 두 샤드에서 같은 계정 ID 가 나오지만, 매치는 한쪽에서만 나온다(Task 1 실측).
   * 최근 매치가 없는 계정은 null 이다 — 미확인이지 오류가 아니다.
   */
  matchShard: PubgPlatform | null;
  /** 조회 시점의 최근 매치 ID (최신순). 보존 기간은 2주다. */
  recentMatchIds: string[];
}

/**
 * PUBG 공개 API 클라이언트.
 *
 * 두 가지만 한다 — 닉네임으로 계정을 찾고, 매치 상세를 받는다.
 * 예산(10 req/분)은 `PubgRateLimiterService` 가 전역으로 관리한다.
 */
@Injectable()
export class PubgApiService {
  private readonly logger = new Logger(PubgApiService.name);
  private readonly apiKey?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly rateLimiter: PubgRateLimiterService,
  ) {
    this.apiKey = this.configService.get<string>("PUBG_API_KEY");
    if (!this.apiKey) {
      // 키 없이도 앱은 떠야 한다. 조회를 시도할 때 비로소 막힌다.
      this.logger.warn(
        "PUBG_API_KEY 가 없습니다. PUBG 계정 조회가 비활성 상태입니다.",
      );
    }
  }

  /** 키가 없으면 PUBG 조회 기능 전체가 꺼진 상태다. */
  get isEnabled(): boolean {
    return !!this.apiKey;
  }

  /**
   * 닉네임으로 계정을 찾고, 매치가 나오는 샤드까지 확정한다.
   *
   * 사용자에게 스팀/카카오를 묻지 않는다(Task 1 실측 — 닉네임 조회는 샤드 무관).
   * steam 을 먼저 보고 매치가 없으면 kakao 를 본다. 최대 2콜.
   */
  async lookupPlayer(nickname: string): Promise<PubgPlayerLookup | null> {
    const trimmed = nickname.trim();
    if (!trimmed) return null;

    const cacheKey = `pubg:player:${trimmed.toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      // 못 찾음도 캐시한다. 빈 문자열이 그 표시다.
      return cached === "" ? null : (JSON.parse(cached) as PubgPlayerLookup);
    }

    let firstHit: PubgPlayerLookup | null = null;

    for (const platform of [PubgPlatform.STEAM, PubgPlatform.KAKAO] as const) {
      const player = await this.fetchPlayerOnShard(trimmed, platform);
      if (!player) continue;

      // 매치가 나오는 샤드를 찾으면 거기서 끝낸다.
      if (player.recentMatchIds.length > 0) {
        await this.redis.set(
          cacheKey,
          JSON.stringify(player),
          PLAYER_CACHE_TTL_SEC,
        );
        return player;
      }
      // 계정은 있는데 매치가 없다 — 다른 샤드도 본다.
      if (!firstHit) firstHit = { ...player, matchShard: null };
    }

    if (firstHit) {
      await this.redis.set(
        cacheKey,
        JSON.stringify(firstHit),
        PLAYER_CACHE_TTL_SEC,
      );
      return firstHit;
    }

    await this.redis.set(cacheKey, "", PLAYER_MISS_CACHE_TTL_SEC);
    return null;
  }

  private async fetchPlayerOnShard(
    nickname: string,
    platform: PubgPlatform,
  ): Promise<PubgPlayerLookup | null> {
    const url =
      `${API_BASE}/${SHARD_PATH[platform]}/players` +
      `?filter[playerNames]=${encodeURIComponent(nickname)}`;

    const body = await this.request<{
      data?: {
        id: string;
        attributes?: { name?: string };
        relationships?: { matches?: { data?: { id: string }[] } };
      }[];
    }>(url, { allowNotFound: true });

    const player = body?.data?.[0];
    if (!player) return null;

    return {
      playerId: player.id,
      playerName: player.attributes?.name ?? nickname,
      matchShard: platform,
      recentMatchIds: (player.relationships?.matches?.data ?? []).map(
        (m) => m.id,
      ),
    };
  }

  /**
   * 계정 ID 로 최근 매치 목록만 받는다.
   *
   * 닉네임 조회(`lookupPlayer`)와 달리 계정 ID 를 이미 알고 있을 때 쓴다.
   * 라운드 결과를 찾을 때마다 닉네임으로 다시 훑으면 샤드 탐색까지 딸려와
   * 예산을 두 배로 쓴다.
   */
  async getPlayerMatchIds(
    platform: PubgPlatform,
    playerId: string,
    background = true,
  ): Promise<string[]> {
    const url = `${API_BASE}/${SHARD_PATH[platform]}/players/${encodeURIComponent(playerId)}`;
    const body = await this.request<{
      data?: { relationships?: { matches?: { data?: { id: string }[] } } };
    }>(url, { allowNotFound: true, background });
    if (!body?.data) throw new ServiceUnavailableException("참가자의 경기 목록을 받지 못했습니다.");
    return (body.data.relationships?.matches?.data ?? []).map((m) => m.id);
  }

  /**
   * 현재 시즌의 공식 랭크.
   *
   * 시즌 조회 1콜 + 랭크 조회 1콜이라 캐시가 없으면 프로필 한 번에 2콜을 쓴다.
   * 랭크가 없는 계정(배치 미완)은 null 이며, 이는 오류가 아니다.
   */
  async getRankedStats(
    platform: PubgPlatform,
    playerId: string,
  ): Promise<PubgRankedSnapshot | null> {
    const seasonId = await this.getCurrentSeasonId(platform);
    if (!seasonId) return null;

    const cacheKey = `pubg:ranked:${SHARD_PATH[platform]}:${playerId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached === "" ? null : (JSON.parse(cached) as PubgRankedSnapshot);
    }

    const url =
      `${API_BASE}/${SHARD_PATH[platform]}/players/${encodeURIComponent(playerId)}` +
      `/seasons/${encodeURIComponent(seasonId)}/ranked`;
    const body = await this.request<{
      data?: {
        attributes?: {
          rankedGameModeStats?: Record<
            string,
            {
              currentTier?: { tier?: string; subTier?: string };
              currentRankPoint?: number;
              roundsPlayed?: number;
            }
          >;
        };
      };
    }>(url, { allowNotFound: true });

    const modes = body?.data?.attributes?.rankedGameModeStats ?? {};
    // 스쿼드가 배그 내전의 기준 모드다. 없으면 판수가 가장 많은 모드를 쓴다.
    const entries = Object.entries(modes).filter(
      ([, stats]) => (stats?.roundsPlayed ?? 0) > 0,
    );
    if (entries.length === 0) {
      await this.redis.set(cacheKey, "", RANKED_CACHE_TTL_SEC);
      return null;
    }
    const picked =
      entries.find(([mode]) => mode.startsWith("squad")) ??
      entries.sort(
        (a, b) => (b[1].roundsPlayed ?? 0) - (a[1].roundsPlayed ?? 0),
      )[0];

    const [mode, stats] = picked;
    const snapshot: PubgRankedSnapshot = {
      seasonId,
      mode,
      tier: stats.currentTier?.tier ?? null,
      subTier: stats.currentTier?.subTier ?? null,
      rankPoint: stats.currentRankPoint ?? null,
      roundsPlayed: stats.roundsPlayed ?? 0,
    };
    await this.redis.set(
      cacheKey,
      JSON.stringify(snapshot),
      RANKED_CACHE_TTL_SEC,
    );
    return snapshot;
  }

  /** 현재 시즌 ID. 시즌 목록은 몇 달에 한 번만 바뀌므로 길게 캐시한다. */
  private async getCurrentSeasonId(
    platform: PubgPlatform,
  ): Promise<string | null> {
    const cacheKey = `pubg:season:${SHARD_PATH[platform]}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached || null;

    const body = await this.request<{
      data?: { id: string; attributes?: { isCurrentSeason?: boolean } }[];
    }>(`${API_BASE}/${SHARD_PATH[platform]}/seasons`, { allowNotFound: true });

    const current = body?.data?.find(
      (season) => season.attributes?.isCurrentSeason,
    );
    await this.redis.set(cacheKey, current?.id ?? "", SEASON_CACHE_TTL_SEC);
    return current?.id ?? null;
  }

  /**
   * 매치 상세. 한 건에 전 팀·전원의 순위와 킬이 들어 있어 인원수와 무관하게 1콜이다.
   * 응답 구조는 실측으로 확인했다(Task 2).
   */
  async getMatch(
    platform: PubgPlatform,
    matchId: string,
  ): Promise<PubgMatchDetail | null> {
    const url = `${API_BASE}/${SHARD_PATH[platform]}/matches/${encodeURIComponent(matchId)}`;
    const body = await this.request<PubgMatchResponse>(url, {
      allowNotFound: true,
      background: true,
    });
    if (!body?.data) return null;
    return parseMatch(body);
  }

  private async request<T>(
    url: string,
    options: { allowNotFound?: boolean; background?: boolean } = {},
  ): Promise<T | null> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        "PUBG 연동이 아직 설정되지 않았습니다.",
      );
    }

    if (options.background) {
      const ok = await this.rateLimiter.acquireWaiting();
      if (!ok) {
        this.logger.warn(`PUBG 예산 대기 초과로 요청 포기: ${url}`);
        return null;
      }
    } else {
      await this.rateLimiter.acquireInteractive();
    }

    let res: Response;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/vnd.api+json",
        },
      });
    } catch (error) {
      this.logger.error(`PUBG API 요청 실패: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        "PUBG API에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    if (res.status === 404 && options.allowNotFound) return null;

    if (res.status === 429) {
      // 전역 캡을 통과했는데도 429 면 캡이 실제 한도보다 헐겁다는 뜻이다.
      this.logger.warn("PUBG API 429 — 전역 캡 설정을 낮춰야 할 수 있습니다.");
      throw new HttpException(
        "PUBG API 호출이 몰려 있습니다. 잠시 후 다시 시도해주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (res.status === 401) {
      this.logger.error("PUBG API 키가 거부되었습니다(401).");
      throw new ServiceUnavailableException(
        "PUBG 연동 설정에 문제가 있습니다. 관리자에게 문의해주세요.",
      );
    }

    if (!res.ok) {
      this.logger.error(`PUBG API ${res.status}: ${url}`);
      throw new ServiceUnavailableException(
        "PUBG API 응답을 처리하지 못했습니다.",
      );
    }

    return (await res.json()) as T;
  }
}

/** 매치 한 건에서 뽑아낸 팀 성적 */
export interface PubgMatchTeamResult {
  /** 로스터 ID. 팀을 식별하는 값이지만 매치마다 새로 생긴다. */
  rosterId: string;
  /** 팀 순위 (1위가 우승) */
  placement: number;
  /** 팀 합산 킬 */
  kills: number;
  /**
   * 죽은 팀원 수.
   *
   * `deathType` 이 `alive` 가 아닌 인원을 센다. 킬내기는 사망이 감점이라
   * 이 값이 점수에 직접 들어간다.
   */
  deaths: number;
  /** 실제 참가자 닉네임. 로스터 인원이 팀 정원과 다를 수 있다(Task 1 주의). */
  playerNames: string[];
  playerIds: string[];
  damage: number;
}

export interface PubgMatchDetail {
  matchId: string;
  createdAt: string;
  gameMode: string;
  mapName: string;
  isCustomMatch: boolean;
  teams: PubgMatchTeamResult[];
}

interface PubgMatchResponse {
  data?: {
    id: string;
    attributes?: {
      createdAt?: string;
      gameMode?: string;
      mapName?: string;
      isCustomMatch?: boolean;
    };
  };
  included?: {
    id: string;
    type: string;
    attributes?: {
      stats?: {
        rank?: number;
        name?: string;
        playerId?: string;
        damageDealt?: number;
        kills?: number;
        /** `alive` 면 생존, 그 외("byplayer"·"suicide"·"logout")는 사망 */
        deathType?: string;
      };
    };
    relationships?: { participants?: { data?: { id: string }[] } };
  }[];
}

/**
 * 매치 응답을 팀별 성적으로 접는다.
 *
 * `included` 안에 roster(팀)와 participant(개인)가 섞여 오고,
 * roster 가 자기 participant 를 참조한다.
 */
function parseMatch(body: PubgMatchResponse): PubgMatchDetail {
  const included = body.included ?? [];
  const participants = new Map(
    included
      .filter((x) => x.type === "participant")
      .map((p) => [p.id, p.attributes?.stats]),
  );

  const teams: PubgMatchTeamResult[] = included
    .filter((x) => x.type === "roster")
    .map((roster) => {
      const members = (roster.relationships?.participants?.data ?? [])
        .map((ref) => participants.get(ref.id))
        .filter((s): s is NonNullable<typeof s> => !!s);

      return {
        rosterId: roster.id,
        placement: roster.attributes?.stats?.rank ?? 0,
        // 로스터 인원수를 가정하지 않는다. 3인 로스터도 관측됐다(Task 1).
        kills: members.reduce((sum, s) => sum + (s.kills ?? 0), 0),
        // `deathType` 이 없으면 판단할 수 없으므로 사망으로 세지 않는다.
        // 없는 정보를 감점으로 바꾸면 점수가 조용히 깎인다.
        deaths: members.filter((s) => s.deathType && s.deathType !== "alive")
          .length,
        playerNames: members.map((s) => s.name ?? "").filter(Boolean),
        playerIds: members.map((s) => s.playerId ?? "").filter(Boolean),
        damage: members.reduce((sum, s) => sum + (s.damageDealt ?? 0), 0),
      };
    })
    .sort((a, b) => a.placement - b.placement);

  return {
    matchId: body.data?.id ?? "",
    createdAt: body.data?.attributes?.createdAt ?? "",
    gameMode: body.data?.attributes?.gameMode ?? "",
    mapName: body.data?.attributes?.mapName ?? "",
    isCustomMatch: body.data?.attributes?.isCustomMatch ?? false,
    teams,
  };
}
