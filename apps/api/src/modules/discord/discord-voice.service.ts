import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import {
  Client,
  ChannelType,
  PermissionFlagsBits,
  VoiceChannel,
  Role as DiscordRole,
} from "discord.js";

@Injectable()
export class DiscordVoiceService {
  private client!: Client;
  private readonly logger = new Logger(DiscordVoiceService.name);
  private readonly moveDelayMs: number;
  private readonly staleChannelHours: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.moveDelayMs = this.readPositiveInt("DISCORD_VOICE_MOVE_DELAY_MS", 300);
    this.staleChannelHours = this.readPositiveInt(
      "DISCORD_STALE_CHANNEL_HOURS",
      6,
    );
  }

  setClient(client: Client) {
    this.client = client;
  }

  private readPositiveInt(key: string, fallback: number): number {
    const value = Number(this.configService.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private isDiscordReady(): boolean {
    return Boolean(this.client?.isReady?.());
  }

  private async delay(ms = this.moveDelayMs): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldSkipBotUsername(username: string): boolean {
    return /^testbot_\d+$/.test(username);
  }

  /**
   * 방에 묶인 디스코드 길드 ID를 해석한다.
   * 멀티 길드 지원: Room.discordGuildId 가 있으면 그 길드를, 없으면 기존 홈 서버
   * (env DISCORD_GUILD_ID)로 폴백한다. 둘 다 없으면 null.
   */
  private async resolveRoomGuildId(roomId: string): Promise<string | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { discordGuildId: true },
    });
    return (
      room?.discordGuildId ||
      this.configService.get<string>("DISCORD_GUILD_ID") ||
      null
    );
  }

  async getRoomNotificationTarget(
    roomId: string,
  ): Promise<{ guildId: string; channelId: string } | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        discordGuildId: true,
        discordChannels: {
          where: { teamName: "Lobby" },
          select: { channelId: true },
          take: 1,
        },
      },
    });
    if (!room) return null;

    const guildId =
      room.discordGuildId ||
      this.configService.get<string>("DISCORD_GUILD_ID") ||
      null;
    if (!guildId) return null;

    const lobbyChannelId = room.discordChannels?.[0]?.channelId;
    if (lobbyChannelId) {
      return { guildId, channelId: lobbyChannelId };
    }

    if (!room.discordGuildId) {
      const fallbackChannelId = this.configService.get<string>(
        "DISCORD_NOTIFICATION_CHANNEL_ID",
      );
      if (fallbackChannelId) {
        return { guildId, channelId: fallbackChannelId };
      }
    }

    return null;
  }

  /**
   * 채널 ID로부터 소속 길드 ID를 해석한다. RoomDiscordChannel → Room.discordGuildId
   * 순으로 찾고, 없으면 홈 서버(env)로 폴백한다.
   */
  private async resolveChannelGuildId(
    channelId: string,
  ): Promise<string | null> {
    const link = await this.prisma.roomDiscordChannel.findUnique({
      where: { channelId },
      select: { room: { select: { discordGuildId: true } } },
    });
    return (
      link?.room?.discordGuildId ||
      this.configService.get<string>("DISCORD_GUILD_ID") ||
      null
    );
  }

  // ========================================
  // Channel Creation
  // ========================================

  async createRoomChannels(
    roomId: string,
    roomName: string,
    numTeams: number,
  ): Promise<{
    categoryId: string;
    teamChannels: Array<{ teamName: string; channelId: string }>;
    lobbyChannelId?: string;
  }> {
    const guildId = await this.resolveRoomGuildId(roomId);
    if (!guildId) {
      throw new BadRequestException("Discord guild not configured");
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);

      // Create category with retry
      let category;
      let retryCount = 0;
      const MAX_RETRIES = 3;

      while (retryCount < MAX_RETRIES) {
        try {
          category = await guild.channels.create({
            name: `『 ${roomName} 』`,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.Connect,
                ],
              },
            ],
          });
          break; // 성공 시 루프 탈출
        } catch (createError: any) {
          retryCount++;
          this.logger.warn(
            `Failed to create category (attempt ${retryCount}/${MAX_RETRIES}): ${createError.message}`,
          );

          if (retryCount >= MAX_RETRIES) {
            throw new BadRequestException(
              `Failed to create Discord category after ${MAX_RETRIES} attempts. Please try again later.`,
            );
          }

          // 재시도 전 대기 (레이트 리밋 회피)
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount),
          );
        }
      }

      if (!category) {
        throw new BadRequestException("Failed to create Discord category");
      }

      // Create lobby channel first (생성 순서로 맨 위 고정)
      const lobbyChannel = await guild.channels.create({
        name: "── 대기실 ──",
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: 50,
      });

      await this.prisma.roomDiscordChannel.create({
        data: {
          roomId,
          channelId: lobbyChannel.id,
          channelType: "VOICE",
          teamName: "Lobby",
        },
      });

      // Create team voice channels
      // displayName: Discord 채널 표시명, dbTeamName: snake-draft의 team.name과 매칟용 (Team 1, Team 2...)
      const teamChannels: Array<{ teamName: string; channelId: string }> = [];

      for (let i = 0; i < numTeams; i++) {
        const displayName = `┊ ${i + 1}팀`;
        const dbTeamName = `Team ${i + 1}`;

        const channel = await guild.channels.create({
          name: displayName,
          type: ChannelType.GuildVoice,
          parent: category.id,
          userLimit: 5,
        });

        teamChannels.push({ teamName: dbTeamName, channelId: channel.id });

        await this.prisma.roomDiscordChannel.create({
          data: {
            roomId,
            channelId: channel.id,
            channelType: "VOICE",
            teamName: dbTeamName, // "Team 1" 형식으로 저장 → team.name과 매칭
          },
        });
      }

      this.logger.log(
        `Successfully created Discord channels for room ${roomId}: category + lobby + ${numTeams} team channels`,
      );

      return {
        categoryId: category.id,
        teamChannels,
        lobbyChannelId: lobbyChannel.id,
      };
    } catch (error: any) {
      // 생성 중 실패 시 이미 생성된 채널들 정리
      this.logger.error(
        `Error creating Discord channels for room ${roomId}:`,
        error,
      );

      // 부분적으로 생성된 채널들 정리 시도
      try {
        const existingChannels = await this.prisma.roomDiscordChannel.findMany({
          where: { roomId },
        });

        for (const ch of existingChannels) {
          try {
            const guild = await this.client.guilds.fetch(guildId);
            const channel = await guild.channels
              .fetch(ch.channelId)
              .catch(() => null);
            if (channel) await channel.delete();
          } catch {
            // 무시
          }
        }

        await this.prisma.roomDiscordChannel.deleteMany({ where: { roomId } });
      } catch (cleanupError) {
        this.logger.error(
          `Failed to cleanup channels after error:`,
          cleanupError,
        );
      }

      // 에러를 다시 던져서 상위에서 처리하도록
      throw error;
    }
  }

  // ========================================
  // Member Movement
  // ========================================

  async moveUserToTeamChannel(
    discordUserId: string,
    teamChannelId: string,
  ): Promise<boolean> {
    const guildId = await this.resolveChannelGuildId(teamChannelId);
    if (!guildId) {
      this.logger.warn("Discord guild not configured, skipping voice move");
      return false;
    }

    if (!this.isDiscordReady()) {
      this.logger.warn("Discord bot is not ready, skipping voice move");
      return false;
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordUserId);

      // Check if user is in a voice channel
      if (!member.voice.channel) {
        this.logger.debug(`User ${discordUserId} is not in a voice channel`);
        return false;
      }

      // Move to target channel
      await member.voice.setChannel(teamChannelId);
      this.logger.log(
        `Moved user ${discordUserId} to channel ${teamChannelId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to move user ${discordUserId}:`, error);
      return false;
    }
  }

  async moveTeamToChannel(
    teamId: string,
    channelId: string,
  ): Promise<{ success: number; failed: number }> {
    // Get team members with Discord IDs
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: {
              include: {
                authProviders: {
                  where: { provider: "DISCORD" },
                },
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new BadRequestException("Team not found");
    }

    let success = 0;
    let failed = 0;

    for (const [index, member] of team.members.entries()) {
      // 봇 계정은 건너뛰기 (Discord 계정 없음)
      if (this.shouldSkipBotUsername(member.user.username)) {
        this.logger.debug(
          `Skipping bot ${member.user.username} for voice channel move`,
        );
        continue;
      }

      const discordProvider = member.user.authProviders.find(
        (p: (typeof member.user.authProviders)[number]) =>
          p.provider === "DISCORD",
      );

      if (!discordProvider) {
        failed++;
        continue;
      }

      const moved = await this.moveUserToTeamChannel(
        discordProvider.providerId,
        channelId,
      );

      if (moved) {
        success++;
      } else {
        failed++;
      }

      // Discord voice move는 짧은 간격으로 직렬 처리해 429와 부분 이동 실패를 줄인다.
      if (index < team.members.length - 1) {
        await this.delay();
      }
    }

    return { success, failed };
  }

  // ========================================
  // Channel Cleanup
  // ========================================

  /**
   * @param keepLobby true = 팀 채널만 삭제, 대기실+카테고리 유지 (토너먼트 완료 시)
   *                  false(기본) = 전체 삭제 (방 종료 시)
   */
  async deleteRoomChannels(
    roomId: string,
    keepLobby = false,
    snapshot?: {
      discordCategoryId?: string | null;
      discordChannels?: { channelId: string; teamName?: string | null }[];
    },
  ): Promise<void> {
    const guildId = await this.resolveRoomGuildId(roomId);
    if (!guildId) {
      return;
    }

    const room = snapshot
      ? {
          discordCategoryId: snapshot.discordCategoryId ?? null,
          discordChannels: snapshot.discordChannels ?? [],
        }
      : await this.prisma.room.findUnique({
          where: { id: roomId },
          include: {
            discordChannels: true,
          },
        });

    if (!room || !room.discordCategoryId) {
      return;
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);

      const channelsToDelete = keepLobby
        ? room.discordChannels.filter(
            (ch: (typeof room.discordChannels)[number]) =>
              ch.teamName !== "Lobby",
          )
        : room.discordChannels;

      // Delete child channels first (Discord does NOT auto-delete them with category)
      for (const ch of channelsToDelete) {
        try {
          const channel = await guild.channels
            .fetch(ch.channelId)
            .catch(() => null);
          if (channel) await channel.delete();
        } catch {
          // Channel may already be deleted, continue
        }
      }

      if (!keepLobby) {
        // Delete the category itself
        try {
          const category = await guild.channels
            .fetch(room.discordCategoryId)
            .catch(() => null);
          if (category) await category.delete();
        } catch {
          // Category may already be deleted
        }

        // Clear discordCategoryId in DB
        await this.prisma.room
          .update({
            where: { id: roomId },
            data: { discordCategoryId: null },
          })
          .catch(() => {}); // Room may already be deleted
      }

      // Clean up DB records for deleted channels
      await this.prisma.roomDiscordChannel.deleteMany({
        where: {
          roomId,
          ...(keepLobby ? { teamName: { not: "Lobby" } } : {}),
        },
      });

      this.logger.log(
        `Deleted Discord channels for room ${roomId} (keepLobby=${keepLobby})`,
      );
    } catch (error) {
      this.logger.error(`Failed to delete channels for room ${roomId}:`, error);
    }
  }

  // ========================================
  // Channel Update (방 설정 변경 시 팀 채널 동기화)
  // ========================================

  async updateRoomChannels(roomId: string, newNumTeams: number): Promise<void> {
    const guildId = await this.resolveRoomGuildId(roomId);
    if (!guildId) return;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { discordChannels: true },
    });

    if (!room || !room.discordCategoryId) return;

    const guild = await this.client.guilds.fetch(guildId);
    const category = await guild.channels
      .fetch(room.discordCategoryId)
      .catch(() => null);
    if (!category) return;

    // Get current team channels (excluding Lobby), sorted by team number
    const existingTeamChannels = room.discordChannels
      .filter(
        (ch: (typeof room.discordChannels)[number]) => ch.teamName !== "Lobby",
      )
      .sort(
        (
          a: (typeof room.discordChannels)[number],
          b: (typeof room.discordChannels)[number],
        ) => {
          // 생성 시각 기준 정렬 (팀명이 팀장명으로 바뀌어도 순서 유지)
          return (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0);
        },
      );
    const currentNumTeams = existingTeamChannels.length;

    if (newNumTeams > currentNumTeams) {
      // Add missing team channels
      for (let i = currentNumTeams; i < newNumTeams; i++) {
        const displayName = `┊ ${i + 1}팀`;
        const dbTeamName = `Team ${i + 1}`;

        const channel = await guild.channels.create({
          name: displayName,
          type: ChannelType.GuildVoice,
          parent: room.discordCategoryId,
          userLimit: 5,
        });

        await this.prisma.roomDiscordChannel.create({
          data: {
            roomId,
            channelId: channel.id,
            channelType: "VOICE",
            teamName: dbTeamName,
          },
        });

        this.logger.log(
          `Added team channel "${displayName}" for room ${roomId}`,
        );
      }
    } else if (newNumTeams < currentNumTeams) {
      // Remove extra team channels (from the end)
      const toRemove = existingTeamChannels.slice(newNumTeams);

      for (const ch of toRemove) {
        try {
          const channel = await guild.channels
            .fetch(ch.channelId)
            .catch(() => null);
          if (channel) await channel.delete();
        } catch {
          // Already deleted
        }

        await this.prisma.roomDiscordChannel.delete({
          where: { id: ch.id },
        });

        this.logger.log(
          `Removed team channel "${ch.teamName}" for room ${roomId}`,
        );
      }
    }
  }

  /**
   * 팀 확정 후 Discord 음성채널 이름을 팀장명 기준으로 일괄 갱신
   * teams: [{ id, name, captainId }] — auction.service에서 생성된 순서대로 전달
   */
  async renameTeamChannels(
    roomId: string,
    teams: Array<{ id: string; name: string }>,
  ): Promise<void> {
    const guildId = await this.resolveRoomGuildId(roomId);
    if (!guildId) return;

    // DB에서 팀 채널 목록 조회 (Lobby 제외, 생성순 정렬)
    const discordChannels = await this.prisma.roomDiscordChannel.findMany({
      where: { roomId, teamName: { not: "Lobby" } },
      orderBy: { createdAt: "asc" },
    });

    if (!discordChannels.length) return;

    try {
      const guild = await this.client.guilds.fetch(guildId);

      for (let i = 0; i < Math.min(teams.length, discordChannels.length); i++) {
        const team = teams[i];
        const ch = discordChannels[i];
        const newDisplayName = `┊ ${team.name}`;

        // Discord 채널명 변경
        const channel = await guild.channels.fetch(ch.channelId).catch(() => null);
        if (channel) {
          await channel.setName(newDisplayName);
        }

        // DB teamName을 team.name으로 업데이트 (매칭 키 동기화)
        await this.prisma.roomDiscordChannel.update({
          where: { id: ch.id },
          data: { teamName: team.name },
        });
      }

      this.logger.log(`Renamed Discord team channels for room ${roomId}`);
    } catch (error: any) {
      this.logger.warn(`Failed to rename team channels for room ${roomId}: ${error.message}`);
    }
  }

  /**
   * 방 이름 변경 시 Discord 카테고리 이름 동기화
   */
  async updateCategoryName(roomId: string, newRoomName: string): Promise<void> {
    const guildId = await this.resolveRoomGuildId(roomId);
    if (!guildId) return;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { discordCategoryId: true },
    });

    if (!room?.discordCategoryId) return;

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const category = await guild.channels
        .fetch(room.discordCategoryId)
        .catch(() => null);
      if (category) {
        await category.setName(`『 ${newRoomName} 』`);
        this.logger.log(
          `Updated Discord category name for room ${roomId}: "${newRoomName}"`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to update category name for room ${roomId}: ${error.message}`,
      );
    }
  }

  // ========================================
  // Utility Methods
  // ========================================

  async sendChannelMessage(channelId: string, message: string): Promise<void> {
    const guildId = await this.resolveChannelGuildId(channelId);
    if (!guildId) {
      return;
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (channel?.isTextBased()) {
        await channel.send(message);
      }
    } catch (error) {
      console.error(`Failed to send message to channel ${channelId}:`, error);
    }
  }

  async getUsersInVoiceChannel(channelId: string): Promise<string[]> {
    const guildId = await this.resolveChannelGuildId(channelId);
    if (!guildId) {
      return [];
    }

    if (!this.isDiscordReady()) {
      this.logger.warn("Discord bot is not ready, returning empty voice list");
      return [];
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channel = (await guild.channels.fetch(channelId)) as VoiceChannel;

      if (!channel || channel.type !== ChannelType.GuildVoice) {
        return [];
      }

      return Array.from(channel.members.keys());
    } catch (error) {
      console.error(`Failed to get users in channel ${channelId}:`, error);
      return [];
    }
  }

  async getDiscordUserIdByNexusUserId(
    nexusUserId: string,
  ): Promise<string | null> {
    const authProvider = await this.prisma.authProvider.findFirst({
      where: {
        userId: nexusUserId,
        provider: "DISCORD",
      },
    });

    return authProvider?.providerId || null;
  }

  /**
   * Discord providerId → Nexus userId 역방향 매핑
   * @param discordId Discord 계정의 providerId
   * @returns Nexus 유저 ID 또는 null (미연동 시)
   */
  async getNexusUserIdByDiscordId(discordId: string): Promise<string | null> {
    const authProvider = await this.prisma.authProvider.findUnique({
      where: {
        provider_providerId: {
          provider: "DISCORD",
          providerId: discordId,
        },
      },
      select: { userId: true },
    });

    return authProvider?.userId || null;
  }

  /**
   * 방의 Lobby 채널 음성 검증
   * - 방의 Discord Lobby 채널에 있는 유저들의 Discord ID를 조회
   * - 방 참가자 중 Discord 연동 유저와 비교하여 음성채널 미참가자 목록 반환
   * @param roomId 검증할 방 ID
   * @returns missingUsernames: 음성채널 미참가 유저의 Nexus username 목록
   */
  async validateVoicePresence(
    roomId: string,
  ): Promise<{ valid: boolean; missingUsernames: string[] }> {
    const guildId = await this.resolveRoomGuildId(roomId);
    if (!guildId) {
      // Discord 미설정 시 검증 스킵 (항상 통과)
      return { valid: true, missingUsernames: [] };
    }

    if (!this.isDiscordReady()) {
      this.logger.warn(
        "[validateVoicePresence] Discord bot is not ready, skipping voice validation",
      );
      return { valid: true, missingUsernames: [] };
    }

    // Lobby 채널 ID 조회
    const lobbyChannel = await this.prisma.roomDiscordChannel.findFirst({
      where: { roomId, teamName: "Lobby" },
      select: { channelId: true },
    });

    if (!lobbyChannel) {
      // 방에 Discord 채널 자체가 없으면 검증 스킵
      this.logger.debug(
        `[validateVoicePresence] 방 ${roomId}에 Lobby 채널 없음 → 검증 스킵`,
      );
      return { valid: true, missingUsernames: [] };
    }

    // Lobby 채널에 현재 접속 중인 Discord 유저 ID 목록
    const voiceUserIds = await this.getUsersInVoiceChannel(
      lobbyChannel.channelId,
    );
    const voiceUserIdSet = new Set(voiceUserIds);

    // 방 참가자 중 Discord 연동 유저 목록 조회
    const participants = await this.prisma.roomParticipant.findMany({
      where: { roomId, isReady: true },
      include: {
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
    });

    const missingUsernames: string[] = [];

    for (const participant of participants) {
      const username = participant.user.username;

      // 봇 계정은 검증 스킵
      if (this.shouldSkipBotUsername(username)) continue;

      const discordProvider = participant.user.authProviders[0];

      // Discord 미연동 유저는 검증 스킵
      if (!discordProvider) continue;

      // 음성채널 미참가 유저 기록
      if (!voiceUserIdSet.has(discordProvider.providerId)) {
        missingUsernames.push(username);
      }
    }

    return {
      valid: missingUsernames.length === 0,
      missingUsernames,
    };
  }

  // ========================================
  // Team Assignment Flow
  // ========================================

  async handleTeamAssignment(roomId: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    authProviders: {
                      where: { provider: "DISCORD" },
                    },
                  },
                },
              },
            },
          },
        },
        discordChannels: true,
      },
    });

    if (!room) {
      throw new BadRequestException("Room not found");
    }

    // Move each team to their channel
    let success = 0;
    let failed = 0;

    for (const [index, team] of room.teams.entries()) {
      const teamChannel = room.discordChannels.find(
        (ch: (typeof room.discordChannels)[number]) =>
          ch.teamName === team.name,
      );

      if (!teamChannel) {
        this.logger.warn(`No Discord channel found for team ${team.name}`);
        failed += team.members.length;
        continue;
      }

      try {
        const result = await this.moveTeamToChannel(
          team.id,
          teamChannel.channelId,
        );
        success += result.success;
        failed += result.failed;
      } catch (error) {
        failed += team.members.length;
        this.logger.warn(
          `Failed to move team ${team.name} for room ${roomId}:`,
          error,
        );
      }

      if (index < room.teams.length - 1) {
        await this.delay();
      }
    }

    this.logger.log(
      `Discord team assignment finished for room ${roomId}: ${success} success, ${failed} failed`,
    );
  }

  // ========================================
  // Lobby Management (빈 대기실 스캔 및 할당)
  // ========================================

  /**
   * 빈 내전 대기실을 스캔하여 할당
   * @param maxParticipants 최대 인원수 (팀 수 계산용)
   * @returns 할당된 대기실 채널 ID 또는 null
   */
  async findAndAssignLobbyChannel(
    maxParticipants: number,
  ): Promise<string | null> {
    // 전역 "내전 대기실"은 홈 서버 전용 개념(방 컨텍스트 없음)이라 홈 길드(env) 고정.
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    const lobbyChannelName =
      this.configService.get("DISCORD_LOBBY_CHANNEL_NAME") || "내전 대기실";

    if (!guildId) {
      this.logger.warn(
        "Discord guild not configured, skipping lobby assignment",
      );
      return null;
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();

      // 대기실 채널 찾기 (이름으로 검색)
      const lobbyChannels = Array.from(channels.values())
        .filter((ch): ch is VoiceChannel => ch !== null)
        .filter(
          (ch): ch is VoiceChannel =>
            ch.type === ChannelType.GuildVoice &&
            ch.name.includes(lobbyChannelName),
        );

      // 빈 채널 찾기 (인원이 0명인 채널)
      for (const channel of lobbyChannels) {
        const memberCount = channel.members.size;
        const userLimit = channel.userLimit || 0;

        // 빈 채널이거나, 인원 제한이 있고 여유가 있는 채널
        if (
          memberCount === 0 ||
          (userLimit > 0 && memberCount + maxParticipants <= userLimit)
        ) {
          this.logger.log(
            `Assigned lobby channel: ${channel.name} (${channel.id})`,
          );
          return channel.id;
        }
      }

      // 빈 채널이 없으면 첫 번째 대기실 반환 (또는 null)
      if (lobbyChannels.length > 0) {
        this.logger.warn(
          `No empty lobby found, using first available: ${lobbyChannels[0].name}`,
        );
        return lobbyChannels[0].id;
      }

      this.logger.warn(
        `No lobby channel found with name containing "${lobbyChannelName}"`,
      );
      return null;
    } catch (error) {
      this.logger.error(`Failed to find lobby channel:`, error);
      return null;
    }
  }

  // ========================================
  // Role Management (팀장 역할 부여)
  // ========================================

  /**
   * 팀장에게 디스코드 역할 부여
   * @param roomId 방 ID
   * @param discordUserId 디스코드 유저 ID
   * @returns 성공 여부
   */
  async assignCaptainRole(
    roomId: string,
    discordUserId: string,
  ): Promise<boolean> {
    const guildId = await this.resolveRoomGuildId(roomId);
    const captainRoleName =
      this.configService.get("DISCORD_CAPTAIN_ROLE_NAME") || "팀장";

    if (!guildId) {
      this.logger.warn(
        "Discord guild not configured, skipping role assignment",
      );
      return false;
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordUserId);

      // 역할 찾기
      const roles = await guild.roles.fetch();
      const captainRole = roles.find(
        (role: DiscordRole) =>
          role.name === captainRoleName || role.name.includes(captainRoleName),
      );

      if (!captainRole) {
        this.logger.warn(
          `Captain role "${captainRoleName}" not found in guild`,
        );
        return false;
      }

      // 역할 부여 (이미 있으면 무시)
      if (!member.roles.cache.has(captainRole.id)) {
        await member.roles.add(captainRole);
        this.logger.log(`Assigned captain role to ${member.user.tag}`);
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to assign captain role to ${discordUserId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * 팀장 역할 제거
   * @param roomId 방 ID
   * @param discordUserId 디스코드 유저 ID
   */
  async removeCaptainRole(
    roomId: string,
    discordUserId: string,
  ): Promise<void> {
    const guildId = await this.resolveRoomGuildId(roomId);
    const captainRoleName =
      this.configService.get("DISCORD_CAPTAIN_ROLE_NAME") || "팀장";

    if (!guildId) return;

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordUserId);

      const roles = await guild.roles.fetch();
      const captainRole = roles.find(
        (role: DiscordRole) =>
          role.name === captainRoleName || role.name.includes(captainRoleName),
      );

      if (captainRole && member.roles.cache.has(captainRole.id)) {
        await member.roles.remove(captainRole);
        this.logger.log(`Removed captain role from ${member.user.tag}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove captain role from ${discordUserId}:`,
        error,
      );
    }
  }

  // ========================================
  // Move All to Lobby (토너먼트 완료 시)
  // ========================================

  /**
   * 룸의 모든 참가자를 방 내부 대기실(🏠 내전 대기실)로 이동
   * @param roomId 룸 ID
   */
  async moveAllToLobby(
    roomId: string,
  ): Promise<{ success: number; failed: number }> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              include: {
                authProviders: {
                  where: { provider: "DISCORD" },
                },
              },
            },
          },
        },
        discordChannels: {
          where: { teamName: "Lobby" },
        },
      },
    });

    if (!room) {
      throw new BadRequestException("Room not found");
    }

    const targetLobbyId = room.discordChannels[0]?.channelId;

    if (!targetLobbyId) {
      this.logger.warn(`No lobby channel found for room ${roomId}`);
      return { success: 0, failed: room.participants.length };
    }

    let success = 0;
    let failed = 0;

    // 모든 참가자를 대기실로 이동
    for (const [index, participant] of room.participants.entries()) {
      // 봇 계정은 건너뛰기 (Discord 계정 없음)
      if (this.shouldSkipBotUsername(participant.user.username)) {
        this.logger.debug(
          `Skipping bot ${participant.user.username} for lobby move`,
        );
        continue;
      }

      const discordProvider = participant.user.authProviders.find(
        (p: (typeof participant.user.authProviders)[number]) =>
          p.provider === "DISCORD",
      );

      if (!discordProvider) {
        failed++;
        continue;
      }

      try {
        const moved = await this.moveUserToTeamChannel(
          discordProvider.providerId,
          targetLobbyId,
        );

        if (moved) {
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to move user ${participant.userId} to lobby:`,
          error,
        );
        failed++;
      }

      if (index < room.participants.length - 1) {
        await this.delay();
      }
    }

    this.logger.log(
      `Moved ${success} users to lobby, ${failed} failed for room ${roomId}`,
    );
    return { success, failed };
  }

  /**
   * 서버 장애 등으로 삭제되지 않은 빈 임시 내전 음성 채널을 매일 새벽 정리한다.
   * 활성 상태 방은 건드리지 않고, 오래된 WAITING/COMPLETED 방의 빈 채널만 대상으로 한다.
   */
  @Cron("0 4 * * *")
  async cleanupStaleEmptyRoomChannels(): Promise<void> {
    // TODO(multi-guild): 현재는 홈 길드만 청소. 멀티 길드 도입 시 바인딩된 모든
    // 길드를 순회하도록 확장 필요.
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    if (!guildId || !this.isDiscordReady()) return;

    const staleBefore = new Date(
      Date.now() - this.staleChannelHours * 60 * 60 * 1000,
    );

    const rooms = await this.prisma.room.findMany({
      where: {
        discordCategoryId: { not: null },
        updatedAt: { lt: staleBefore },
        status: { in: ["WAITING", "COMPLETED"] },
      },
      select: {
        id: true,
        name: true,
        discordCategoryId: true,
        discordChannels: {
          select: { channelId: true, teamName: true },
        },
      },
    });

    if (rooms.length === 0) return;

    const guild = await this.client.guilds.fetch(guildId);
    let cleanedRooms = 0;

    for (const room of rooms) {
      try {
        const channels = await Promise.all(
          room.discordChannels.map(async (record) => ({
            record,
            channel: await guild.channels
              .fetch(record.channelId)
              .catch(() => null),
          })),
        );

        const hasActiveVoiceMember = channels.some(({ channel }) => {
          return (
            channel?.type === ChannelType.GuildVoice && channel.members.size > 0
          );
        });

        if (hasActiveVoiceMember) continue;

        await this.deleteRoomChannels(room.id, false, {
          discordCategoryId: room.discordCategoryId,
          discordChannels: room.discordChannels,
        });
        cleanedRooms++;
      } catch (error) {
        this.logger.warn(
          `Failed to cleanup stale Discord channels for room ${room.id} (${room.name}):`,
          error,
        );
      }

      await this.delay();
    }

    if (cleanedRooms > 0) {
      this.logger.log(
        `Cleaned up stale empty Discord channels for ${cleanedRooms}/${rooms.length} rooms`,
      );
    }
  }
}
