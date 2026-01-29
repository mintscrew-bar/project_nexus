import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../redis/redis.service";
import axios from "axios";

/**
 * Riot Data Dragon Service
 *
 * Data Dragon은 Riot Games가 제공하는 정적 데이터 CDN입니다.
 * 챔피언, 아이템, 스펠 등의 이미지와 메타데이터를 제공합니다.
 *
 * API 키가 필요 없으며, Rate Limit도 없습니다.
 *
 * 참고: https://ddragon.leagueoflegends.com/
 */

// DataDragon versions API returns an array of version strings (e.g., ["14.1.1", "14.1.0", ...])
type DataDragonVersions = string[];

export interface ChampionData {
  data: Record<
    string,
    {
      id: string;
      key: string;
      name: string;
      title: string;
      image: {
        full: string;
        sprite: string;
        group: string;
        x: number;
        y: number;
        w: number;
        h: number;
      };
    }
  >;
}

export interface ItemStats {
  FlatHPPoolMod?: number; // 체력
  FlatMPPoolMod?: number; // 마나
  FlatPhysicalDamageMod?: number; // 공격력
  FlatMagicDamageMod?: number; // 주문력
  FlatArmorMod?: number; // 방어력
  FlatSpellBlockMod?: number; // 마법저항력
  PercentAttackSpeedMod?: number; // 공격속도
  FlatCritChanceMod?: number; // 치명타확률
  FlatMovementSpeedMod?: number; // 이동속도(고정)
  PercentMovementSpeedMod?: number; // 이동속도(%)
  PercentLifeStealMod?: number; // 생명력흡수
  FlatHPRegenMod?: number; // 체력재생
  FlatMPRegenMod?: number; // 마나재생
}

export interface ItemInfo {
  name: string;
  description: string; // HTML 포함된 설명 (효과 포함)
  plaintext?: string; // 간단한 설명
  colloq?: string; // 검색용 별칭
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
  gold: {
    base: number;
    total: number;
    sell: number;
    purchasable: boolean;
  };
  stats: ItemStats;
  tags?: string[]; // 아이템 태그 (Damage, Health, Armor 등)
  into?: string[]; // 이 아이템으로 조합되는 상위 아이템
  from?: string[]; // 이 아이템을 만드는 하위 아이템
}

export interface ItemData {
  data: Record<string, ItemInfo>;
}

@Injectable()
export class DataDragonService {
  private readonly logger = new Logger(DataDragonService.name);
  private readonly baseUrl = "https://ddragon.leagueoflegends.com";
  private cachedVersion: string | null = null;
  private readonly cacheTTL = 3600; // 1시간

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 최신 게임 버전 가져오기
   */
  async getLatestVersion(): Promise<string> {
    // Redis 캐시 확인
    const cached = await this.redis.get("ddragon:version");
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get<DataDragonVersions>(
        `${this.baseUrl}/api/versions.json`,
      );
      const version = response.data[0]; // 최신 버전

      // 캐시 저장
      await this.redis.set("ddragon:version", version, this.cacheTTL);
      this.cachedVersion = version;

      return version;
    } catch (error) {
      this.logger.error("Failed to fetch Data Dragon version", error);
      // 폴백: 하드코딩된 최신 버전 (2025년 기준)
      return "16.2.1";
    }
  }

  /**
   * 챔피언 데이터 가져오기
   */
  async getChampionData(locale: string = "ko_KR"): Promise<ChampionData> {
    const version = await this.getLatestVersion();
    const cacheKey = `ddragon:champions:${version}:${locale}`;

    // Redis 캐시 확인
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const response = await axios.get<ChampionData>(
        `${this.baseUrl}/cdn/${version}/data/${locale}/champion.json`,
      );

      // 캐시 저장
      await this.redis.set(
        cacheKey,
        JSON.stringify(response.data),
        this.cacheTTL,
      );

      return response.data;
    } catch (error) {
      this.logger.error("Failed to fetch champion data", error);
      throw error;
    }
  }

  /**
   * 아이템 데이터 가져오기
   */
  async getItemData(locale: string = "ko_KR"): Promise<ItemData> {
    const version = await this.getLatestVersion();
    const cacheKey = `ddragon:items:${version}:${locale}`;

    // Redis 캐시 확인
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const response = await axios.get<ItemData>(
        `${this.baseUrl}/cdn/${version}/data/${locale}/item.json`,
      );

      // 캐시 저장
      await this.redis.set(
        cacheKey,
        JSON.stringify(response.data),
        this.cacheTTL,
      );

      return response.data;
    } catch (error) {
      this.logger.error("Failed to fetch item data", error);
      throw error;
    }
  }

  /**
   * 챔피언 이미지 URL 생성
   * @param championKey 챔피언 키 (예: "Aatrox", "Ahri")
   * @param type 이미지 타입: "square" (아이콘), "splash" (스플래시 아트), "loading" (로딩 화면)
   */
  async getChampionImageUrl(
    championKey: string,
    type: "square" | "splash" | "loading" = "square",
  ): Promise<string> {
    const version = await this.getLatestVersion();

    switch (type) {
      case "square":
        // 정사각형 아이콘 (프로필, 선택 화면)
        return `${this.baseUrl}/cdn/${version}/img/champion/${championKey}.png`;

      case "splash":
        // 스플래시 아트 (고해상도, 배경 이미지용)
        // 기본 스킨은 0번
        return `${this.baseUrl}/cdn/img/champion/splash/${championKey}_0.jpg`;

      case "loading":
        // 로딩 화면 이미지
        return `${this.baseUrl}/cdn/img/champion/loading/${championKey}_0.jpg`;

      default:
        return `${this.baseUrl}/cdn/${version}/img/champion/${championKey}.png`;
    }
  }

  /**
   * 아이템 이미지 URL 생성
   * @param itemId 아이템 ID (예: "1001", "3031")
   */
  async getItemImageUrl(itemId: string): Promise<string> {
    const version = await this.getLatestVersion();
    return `${this.baseUrl}/cdn/${version}/img/item/${itemId}.png`;
  }

  /**
   * 스펠 이미지 URL 생성
   * @param spellKey 스펠 키 (예: "SummonerFlash", "SummonerHeal")
   */
  async getSpellImageUrl(spellKey: string): Promise<string> {
    const version = await this.getLatestVersion();
    return `${this.baseUrl}/cdn/${version}/img/spell/${spellKey}.png`;
  }

  /**
   * 프로필 아이콘 이미지 URL 생성
   * @param iconId 프로필 아이콘 ID
   */
  async getProfileIconUrl(iconId: number): Promise<string> {
    const version = await this.getLatestVersion();
    return `${this.baseUrl}/cdn/${version}/img/profileicon/${iconId}.png`;
  }
}
