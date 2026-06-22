import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
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
  Guild,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  Role,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  VoiceState,
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

// 티어 순서 맵핑 (정렬용)
const TIER_ORDER: Record<string, number> = {
  CHALLENGER: 10,
  GRANDMASTER: 9,
  MASTER: 8,
  DIAMOND: 7,
  EMERALD: 6,
  PLATINUM: 5,
  GOLD: 4,
  SILVER: 3,
  BRONZE: 2,
  IRON: 1,
  UNRANKED: 0,
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

const RULES_MODAL_ID = "nexus_rules_publish_modal";
const RULES_TITLE_INPUT_ID = "nexus_rules_title";
const RULES_CONTENT_INPUT_ID = "nexus_rules_content";
const VERIFY_MODAL_ID = "nexus_verify_modal";
const VERIFY_BUTTON_ID = "nexus_verify_start_button";
const VERIFY_RIOT_ID_INPUT_ID = "nexus_verify_riot_id";
const DISCORD_EMBED_DESCRIPTION_LIMIT = 4000;
const RULES_EMBED_DESCRIPTION_LIMIT = 3800;
const DISCORD_LINE_ROLE_KEYS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const DISCORD_TIER_ROLE_KEYS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
  "UNRANKED",
];

interface RoomNotifEntry {
  guildId: string;
  channelId: string;
  messageId: string;
  roomName: string;
  hostName: string;
  maxPlayers: number;
  teamMode: string;
  isPrivate: boolean;
}

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private rest: REST;
  private voiceService: DiscordVoiceService | null = null;
  // 방 생성 알림 메시지 참조 (roomId → 메시지 정보), 재시작 시 초기화됨
  private readonly roomNotifMap = new Map<string, RoomNotifEntry>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
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
    const guildId =
      this.configService.get("DISCORD_GUILD_ID") ||
      this.configService.get("ADMIN_ALERT_DISCORD_GUILD_ID");

    if (
      !token ||
      !clientId ||
      token.includes("your-") ||
      clientId.includes("your-") ||
      guildId?.includes("your-")
    ) {
      console.warn(
        "Discord bot not properly configured, skipping bot initialization",
      );
      return;
    }

    try {
      this.setupEventHandlers();
      await this.client.login(token);
      console.log("Discord bot initialized successfully");
      await this.registerCommands().catch((error) => {
        console.warn(
          "Discord slash command registration failed:",
          error instanceof Error ? error.message : error,
        );
      });
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
    this.client.on("clientReady", async () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
      // 봇 상태 메시지 설정
      this.client.user?.setActivity("🎮 /nexus help", { type: 0 });

      // 서버 재시작 후 현재 Discord 음성 채널 멤버 상태를 동기화.
      // 재시작 전에 이미 채널에 있던 유저들을 "음성 접속 중"으로 복구한다.
      await this.syncVoiceStatesOnReady().catch((err) =>
        console.warn("[DiscordBot] 음성 상태 동기화 실패:", err?.message),
      );
    });

    this.client.on("interactionCreate", this.handleInteraction.bind(this));
    this.client.on("guildMemberAdd", this.handleGuildMemberAdd.bind(this));

    // ─── 멀티 길드 라이프사이클 ───
    // 봇이 외부 길드에 추가/제거될 때 DiscordGuildLink 상태를 동기화한다.
    this.client.on("guildCreate", this.handleGuildCreate.bind(this));
    this.client.on("guildDelete", this.handleGuildDelete.bind(this));

    // ─── 음성채널 입/퇴장 감지 ───
    // 유저가 음성채널에 입장하거나 퇴장할 때마다 해당 채널이
    // Nexus 방의 Lobby 채널인지 DB에서 조회하고, 맞으면 내부 이벤트 발행
    this.client.on("voiceStateUpdate", this.handleVoiceStateUpdate.bind(this));
  }

  private async handleGuildMemberAdd(member: GuildMember) {
    if (member.user.bot) return;
    console.log(`[DiscordBot] 신규 멤버 입장: ${member.user.tag}`);
  }

  private async sendAdminLifecycleAlert(message: string) {
    const guildId =
      this.configService.get<string>("ADMIN_ALERT_DISCORD_GUILD_ID") ||
      this.configService.get<string>("DISCORD_GUILD_ID");
    const channelId =
      this.configService.get<string>(
        "ADMIN_ALERT_DISCORD_APPROVAL_CHANNEL_ID",
      ) ||
      this.configService.get<string>(
        "ADMIN_ALERT_DISCORD_SECURITY_CHANNEL_ID",
      ) ||
      this.configService.get<string>("ADMIN_ALERT_DISCORD_CHANNEL_ID");

    if (!guildId || !channelId) return;
    await this.sendNotification(guildId, channelId, message).catch((err: any) =>
      console.warn(
        `[DiscordBot] 관리자 라이프사이클 알림 실패: ${err?.message}`,
      ),
    );
  }

  /**
   * 봇이 외부 길드에 추가됨. OAuth 흐름으로 미리 만들어둔 PENDING 링크가 있으면
   * 길드 이름을 갱신한다. 링크가 없으면(우리 흐름 외 무단 초대) 휴면 — 아무 동작 안 함.
   */
  private async handleGuildCreate(guild: { id: string; name: string }) {
    try {
      const link = await this.prisma.discordGuildLink.findUnique({
        where: { guildId: guild.id },
      });
      if (!link) {
        console.log(
          `[DiscordBot] 미등록 길드에 추가됨(휴면): ${guild.name} (${guild.id})`,
        );
        await this.sendAdminLifecycleAlert(
          [
            "**Discord 봇이 미등록 서버에 추가됨**",
            "승인 링크가 없으므로 이 서버는 Nexus 방 생성에 사용할 수 없습니다.",
            `- 길드명: ${guild.name}`,
            `- 길드 ID: ${guild.id}`,
          ].join("\n"),
        );
        return;
      }
      await this.prisma.discordGuildLink.update({
        where: { guildId: guild.id },
        data: { guildName: guild.name },
      });
      console.log(`[DiscordBot] 길드 연동 확인: ${guild.name} (${guild.id})`);
    } catch (err: any) {
      console.warn(`[DiscordBot] guildCreate 처리 실패: ${err?.message}`);
    }
  }

  /**
   * 길드 활성화(승인) 전 봇이 실제로 그 길드에 있고 채널 운영 권한을 가졌는지 검증한다.
   * - inGuild: 봇이 해당 길드 멤버인지
   * - hasManageChannels: 카테고리/음성채널 생성·삭제 권한
   * - hasMoveMembers: 음성채널 간 이동 권한
   */
  async verifyGuildPermissions(guildId: string): Promise<{
    inGuild: boolean;
    hasManageChannels: boolean;
    hasMoveMembers: boolean;
    guildName?: string;
  }> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const me = await guild.members.fetchMe();
      return {
        inGuild: true,
        hasManageChannels: me.permissions.has(
          PermissionFlagsBits.ManageChannels,
        ),
        hasMoveMembers: me.permissions.has(PermissionFlagsBits.MoveMembers),
        guildName: guild.name,
      };
    } catch {
      // fetch 실패 = 봇이 길드에 없음(추방되었거나 초대 안 됨)
      return {
        inGuild: false,
        hasManageChannels: false,
        hasMoveMembers: false,
      };
    }
  }

  /**
   * 봇이 외부 길드에서 추방/제거됨. 해당 링크를 DISABLED로 표시해
   * 더 이상 그 길드에 채널을 만들지 않도록 한다.
   */
  private async handleGuildDelete(guild: { id: string }) {
    try {
      await this.prisma.discordGuildLink.updateMany({
        where: { guildId: guild.id, status: { not: "DISABLED" } },
        data: { status: "DISABLED" },
      });
      console.log(`[DiscordBot] 길드 연동 해제(DISABLED): ${guild.id}`);
    } catch (err: any) {
      console.warn(`[DiscordBot] guildDelete 처리 실패: ${err?.message}`);
    }
  }

  /**
   * Discord 음성채널 입/퇴장 이벤트 핸들러
   * - 입장(channelId가 새로 생김) 또는 퇴장(channelId가 사라짐) 모두 처리
   * - 봇 계정(testbot_ 패턴) 은 무시
   * - 해당 채널이 RoomDiscordChannel(Lobby)에 해당하면 'discord.voice.update' 이벤트 발행
   */
  private async handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ) {
    const discordUserId = newState.member?.user.id || oldState.member?.user.id;
    if (!discordUserId) return;

    // 봇 계정은 스킵 (Discord 봇 자체 또는 testbot_ 패턴 유저)
    if (
      newState.member?.user.bot ||
      /^testbot_\d+$/.test(newState.member?.user.username || "")
    ) {
      return;
    }

    // 변경된 채널 ID (입장한 채널 또는 퇴장한 채널)
    const changedChannelId = newState.channelId || oldState.channelId;
    if (!changedChannelId) return;

    try {
      // 해당 채널이 Nexus 방의 Discord 채널인지 확인 (Lobby 채널만 관심)
      const roomChannel = await this.prisma.roomDiscordChannel.findFirst({
        where: {
          channelId: changedChannelId,
          teamName: "Lobby", // Lobby 채널만 음성 검증에 사용
        },
        select: { roomId: true },
      });

      if (!roomChannel) return; // Nexus와 관련 없는 채널이면 무시

      // 현재 음성 상태: 방에 들어온 채널이 Lobby이면 inVoice=true
      const inVoice = newState.channelId === changedChannelId;

      // Room Gateway로 이벤트 전달
      this.eventEmitter.emit("discord.voice.update", {
        discordUserId,
        roomId: roomChannel.roomId,
        inVoice,
      });
    } catch (error) {
      console.error("[DiscordBot] voiceStateUpdate 처리 오류:", error);
    }
  }

  /**
   * 봇이 ready 상태가 됐을 때 현재 음성 채널 멤버 상태를 전체 동기화한다.
   * 서버 재시작 시 이미 Discord 채널에 있는 유저들이
   * "음성 미접속"으로 잘못 표시되는 문제를 해결한다.
   *
   * 동작:
   * 1. DB에서 WAITING 상태인 방들의 Lobby Discord 채널 조회
   * 2. Discord API로 각 채널의 현재 멤버 목록 fetch
   * 3. 멤버별로 'discord.voice.update' 이벤트를 재발행하여 상태 복구
   */
  private async syncVoiceStatesOnReady(): Promise<void> {
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    if (!guildId) return;

    // WAITING 방의 Lobby 채널만 조회 (게임 진행 중인 방은 제외)
    const lobbyChannels = await this.prisma.roomDiscordChannel.findMany({
      where: {
        teamName: "Lobby",
        room: { status: "WAITING" },
      },
      select: { channelId: true, roomId: true },
    });

    if (lobbyChannels.length === 0) return;

    try {
      const guild = await this.client.guilds.fetch(guildId);

      for (const { channelId, roomId } of lobbyChannels) {
        try {
          const channel = await guild.channels.fetch(channelId);
          if (!channel || channel.type !== 2 /* GuildVoice */) continue;

          const voiceChannel = channel as import("discord.js").VoiceChannel;
          // 현재 채널에 있는 멤버들에 대해 inVoice=true 이벤트 발행
          for (const [, member] of voiceChannel.members) {
            if (member.user.bot) continue;
            this.eventEmitter.emit("discord.voice.update", {
              discordUserId: member.user.id,
              roomId,
              inVoice: true,
            });
          }
        } catch {
          // 채널이 삭제됐거나 접근 불가 — 개별 채널 실패는 무시
        }
      }

      console.log(
        `[DiscordBot] 음성 상태 동기화 완료 (대상 채널 ${lobbyChannels.length}개)`,
      );
    } catch (error) {
      console.warn("[DiscordBot] 음성 상태 동기화 중 오류:", error);
    }
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
        )
        .addSubcommand((sub) =>
          sub
            .setName("leaderboard")
            .setDescription("티어+LP 기준 상위 10명 리더보드 보기"),
        )
        .addSubcommand((sub) =>
          sub.setName("clan").setDescription("내가 속한 클랜 정보 보기"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("rules")
            .setDescription("서버 규칙 작성 모달을 열고 봇 메시지로 게시"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("verify")
            .setDescription("Nexus 서버 기본 역할을 받고 채널 접근 권한 열기"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("setuproles")
            .setDescription("티어/주라인/부라인/기본 역할을 자동 생성"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("setupverifypanel")
            .setDescription("현재 채널에 인증 패널(버튼+모달) 게시"),
        ),
    ].map((cmd) => cmd.toJSON());

    const guildId = this.configService.get("DISCORD_GUILD_ID");
    const applicationId =
      this.client.application?.id ||
      this.client.user?.id ||
      this.configService.get("DISCORD_CLIENT_ID") ||
      "";

    if (guildId) {
      try {
        await this.rest.put(
          Routes.applicationGuildCommands(applicationId, guildId),
          { body: commands },
        );
        console.log(`[DiscordBot] Guild commands registered: ${guildId}`);
        return;
      } catch (error) {
        console.warn(
          `[DiscordBot] Guild command registration failed (${guildId}), fallback to global commands`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    await this.rest.put(Routes.applicationCommands(applicationId), {
      body: commands,
    });
    console.log("[DiscordBot] Global commands registered");
  }

  private async handleInteraction(interaction: Interaction) {
    if (interaction.isModalSubmit()) {
      if (interaction.customId === RULES_MODAL_ID) {
        await this.handleRulesModalSubmit(interaction);
      }
      if (interaction.customId === VERIFY_MODAL_ID) {
        await this.handleVerifyModalSubmit(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === VERIFY_BUTTON_ID) {
        await this.handleVerifyButton(interaction);
      }
      return;
    }

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
          case "leaderboard":
            await this.handleLeaderboardCommand(interaction);
            break;
          case "clan":
            await this.handleClanCommand(interaction);
            break;
          case "rules":
            await this.handleRulesCommand(interaction);
            break;
          case "verify":
            await this.handleVerifyCommand(interaction);
            break;
          case "setuproles":
            await this.handleSetupRolesCommand(interaction);
            break;
          case "setupverifypanel":
            await this.handleSetupVerifyPanelCommand(interaction);
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

  private async handleVerifyCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply(
        "❌ 서버 안에서만 사용할 수 있는 명령어입니다.",
      );
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await this.assignMemberAccessRole(member);

    if (result === "already_assigned") {
      await interaction.editReply("✅ 이미 서버 기본 역할을 가지고 있습니다.");
      return;
    }

    await interaction.editReply("✅ 서버 기본 역할을 지급했습니다.");
  }

  private async handleSetupRolesCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    if (!this.hasRulesPublishPermission(interaction)) {
      await interaction.reply({
        content: "❌ 역할 생성 권한이 없습니다.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ 서버 안에서만 사용할 수 있는 명령어입니다.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await interaction.guild.roles.fetch();

    const memberRoleName =
      this.configService.get("DISCORD_MEMBER_ROLE_NAME") || "인증됨";
    const mainLinePrefix =
      this.configService.get("DISCORD_MAIN_LINE_ROLE_PREFIX") || "주라인-";
    const subLinePrefix =
      this.configService.get("DISCORD_SUB_LINE_ROLE_PREFIX") || "부라인-";
    const tierPrefix =
      this.configService.get("DISCORD_TIER_ROLE_PREFIX") || "티어-";

    const roleColorByName = new Map<string, `#${string}`>([
      [memberRoleName, "#7F8C8D"],
      [`${mainLinePrefix}TOP`, "#E67E22"],
      [`${mainLinePrefix}JUNGLE`, "#27AE60"],
      [`${mainLinePrefix}MID`, "#2980B9"],
      [`${mainLinePrefix}ADC`, "#C0392B"],
      [`${mainLinePrefix}SUPPORT`, "#8E44AD"],
      [`${subLinePrefix}TOP`, "#D4A373"],
      [`${subLinePrefix}JUNGLE`, "#7FB069"],
      [`${subLinePrefix}MID`, "#6FA8DC"],
      [`${subLinePrefix}ADC`, "#D98880"],
      [`${subLinePrefix}SUPPORT`, "#B39DDB"],
      [`${tierPrefix}IRON`, "#5D6D7E"],
      [`${tierPrefix}BRONZE`, "#A97142"],
      [`${tierPrefix}SILVER`, "#BDC3C7"],
      [`${tierPrefix}GOLD`, "#F1C40F"],
      [`${tierPrefix}PLATINUM`, "#1ABC9C"],
      [`${tierPrefix}EMERALD`, "#2ECC71"],
      [`${tierPrefix}DIAMOND`, "#5DADE2"],
      [`${tierPrefix}MASTER`, "#9B59B6"],
      [`${tierPrefix}GRANDMASTER`, "#E74C3C"],
      [`${tierPrefix}CHALLENGER`, "#F39C12"],
      [`${tierPrefix}UNRANKED`, "#95A5A6"],
    ]);

    const wantedRoleNames = new Set<string>(roleColorByName.keys());
    for (const key of DISCORD_LINE_ROLE_KEYS) {
      wantedRoleNames.add(`${mainLinePrefix}${key}`);
      wantedRoleNames.add(`${subLinePrefix}${key}`);
    }
    for (const key of DISCORD_TIER_ROLE_KEYS) {
      wantedRoleNames.add(`${tierPrefix}${key}`);
    }

    let created = 0;
    let updated = 0;
    for (const roleName of wantedRoleNames) {
      const targetColor = roleColorByName.get(roleName);
      const existingRole = interaction.guild.roles.cache.find(
        (role) => role.name === roleName,
      );

      if (!existingRole) {
        await interaction.guild.roles.create({
          name: roleName,
          color: targetColor,
          reason: "Nexus role bootstrap",
        });
        created += 1;
        continue;
      }

      if (targetColor && existingRole.hexColor !== targetColor.toUpperCase()) {
        await existingRole.edit({
          color: targetColor,
          reason: "Nexus role color sync",
        });
        updated += 1;
      }
    }

    await interaction.editReply(
      `✅ 역할 생성 ${created}개, 색상 업데이트 ${updated}개 완료`,
    );
  }

  private async handleSetupVerifyPanelCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    if (!this.hasRulesPublishPermission(interaction)) {
      await interaction.reply({
        content: "❌ 인증 패널 게시 권한이 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply({
        content: "❌ 이 채널에는 인증 패널을 게시할 수 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("Nexus 서버 인증")
      .setDescription(
        [
          "아래 버튼을 눌러 인증을 진행하세요.",
          "Nexus 웹사이트에서 Discord 연동 + Riot 계정 등록이 완료되어 있어야 합니다.",
        ].join("\n"),
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(VERIFY_BUTTON_ID)
        .setLabel("인증 시작")
        .setStyle(ButtonStyle.Primary),
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: "✅ 인증 패널을 게시했습니다.",
      ephemeral: true,
    });
  }

  private async handleVerifyButton(interaction: ButtonInteraction) {
    const input = new TextInputBuilder()
      .setCustomId(VERIFY_RIOT_ID_INPUT_ID)
      .setLabel("대표 Riot ID (gameName#tagLine)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("예: Faker#KR1")
      .setRequired(true)
      .setMaxLength(70);

    const modal = new ModalBuilder()
      .setCustomId(VERIFY_MODAL_ID)
      .setTitle("Nexus 인증")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );

    await interaction.showModal(modal);
  }

  private normalizeRiotId(value: string): string {
    return value.replace(/\s+/g, "").toLowerCase();
  }

  private async handleVerifyModalSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply(
        "❌ 서버 안에서만 사용할 수 있는 인증입니다.",
      );
      return;
    }

    const user = await this.findUserByDiscordId(interaction.user.id);
    if (!user) {
      await interaction.editReply(
        "❌ Discord 연동 계정을 찾지 못했습니다. 웹사이트에서 Discord 연동을 먼저 진행해주세요.",
      );
      return;
    }

    const primaryAccount = user.riotAccounts.find((acc) => acc.isPrimary);
    if (!primaryAccount) {
      await interaction.editReply(
        "❌ 대표 Riot 계정이 없습니다. 웹사이트에서 Riot 계정을 등록하고 대표 계정을 지정해주세요.",
      );
      return;
    }

    const inputRiotId = this.normalizeRiotId(
      interaction.fields.getTextInputValue(VERIFY_RIOT_ID_INPUT_ID),
    );
    const primaryRiotId = this.normalizeRiotId(
      `${primaryAccount.gameName}#${primaryAccount.tagLine}`,
    );

    if (inputRiotId !== primaryRiotId) {
      await interaction.editReply(
        `❌ Riot ID가 대표 계정과 일치하지 않습니다. 대표 계정: ${primaryAccount.gameName}#${primaryAccount.tagLine}`,
      );
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    await this.assignMemberAccessRole(member);
    await this.syncUserTierAndLineRoles(user.id).catch(() => {
      console.warn(
        `[DiscordBot] 인증 후 티어/라인 역할 동기화 실패: ${interaction.user.tag}`,
      );
    });

    await interaction.editReply(
      "✅ 인증 완료! 이제 서버 채널을 이용할 수 있습니다.",
    );
  }

  private async assignMemberAccessRole(
    member: GuildMember,
  ): Promise<"assigned" | "already_assigned"> {
    const role = await this.resolveMemberAccessRole(member.guild);

    if (!role) {
      throw new Error(
        "member access role not found. Set DISCORD_MEMBER_ROLE_ID or DISCORD_MEMBER_ROLE_NAME.",
      );
    }

    if (role.managed) {
      throw new Error(`role is managed and cannot be assigned: ${role.name}`);
    }

    if (member.roles.cache.has(role.id)) {
      return "already_assigned";
    }

    const botMember =
      member.guild.members.me || (await member.guild.members.fetchMe());
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error("bot is missing Manage Roles permission");
    }

    if (role.position >= botMember.roles.highest.position) {
      throw new Error(`bot role must be higher than target role: ${role.name}`);
    }

    await member.roles.add(role, "Nexus member access role");
    return "assigned";
  }

  private async resolveMemberAccessRole(guild: Guild): Promise<Role | null> {
    const roleId = this.configService.get("DISCORD_MEMBER_ROLE_ID");
    if (roleId) {
      return guild.roles.fetch(roleId).catch(() => null);
    }

    const roleName =
      this.configService.get("DISCORD_MEMBER_ROLE_NAME") || "인증됨";
    await guild.roles.fetch();
    return guild.roles.cache.find((role) => role.name === roleName) || null;
  }

  private hasRulesPublishPermission(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  ): boolean {
    return Boolean(
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
    );
  }

  private async handleRulesCommand(interaction: ChatInputCommandInteraction) {
    if (!this.hasRulesPublishPermission(interaction)) {
      await interaction.reply({
        content: "❌ 서버 규칙 게시 권한이 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const titleInput = new TextInputBuilder()
      .setCustomId(RULES_TITLE_INPUT_ID)
      .setLabel("제목")
      .setStyle(TextInputStyle.Short)
      .setValue("Nexus 서버 규칙")
      .setRequired(true)
      .setMaxLength(120);

    const contentInput = new TextInputBuilder()
      .setCustomId(RULES_CONTENT_INPUT_ID)
      .setLabel("규칙 내용")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("여기에 서버 규칙 내용을 입력하세요.")
      .setRequired(true)
      .setMaxLength(DISCORD_EMBED_DESCRIPTION_LIMIT);

    const modal = new ModalBuilder()
      .setCustomId(RULES_MODAL_ID)
      .setTitle("서버 규칙 게시")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
      );

    await interaction.showModal(modal);
  }

  private async handleRulesModalSubmit(interaction: ModalSubmitInteraction) {
    if (!this.hasRulesPublishPermission(interaction)) {
      await interaction.reply({
        content: "❌ 서버 규칙 게시 권한이 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply({
        content: "❌ 이 채널에는 규칙을 게시할 수 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const title = interaction.fields
      .getTextInputValue(RULES_TITLE_INPUT_ID)
      .trim();
    const content = interaction.fields
      .getTextInputValue(RULES_CONTENT_INPUT_ID)
      .trim();

    if (!title || !content) {
      await interaction.reply({
        content: "❌ 제목과 내용을 모두 입력해주세요.",
        ephemeral: true,
      });
      return;
    }

    const chunks = this.splitEmbedDescription(content);
    const embeds = chunks.map((chunk, index) =>
      new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(
          chunks.length === 1
            ? title
            : `${title} (${index + 1}/${chunks.length})`,
        )
        .setDescription(chunk)
        .setFooter({
          text: `게시자: ${interaction.user.tag}`,
        })
        .setTimestamp(),
    );

    for (const embed of embeds) {
      await channel.send({ embeds: [embed] });
    }

    await interaction.reply({
      content: `✅ 규칙을 ${embeds.length}개 메시지로 게시했습니다.`,
      ephemeral: true,
    });
  }

  private splitEmbedDescription(content: string): string[] {
    if (content.length <= RULES_EMBED_DESCRIPTION_LIMIT) return [content];

    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= RULES_EMBED_DESCRIPTION_LIMIT) {
        chunks.push(remaining);
        break;
      }

      const slice = remaining.slice(0, RULES_EMBED_DESCRIPTION_LIMIT);
      const newlineSplitAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
      );
      const splitAt =
        newlineSplitAt > 0 ? newlineSplitAt : RULES_EMBED_DESCRIPTION_LIMIT;

      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }

    return chunks;
  }

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
          name: "🏅 랭킹 & 클랜",
          value: [
            "`/nexus leaderboard` - 티어+LP 상위 10명",
            "`/nexus clan` - 내 클랜 정보",
          ].join("\n"),
        },
        {
          name: "🏠 방 관련",
          value: [
            "`/nexus rooms` - 활성 방 목록 (대기~역할선택~진행중)",
            "`/nexus team` - 현재 팀 정보",
            "`/nexus rules` - 서버 규칙 게시 (관리자)",
            "`/nexus verify` - 서버 기본 역할 받기",
            "`/nexus setuproles` - 티어/라인 역할 자동 생성 (관리자)",
            "`/nexus setupverifypanel` - 인증 패널 게시 (관리자)",
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
                  .map(
                    (r: (typeof existingUser.riotAccounts)[number]) =>
                      `${r.gameName}#${r.tagLine}`,
                  )
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

    const primaryAccount = user.riotAccounts.find(
      (r: (typeof user.riotAccounts)[number]) => r.isPrimary,
    );

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
                ? "매니저"
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
        room.teamMode === "AUCTION"
          ? "경매"
          : room.teamMode === "SNAKE_DRAFT"
            ? "스네이크 드래프트"
            : room.teamMode === "AUTO_BALANCE"
              ? "자동 밸런스"
              : "자유 팀 선택";
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

    const memberLines = team.members.map((m: (typeof team.members)[number]) => {
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
      (p: (typeof room.participants)[number]) => !p.teamId && !p.isCaptain,
    );
    if (unassigned.length > 0) {
      const playerList = unassigned
        .slice(0, 10)
        .map((p: (typeof room.participants)[number]) => {
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

    // 진영(블루/레드) — blueSideTeamId 기준(미설정이면 teamA=블루 기본)
    const blueIsA = match.blueSideTeamId
      ? match.blueSideTeamId === match.teamA?.id
      : true;
    const teamAEmoji = blueIsA ? "🔵" : "🔴";
    const teamBEmoji = blueIsA ? "🔴" : "🔵";

    const embed = new EmbedBuilder()
      .setColor(match.status === "IN_PROGRESS" ? Colors.Red : Colors.Yellow)
      .setTitle(`${statusEmoji} 매치 정보`)
      .setDescription(
        `**${match.room?.name ?? "(외부 매치)"}** - ${match.bracketRound || `${match.matchNumber}번째 매치`}`,
      )
      .addFields(
        {
          name: `${teamAEmoji} ${match.teamA?.name ?? "TBD"}`,
          value:
            match.teamA?.members
              .map((m: { user: { username: string } }) => m.user.username)
              .join(", ") || "팀원 없음",
          inline: true,
        },
        {
          name: "VS",
          value: statusText,
          inline: true,
        },
        {
          name: `${teamBEmoji} ${match.teamB?.name ?? "TBD"}`,
          value:
            match.teamB?.members
              .map((m: { user: { username: string } }) => m.user.username)
              .join(", ") || "팀원 없음",
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
      (m: (typeof matches)[number]) => m.status === "COMPLETED",
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
      const lines = list.map((m: (typeof matches)[number]) => {
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

  private async handleLeaderboardCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    const accounts = await this.prisma.riotAccount.findMany({
      where: { isPrimary: true },
      select: {
        gameName: true,
        tagLine: true,
        tier: true,
        rank: true,
        lp: true,
        user: { select: { username: true } },
      },
    });

    // 티어 + LP 기준 내림차순 정렬
    const rankValue: Record<string, number> = { I: 4, II: 3, III: 2, IV: 1 };
    accounts.sort(
      (a: (typeof accounts)[number], b: (typeof accounts)[number]) => {
        const tierDiff = (TIER_ORDER[b.tier] ?? 0) - (TIER_ORDER[a.tier] ?? 0);
        if (tierDiff !== 0) return tierDiff;
        const rankDiff =
          (rankValue[b.rank ?? ""] ?? 0) - (rankValue[a.rank ?? ""] ?? 0);
        if (rankDiff !== 0) return rankDiff;
        return b.lp - a.lp;
      },
    );

    const top10 = accounts.slice(0, 10);

    if (top10.length === 0) {
      await interaction.reply({
        content: "❌ 등록된 Riot 계정이 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const lines = top10.map((acc: (typeof top10)[number], i: number) => {
      const medal =
        i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const tierEmoji = TIER_EMOJI[acc.tier] || "❓";
      const rankStr = acc.rank && acc.tier !== "UNRANKED" ? ` ${acc.rank}` : "";
      return `${medal} ${tierEmoji} **${acc.user.username}** — ${acc.gameName}#${acc.tagLine} · ${acc.tier}${rankStr} ${acc.lp} LP`;
    });

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("🏆 리더보드 — 상위 10명")
      .setDescription(lines.join("\n"))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  private async handleClanCommand(interaction: ChatInputCommandInteraction) {
    const user = await this.findUserByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        content: "❌ 계정이 연동되지 않았습니다. `/nexus link`로 연동하세요!",
        ephemeral: true,
      });
      return;
    }

    const clanMember = await this.prisma.clanMember.findFirst({
      where: { userId: user.id },
      include: {
        clan: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    riotAccounts: { where: { isPrimary: true } },
                  },
                },
              },
              orderBy: { joinedAt: "asc" },
            },
          },
        },
      },
    });

    if (!clanMember) {
      await interaction.reply({
        content:
          "❌ 가입된 클랜이 없습니다. 웹사이트에서 클랜을 검색하고 가입해보세요!",
        ephemeral: true,
      });
      return;
    }

    const clan = clanMember.clan;
    const recruitEmoji = clan.isRecruiting ? "🟢 모집 중" : "🔴 모집 마감";
    const tierReq = clan.minTier
      ? `${TIER_EMOJI[clan.minTier] || ""} ${clan.minTier} 이상`
      : "없음";

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(`🛡️ ${clan.name} [${clan.tag}]`)
      .setDescription(clan.description || "클랜 소개가 없습니다.")
      .addFields(
        { name: "📋 모집 상태", value: recruitEmoji, inline: true },
        {
          name: "👥 멤버 수",
          value: `${clan.members.length}/${clan.maxMembers}`,
          inline: true,
        },
        { name: "🎯 최소 티어", value: tierReq, inline: true },
      );

    const memberLines = clan.members.map((m: (typeof clan.members)[number]) => {
      const roleEmoji =
        m.role === "OWNER" ? "👑" : m.role === "OFFICER" ? "⚔️" : "👤";
      const riot = m.user.riotAccounts[0];
      const tierEmoji = riot ? TIER_EMOJI[riot.tier] || "" : "";
      const tierStr = riot ? `${tierEmoji} ${riot.tier}` : "";
      return `${roleEmoji} **${m.user.username}** ${tierStr}`;
    });

    // Embed field value는 1024자 제한
    const memberText =
      memberLines.length > 20
        ? memberLines.slice(0, 20).join("\n") +
          `\n... 외 ${memberLines.length - 20}명`
        : memberLines.join("\n") || "멤버 없음";

    embed.addFields({
      name: "👥 멤버 목록",
      value: memberText,
      inline: false,
    });

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

  async sendNotification(
    guildId: string,
    channelId: string,
    message: string,
  ): Promise<boolean> {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (channel?.isTextBased()) {
      await channel.send(message);
      return true;
    }

    return false;
  }

  async sendEmbedNotification(
    guildId: string,
    channelId: string,
    embed: EmbedBuilder,
    components?: ActionRowBuilder<ButtonBuilder>[],
  ): Promise<string | null> {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (channel?.isTextBased()) {
      const message = await channel.send({
        embeds: [embed],
        ...(components?.length ? { components } : {}),
      });
      return message.id;
    }
    return null;
  }

  storeRoomNotification(roomId: string, entry: RoomNotifEntry) {
    this.roomNotifMap.set(roomId, entry);
  }

  async updateRoomNotification(roomId: string, participants: string[]): Promise<void> {
    const notif = this.roomNotifMap.get(roomId);
    if (!notif) return;
    try {
      const guild = await this.client.guilds.fetch(notif.guildId);
      const channel = await guild.channels.fetch(notif.channelId);
      if (!channel?.isTextBased()) return;
      const message = await channel.messages.fetch(notif.messageId);
      const { embed, components } = this.buildRoomCreatedEmbed(
        roomId, notif.roomName, notif.hostName, notif.maxPlayers, notif.teamMode, notif.isPrivate, participants,
      );
      await message.edit({ embeds: [embed], components });
    } catch (err: any) {
      console.warn(`[DiscordBot] 방 알림 업데이트 실패 (${roomId}): ${err?.message}`);
    }
  }

  clearRoomNotification(roomId: string) {
    this.roomNotifMap.delete(roomId);
  }

  async syncUserTierAndLineRoles(userId: string): Promise<void> {
    const guildId = this.configService.get("DISCORD_GUILD_ID");
    if (!guildId) return;

    const discordProvider = await this.prisma.authProvider.findFirst({
      where: { userId, provider: "DISCORD" },
      select: { providerId: true },
    });
    if (!discordProvider?.providerId) return;

    const primaryAccount = await this.prisma.riotAccount.findFirst({
      where: { userId, isPrimary: true },
      select: { mainRole: true, subRole: true, tier: true },
    });
    if (!primaryAccount) return;

    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordProvider.providerId);
    await guild.roles.fetch();

    const mainLinePrefix =
      this.configService.get("DISCORD_MAIN_LINE_ROLE_PREFIX") || "주라인-";
    const subLinePrefix =
      this.configService.get("DISCORD_SUB_LINE_ROLE_PREFIX") || "부라인-";
    const tierPrefix =
      this.configService.get("DISCORD_TIER_ROLE_PREFIX") || "티어-";

    const desiredRoleNames = new Set<string>();
    if (primaryAccount.mainRole) {
      desiredRoleNames.add(`${mainLinePrefix}${primaryAccount.mainRole}`);
    }
    if (primaryAccount.subRole) {
      desiredRoleNames.add(`${subLinePrefix}${primaryAccount.subRole}`);
    }
    if (primaryAccount.tier) {
      desiredRoleNames.add(`${tierPrefix}${primaryAccount.tier}`);
    }

    const managedMainLineRoleNames = new Set(
      DISCORD_LINE_ROLE_KEYS.map((key) => `${mainLinePrefix}${key}`),
    );
    const managedSubLineRoleNames = new Set(
      DISCORD_LINE_ROLE_KEYS.map((key) => `${subLinePrefix}${key}`),
    );
    const managedTierRoleNames = new Set(
      DISCORD_TIER_ROLE_KEYS.map((key) => `${tierPrefix}${key}`),
    );
    const managedRoleNames = new Set([
      ...managedMainLineRoleNames,
      ...managedSubLineRoleNames,
      ...managedTierRoleNames,
    ]);

    const removableRoles = member.roles.cache.filter((role) =>
      managedRoleNames.has(role.name),
    );
    for (const [, role] of removableRoles) {
      if (!desiredRoleNames.has(role.name)) {
        await member.roles.remove(role, "Nexus tier/line role sync");
      }
    }

    for (const roleName of desiredRoleNames) {
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (!role) {
        console.warn(`[DiscordBot] 역할을 찾을 수 없어 건너뜀: ${roleName}`);
        continue;
      }
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, "Nexus tier/line role sync");
      }
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
    roomId: string,
    roomName: string,
    hostName: string,
    maxPlayers: number,
    teamMode: string,
    isPrivate: boolean,
    participants: string[] = [],
  ): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";

    const MODE_LABEL: Record<string, string> = {
      AUCTION: "경매 드래프트",
      SNAKE_DRAFT: "스네이크 드래프트",
      AUTO_BALANCE: "자동 밸런스",
      MANUAL_TEAM: "자유 팀 선택",
    };
    const MODE_EMOJI: Record<string, string> = {
      AUCTION: "💰",
      SNAKE_DRAFT: "🐍",
      AUTO_BALANCE: "⚖️",
      MANUAL_TEAM: "🤝",
    };

    const modeLabel = MODE_LABEL[teamMode] ?? teamMode;
    const modeEmoji = MODE_EMOJI[teamMode] ?? "🎮";
    const lockEmoji = isPrivate ? " 🔒" : "";
    const currentPlayers = participants.length;

    const memberList = participants.length > 0
      ? participants.map((name) => `· ${name}`).join("\n")
      : "없음";

    const embed = new EmbedBuilder()
      .setColor(0x667eea)
      .setTitle(`${modeEmoji} 내전 방 생성됨`)
      .setDescription(`**${roomName}**${lockEmoji}`)
      .addFields(
        { name: "👑 방장", value: hostName, inline: true },
        { name: "🎮 모드", value: modeLabel, inline: true },
        { name: "👥 인원", value: `${currentPlayers} / ${maxPlayers}명`, inline: true },
        { name: "참가자", value: memberList, inline: false },
      )
      .setTimestamp();

    const button = new ButtonBuilder()
      .setLabel("방 참가하기")
      .setStyle(ButtonStyle.Link)
      .setURL(`${appUrl}/tournaments/${roomId}/lobby`)
      .setEmoji("🚀");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    return { embed, components: [row] };
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

  // blueName/redName: 가위바위보로 정해진 진영 기준(blueSideTeamId). 호출부에서 정렬해 전달.
  buildMatchStartEmbed(
    blueName: string,
    redName: string,
    tournamentCode?: string,
  ) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("⚔️ 매치 시작!")
      .setDescription(`🔵 **${blueName}**  vs  🔴 **${redName}**`)
      .addFields(
        { name: "🔵 블루 진영", value: blueName, inline: true },
        { name: "🔴 레드 진영", value: redName, inline: true },
      )
      .setTimestamp();

    if (tournamentCode) {
      embed.addFields({
        name: "🎮 토너먼트 코드",
        value: `\`${tournamentCode}\`\n*커스텀 게임에서 블루/레드 진영에 맞게 입장하세요*`,
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
