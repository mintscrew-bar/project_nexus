import { Injectable, Logger } from "@nestjs/common";

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const SUCCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 60 * 1000;

interface DiscordInviteApiResponse {
  guild?: {
    id?: string;
    name?: string;
  };
  approximate_member_count?: number;
  approximate_presence_count?: number;
}

export interface DiscordInviteStats {
  available: boolean;
  guildId?: string;
  guildName?: string;
  memberCount?: number;
  onlineCount?: number;
  checkedAt: string;
}

interface CacheEntry {
  expiresAt: number;
  value: DiscordInviteStats;
}

/**
 * 지원하는 Discord 초대 URL에서 초대 코드를 안전하게 추출한다.
 * 외부 URL 자체를 요청하지 않고 추출된 코드로 Discord API URL을 구성해 SSRF를 방지한다.
 */
export function extractDiscordInviteCode(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    let code: string | undefined;

    if (hostname === "discord.gg" || hostname === "www.discord.gg") {
      code = segments[0];
    } else if (
      hostname === "discord.com" ||
      hostname === "www.discord.com" ||
      hostname === "discordapp.com" ||
      hostname === "www.discordapp.com"
    ) {
      if (segments[0]?.toLowerCase() === "invite") code = segments[1];
    }

    if (!code) return null;
    const decodedCode = decodeURIComponent(code);
    return /^[A-Za-z0-9_-]{2,100}$/.test(decodedCode) ? decodedCode : null;
  } catch {
    return null;
  }
}

@Injectable()
export class DiscordInviteStatsService {
  private readonly logger = new Logger(DiscordInviteStatsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  async getStats(inviteUrl: string): Promise<DiscordInviteStats> {
    const code = extractDiscordInviteCode(inviteUrl);
    if (!code) return this.unavailableStats();

    const cached = this.cache.get(code);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    try {
      const response = await fetch(
        `${DISCORD_API_BASE_URL}/invites/${encodeURIComponent(code)}?with_counts=true`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Discord invite stats request failed: status=${response.status}`,
        );
        return this.cacheResult(
          code,
          this.unavailableStats(),
          FAILURE_CACHE_TTL_MS,
        );
      }

      const data = (await response.json()) as DiscordInviteApiResponse;
      if (
        !Number.isInteger(data.approximate_member_count) ||
        !Number.isInteger(data.approximate_presence_count)
      ) {
        return this.cacheResult(
          code,
          this.unavailableStats(),
          FAILURE_CACHE_TTL_MS,
        );
      }

      return this.cacheResult(
        code,
        {
          available: true,
          guildId: data.guild?.id,
          guildName: data.guild?.name,
          memberCount: data.approximate_member_count,
          onlineCount: data.approximate_presence_count,
          checkedAt: new Date().toISOString(),
        },
        SUCCESS_CACHE_TTL_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Discord invite stats request error: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return this.cacheResult(
        code,
        this.unavailableStats(),
        FAILURE_CACHE_TTL_MS,
      );
    }
  }

  private unavailableStats(): DiscordInviteStats {
    return { available: false, checkedAt: new Date().toISOString() };
  }

  private cacheResult(
    code: string,
    value: DiscordInviteStats,
    ttlMs: number,
  ): DiscordInviteStats {
    this.cache.set(code, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }
}
