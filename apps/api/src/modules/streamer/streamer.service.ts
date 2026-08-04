import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, StreamerPlatform } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { LiveProviderRegistry } from "./providers/live-provider.registry";
import { LiveSnapshot } from "./providers/live-provider.interface";

/** 라이브 상태 캐시 TTL(초). 폴링 주기(60초)보다 살짝 길게 잡아 빈틈을 막는다. */
const LIVE_CACHE_TTL = 90;

/** 라이브 상태 캐시가 이 시간보다 오래되면 화면에서 "모름"으로 취급한다. */
const LIVE_STALE_MS = 5 * 60 * 1000;

export interface StreamerLiveState extends LiveSnapshot {
  checkedAt: string;
}

export interface StreamerListItem {
  userId: string;
  username: string;
  avatar: string | null;
  platform: StreamerPlatform;
  channelUrl: string;
  channelName: string | null;
  channelImageUrl: string | null;
  followerCount: number | null;
  verified: boolean;
  lastLiveAt: Date | null;
  live: StreamerLiveState | null;
  /** 이 스트리머가 지금 호스트로 열어둔 내전 방 */
  activeRoom: { id: string; name: string; status: string } | null;
}

@Injectable()
export class StreamerService {
  private readonly logger = new Logger(StreamerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly providers: LiveProviderRegistry,
  ) {}

  // ── 캐시 ──────────────────────────────────────────────────────────────

  private cacheKey(platform: StreamerPlatform, channelId: string): string {
    return `streamer:live:${platform}:${channelId}`;
  }

  private async readCache(
    platform: StreamerPlatform,
    channelId: string,
  ): Promise<StreamerLiveState | null> {
    try {
      const raw = await this.redis.get(this.cacheKey(platform, channelId));
      if (!raw) return null;

      const parsed = JSON.parse(raw) as StreamerLiveState;
      // 캐시가 너무 오래되면 신뢰하지 않는다(폴링이 멈춘 상황 대비).
      if (Date.now() - new Date(parsed.checkedAt).getTime() > LIVE_STALE_MS) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeCache(
    platform: StreamerPlatform,
    channelId: string,
    snapshot: LiveSnapshot,
  ): Promise<StreamerLiveState> {
    const state: StreamerLiveState = {
      ...snapshot,
      checkedAt: new Date().toISOString(),
    };
    await this.redis.set(
      this.cacheKey(platform, channelId),
      JSON.stringify(state),
      LIVE_CACHE_TTL,
    );
    return state;
  }

  // ── 라이브 조회 ────────────────────────────────────────────────────────

  /**
   * 검증된 채널 하나의 라이브 상태를 가져온다.
   * 캐시가 살아있으면 캐시를, 없으면 플랫폼에 물어보고 캐시에 넣는다.
   * 조회에 실패하면 null(= 모름)이고, 호출부는 뱃지를 감춘다.
   */
  async getLiveState(
    platform: StreamerPlatform,
    channelId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<StreamerLiveState | null> {
    if (!options?.forceRefresh) {
      const cached = await this.readCache(platform, channelId);
      if (cached) return cached;
    }

    const provider = this.providers.get(platform);
    if (!provider) return null;

    const snapshot = await provider.fetchLiveSnapshot(channelId);
    if (!snapshot) return null;

    return this.writeCache(platform, channelId, snapshot);
  }

  /**
   * 여러 채널을 한 번에 조회한다.
   * 캐시 미스만 실제 호출하고, 플랫폼에 부담을 주지 않도록 동시 실행 폭을 제한한다.
   */
  async getLiveStates(
    profiles: Array<{ platform: StreamerPlatform; channelId: string }>,
  ): Promise<Map<string, StreamerLiveState>> {
    const result = new Map<string, StreamerLiveState>();
    const misses: typeof profiles = [];

    for (const profile of profiles) {
      const cached = await this.readCache(profile.platform, profile.channelId);
      if (cached) {
        result.set(`${profile.platform}:${profile.channelId}`, cached);
      } else {
        misses.push(profile);
      }
    }

    // 동시 5개씩 끊어서 처리 — 스트리머가 늘어도 순간 부하가 일정하게 유지된다.
    const concurrency = 5;
    for (let i = 0; i < misses.length; i += concurrency) {
      const chunk = misses.slice(i, i + concurrency);
      const states = await Promise.all(
        chunk.map((profile) =>
          this.getLiveState(profile.platform, profile.channelId),
        ),
      );
      chunk.forEach((profile, index) => {
        const state = states[index];
        if (state) {
          result.set(`${profile.platform}:${profile.channelId}`, state);
        }
      });
    }

    return result;
  }

  // ── 목록 ──────────────────────────────────────────────────────────────

  /**
   * 스트리머 탭용 목록.
   *
   * 라이브 전용 목록이 아니라 "등록된 스트리머 목록"이고, 방송 중인 사람이
   * 위로 올라오는 형태다. 등록자가 적은 초기에도 페이지가 비지 않게 하려는 의도다.
   */
  async listStreamers(): Promise<StreamerListItem[]> {
    const profiles = await this.prisma.streamerProfile.findMany({
      where: { isActive: true, verifiedAt: { not: null } },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: [{ lastLiveAt: "desc" }, { createdAt: "asc" }],
    });

    const withChannel = profiles.filter(
      (profile): profile is typeof profile & { channelId: string } =>
        !!profile.channelId,
    );

    const liveStates = await this.getLiveStates(
      withChannel.map((profile) => ({
        platform: profile.platform,
        channelId: profile.channelId,
      })),
    );

    const activeRooms = await this.findActiveRooms(
      profiles.map((profile) => profile.userId),
    );

    const items: StreamerListItem[] = profiles.map((profile) => {
      const live = profile.channelId
        ? (liveStates.get(`${profile.platform}:${profile.channelId}`) ?? null)
        : null;

      return {
        userId: profile.userId,
        username: profile.user.username,
        avatar: profile.user.avatar,
        platform: profile.platform,
        channelUrl: profile.channelUrl,
        channelName: profile.channelName,
        channelImageUrl: profile.channelImageUrl,
        followerCount: profile.followerCount,
        verified: !!profile.verifiedAt,
        lastLiveAt: profile.lastLiveAt,
        live,
        activeRoom: activeRooms.get(profile.userId) ?? null,
      };
    });

    // 방송 중 → 시청자 수 많은 순 → 최근 방송 순
    return items.sort((a, b) => {
      const aLive = a.live?.isLive ? 1 : 0;
      const bLive = b.live?.isLive ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;

      if (aLive === 1) {
        return (b.live?.viewerCount ?? 0) - (a.live?.viewerCount ?? 0);
      }

      const aLast = a.lastLiveAt?.getTime() ?? 0;
      const bLast = b.lastLiveAt?.getTime() ?? 0;
      return bLast - aLast;
    });
  }

  /** 스트리머들이 지금 호스트로 잡고 있는 진행 중 방을 찾는다. */
  private async findActiveRooms(
    userIds: string[],
  ): Promise<Map<string, { id: string; name: string; status: string }>> {
    if (userIds.length === 0) return new Map();

    const rooms = await this.prisma.room.findMany({
      where: {
        hostId: { in: userIds },
        isPrivate: false,
        status: {
          in: [
            "WAITING",
            "IN_PROGRESS",
            "TEAM_SELECTION",
            "DRAFT",
            "DRAFT_COMPLETED",
            "ROLE_SELECTION",
          ],
        },
      },
      select: { id: true, name: true, status: true, hostId: true },
      orderBy: { createdAt: "desc" },
    });

    const map = new Map<string, { id: string; name: string; status: string }>();
    for (const room of rooms) {
      // 같은 호스트의 방이 여러 개면 가장 최근 것만 노출한다.
      if (!map.has(room.hostId)) {
        map.set(room.hostId, {
          id: room.id,
          name: room.name,
          status: room.status,
        });
      }
    }
    return map;
  }

  /**
   * 방 목록에 붙일 호스트 라이브 여부.
   * 방 목록은 트래픽이 많은 화면이라 캐시된 값만 읽고 새로 조회하지 않는다.
   * (실제 갱신은 폴링이 담당)
   */
  async getHostLiveMap(
    hostIds: string[],
  ): Promise<Map<string, { platform: StreamerPlatform; channelUrl: string }>> {
    if (hostIds.length === 0) return new Map();

    const profiles = await this.prisma.streamerProfile.findMany({
      where: {
        userId: { in: hostIds },
        isActive: true,
        verifiedAt: { not: null },
        channelId: { not: null },
      },
      select: {
        userId: true,
        platform: true,
        channelId: true,
        channelUrl: true,
      },
    });

    const map = new Map<
      string,
      { platform: StreamerPlatform; channelUrl: string }
    >();

    for (const profile of profiles) {
      if (map.has(profile.userId) || !profile.channelId) continue;

      const cached = await this.readCache(profile.platform, profile.channelId);
      if (cached?.isLive) {
        map.set(profile.userId, {
          platform: profile.platform,
          channelUrl: profile.channelUrl,
        });
      }
    }

    return map;
  }

  // ── 폴링 ──────────────────────────────────────────────────────────────

  /**
   * 검증된 스트리머 전체의 라이브 상태를 갱신한다. (tasks에서 주기 호출)
   *
   * 전수 폴링이지만 대상이 "검증된 스트리머"로 제한되어 있어 규모가 작다.
   * 수가 늘면 온라인·방 참가 여부로 대상을 좁히는 단계를 추가한다.
   */
  async refreshAllLiveStates(): Promise<{
    checked: number;
    live: number;
    failed: number;
  }> {
    const profiles = await this.prisma.streamerProfile.findMany({
      where: {
        isActive: true,
        verifiedAt: { not: null },
        channelId: { not: null },
      },
      select: { id: true, platform: true, channelId: true, lastLiveAt: true },
    });

    let live = 0;
    let failed = 0;

    const concurrency = 5;
    for (let i = 0; i < profiles.length; i += concurrency) {
      const chunk = profiles.slice(i, i + concurrency);

      await Promise.all(
        chunk.map(async (profile) => {
          if (!profile.channelId) return;

          const state = await this.getLiveState(
            profile.platform,
            profile.channelId,
            { forceRefresh: true },
          );

          if (!state) {
            failed += 1;
            return;
          }
          if (state.isLive) live += 1;

          // lastLiveAt은 "3일 전 방송" 표시용이라 방송 중일 때만,
          // 그것도 10분 이상 지났을 때만 쓴다. (폴링마다 DB를 때리지 않도록)
          const shouldTouch =
            state.isLive &&
            (!profile.lastLiveAt ||
              Date.now() - profile.lastLiveAt.getTime() > 10 * 60 * 1000);

          if (shouldTouch) {
            await this.prisma.streamerProfile.update({
              where: { id: profile.id },
              data: { lastLiveAt: new Date(), lastCheckedAt: new Date() },
            });
          }
        }),
      );
    }

    this.logger.log(
      `스트리머 라이브 갱신: 대상 ${profiles.length}명 · 방송 중 ${live}명 · 실패 ${failed}명`,
    );

    return { checked: profiles.length, live, failed };
  }

  // ── 관리자 ────────────────────────────────────────────────────────────

  /** 관리자 목록 — 미검증·비활성까지 전부 보여준다. */
  async listForAdmin(filters?: {
    verified?: "all" | "verified" | "pending";
    search?: string;
  }) {
    const where: Prisma.StreamerProfileWhereInput = {};

    if (filters?.verified === "verified") where.verifiedAt = { not: null };
    if (filters?.verified === "pending") where.verifiedAt = null;

    const search = filters?.search?.trim();
    if (search) {
      where.OR = [
        { channelName: { contains: search, mode: "insensitive" } },
        { user: { username: { contains: search, mode: "insensitive" } } },
      ];
    }

    const profiles = await this.prisma.streamerProfile.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: [{ verifiedAt: "asc" }, { createdAt: "desc" }],
    });

    const liveStates = await this.getLiveStates(
      profiles
        .filter((profile) => !!profile.channelId && !!profile.verifiedAt)
        .map((profile) => ({
          platform: profile.platform,
          channelId: profile.channelId as string,
        })),
    );

    return profiles.map((profile) => ({
      id: profile.id,
      userId: profile.userId,
      username: profile.user.username,
      avatar: profile.user.avatar,
      platform: profile.platform,
      channelUrl: profile.channelUrl,
      channelId: profile.channelId,
      channelName: profile.channelName,
      followerCount: profile.followerCount,
      isActive: profile.isActive,
      verifiedAt: profile.verifiedAt,
      lastLiveAt: profile.lastLiveAt,
      lastCheckedAt: profile.lastCheckedAt,
      isLive: profile.channelId
        ? (liveStates.get(`${profile.platform}:${profile.channelId}`)?.isLive ??
          null)
        : null,
      createdAt: profile.createdAt,
    }));
  }

  /** 관리자 수동 검증 — 코드 대조가 어려운 경우의 예외 경로 */
  async setVerified(profileId: string, verified: boolean) {
    const profile = await this.prisma.streamerProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile)
      throw new NotFoundException("스트리머 프로필을 찾을 수 없습니다.");

    return this.prisma.streamerProfile.update({
      where: { id: profileId },
      data: {
        verifiedAt: verified ? new Date() : null,
        verificationCode: null,
        verificationExpiresAt: null,
      },
    });
  }

  /** 관리자 노출 토글 */
  async setActive(profileId: string, isActive: boolean) {
    const profile = await this.prisma.streamerProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile)
      throw new NotFoundException("스트리머 프로필을 찾을 수 없습니다.");

    return this.prisma.streamerProfile.update({
      where: { id: profileId },
      data: { isActive },
    });
  }
}
