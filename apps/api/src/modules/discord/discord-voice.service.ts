import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  setClient(client: Client) {
    this.client = client;
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
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    if (!guildId) {
      throw new BadRequestException("Discord guild not configured");
    }

    const guild = await this.client.guilds.fetch(guildId);

    // Create category
    const category = await guild.channels.create({
      name: `🎮 ${roomName}`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
      ],
    });

    // Create team voice channels
    const teamChannels: Array<{ teamName: string; channelId: string }> = [];
    const teamNames = [
      "🔵 Blue Team",
      "🔴 Red Team",
      "🟢 Green Team",
      "🟡 Yellow Team",
    ];

    for (let i = 0; i < numTeams; i++) {
      const channel = await guild.channels.create({
        name: teamNames[i] || `Team ${i + 1}`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: 5, // 5 players per team
      });

      teamChannels.push({
        teamName: teamNames[i] || `Team ${i + 1}`,
        channelId: channel.id,
      });

      // Store in database
      await this.prisma.roomDiscordChannel.create({
        data: {
          roomId,
          channelId: channel.id,
          channelType: "VOICE",
          teamName: teamNames[i] || `Team ${i + 1}`,
        },
      });
    }

    // Create lobby/waiting room if needed (15 or 20 players)
    let lobbyChannelId: string | undefined;
    if (numTeams >= 3) {
      const lobbyChannel = await guild.channels.create({
        name: "⏳ 대기실",
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: 20,
      });

      lobbyChannelId = lobbyChannel.id;

      await this.prisma.roomDiscordChannel.create({
        data: {
          roomId,
          channelId: lobbyChannel.id,
          channelType: "VOICE",
          teamName: "Lobby",
        },
      });
    }

    return {
      categoryId: category.id,
      teamChannels,
      lobbyChannelId,
    };
  }

  // ========================================
  // Member Movement
  // ========================================

  async moveUserToTeamChannel(
    discordUserId: string,
    teamChannelId: string,
  ): Promise<boolean> {
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    if (!guildId) {
      throw new BadRequestException("Discord guild not configured");
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

    // Move each member
    for (const member of team.members) {
      const discordProvider = member.user.authProviders.find(
        (p) => p.provider === "DISCORD",
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
    }

    return { success, failed };
  }

  // ========================================
  // Channel Cleanup
  // ========================================

  async deleteRoomChannels(roomId: string): Promise<void> {
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    if (!guildId) {
      return;
    }

    // Get room's Discord channels
    const room = await this.prisma.room.findUnique({
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

      // Delete category (this will delete all channels inside)
      const category = await guild.channels.fetch(room.discordCategoryId);
      if (category) {
        await category.delete();
      }

      // Clean up database
      await this.prisma.roomDiscordChannel.deleteMany({
        where: { roomId },
      });

      this.logger.log(`Deleted Discord channels for room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to delete channels for room ${roomId}:`, error);
    }
  }

  // ========================================
  // Utility Methods
  // ========================================

  async sendChannelMessage(channelId: string, message: string): Promise<void> {
    const guildId = this.configService.get("DISCORD_GUILD_ID");
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
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    if (!guildId) {
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
    for (const team of room.teams) {
      const teamChannel = room.discordChannels.find(
        (ch) => ch.teamName === team.name,
      );

      if (!teamChannel) {
        this.logger.warn(`No Discord channel found for team ${team.name}`);
        continue;
      }

      await this.moveTeamToChannel(team.id, teamChannel.channelId);
    }
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
   * @param discordUserId 디스코드 유저 ID
   * @returns 성공 여부
   */
  async assignCaptainRole(discordUserId: string): Promise<boolean> {
    const guildId = this.configService.get("DISCORD_GUILD_ID");
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
   * @param discordUserId 디스코드 유저 ID
   */
  async removeCaptainRole(discordUserId: string): Promise<void> {
    const guildId = this.configService.get("DISCORD_GUILD_ID");
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
   * 룸의 모든 참가자를 대기실로 이동
   * @param roomId 룸 ID
   * @param lobbyChannelId 대기실 채널 ID (없으면 자동 찾기)
   */
  async moveAllToLobby(
    roomId: string,
    lobbyChannelId?: string,
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
      },
    });

    if (!room) {
      throw new BadRequestException("Room not found");
    }

    // 대기실 채널 ID 결정: 1) 파라미터로 받은 ID, 2) 룸의 내부 대기실, 3) 외부 대기실 찾기
    let targetLobbyId: string | undefined = lobbyChannelId;

    if (!targetLobbyId) {
      // 룸의 내부 대기실 찾기 (createRoomChannels에서 생성한 대기실)
      const roomChannels = await this.prisma.roomDiscordChannel.findMany({
        where: {
          roomId,
          channelType: "VOICE",
          teamName: "Lobby",
        },
      });

      if (roomChannels.length > 0) {
        targetLobbyId = roomChannels[0].channelId;
        this.logger.log(
          `Using room's internal lobby channel: ${targetLobbyId}`,
        );
      } else {
        // 내부 대기실이 없으면 외부 대기실 찾기
        const externalLobbyId = await this.findAndAssignLobbyChannel(
          room.maxParticipants,
        );
        if (externalLobbyId) {
          targetLobbyId = externalLobbyId;
          this.logger.log(`Using external lobby channel: ${targetLobbyId}`);
        }
      }
    }

    if (!targetLobbyId) {
      this.logger.warn(`No lobby channel found for room ${roomId}`);
      return { success: 0, failed: room.participants.length };
    }

    let success = 0;
    let failed = 0;

    // 모든 참가자를 대기실로 이동
    for (const participant of room.participants) {
      const discordProvider = participant.user.authProviders.find(
        (p) => p.provider === "DISCORD",
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
    }

    this.logger.log(
      `Moved ${success} users to lobby, ${failed} failed for room ${roomId}`,
    );
    return { success, failed };
  }
}
