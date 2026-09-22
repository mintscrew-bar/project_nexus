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
import { RoomGateway } from "./room.gateway";
import { gameSlug, roomLobbyUrl } from "../../common/utils/app-url.util";
import { roomDisplayName } from "../../common/utils/room-title.util";

/** 참가자가 풀어야 하는 시작 조건. 시작 거절 사유(start-blocked.ts) 중 "사람" 몫만. */
export type RoomNudgeReason = "READY" | "VOICE";

/**
 * 같은 사람에게 확인 모달을 다시 띄우기까지(초), 같은 사유로 DM 을 다시
 * 보내기까지(초). 방장이 시작을 연타하면 받는 사람 화면에 모달이 계속 뜨고,
 * DM 은 디스코드 레이트 리밋도 먹는다.
 */
export const ROOM_NUDGE_COOLDOWN_SECONDS = 60;

const BOT_USERNAME = /^testbot_\d+$/;

/** 참가자 화면에 뜨는 확인 모달 내용(web RoomStartAlertModal) */
export interface RoomStartAlertPayload {
  roomId: string;
  roomName: string;
  hostName: string;
  /** 사이트 내부 경로 — 로비로 가기 버튼 */
  lobbyPath: string;
  /** 방 대기실 음성 채널 링크. VOICE 가 있을 때만 쓴다 */
  voiceUrl: string | null;
  /** 이 사람이 풀어야 하는 조건 */
  items: RoomNudgeReason[];
}

export interface RoomStartAlertResult {
  /** 확인 모달을 띄운 사람 */
  alerted: string[];
  /** 지금 사이트에 없어 모달을 못 띄운 사람 — 디스코드 DM 으로 불러야 한다 */
  offline: string[];
  /** 1분 안에 이미 모달을 받아 이번엔 건너뛴 사람 */
  recentlyAlerted: string[];
}

export interface RoomNudgeResult {
  /** 호출 대상 인원 */
  targets: number;
  /** 디스코드 DM 이 실제로 전달된 인원(연동 안 했거나 DM 을 막아 둔 사람은 빠진다) */
  dmDelivered: number;
  /** 다음 호출까지 남은 시간(초) */
  cooldownSeconds: number;
}

type LoadedRoom = NonNullable<
  Awaited<ReturnType<RoomNudgeService["loadRoom"]>>
>;

/**
 * 시작을 막고 있는 참가자를 부른다.
 *
 * 1) alertBlockers — 방장이 조건이 안 맞은 채로 "내전 시작"을 누르면 자동으로
 *    막고 있는 참가자 화면에 확인 모달을 띄운다. 확인을 눌러야 사라진다.
 *    알림함에는 남기지 않는다. "지금 준비 눌러 달라"는 나중에 보면 의미가 없다
 *    (운영자 결정, 2026-09-22).
 * 2) nudge — 방장 모달의 요청 버튼. 사이트를 안 보고 있는 사람을 디스코드 DM 으로 부른다.
 */
@Injectable()
export class RoomNudgeService {
  private readonly logger = new Logger(RoomNudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly roomGateway: RoomGateway,
    @Optional()
    @Inject("DISCORD_BOT_SERVICE")
    private readonly discordBot?: any,
    @Optional()
    @Inject("DISCORD_VOICE_SERVICE")
    private readonly discordVoice?: any,
  ) {}

  /** 방장이 시작을 눌렀는데 조건이 남았다 — 막고 있는 사람에게 확인 모달을 띄운다. */
  async alertBlockers(
    hostId: string,
    roomId: string,
  ): Promise<RoomStartAlertResult> {
    const room = await this.loadHostRoom(hostId, roomId);
    const candidates = this.candidates(room, hostId);

    // 사람마다 풀어야 할 조건을 모은다. 준비도 안 하고 대기실에도 없으면 둘 다.
    const notReady = new Set(
      candidates.filter((p) => !p.isReady).map((p) => p.userId),
    );
    const outsideVoice = new Set(
      (await this.voiceMissing(roomId, candidates)).map((p) => p.userId),
    );

    const payloadBase = {
      roomId,
      roomName: roomDisplayName(room as any),
      hostName: room.host.username,
      lobbyPath: `/${gameSlug(room.gameTitle as GameTitle)}/tournaments/${roomId}/lobby`,
      voiceUrl: this.lobbyVoiceUrl(room),
    };

    const result: RoomStartAlertResult = {
      alerted: [],
      offline: [],
      recentlyAlerted: [],
    };
    for (const participant of candidates) {
      const items: RoomNudgeReason[] = [];
      if (notReady.has(participant.userId)) items.push("READY");
      if (outsideVoice.has(participant.userId)) items.push("VOICE");
      if (items.length === 0) continue;

      const name = participant.user.username;
      const key = `room-start-alert:${roomId}:${participant.userId}`;
      if (!(await this.tryClaim(key))) {
        result.recentlyAlerted.push(name);
        continue;
      }
      const payload: RoomStartAlertPayload = { ...payloadBase, items };
      if (this.roomGateway.sendStartAlert(participant.userId, payload) > 0) {
        result.alerted.push(name);
      } else {
        result.offline.push(name);
        // 못 띄웠으면 쿨다운을 풀어 둔다. 사이트에 돌아오면 다음 시작 때 받아야 한다.
        await this.redis.del(key);
      }
    }
    return result;
  }

  /** 방장 모달의 요청 버튼 — 디스코드 DM 으로 부른다. */
  async nudge(
    hostId: string,
    roomId: string,
    reason: RoomNudgeReason,
  ): Promise<RoomNudgeResult> {
    const room = await this.loadHostRoom(hostId, roomId);
    const candidates = this.candidates(room, hostId);
    const targets =
      reason === "READY"
        ? candidates.filter((p) => !p.isReady)
        : await this.voiceMissing(roomId, candidates);
    if (targets.length === 0) {
      // 부를 사람이 없으면 쿨다운도 걸지 않는다. 막 해결된 경우다.
      return { targets: 0, dmDelivered: 0, cooldownSeconds: 0 };
    }

    const key = `room-nudge:${roomId}:${reason}`;
    if (!(await this.tryClaim(key))) {
      const remainingMs = await this.redis.pttl(key);
      throw new BadRequestException(
        `방금 호출했습니다. ${Math.ceil(remainingMs / 1000)}초 뒤에 다시 부를 수 있습니다.`,
      );
    }

    const discordIds = targets
      .map((target) => target.user.authProviders[0]?.providerId)
      .filter((id): id is string => Boolean(id));
    let dmDelivered = 0;
    if (this.discordBot?.sendDirectMessages && discordIds.length > 0) {
      const appUrl =
        this.configService.get<string>("APP_URL") || "https://labs-nexus.com";
      const roomName = roomDisplayName(room as any);
      const lines =
        reason === "READY"
          ? [
              "📣 **준비 요청**",
              `『${roomName}』 방장이 준비를 기다리고 있습니다. 로비에서 '준비 완료하기'를 눌러주세요.`,
            ]
          : [
              "📣 **Discord 대기실 입장 요청**",
              `『${roomName}』 방장이 기다리고 있습니다. 대기실 음성 채널에 들어와야 내전을 시작할 수 있습니다.`,
            ];
      lines.push(
        `로비: ${roomLobbyUrl(appUrl, roomId, room.gameTitle as GameTitle)}`,
      );
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
      dmDelivered,
      cooldownSeconds: ROOM_NUDGE_COOLDOWN_SECONDS,
    };
  }

  private loadRoom(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        gameTitle: true,
        pubgPlatform: true,
        hostId: true,
        status: true,
        discordGuildId: true,
        host: { select: { username: true } },
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
  }

  private async loadHostRoom(hostId: string, roomId: string) {
    const room = await this.loadRoom(roomId);
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== hostId) {
      throw new ForbiddenException("방장만 참가자를 호출할 수 있습니다.");
    }
    if (room.status !== "WAITING") {
      throw new BadRequestException("대기 중인 방에서만 호출할 수 있습니다.");
    }
    return room;
  }

  /** 방장 자신과 테스트 봇은 부르지 않는다. */
  private candidates(room: LoadedRoom, hostId: string) {
    return room.participants.filter(
      (p) => p.userId !== hostId && !BOT_USERNAME.test(p.user.username),
    );
  }

  /**
   * 대기실에 없는 선수. 시작 검증(validateVoicePresence)과 같은 판정이되,
   * 준비 안 한 사람도 포함한다 — 준비를 누르는 순간 또 막히지 않게 미리 부른다.
   */
  private async voiceMissing<T extends { user: { username: string } }>(
    roomId: string,
    candidates: T[],
  ): Promise<T[]> {
    if (!this.discordVoice?.validateVoicePresence) return [];
    const { missingUsernames } = await this.discordVoice.validateVoicePresence(
      roomId,
      { includeNotReady: true },
    );
    const missing = new Set<string>(missingUsernames ?? []);
    return candidates.filter((p) => missing.has(p.user.username));
  }

  /**
   * 쿨다운 키를 잡는다. 이미 잡혀 있으면 false.
   * 만료가 빠진 키(expire 직전에 죽은 경우)는 다시 잡는다 — 영원히 막히면 안 된다.
   */
  private async tryClaim(key: string): Promise<boolean> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ROOM_NUDGE_COOLDOWN_SECONDS);
      return true;
    }
    if ((await this.redis.pttl(key)) === 0) {
      await this.redis.expire(key, ROOM_NUDGE_COOLDOWN_SECONDS);
      return true;
    }
    return false;
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
