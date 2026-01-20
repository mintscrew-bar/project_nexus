import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  Client,
  ChannelType,
  PermissionFlagsBits,
  CategoryChannel,
  VoiceChannel,
  GuildMember,
} from "discord.js";

@Injectable()
export class DiscordVoiceService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private client: Client,
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
    const teamNames = ["🔵 Blue Team", "🔴 Red Team", "🟢 Green Team", "🟡 Yellow Team"];

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
        console.log(`User ${discordUserId} is not in a voice channel`);
        return false;
      }

      // Move to target channel
      await member.voice.setChannel(teamChannelId);
      console.log(`Moved user ${discordUserId} to channel ${teamChannelId}`);
      return true;
    } catch (error) {
      console.error(`Failed to move user ${discordUserId}:`, error);
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

      console.log(`Deleted Discord channels for room ${roomId}`);
    } catch (error) {
      console.error(`Failed to delete channels for room ${roomId}:`, error);
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
        console.warn(`No Discord channel found for team ${team.name}`);
        continue;
      }

      await this.moveTeamToChannel(team.id, teamChannel.channelId);
    }
  }
}
