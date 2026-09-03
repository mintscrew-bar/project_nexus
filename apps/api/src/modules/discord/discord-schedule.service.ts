import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { DiscordBotService } from "./discord-bot.service";
import { DiscordVoiceService } from "./discord-voice.service";
import { roomLobbyUrl } from "../../common/utils/app-url.util";
import type { GameTitle } from "@nexus/types";

/** 시작 1시간 전 리마인드를 보내는 구간 */
const REMIND_1H_MS = 60 * 60 * 1000;
/** 시작 10분 전 리마인드 + 음성채널 생성 구간 */
const REMIND_10M_MS = 10 * 60 * 1000;
/**
 * 개설 시점에 이미 이만큼 안 남은 방에는 1시간 전 리마인드를 보내지 않는다.
 * 방금 올라간 모집 공지 바로 밑에 같은 내용이 한 번 더 붙을 뿐이다.
 */
const MIN_LEAD_FOR_1H_MS = 70 * 60 * 1000;
/**
 * 봇이 꺼져 있던 동안 지나간 예약은 되살리지 않는다.
 * 30분 늦은 "지금 시작합니다" DM은 안 보내느니만 못하다.
 */
const CATCHUP_LIMIT_MS = 30 * 60 * 1000;
/** 즉시 개설 방이 정원을 못 채운 채 이만큼 지나면 모집을 닫는다. */
const STALE_INSTANT_ROOM_MS = 6 * 60 * 60 * 1000;
/** 예약 방은 예정 시각을 이만큼 넘기면 닫는다. 조금 늦게 모이는 경우가 있다. */
const STALE_SCHEDULED_ROOM_MS = 60 * 60 * 1000;

/**
 * 예고제(예약 개설) 알림.
 *
 * 예약 방은 모집 공지만 올라간 채 몇 시간을 기다린다. 그 사이 사람들이 잊는 것이
 * 예고제의 유일한 실패 요인이라, 시작 1시간 전·10분 전·시작 시점에 각각 다른
 * 방식으로 다시 부른다.
 */
@Injectable()
export class DiscordScheduleService {
  private readonly logger = new Logger(DiscordScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly botService: DiscordBotService,
    private readonly voiceService: DiscordVoiceService,
  ) {}

  /**
   * 매분 예약 방을 훑는다. `(status, scheduledAt)` 인덱스로 좁은 시간창만 읽으므로
   * 예약이 없을 때의 비용은 인덱스 조회 한 번이다.
   */
  @Cron("* * * * *")
  async processScheduledRooms(): Promise<void> {
    const now = new Date();
    const rooms = await this.prisma.room.findMany({
      where: {
        status: "WAITING",
        scheduledAt: {
          gte: new Date(now.getTime() - CATCHUP_LIMIT_MS),
          lte: new Date(now.getTime() + REMIND_1H_MS + 60_000),
        },
      },
      select: {
        id: true,
        name: true,
        // 로비 링크가 `/lol/...` 처럼 게임별 경로라 URL 조립에 필요하다
        gameTitle: true,
        maxParticipants: true,
        scheduledAt: true,
        createdAt: true,
        discordGuildId: true,
        discordCategoryId: true,
        scheduledRemind1hAt: true,
        scheduledRemind10mAt: true,
        scheduledStartNotifiedAt: true,
      },
    });

    for (const room of rooms) {
      if (!room.scheduledAt) continue;
      const msUntilStart = room.scheduledAt.getTime() - now.getTime();

      try {
        if (msUntilStart <= 0 && !room.scheduledStartNotifiedAt) {
          await this.notifyStart(room);
        } else if (msUntilStart > 0 && msUntilStart <= REMIND_10M_MS) {
          if (!room.scheduledRemind10mAt) await this.remind10m(room);
        } else if (msUntilStart > 0 && msUntilStart <= REMIND_1H_MS) {
          if (
            !room.scheduledRemind1hAt &&
            room.scheduledAt.getTime() - room.createdAt.getTime() >=
              MIN_LEAD_FOR_1H_MS
          ) {
            await this.remind1h(room);
          }
        }
      } catch (error) {
        this.logger.warn(
          `[Schedule] 방 ${room.id} 알림 처리 실패: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * 정원을 못 채운 채 식어버린 방의 모집 공지를 닫는다.
   *
   * 방 자체는 지우지 않는다. 호스트가 잠시 자리를 비운 사이 사라지는 것보다,
   * 공지만 닫히고 방은 남아 있는 쪽이 되돌리기 쉽다. 다만 아무도 안 오는 방의
   * 빈 음성채널까지 남겨두면 서버 채널 목록이 계속 더러워지므로 그건 정리한다.
   */
  @Cron("*/10 * * * *")
  async closeStaleRecruitments(): Promise<void> {
    const now = new Date();
    const rooms = await this.prisma.room.findMany({
      where: {
        status: "WAITING",
        recruitClosedAt: null,
        OR: [
          {
            scheduledAt: {
              not: null,
              lt: new Date(now.getTime() - STALE_SCHEDULED_ROOM_MS),
            },
          },
          {
            scheduledAt: null,
            createdAt: { lt: new Date(now.getTime() - STALE_INSTANT_ROOM_MS) },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        gameTitle: true,
        maxParticipants: true,
        discordCategoryId: true,
        host: {
          select: {
            authProviders: {
              where: { provider: "DISCORD" },
              select: { providerId: true },
              take: 1,
            },
          },
        },
        participants: { where: { role: "PLAYER" }, select: { id: true } },
      },
    });

    for (const room of rooms) {
      // 정원을 채운 방은 시작이 늦어지고 있을 뿐이다. 건드리지 않는다.
      if (room.participants.length >= room.maxParticipants) continue;

      try {
        await this.prisma.room.update({
          where: { id: room.id },
          data: { recruitClosedAt: now },
        });

        const closed = await this.botService.closeRoomRecruitMessages(room.id);

        if (room.discordCategoryId) {
          try {
            await this.voiceService.deleteRoomChannels(room.id);
          } catch (error) {
            this.logger.warn(
              `[Schedule] 방 ${room.id} 음성채널 정리 실패: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        await this.suggestRetryToHost(room);

        this.logger.log(
          `[Schedule] 방 ${room.id}: 모집 종료 (${room.participants.length}/${room.maxParticipants}), 공지 ${closed}개 서버`,
        );
      } catch (error) {
        this.logger.warn(
          `[Schedule] 방 ${room.id} 모집 종료 처리 실패: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /** 호스트에게 왜 닫혔는지와 다음에 뭘 하면 되는지를 DM으로 알린다. */
  private async suggestRetryToHost(room: {
    id: string;
    name: string;
    maxParticipants: number;
    host: { authProviders: { providerId: string }[] };
    participants: { id: string }[];
    gameTitle: GameTitle;
  }): Promise<void> {
    const hostDiscordId = room.host.authProviders[0]?.providerId;
    if (!hostDiscordId) return;

    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";

    await this.botService.sendDirectMessages(
      [hostDiscordId],
      [
        `**${room.name}** 모집을 닫았습니다. (${room.participants.length}/${room.maxParticipants})`,
        "",
        "사람이 가장 잘 모이는 시간에 미리 예고해두면 확률이 올라갑니다.",
        "`/nexus schedule time:오늘 21:00 mode:경매 드래프트` 처럼 예약해보세요.",
        "",
        `방은 그대로 남아 있습니다: ${roomLobbyUrl(appUrl, room.id, room.gameTitle)}`,
      ].join("\n"),
    );
  }

  /** 시작 1시간 전: 아직 모집 중이면 알림 역할까지 다시 부른다. */
  private async remind1h(room: { id: string }): Promise<void> {
    // 발송 전에 먼저 기록한다. 실패해도 재시도하지 않는 게 맞다 —
    // 몇 분 늦게 도착하는 "1시간 전" 알림은 이미 틀린 정보다.
    await this.prisma.room.update({
      where: { id: room.id },
      data: { scheduledRemind1hAt: new Date() },
    });
    const sent = await this.botService.sendRoomScheduleReminder(room.id, "1h");
    this.logger.log(
      `[Schedule] 방 ${room.id}: 1시간 전 리마인드 ${sent}개 서버`,
    );
  }

  /** 시작 10분 전: 음성채널을 이제 만들고, 대기실 링크와 함께 부른다. */
  private async remind10m(room: {
    id: string;
    name: string;
    maxParticipants: number;
    discordCategoryId: string | null;
  }): Promise<void> {
    await this.prisma.room.update({
      where: { id: room.id },
      data: { scheduledRemind10mAt: new Date() },
    });

    // 예약 방은 개설 시점에 음성채널을 만들지 않는다(빈 채널 방치 방지).
    // 시작 직전인 지금이 만들 시점이다.
    if (!room.discordCategoryId) {
      try {
        const channels = await this.voiceService.createRoomChannels(
          room.id,
          room.name,
          Math.floor(room.maxParticipants / 5),
        );
        await this.prisma.room.update({
          where: { id: room.id },
          data: { discordCategoryId: channels.categoryId },
        });
        // 공지 카드에 음성 대기실 버튼이 붙도록 다시 그린다.
        await this.botService.updateRoomNotification(room.id);
      } catch (error) {
        // 음성채널이 없어도 내전은 진행된다. 리마인드는 그대로 보낸다.
        this.logger.warn(
          `[Schedule] 방 ${room.id} 음성채널 생성 실패: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const sent = await this.botService.sendRoomScheduleReminder(room.id, "10m");
    this.logger.log(
      `[Schedule] 방 ${room.id}: 10분 전 리마인드 ${sent}개 서버`,
    );
  }

  /** 예정 시각: 참가 신청자에게 DM으로 직접 부른다. */
  private async notifyStart(room: {
    id: string;
    name: string;
    discordGuildId: string | null;
    gameTitle: GameTitle;
  }): Promise<void> {
    await this.prisma.room.update({
      where: { id: room.id },
      data: { scheduledStartNotifiedAt: new Date() },
    });

    const participants = await this.prisma.roomParticipant.findMany({
      where: { roomId: room.id, role: "PLAYER" },
      select: {
        user: {
          select: {
            authProviders: {
              where: { provider: "DISCORD" },
              select: { providerId: true },
              take: 1,
            },
          },
        },
      },
    });
    const discordIds = participants
      .map((participant) => participant.user.authProviders[0]?.providerId)
      .filter((id): id is string => !!id);
    if (discordIds.length === 0) return;

    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";
    const lobbyChannel = await this.prisma.roomDiscordChannel.findFirst({
      where: { roomId: room.id, teamName: "Lobby" },
      select: { channelId: true },
    });

    const lines = [
      `🎮 **${room.name}** 내전이 시작됩니다.`,
      `로비: ${roomLobbyUrl(appUrl, room.id, room.gameTitle)}`,
    ];
    if (room.discordGuildId && lobbyChannel) {
      lines.push(
        `음성 대기실: https://discord.com/channels/${room.discordGuildId}/${lobbyChannel.channelId}`,
      );
    }

    const delivered = await this.botService.sendDirectMessages(
      discordIds,
      lines.join("\n"),
    );
    this.logger.log(
      `[Schedule] 방 ${room.id}: 시작 DM ${delivered}/${discordIds.length}명 전달`,
    );
  }
}
