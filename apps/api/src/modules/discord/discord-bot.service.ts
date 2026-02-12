import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Interaction,
  VoiceChannel,
  EmbedBuilder,
  Colors,
  ChatInputCommandInteraction,
} from "discord.js";
import { PrismaService } from "../prisma/prisma.service";
import type { DiscordVoiceService } from "./discord-voice.service";

// 티어 이모지 맵핑
const TIER_EMOJI: Record<string, string> = {
  IRON: "🔘",
  BRONZE: "🥉",
  SILVER: "🥈",
  GOLD: "🥇",
  PLATINUM: "💎",
  EMERALD: "💚",
  DIAMOND: "💠",
  MASTER: "🏆",
  GRANDMASTER: "👑",
  CHALLENGER: "⚔️",
  UNRANKED: "❓",
};

// 포지션 이모지 맵핑
const ROLE_EMOJI: Record<string, string> = {
  TOP: "🛡️",
  JUNGLE: "🌲",
  MID: "⚡",
  ADC: "🎯",
  SUPPORT: "💚",
};

// 방 상태 한글 맵핑 (프로젝트 흐름: WAITING → TEAM_SELECTION → DRAFT → DRAFT_COMPLETED → ROLE_SELECTION → IN_PROGRESS → COMPLETED)
const ROOM_STATUS_KR: Record<string, string> = {
  WAITING: "대기 중",
  TEAM_SELECTION: "팀 선택 대기",
  DRAFT: "드래프트/경매 진행 중",
  DRAFT_COMPLETED: "드래프트 완료",
  ROLE_SELECTION: "역할 선택 중",
  IN_PROGRESS: "대진표 진행 중",
  COMPLETED: "완료됨",
};

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private rest: REST;
  private voiceService: DiscordVoiceService | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.rest = new REST({ version: "10" }).setToken(
      this.configService.get("DISCORD_BOT_TOKEN") || "",
    );
  }

  async onModuleInit() {
    const token = this.configService.get("DISCORD_BOT_TOKEN");
    const clientId = this.configService.get("DISCORD_CLIENT_ID");
    const guildId = this.configService.get("DISCORD_GUILD_ID");

    if (
      !token ||
      !clientId ||
      !guildId ||
      token.includes("your-") ||
      clientId.includes("your-") ||
      guildId.includes("your-")
    ) {
      console.warn(
        "Discord bot not properly configured, skipping bot initialization",
      );
      return;
    }

    try {
      this.setupEventHandlers();
      await this.registerCommands();
      await this.client.login(token);
      console.log("Discord bot initialized successfully");
    } catch (error) {
      console.warn(
        "Discord bot initialization failed:",
        error instanceof Error ? error.message : error,
      );
      console.warn("Application will continue without Discord bot features");
    }
  }

  async onModuleDestroy() {
    this.client.destroy();
  }

  private setupEventHandlers() {
    this.client.on("ready", () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
      // 봇 상태 메시지 설정
      this.client.user?.setActivity("🎮 /nexus help", { type: 0 });
    });

    this.client.on("interactionCreate", this.handleInteraction.bind(this));
  }

  private async registerCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName("nexus")
        .setDescription("Nexus 내전 토너먼트 명령어")
        .addSubcommand((sub) =>
          sub.setName("help").setDescription("모든 명령어 도움말 보기"),
        )
        .addSubcommand((sub) =>
          sub.setName("link").setDescription("Discord 계정을 Nexus에 연동"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("profile")
            .setDescription("내 프로필 또는 다른 유저 프로필 보기")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("프로필을 볼 유저 (선택사항)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("rooms")
            .setDescription("현재 활성화된 내전 방 목록 보기"),
        )
        .addSubcommand((sub) =>
          sub.setName("team").setDescription("현재 참가 중인 팀 정보 보기"),
        )
        .addSubcommand((sub) =>
          sub.setName("auction").setDescription("현재 경매 상태 확인"),
        )
        .addSubcommand((sub) =>
          sub.setName("match").setDescription("현재 진행 중인 매치 정보 보기"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("bracket")
            .setDescription("참가 중인 방의 대진표(브래킷) 보기"),
        )
        .addSubcommand((sub) =>
          sub.setName("stats").setDescription("내 통계 정보 보기"),
        ),
    ].map((cmd) => cmd.toJSON());

    const guildId = this.configService.get("DISCORD_GUILD_ID");

    if (guildId) {
      await this.rest.put(
        Routes.applicationGuildCommands(
          this.configService.get("DISCORD_CLIENT_ID") || "",
          guildId,
        ),
        { body: commands },
      );
    }
  }

  private async handleInteraction(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "nexus") {
      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
          case "help":
            await this.handleHelpCommand(interaction);
            break;
          case "link":
            await this.handleLinkCommand(interaction);
            break;
          case "profile":
            await this.handleProfileCommand(interaction);
            break;
          case "rooms":
            await this.handleRoomsCommand(interaction);
            break;
          case "team":
            await this.handleTeamCommand(interaction);
            break;
          case "auction":
            await this.handleAuctionCommand(interaction);
            break;
          case "match":
            await this.handleMatchCommand(interaction);
            break;
          case "bracket":
            await this.handleBracketCommand(interaction);
            break;
          case "stats":
            await this.handleStatsCommand(interaction);
            break;
        }
      } catch (error) {
        console.error(`Error handling command ${subcommand}:`, error);
        await interaction.reply({
          content: "❌ 명령어 처리 중 오류가 발생했습니다.",
          ephemeral: true,
        });
      }
    }
  }

  // ========================================
  // Command Handlers
  // ========================================

  private async handleHelpCommand(interaction: ChatInputCommandInteraction) {
    const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("🎮 Nexus 명령어 도움말")
      .setDescription("LoL 내전 토너먼트 플랫폼 Nexus의 Discord 봇입니다.")
      .addFields(
        {
          name: "📋 기본 명령어",
          value: [
            "`/nexus help` - 이 도움말 보기",
            "`/nexus link` - Discord 계정 연동",
            "`/nexus profile [@유저]` - 프로필 보기",
            "`/nexus stats` - 내 통계 보기",
          ].join("\n"),
        },
        {
          name: "🏠 방 관련",
          value: [
            "`/nexus rooms` - 활성 방 목록 (대기~역할선택~진행중)",
            "`/nexus team` - 현재 팀 정보",
          ].join("\n"),
        },
        {
          name: "⚔️ 게임 관련",
          value: [
            "`/nexus auction` - 경매 상태 (경매 방 참가 시)",
            "`/nexus match` - 현재 진행 중인 매치 정보",
            "`/nexus bracket` - 참가 중인 방의 대진표 보기",
          ].join("\n"),
        },
      )
      .setFooter({ text: `웹사이트: ${appUrl}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  private async handleLinkCommand(interaction: ChatInputCommandInteraction) {
    const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";

    // 이미 연동된 유저인지 확인
    const existingUser = await this.findUserByDiscordId(interaction.user.id);

    if (existingUser) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("✅ 이미 연동됨")
        .setDescription(
          `**${existingUser.username}** 계정으로 이미 연동되어 있습니다.`,
        )
        .addFields({
          name: "연동된 Riot 계정",
          value:
            existingUser.riotAccounts.length > 0
              ? existingUser.riotAccounts
                  .map((r) => `${r.gameName}#${r.tagLine}`)
                  .join(", ")
              : "없음",
        });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("🔗 계정 연동")
      .setDescription("아래 링크에서 Discord로 로그인하여 계정을 연동하세요!")
      .addFields({
        name: "연동 링크",
        value: `[여기를 클릭하세요](${appUrl}/auth/login)`,
      })
      .setFooter({
        text: "Discord 로그인 버튼을 클릭하면 자동으로 연동됩니다",
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  private async handleProfileCommand(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;

    const user = await this.findUserByDiscordId(targetUser.id);

    if (!user) {
      await interaction.reply({
        content: `❌ ${targetUser.id === interaction.user.id ? "계정이 연동되지 않았습니다" : "해당 유저가 Nexus에 연동되지 않았습니다"}. \`/nexus link\`로 연동하세요!`,
        ephemeral: true,
      });
      return;
    }

    const primaryAccount = user.riotAccounts.find((r) => r.isPrimary);

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle(`🎮 ${user.username}의 프로필`)
      .setThumbnail(
        user.avatar ||
          `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.png`,
      )
      .addFields(
        {
          name: "🏆 역할",
          value:
            user.role === "ADMIN"
              ? "관리자"
              : user.role === "MODERATOR"
                ? "모더레이터"
                : "유저",
          inline: true,
        },
        {
          name: "⭐ 평판",
          value: `${user.reputation}점`,
          inline: true,
        },
      );

    if (primaryAccount) {
      const tierEmoji = TIER_EMOJI[primaryAccount.tier] || "❓";
      const mainRoleEmoji = primaryAccount.mainRole
        ? ROLE_EMOJI[primaryAccount.mainRole]
        : "";
      const subRoleEmoji = primaryAccount.subRole
        ? ROLE_EMOJI[primaryAccount.subRole]
        : "";

      embed.addFields(
        {
          name: "🎮 Riot 계정",
          value: `${primaryAccount.gameName}#${primaryAccount.tagLine}`,
          inline: false,
        },
        {
          name: "📊 랭크",
          value: `${tierEmoji} ${primaryAccount.tier} ${primaryAccount.rank} (${primaryAccount.lp} LP)`,
          inline: true,
        },
        {
          name: "🎯 주 포지션",
          value: primaryAccount.mainRole
            ? `${mainRoleEmoji} ${primaryAccount.mainRole}${primaryAccount.subRole ? ` / ${subRoleEmoji} ${primaryAccount.subRole}` : ""}`
            : "미설정",
          inline: true,
        },
      );

      if (primaryAccount.peakTier) {
        const peakEmoji = TIER_EMOJI[primaryAccount.peakTier] || "❓";
        embed.addFields({
          name: "🏅 최고 티어",
          value: `${peakEmoji} ${primaryAccount.peakTier} ${primaryAccount.peakRank || ""}`,
          inline: true,
        });
      }
    } else if (user.riotAccounts.length === 0) {
      embed.addFields({
        name: "🎮 Riot 계정",
        value: "연동된 계정 없음",
        inline: false,
      });
    }

    embed.setFooter({
      text: `가입일: ${user.createdAt.toLocaleDateString("ko-KR")}`,
    });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleRoomsCommand(interaction: ChatInputCommandInteraction) {
    const rooms = await this.prisma.room.findMany({
      where: {
        status: {
          in: [
            "WAITING",
            "TEAM_SELECTION",
            "DRAFT",
            "DRAFT_COMPLETED",
            "ROLE_SELECTION",
            "IN_PROGRESS",
          ],
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        teamMode: true,
        isPrivate: true,
        maxParticipants: true,
        hostId: true,
        host: { select: { username: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (rooms.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Grey)
        .setTitle("🏠 활성 방 목록")
        .setDescription(
          "현재 활성화된 방이 없습니다.\n웹사이트에서 새 방을 만들어보세요!",
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("🏠 활성 방 목록")
      .setDescription(`현재 ${rooms.length}개의 방이 활성화되어 있습니다.`);

    for (const room of rooms) {
      const statusEmoji =
        room.status === "WAITING"
          ? "⏳"
          : room.status === "TEAM_SELECTION"
            ? "👥"
            : room.status === "DRAFT"
              ? "📋"
              : room.status === "DRAFT_COMPLETED"
                ? "✅"
                : room.status === "ROLE_SELECTION"
                  ? "🎯"
                  : "⚔️";
      const modeText =
        room.teamMode === "AUCTION" ? "경매" : "스네이크 드래프트";
      const lockIcon = room.isPrivate ? "🔒" : "🔓";

      embed.addFields({
        name: `${statusEmoji} ${room.name} ${lockIcon}`,
        value: [
          `**호스트:** ${room.host.username}`,
          `**인원:** ${room._count.participants}/${room.maxParticipants}`,
          `**모드:** ${modeText}`,
          `**상태:** ${ROOM_STATUS_KR[room.status] ?? room.status}`,
        ].join("\n"),
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleTeamCommand(interaction: ChatInputCommandInteraction) {
    const user = await this.findUserByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        content: "❌ 계정이 연동되지 않았습니다. `/nexus link`로 연동하세요!",
        ephemeral: true,
      });
      return;
    }

    // 현재 참가 중인 팀 찾기
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId: user.id },
      include: {
        team: {
          include: {
            room: true,
            captain: true,
            members: {
              include: {
                user: {
                  include: {
                    riotAccounts: { where: { isPrimary: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const activeStatuses = [
      "WAITING",
      "TEAM_SELECTION",
      "DRAFT",
      "DRAFT_COMPLETED",
      "ROLE_SELECTION",
      "IN_PROGRESS",
    ];
    if (!teamMember || !activeStatuses.includes(teamMember.team.room.status)) {
      await interaction.reply({
        content: "❌ 현재 참가 중인 팀이 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const team = teamMember.team;

    const embed = new EmbedBuilder()
      .setColor(
        team.color ? parseInt(team.color.replace("#", ""), 16) : Colors.Blue,
      )
      .setTitle(`⚔️ ${team.name}`)
      .setDescription(`**방:** ${team.room.name}`)
      .addFields({
        name: "👑 팀장",
        value: team.captain.username,
        inline: true,
      });

    if (team.room.teamMode === "AUCTION") {
      embed.addFields({
        name: "💰 예산",
        value: `${team.remainingBudget.toLocaleString()} / ${team.initialBudget.toLocaleString()}`,
        inline: true,
      });
    }

    const memberLines = team.members.map((m) => {
      const riot = m.user.riotAccounts[0];
      const roleEmoji = m.assignedRole ? ROLE_EMOJI[m.assignedRole] : "❓";
      const tierEmoji = riot ? TIER_EMOJI[riot.tier] || "" : "";
      const riotInfo = riot ? `${riot.gameName}#${riot.tagLine}` : "연동 안됨";
      const isCaptain = m.userId === team.captainId ? " 👑" : "";
      return `${roleEmoji} **${m.user.username}**${isCaptain} - ${tierEmoji} ${riotInfo}`;
    });

    embed.addFields({
      name: `👥 팀원 (${team.members.length}/5)`,
      value: memberLines.join("\n") || "팀원 없음",
      inline: false,
    });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleAuctionCommand(interaction: ChatInputCommandInteraction) {
    const user = await this.findUserByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        content: "❌ 계정이 연동되지 않았습니다. `/nexus link`로 연동하세요!",
        ephemeral: true,
      });
      return;
    }

    // 유저가 참가 중인 경매 방 찾기 (팀 선택 대기 또는 드래프트 진행 중)
    const participant = await this.prisma.roomParticipant.findFirst({
      where: {
        userId: user.id,
        room: {
          status: { in: ["TEAM_SELECTION", "DRAFT"] },
          teamMode: "AUCTION",
        },
      },
      include: {
        room: {
          include: {
            teams: {
              include: {
                captain: true,
                members: true,
              },
            },
            participants: {
              where: { teamId: null },
              include: {
                user: {
                  include: {
                    riotAccounts: { where: { isPrimary: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!participant) {
      await interaction.reply({
        content: "❌ 현재 참가 중인 경매가 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const room = participant.room;

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle(`💰 경매 현황 - ${room.name}`)
      .setDescription("각 팀의 예산 및 인원 현황입니다.");

    // 팀별 정보
    for (const team of room.teams) {
      const budgetPercent = Math.round(
        (team.remainingBudget / team.initialBudget) * 100,
      );
      embed.addFields({
        name: `${team.name} (${team.captain.username})`,
        value: [
          `💵 예산: ${team.remainingBudget.toLocaleString()} / ${team.initialBudget.toLocaleString()} (${budgetPercent}%)`,
          `👥 인원: ${team.members.length}/5`,
        ].join("\n"),
        inline: true,
      });
    }

    // 미배정 선수 목록
    const unassigned = room.participants.filter(
      (p) => !p.teamId && !p.isCaptain,
    );
    if (unassigned.length > 0) {
      const playerList = unassigned
        .slice(0, 10)
        .map((p) => {
          const riot = p.user.riotAccounts[0];
          const tierEmoji = riot ? TIER_EMOJI[riot.tier] || "" : "";
          return `${tierEmoji} ${p.user.username}`;
        })
        .join(", ");

      embed.addFields({
        name: `📋 대기 중인 선수 (${unassigned.length}명)`,
        value:
          playerList +
          (unassigned.length > 10 ? ` 외 ${unassigned.length - 10}명` : ""),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleMatchCommand(interaction: ChatInputCommandInteraction) {
    const user = await this.findUserByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        content: "❌ 계정이 연동되지 않았습니다. `/nexus link`로 연동하세요!",
        ephemeral: true,
      });
      return;
    }

    // 유저가 속한 진행 중인 매치 찾기
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId: user.id },
      include: {
        team: {
          include: {
            matchesAsTeamA: {
              where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
              include: {
                teamA: { include: { members: { include: { user: true } } } },
                teamB: { include: { members: { include: { user: true } } } },
                room: true,
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            matchesAsTeamB: {
              where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
              include: {
                teamA: { include: { members: { include: { user: true } } } },
                teamB: { include: { members: { include: { user: true } } } },
                room: true,
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const match =
      teamMember?.team.matchesAsTeamA[0] || teamMember?.team.matchesAsTeamB[0];

    if (!match) {
      await interaction.reply({
        content: "❌ 현재 진행 중인 매치가 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const statusEmoji = match.status === "PENDING" ? "⏳" : "⚔️";
    const statusText = match.status === "PENDING" ? "대기 중" : "진행 중";

    const embed = new EmbedBuilder()
      .setColor(match.status === "IN_PROGRESS" ? Colors.Red : Colors.Yellow)
      .setTitle(`${statusEmoji} 매치 정보`)
      .setDescription(
        `**${match.room.name}** - ${match.bracketRound || `${match.matchNumber}번째 매치`}`,
      )
      .addFields(
        {
          name: `🔵 ${match.teamA?.name ?? "TBD"}`,
          value:
            match.teamA?.members.map((m) => m.user.username).join(", ") ||
            "팀원 없음",
          inline: true,
        },
        {
          name: "VS",
          value: statusText,
          inline: true,
        },
        {
          name: `🔴 ${match.teamB?.name ?? "TBD"}`,
          value:
            match.teamB?.members.map((m) => m.user.username).join(", ") ||
            "팀원 없음",
          inline: true,
        },
      );

    if (match.tournamentCode) {
      embed.addFields({
        name: "🎮 토너먼트 코드",
        value: `\`${match.tournamentCode}\`\n*커스텀 게임에서 이 코드를 입력하세요*`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleBracketCommand(interaction: ChatInputCommandInteraction) {
    const user = await this.findUserByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        content: "❌ 계정이 연동되지 않았습니다. `/nexus link`로 연동하세요!",
        ephemeral: true,
      });
      return;
    }

    // 참가 중인 방 중 대진표가 있는 방 (IN_PROGRESS 또는 COMPLETED)
    const participant = await this.prisma.roomParticipant.findFirst({
      where: {
        userId: user.id,
        room: {
          status: { in: ["IN_PROGRESS", "COMPLETED"] },
        },
      },
      select: {
        roomId: true,
        room: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    if (!participant) {
      await interaction.reply({
        content:
          "❌ 대진표가 있는 방에 참가 중이 아닙니다. (역할 선택이 끝난 뒤 대진이 생성됩니다)",
        ephemeral: true,
      });
      return;
    }

    const matches = await this.prisma.match.findMany({
      where: { roomId: participant.roomId },
      select: {
        id: true,
        round: true,
        bracketRound: true,
        status: true,
        winnerId: true,
        tournamentCode: true,
        teamA: { select: { name: true } },
        teamB: { select: { name: true } },
      },
      orderBy: [{ round: "asc" }, { createdAt: "asc" }],
    });

    if (matches.length === 0) {
      await interaction.reply({
        content: "❌ 해당 방에 아직 매치가 생성되지 않았습니다.",
        ephemeral: true,
      });
      return;
    }

    const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";
    const room = participant.room;
    const completedCount = matches.filter(
      (m) => m.status === "COMPLETED",
    ).length;

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`📋 대진표 - ${room.name}`)
      .setDescription(
        `**상태:** ${ROOM_STATUS_KR[room.status] ?? room.status} · ${completedCount}/${matches.length}경기 완료`,
      )
      .setFooter({
        text: `웹에서 보기: ${appUrl}/tournaments/${room.id}/bracket`,
      })
      .setTimestamp();

    // 라운드별로 그룹
    const byRound = new Map<number, typeof matches>();
    for (const m of matches) {
      const r = m.round ?? 0;
      if (!byRound.has(r)) byRound.set(r, []);
      byRound.get(r)!.push(m);
    }

    const roundOrder = Array.from(byRound.keys()).sort((a, b) => a - b);
    for (const round of roundOrder) {
      const list = byRound.get(round)!;
      const lines = list.map((m) => {
        const label = m.bracketRound || `R${round}`;
        const teamA = m.teamA?.name ?? "TBD";
        const teamB = m.teamB?.name ?? "TBD";
        const statusIcon =
          m.status === "COMPLETED"
            ? "✅"
            : m.status === "IN_PROGRESS"
              ? "⚔️"
              : "⏳";
        return `${statusIcon} **${label}** ${teamA} vs ${teamB}`;
      });
      embed.addFields({
        name: `라운드 ${round}`,
        value: lines.join("\n") || "-",
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleStatsCommand(interaction: ChatInputCommandInteraction) {
    const user = await this.findUserByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        content: "❌ 계정이 연동되지 않았습니다. `/nexus link`로 연동하세요!",
        ephemeral: true,
      });
      return;
    }

    // 통계 집계
    const [roomCount, matchCount, winCount, ratingStats] = await Promise.all([
      // 참가한 방 수
      this.prisma.roomParticipant.count({
        where: { userId: user.id },
      }),
      // 총 매치 수
      this.prisma.teamMember.count({
        where: {
          userId: user.id,
          team: {
            OR: [
              { matchesAsTeamA: { some: { status: "COMPLETED" } } },
              { matchesAsTeamB: { some: { status: "COMPLETED" } } },
            ],
          },
        },
      }),
      // 승리 수 (팀 승리)
      this.prisma.teamMember.count({
        where: {
          userId: user.id,
          team: { wonMatches: { some: {} } },
        },
      }),
      // 평균 평점
      this.prisma.userRating.aggregate({
        where: { targetUserId: user.id },
        _avg: {
          skillRating: true,
          attitudeRating: true,
          communicationRating: true,
        },
        _count: true,
      }),
    ]);

    const embed = new EmbedBuilder()
      .setColor(Colors.Purple)
      .setTitle(`📊 ${user.username}의 통계`)
      .addFields(
        {
          name: "🏠 참가한 방",
          value: `${roomCount}개`,
          inline: true,
        },
        {
          name: "⚔️ 총 매치",
          value: `${matchCount}회`,
          inline: true,
        },
        {
          name: "🏆 승률",
          value:
            matchCount > 0
              ? `${Math.round((winCount / matchCount) * 100)}%`
              : "N/A",
          inline: true,
        },
        {
          name: "⭐ 평판 점수",
          value: `${user.reputation}점`,
          inline: true,
        },
      );

    if (ratingStats._count > 0) {
      const avgSkill = ratingStats._avg.skillRating?.toFixed(1) || "N/A";
      const avgAttitude = ratingStats._avg.attitudeRating?.toFixed(1) || "N/A";
      const avgComm = ratingStats._avg.communicationRating?.toFixed(1) || "N/A";

      embed.addFields(
        {
          name: "🎯 실력 평점",
          value: `${avgSkill}/5`,
          inline: true,
        },
        {
          name: "😊 태도 평점",
          value: `${avgAttitude}/5`,
          inline: true,
        },
        {
          name: "💬 소통 평점",
          value: `${avgComm}/5`,
          inline: true,
        },
      );
    }

    embed.setFooter({ text: `총 ${ratingStats._count}개의 평가 받음` });

    await interaction.reply({ embeds: [embed] });
  }

  // ========================================
  // Helper Methods
  // ========================================

  private async findUserByDiscordId(discordId: string) {
    const authProvider = await this.prisma.authProvider.findUnique({
      where: {
        provider_providerId: {
          provider: "DISCORD",
          providerId: discordId,
        },
      },
      include: {
        user: {
          include: {
            riotAccounts: true,
          },
        },
      },
    });

    return authProvider?.user || null;
  }

  // ========================================
  // Utility methods for external use
  // ========================================

  async moveToVoiceChannel(guildId: string, userId: string, channelId: string) {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    const channel = (await guild.channels.fetch(channelId)) as VoiceChannel;

    if (member.voice.channel && channel) {
      await member.voice.setChannel(channel);
      return true;
    }

    return false;
  }

  async sendNotification(guildId: string, channelId: string, message: string) {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (channel?.isTextBased()) {
      await channel.send(message);
    }
  }

  async sendEmbedNotification(
    guildId: string,
    channelId: string,
    embed: EmbedBuilder,
  ) {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  }

  // Methods required by DiscordModule
  getClient(): Client {
    return this.client;
  }

  setVoiceService(voiceService: DiscordVoiceService): void {
    this.voiceService = voiceService;
  }

  // ========================================
  // Notification Builders (for use by other services)
  // ========================================

  buildRoomCreatedEmbed(
    roomName: string,
    hostName: string,
    maxPlayers: number,
  ) {
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("🎮 새 내전방 생성!")
      .setDescription(`**${roomName}** 방이 생성되었습니다.`)
      .addFields(
        { name: "👑 호스트", value: hostName, inline: true },
        { name: "👥 정원", value: `${maxPlayers}명`, inline: true },
      )
      .setTimestamp();
  }

  buildAuctionStartEmbed(roomName: string, teams: string[]) {
    return new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("💰 경매 시작!")
      .setDescription(`**${roomName}** 방의 경매가 시작되었습니다.`)
      .addFields({
        name: "⚔️ 참가 팀",
        value: teams.join("\n"),
      })
      .setTimestamp();
  }

  buildMatchStartEmbed(
    teamAName: string,
    teamBName: string,
    tournamentCode?: string,
  ) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("⚔️ 매치 시작!")
      .setDescription(`**${teamAName}** vs **${teamBName}**`)
      .setTimestamp();

    if (tournamentCode) {
      embed.addFields({
        name: "🎮 토너먼트 코드",
        value: `\`${tournamentCode}\``,
      });
    }

    return embed;
  }

  buildMatchResultEmbed(winnerName: string, loserName: string, score?: string) {
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("🏆 매치 종료!")
      .setDescription(`**${winnerName}** 팀이 승리했습니다!`)
      .addFields({
        name: "결과",
        value: `${winnerName} ${score ? score : ">"} ${loserName}`,
      })
      .setTimestamp();
  }

  buildTournamentCompletedEmbed(roomName: string, winnerName: string) {
    return new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("👑 토너먼트 완료!")
      .setDescription(`**${roomName}** 토너먼트가 종료되었습니다!`)
      .addFields({
        name: "🏆 우승 팀",
        value: `**${winnerName}**`,
      })
      .setTimestamp();
  }
}
