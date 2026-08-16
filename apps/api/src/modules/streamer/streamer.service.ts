import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, StreamerPlatform } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { DiscordAdminAlertService } from "../discord/discord-admin-alert.service";
import { NotificationService } from "../notification/notification.service";
import { LiveProviderRegistry } from "./providers/live-provider.registry";
import { LiveSnapshot } from "./providers/live-provider.interface";

/**
 * "방송 시작" 전환 감지용 캐시 TTL. 라이브 캐시(90초)보다 넉넉히 길게 잡아
 * 폴링이 잠깐 밀려도 이전 상태를 잃지 않게 한다.
 */
const WAS_LIVE_CACHE_TTL = 60 * 60 * 6;

/**
 * 이 횟수만큼 폴링 사이클이 연속으로 "검증된 스트리머 전원 조회 실패"면
 * 비공식 엔드포인트가 막혔다고 보고 운영 채널에 알린다.
 * (한두 명 순간 실패는 흔하므로 "전원 실패"만 신호로 본다)
 */
const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 3;
const FAILURE_STREAK_CACHE_KEY = "streamer:live:failure-streak";

/** 라이브 상태 캐시 TTL(초). 폴링 주기(60초)보다 살짝 길게 잡아 빈틈을 막는다. */
const LIVE_CACHE_TTL = 90;

/** 라이브 상태 캐시가 이 시간보다 오래되면 화면에서 "모름"으로 취급한다. */
const LIVE_STALE_MS = 5 * 60 * 1000;

export interface StreamerLiveState extends LiveSnapshot {
  checkedAt: string;
}

export interface StreamerChannelItem {
  platform: StreamerPlatform;
  channelUrl: string;
  channelName: string | null;
  channelImageUrl: string | null;
  followerCount: number | null;
  verified: boolean;
  lastLiveAt: Date | null;
  live: StreamerLiveState | null;
}

export interface StreamerListItem extends StreamerChannelItem {
  userId: string;
  username: string;
  avatar: string | null;
  channels: StreamerChannelItem[];
  /** 이 스트리머가 지금 호스트로 열어둔 내전 방 */
  activeRoom: { id: string; name: string; status: string } | null;
  /** 요청한 유저가 팔로우 중인지. 비로그인 요청이면 항상 false. */
  isFollowing: boolean;
}

@Injectable()
export class StreamerService {
  private readonly logger = new Logger(StreamerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly providers: LiveProviderRegistry,
    private readonly adminAlert: DiscordAdminAlertService,
    private readonly notificationService: NotificationService,
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
  async listStreamers(viewerId?: string): Promise<StreamerListItem[]> {
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

    const followedIds = viewerId
      ? new Set(await this.getFollowedStreamerIds(viewerId))
      : new Set<string>();

    const grouped = new Map<
      string,
      Pick<
        StreamerListItem,
        "userId" | "username" | "avatar" | "activeRoom" | "isFollowing"
      > & {
        channels: StreamerChannelItem[];
      }
    >();

    for (const profile of profiles) {
      const live = profile.channelId
        ? (liveStates.get(`${profile.platform}:${profile.channelId}`) ?? null)
        : null;

      const channel: StreamerChannelItem = {
        platform: profile.platform,
        channelUrl: profile.channelUrl,
        channelName: profile.channelName,
        channelImageUrl: profile.channelImageUrl,
        followerCount: profile.followerCount,
        verified: !!profile.verifiedAt,
        lastLiveAt: profile.lastLiveAt,
        live,
      };

      const existing = grouped.get(profile.userId);
      if (existing) {
        existing.channels.push(channel);
      } else {
        grouped.set(profile.userId, {
          userId: profile.userId,
          username: profile.user.username,
          avatar: profile.user.avatar,
          channels: [channel],
          activeRoom: activeRooms.get(profile.userId) ?? null,
          isFollowing: followedIds.has(profile.userId),
        });
      }
    }

    const items: StreamerListItem[] = Array.from(grouped.values()).map(
      (streamer) => {
        const channels = [...streamer.channels].sort((a, b) => {
          const liveDiff = Number(!!b.live?.isLive) - Number(!!a.live?.isLive);
          if (liveDiff !== 0) return liveDiff;

          if (a.live?.isLive && b.live?.isLive) {
            const viewerDiff =
              (b.live.viewerCount ?? 0) - (a.live.viewerCount ?? 0);
            if (viewerDiff !== 0) return viewerDiff;
          }

          return (
            (b.lastLiveAt?.getTime() ?? 0) - (a.lastLiveAt?.getTime() ?? 0)
          );
        });
        const primary = channels[0];
        const lastLiveAt = channels.reduce<Date | null>(
          (latest, channel) =>
            !latest ||
            (channel.lastLiveAt &&
              channel.lastLiveAt.getTime() > latest.getTime())
              ? channel.lastLiveAt
              : latest,
          null,
        );

        return {
          ...streamer,
          ...primary,
          channels,
          lastLiveAt,
        };
      },
    );

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
      select: {
        id: true,
        userId: true,
        platform: true,
        channelId: true,
        channelName: true,
        lastLiveAt: true,
      },
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

          await this.notifyFollowersIfWentLive(profile, state.isLive);

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

    await this.trackFailureStreak(profiles.length, failed);

    return { checked: profiles.length, live, failed };
  }

  /**
   * 오프라인 → 라이브로 전환된 순간에만 팔로워에게 알림을 보낸다.
   * 매 폴링(1분)마다 계속 알리면 스팸이 되므로, 직전 상태를 Redis에 저장해 비교한다.
   */
  private async notifyFollowersIfWentLive(
    profile: {
      id: string;
      userId: string;
      platform: StreamerPlatform;
      channelId: string | null;
      channelName: string | null;
    },
    isLive: boolean,
  ): Promise<void> {
    if (!profile.channelId) return;

    const key = `streamer:was-live:${profile.platform}:${profile.channelId}`;
    const previousState = await this.redis.get(key);

    await this.redis.set(key, isLive ? "1" : "0", WAS_LIVE_CACHE_TTL);

    // 배포·캐시 유실 직후에는 직전 상태를 모르므로 현재 상태만 기준점으로 기록한다.
    if (previousState == null) return;

    const wasLive = previousState === "1";
    if (!isLive || wasLive) return;

    const followers = await this.prisma.streamerFollow.findMany({
      where: { streamerId: profile.userId },
      select: { followerId: true },
    });
    if (followers.length === 0) return;

    const streamerName = profile.channelName ?? "스트리머";
    await Promise.all(
      followers.map((f) =>
        this.notificationService
          .notifyStreamerLive(f.followerId, streamerName, profile.userId)
          .catch((error) => {
            const err = error as Error;
            this.logger.warn(`방송 시작 알림 실패: ${err?.message}`);
          }),
      ),
    );
  }

  // ── 팔로우 ────────────────────────────────────────────────────────────

  async follow(followerId: string, streamerId: string): Promise<void> {
    if (followerId === streamerId) {
      throw new BadRequestException("본인을 팔로우할 수 없습니다.");
    }

    const hasProfile = await this.prisma.streamerProfile.findFirst({
      where: { userId: streamerId, verifiedAt: { not: null } },
      select: { id: true },
    });
    if (!hasProfile) {
      throw new NotFoundException("인증된 스트리머가 아닙니다.");
    }

    await this.prisma.streamerFollow.upsert({
      where: { followerId_streamerId: { followerId, streamerId } },
      create: { followerId, streamerId },
      update: {},
    });
  }

  async unfollow(followerId: string, streamerId: string): Promise<void> {
    await this.prisma.streamerFollow.deleteMany({
      where: { followerId, streamerId },
    });
  }

  /** 현재 유저가 팔로우 중인 스트리머 userId 목록 */
  async getFollowedStreamerIds(followerId: string): Promise<string[]> {
    const rows = await this.prisma.streamerFollow.findMany({
      where: { followerId },
      select: { streamerId: true },
    });
    return rows.map((row) => row.streamerId);
  }

  /**
   * 검증된 스트리머 "전원" 조회 실패가 연속되면 비공식 엔드포인트가 막혔다고
   * 보고 운영 채널에 알린다. 한두 명 순간 실패는 흔해서 신호로 보지 않는다.
   */
  private async trackFailureStreak(
    checked: number,
    failed: number,
  ): Promise<void> {
    const allFailed = checked > 0 && failed === checked;

    if (!allFailed) {
      const previous = await this.redis.get(FAILURE_STREAK_CACHE_KEY);
      if (previous && Number(previous) >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
        await this.adminAlert.notifyAdminOperation({
          operation: "스트리머 라이브 조회 복구",
          adminId: "system",
          adminName: "스트리머 폴링",
          summary: "치지직/SOOP 라이브 조회가 다시 정상적으로 동작합니다.",
        });
      }
      await this.redis.del(FAILURE_STREAK_CACHE_KEY);
      return;
    }

    const streak = await this.redis.incr(FAILURE_STREAK_CACHE_KEY);
    // 재시작 등으로 키가 영구화되지 않도록 여유 있게 TTL을 걸어둔다.
    await this.redis.expire(FAILURE_STREAK_CACHE_KEY, 60 * 60);

    if (streak === CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
      await this.adminAlert.notifyAdminOperation({
        operation: "스트리머 라이브 조회 연속 실패",
        adminId: "system",
        adminName: "스트리머 폴링",
        summary: `검증된 스트리머 ${checked}명 전원의 라이브 조회가 ${streak}회 연속 실패했습니다. 치지직/SOOP 비공식 엔드포인트가 바뀌었을 수 있습니다.`,
        targetType: "streamer-provider",
      });
    }
  }

  /**
   * 검증된 채널의 이름·프로필 이미지·팔로워 수를 갱신한다. (하루 1회 폴링)
   *
   * 인증 시점에만 저장해두면 스트리머가 나중에 채널명을 바꿔도 NEXUS에는
   * 옛날 정보가 남는다. 라이브 상태처럼 자주 바뀌는 값이 아니라서
   * 1분 폴링과 분리해 하루 1회만 갱신한다.
   */
  async refreshChannelIdentities(): Promise<{
    checked: number;
    updated: number;
    failed: number;
  }> {
    const profiles = await this.prisma.streamerProfile.findMany({
      where: {
        isActive: true,
        verifiedAt: { not: null },
        channelId: { not: null },
      },
      select: {
        id: true,
        platform: true,
        channelId: true,
        channelName: true,
        channelImageUrl: true,
        followerCount: true,
      },
    });

    let updated = 0;
    let failed = 0;

    const concurrency = 5;
    for (let i = 0; i < profiles.length; i += concurrency) {
      const chunk = profiles.slice(i, i + concurrency);

      await Promise.all(
        chunk.map(async (profile) => {
          if (!profile.channelId) return;

          const provider = this.providers.get(profile.platform);
          if (!provider) return;

          const identity = await provider.fetchIdentity(profile.channelId);
          if (!identity) {
            failed += 1;
            return;
          }

          const changed =
            identity.channelName !== profile.channelName ||
            identity.channelImageUrl !== profile.channelImageUrl ||
            identity.followerCount !== profile.followerCount;

          if (!changed) return;

          updated += 1;
          await this.prisma.streamerProfile.update({
            where: { id: profile.id },
            data: {
              channelName: identity.channelName ?? profile.channelName,
              channelImageUrl: identity.channelImageUrl,
              followerCount: identity.followerCount,
            },
          });
        }),
      );
    }

    this.logger.log(
      `스트리머 채널 정보 갱신: 대상 ${profiles.length}명 · 변경 ${updated}명 · 실패 ${failed}명`,
    );

    return { checked: profiles.length, updated, failed };
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
