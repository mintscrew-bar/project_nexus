import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GameTitle } from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { NotificationService } from "../notification/notification.service";
import { gameSlug, roomLobbyUrl } from "../../common/utils/app-url.util";
import { roomDisplayName } from "../../common/utils/room-title.util";

/** 호출할 수 있는 사유. 시작 거절 사유(start-blocked.ts) 중 "사람"이 풀어야 하는 것만. */
export type RoomNudgeReason = "READY" | "VOICE";

/**
 * 같은 방·같은 사유 호출 간격(초).
 * 연타하면 받는 사람 입장에선 스팸이고, DM 은 디스코드 레이트 리밋도 먹는다.
 */
export const ROOM_NUDGE_COOLDOWN_SECONDS = 60;

const BOT_USERNAME = /^testbot_\d+$/;

export interface RoomNudgeResult {
  /** 호출 대상 인원 */
  targets: number;
  /** 사이트 알림을 만든 인원 */
  siteNotified: number;
  /** 디스코드 DM 이 실제로 전달된 인원(DM 을 막아 둔 사람은 빠진다) */
  dmDelivered: number;
  /** 다음 호출까지 남은 시간(초) */
  cooldownSeconds: number;
}

/**
 * 로비 "호출" — 시작을 막고 있는 참가자를 방장이 부른다.
 *
 * 시작 조건 모달에서 쓴다. 준비를 안 한 사람, Discord 대기실에 없는 사람에게
 * 사이트 알림(알림함 + 실시간)과 디스코드 DM 을 같이 보낸다. 디스코드를 안 보고
 * 있는 사람도 사이트에서 알 수 있어야 한다(운영자 요구, 2026-09-22).
 *
 * 알림 종류는 새로 만들지 않고 SYSTEM 에 data.kind 로 구분한다. 종류를 추가하면
 * 운영 DB 스키마를 바꿔야 한다.
 */
@Injectable()
export class RoomNudgeService {
  private readonly logger = new Logger(RoomNudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
    @Optional()
    @Inject("DISCORD_BOT_SERVICE")
    private readonly discordBot?: any,
    @Optional()
    @Inject("DISCORD_VOICE_SERVICE")
    private readonly discordVoice?: any,
  ) {}

  async nudge(
    hostId: string,
    roomId: string,
    reason: RoomNudgeReason,
  ): Promise<RoomNudgeResult> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        gameTitle: true,
        pubgPlatform: true,
        hostId: true,
        status: true,
        discordGuildId: true,
        participants: {
          where: { role: "PLAYER" },
          select: {
            userId: true,
            isReady: true,
            user: {
              select: {
                username: true,
                authProviders: {
                  where: { provider: "DISCORD" },
                  select: { providerId: true },
                },
              },
            },
          },
        },
        discordChannels: {
          where: { teamName: "Lobby" },
          select: { channelId: true },
          take: 1,
        },
      },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== hostId) {
      throw new ForbiddenException("방장만 참가자를 호출할 수 있습니다.");
    }
    if (room.status !== "WAITING") {
      throw new BadRequestException("대기 중인 방에서만 호출할 수 있습니다.");
    }

    // 방장 자신과 테스트 봇은 부르지 않는다.
    const candidates = room.participants.filter(
      (p) => p.userId !== hostId && !BOT_USERNAME.test(p.user.username),
    );
    const targets = await this.pickTargets(roomId, reason, candidates);
    if (targets.length === 0) {
      // 부를 사람이 없으면 쿨다운도 걸지 않는다. 막 해결된 경우다.
      return {
        targets: 0,
        siteNotified: 0,
        dmDelivered: 0,
        cooldownSeconds: 0,
      };
    }

    await this.claimCooldown(roomId, reason);

    const gameTitle = room.gameTitle as GameTitle;
    const displayName = roomDisplayName(room as any);
    const appUrl =
      this.configService.get<string>("APP_URL") || "https://labs-nexus.com";
    const lobbyPath = `/${gameSlug(gameTitle)}/tournaments/${roomId}/lobby`;
    const copy = this.copyFor(reason, displayName);

    // 사이트 알림 — 한 명이 실패해도 나머지는 받아야 한다.
    const site = await Promise.allSettled(
      targets.map((target) =>
        this.notificationService.create({
          userId: target.userId,
          type: "SYSTEM",
          title: copy.title,
          message: copy.message,
          link: lobbyPath,
          data: { kind: "ROOM_NUDGE", roomId, reason },
        }),
      ),
    );

    // 디스코드 DM — 봇이 꺼져 있거나 DM 을 막아 둔 사람은 조용히 빠진다.
    let dmDelivered = 0;
    const discordIds = targets
      .map((target) => target.user.authProviders[0]?.providerId)
      .filter((id): id is string => Boolean(id));
    if (this.discordBot?.sendDirectMessages && discordIds.length > 0) {
      const lines = [
        `📣 **${copy.title}**`,
        copy.message,
        `로비: ${roomLobbyUrl(appUrl, roomId, gameTitle)}`,
      ];
      const voiceUrl = this.lobbyVoiceUrl(room);
      if (reason === "VOICE" && voiceUrl) lines.push(`대기실: ${voiceUrl}`);
      try {
        dmDelivered = await this.discordBot.sendDirectMessages(
          discordIds,
          lines.join("\n"),
        );
      } catch (error) {
        this.logger.warn(
          `[Nudge] DM 실패 (room ${roomId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      targets: targets.length,
      siteNotified: site.filter((result) => result.status === "fulfilled")
        .length,
      dmDelivered,
      cooldownSeconds: ROOM_NUDGE_COOLDOWN_SECONDS,
    };
  }

  /**
   * 누구를 부를지.
   * - READY: 준비하지 않은 선수
   * - VOICE: 대기실에 없는 선수. 시작 검증(validateVoicePresence)과 같은 판정이되,
   *   준비 안 한 사람도 포함한다 — 준비를 누르는 순간 또 막히지 않게 미리 부른다.
   */
  private async pickTargets<
    T extends { isReady: boolean; user: { username: string } },
  >(roomId: string, reason: RoomNudgeReason, candidates: T[]): Promise<T[]> {
    if (reason === "READY") {
      return candidates.filter((p) => !p.isReady);
    }
    if (!this.discordVoice?.validateVoicePresence) return [];
    const { missingUsernames } = await this.discordVoice.validateVoicePresence(
      roomId,
      {
        includeNotReady: true,
      },
    );
    const missing = new Set<string>(missingUsernames ?? []);
    return candidates.filter((p) => missing.has(p.user.username));
  }

  /** 쿨다운을 잡는다. 이미 잡혀 있으면 남은 시간을 알려주고 거절한다. */
  private async claimCooldown(roomId: string, reason: RoomNudgeReason) {
    const key = `room-nudge:${roomId}:${reason}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ROOM_NUDGE_COOLDOWN_SECONDS);
      return;
    }
    const remainingMs = await this.redis.pttl(key);
    // 만료가 빠진 키(expire 직전에 죽은 경우)는 다시 잡는다. 영원히 막히면 안 된다.
    if (remainingMs === 0) {
      await this.redis.expire(key, ROOM_NUDGE_COOLDOWN_SECONDS);
      return;
    }
    throw new BadRequestException(
      `방금 호출했습니다. ${Math.ceil(remainingMs / 1000)}초 뒤에 다시 부를 수 있습니다.`,
    );
  }

  private copyFor(reason: RoomNudgeReason, roomName: string) {
    return reason === "READY"
      ? {
          title: "준비 요청",
          message: `『${roomName}』 방장이 준비를 기다리고 있습니다. 로비에서 '준비 완료하기'를 눌러주세요.`,
        }
      : {
          title: "Discord 대기실 입장 요청",
          message: `『${roomName}』 방장이 기다리고 있습니다. Discord 대기실 음성 채널에 들어와야 내전을 시작할 수 있습니다.`,
        };
  }

  /** 방 대기실 음성 채널 링크. 방 서버 → 없으면 넥서스 홈 서버. */
  private lobbyVoiceUrl(room: {
    discordGuildId: string | null;
    discordChannels: { channelId: string }[];
  }): string | null {
    const channelId = room.discordChannels[0]?.channelId;
    const guildId =
      room.discordGuildId || this.configService.get<string>("DISCORD_GUILD_ID");
    return channelId && guildId
      ? `https://discord.com/channels/${guildId}/${channelId}`
      : null;
  }
}
