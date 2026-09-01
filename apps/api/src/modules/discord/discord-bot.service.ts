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
  ChannelType,
  TextChannel,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  MessageFlags,
} from "discord.js";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import type { DiscordVoiceService } from "./discord-voice.service";
import { DiscordEmojiService, parseEmojiRef } from "./discord-emoji.service";
import { formatKst, parseKstSchedule } from "./discord-schedule-time";
import type { EmojiMap, RecruitEmojiName } from "./discord-emoji.service";

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
/** 안내 메시지가 올라온 채널을 그대로 공지 채널로 지정하는 버튼 */
const SET_ANNOUNCE_BUTTON_ID = "nexus_set_announce_here_button";
/** 모집 공지에서 바로 방에 참가하는 버튼. `nexus_join_room:{roomId}` 형태 */
const JOIN_ROOM_BUTTON_PREFIX = "nexus_join_room:";
const VERIFY_RIOT_ID_INPUT_ID = "nexus_verify_riot_id";
const ROOM_NOTIFICATION_CACHE_PREFIX = "discord:room-notification:";
const ROOM_NOTIFICATION_TTL_SECONDS = 24 * 60 * 60;
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
  voiceChannelId?: string;
  /** 예고 방의 예정 시각(ISO). 즉시 개설된 방은 null이다. */
  scheduledAt?: string | null;
  /** 방이 생성된 서버의 공지인지. false면 다른 서버로 퍼진 사본이다. */
  isOrigin?: boolean;
  /** 사본에 표시할 원 서버 이름 */
  originGuildName?: string | null;
}

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private rest: REST;
  private voiceService: DiscordVoiceService | null = null;
  // 방 생성 알림 메시지 참조 (roomId → 메시지 정보), 재시작 시 초기화됨
  private readonly roomNotifMap = new Map<string, RoomNotifEntry[]>();
  // 같은 방의 참가/퇴장 편집이 역순으로 완료되지 않도록 직렬화한다.
  private readonly roomNotifUpdateQueue = new Map<string, Promise<void>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redis: RedisService,
    private readonly emojiService: DiscordEmojiService,
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
   * 봇이 외부 길드에 추가됨. Discord의 guildCreate 이벤트가 OAuth 콜백보다
   * 먼저 도착할 수 있으므로 잠시 기다린 뒤 링크를 확인하고 길드 이름을 갱신한다.
   * 링크가 없으면(우리 흐름 외 무단 초대) 휴면 — 아무 동작 안 함.
   */
  private async handleGuildCreate(guild: { id: string; name: string }) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
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

      // 공지 채널이 없으면 내전이 열려도 멤버들이 볼 수 없다. 들어오자마자 안내한다.
      if (!link.announceChannelId) {
        await this.sendAnnounceSetupOnboarding(guild.id);
      }
    } catch (err: any) {
      console.warn(`[DiscordBot] guildCreate 처리 실패: ${err?.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // 내전 모집 공지 채널
  //
  // 이 기능이 생기기 전에는 홈 길드만 중앙 공지 채널(env)을 썼고, 외부 길드는
  // 방을 만든 직후 생성되는 "대기실" 음성 채널로 공지가 갔다. 아무도 보지 않는
  // 곳이라 연동된 커뮤니티는 내전이 열린 사실 자체를 알 수 없었다.
  // ────────────────────────────────────────────────────────────────

  /** 공지 채널 설정 안내. 온보딩과 백필에서 함께 쓴다. */
  buildAnnounceSetupNotice(): {
    content: string;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const content = [
      "**NEXUS 내전 모집 공지 채널을 지정해주세요**",
      "",
      "지정하지 않으면 이 서버 멤버들이 내전이 열린 것을 제때 보지 못합니다.",
      "",
      "아래 버튼을 누르면 **이 채널**이 공지 채널이 됩니다.",
      "다른 채널로 지정하려면 `/nexus setannounce channel:#원하는채널`",
      "",
      "클랜이 있다면 `/nexus linkclan` 으로 이 서버와 연결해두세요.",
      "",
      "(서버 관리 권한이 있는 분만 설정할 수 있습니다)",
    ].join("\n");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SET_ANNOUNCE_BUTTON_ID)
        .setLabel("이 채널로 지정")
        .setStyle(ButtonStyle.Primary),
    );

    return { content, components: [row] };
  }

  /**
   * 공지 채널 지정 공통 처리. 슬래시 커맨드와 버튼이 같은 규칙을 쓰도록 모았다.
   * 지정해도 봇이 글을 못 쓰면 의미가 없으므로 저장 전에 권한을 확인한다.
   */
  private async applyAnnounceChannel(
    guild: Guild,
    channel: TextChannel,
    roleId?: string | null,
    acceptsCrossGuild?: boolean | null,
  ): Promise<string> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const canPost = channel
      .permissionsFor(me)
      ?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages);
    if (!canPost) {
      return `❌ <#${channel.id}> 에 글을 쓸 권한이 없습니다. 봇에게 채널 보기/메시지 보내기 권한을 준 뒤 다시 시도해주세요.`;
    }

    const link = await this.prisma.discordGuildLink.findUnique({
      where: { guildId: guild.id },
      select: { status: true },
    });
    if (!link) {
      return "❌ 이 서버는 아직 NEXUS에 연동되지 않았습니다. 웹에서 서버 연동을 먼저 진행해주세요.";
    }

    await this.prisma.discordGuildLink.update({
      where: { guildId: guild.id },
      data: {
        announceChannelId: channel.id,
        // 넘기지 않은 항목은 기존 설정을 건드리지 않는다.
        // 채널만 바꾸려던 사람이 다른 설정을 잃지 않게 한다.
        ...(roleId !== undefined ? { announceRoleId: roleId } : {}),
        ...(acceptsCrossGuild !== undefined && acceptsCrossGuild !== null
          ? { acceptsCrossGuildRooms: acceptsCrossGuild }
          : {}),
      },
    });

    return [
      `✅ 내전 모집 공지 채널을 <#${channel.id}> 로 지정했습니다.`,
      roleId ? `📢 공지 시 <@&${roleId}> 를 멘션합니다.` : null,
      acceptsCrossGuild === false
        ? "🚫 다른 서버 내전 공지는 받지 않습니다."
        : acceptsCrossGuild === true
          ? "🌐 다른 서버에서 열린 내전 공지도 받습니다."
          : null,
      link.status === "ACTIVE"
        ? "이제 이 서버에서 내전이 열리면 해당 채널로 공지가 올라갑니다."
        : "⚠️ 서버 연동이 아직 활성화(ACTIVE) 상태가 아닙니다. 활성화 후부터 공지가 발송됩니다.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async handleSetAnnounceButton(interaction: ButtonInteraction) {
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: "❌ 서버 관리 권한이 있어야 공지 채널을 지정할 수 있습니다.",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.channel as TextChannel | null;
    if (
      !interaction.guild ||
      !channel ||
      channel.type !== ChannelType.GuildText
    ) {
      await interaction.reply({
        content: "❌ 텍스트 채널에서만 사용할 수 있습니다.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const message = await this.applyAnnounceChannel(interaction.guild, channel);
    await interaction.editReply(message);
  }

  /** 길드에서 봇이 실제로 글을 쓸 수 있는 채널을 찾는다. 온보딩 안내 발송용. */
  private async findPostableChannel(guild: Guild): Promise<TextChannel | null> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const canPost = (channel: TextChannel) =>
      Boolean(
        channel
          .permissionsFor(me)
          ?.has(
            PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages,
          ),
      );

    const systemChannel = guild.systemChannel;
    if (systemChannel && canPost(systemChannel)) return systemChannel;

    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (channel?.type === ChannelType.GuildText && canPost(channel)) {
        return channel;
      }
    }
    return null;
  }

  /** 봇이 서버에 들어온 직후 공지 채널 설정을 안내한다. */
  private async sendAnnounceSetupOnboarding(guildId: string): Promise<boolean> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channel = await this.findPostableChannel(guild);
      if (!channel) {
        console.warn(
          `[DiscordBot] 길드 ${guildId}: 안내를 보낼 텍스트 채널을 찾지 못함`,
        );
        return false;
      }
      await channel.send(this.buildAnnounceSetupNotice());
      return true;
    } catch (err: any) {
      console.warn(
        `[DiscordBot] 길드 ${guildId} 공지 채널 안내 실패: ${err?.message}`,
      );
      return false;
    }
  }

  /** 공지 채널이 아직 없는 ACTIVE 길드 전체에 안내를 1회 보낸다. (백필) */
  async notifyGuildsMissingAnnounceChannel(): Promise<{
    total: number;
    notified: number;
  }> {
    const links = await this.prisma.discordGuildLink.findMany({
      where: { status: "ACTIVE", announceChannelId: null },
      select: { guildId: true, guildName: true },
    });

    let notified = 0;
    for (const link of links) {
      const ok = await this.sendAnnounceSetupOnboarding(link.guildId);
      if (ok) notified++;
      // 길드가 많아도 Discord 레이트 리밋에 걸리지 않게 간격을 둔다.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    console.log(
      `[DiscordBot] 공지 채널 미설정 길드 안내: ${notified}/${links.length}건 발송`,
    );
    return { total: links.length, notified };
  }

  private async handleSetAnnounceCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    if (!this.hasRulesPublishPermission(interaction)) {
      await interaction.reply({
        content: "❌ 서버 관리 권한이 있어야 공지 채널을 지정할 수 있습니다.",
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

    // 옵션을 비우면 명령을 실행한 채널을 쓴다 — 가장 흔한 사용 방식이다.
    const option = interaction.options.getChannel("channel");
    const target = (option ?? interaction.channel) as TextChannel | null;

    if (!target || target.type !== ChannelType.GuildText) {
      await interaction.editReply(
        "❌ 텍스트 채널만 공지 채널로 지정할 수 있습니다.",
      );
      return;
    }

    const role = interaction.options.getRole("role");
    const crossGuild = interaction.options.getBoolean("crossguild");
    const message = await this.applyAnnounceChannel(
      interaction.guild,
      target,
      role ? role.id : undefined,
      crossGuild,
    );
    await interaction.editReply(message);
  }

  /**
   * `/nexus serverstats` — 최근 30일 이 서버의 내전 기록 요약.
   *
   * "우리 서버에서 내전이 돌고 있다"를 서버 사람들이 눈으로 보게 하는 게 목적이라
   * 개인 통계와 달리 공개로 답한다. 이 서버가 원 서버인 방만 센다 —
   * 교차 공지로 흘러온 다른 서버 내전까지 세면 우리 기록이 아니게 된다.
   */
  private async handleServerStatsCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ 서버 안에서만 사용할 수 있는 명령어입니다.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const link = await this.prisma.discordGuildLink.findUnique({
      where: { guildId: interaction.guildId },
      select: { clan: { select: { name: true, tag: true } } },
    });

    const rooms = await this.prisma.room.findMany({
      where: { discordGuildId: interaction.guildId, createdAt: { gte: since } },
      select: {
        id: true,
        name: true,
        status: true,
        maxParticipants: true,
        createdAt: true,
        scheduledAt: true,
        completedAt: true,
        host: { select: { username: true } },
        participants: {
          where: { role: "PLAYER" },
          select: { userId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (rooms.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Grey)
            .setTitle("📊 최근 30일 내전 기록")
            .setDescription(
              [
                "이 서버에서 열린 내전이 아직 없습니다.",
                "`/nexus schedule` 로 첫 내전을 예약해보세요.",
              ].join("\n"),
            )
            .setFooter({ text: appUrl })
            .setTimestamp(),
        ],
      });
      return;
    }

    // 삭제된 방은 남지 않으므로 이 숫자는 "지금까지 남아 있는 방" 기준이다.
    const startedRooms = rooms.filter(
      (room) => room.status !== "WAITING" || room.completedAt !== null,
    );
    const completedRooms = rooms.filter((room) => room.completedAt !== null);
    const fullRooms = rooms.filter(
      (room) => room.participants.length >= room.maxParticipants,
    );
    const scheduledRooms = rooms.filter((room) => room.scheduledAt !== null);
    const uniquePlayers = new Set(
      rooms.flatMap((room) =>
        room.participants.map((participant) => participant.userId),
      ),
    );
    const peak = rooms.reduce(
      (max, room) => Math.max(max, room.participants.length),
      0,
    );

    const hostCounts = new Map<string, number>();
    for (const room of rooms) {
      const name = room.host.username;
      hostCounts.set(name, (hostCounts.get(name) ?? 0) + 1);
    }
    const topHosts = [...hostCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count], index) => `${index + 1}. ${name} — ${count}회`)
      .join("\n");

    const recent = rooms
      .slice(0, 5)
      .map((room) => {
        const when = Math.floor(
          (room.scheduledAt ?? room.createdAt).getTime() / 1000,
        );
        return `<t:${when}:d> **${room.name}** — ${room.participants.length}/${room.maxParticipants} · ${
          ROOM_STATUS_KR[room.status] ?? room.status
        }`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("📊 최근 30일 내전 기록")
      .setDescription(
        link?.clan
          ? `**${link.clan.name}** [${link.clan.tag}] · ${interaction.guild?.name ?? ""}`
          : (interaction.guild?.name ?? null),
      )
      .addFields(
        {
          name: "개설",
          value: [
            `총 **${rooms.length}회** (예약 ${scheduledRooms.length}회)`,
            `시작한 내전 **${startedRooms.length}회** · 완료 **${completedRooms.length}회**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "모집",
          value: [
            `정원 충족 **${fullRooms.length}회**`,
            `최다 참가 **${peak}명** · 참여한 사람 **${uniquePlayers.size}명**`,
          ].join("\n"),
          inline: false,
        },
        { name: "많이 연 사람", value: topHosts || "-", inline: false },
        { name: "최근 내전", value: recent || "-", inline: false },
      )
      .setFooter({ text: `${appUrl} · 삭제된 방은 집계되지 않습니다` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * `/nexus linkclan` — 연동된 서버를 클랜에 이어붙인다.
   *
   * 지금까지 `DiscordGuildLink.clanId`는 스키마에만 있고 아무도 채우지 않았다.
   * 서버와 클랜이 연결돼야 "이 서버 사람들"이 한 조직으로 이어지고, 서버 기록도
   * 클랜 기록으로 쌓인다. 클랜 오너/임원이면서 서버 관리 권한이 있는 사람만 연결한다.
   */
  private async handleLinkClanCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    if (!this.hasRulesPublishPermission(interaction)) {
      await interaction.reply({
        content: "❌ 서버 관리 권한이 있어야 클랜을 연결할 수 있습니다.",
        ephemeral: true,
      });
      return;
    }
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ 서버 안에서만 사용할 수 있는 명령어입니다.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";

    const link = await this.prisma.discordGuildLink.findUnique({
      where: { guildId: interaction.guildId },
      select: { clan: { select: { name: true, tag: true } } },
    });
    if (!link) {
      await interaction.editReply(
        [
          "❌ 이 서버는 아직 NEXUS에 연동되어 있지 않습니다.",
          `${appUrl} 에서 서버를 먼저 연동해주세요.`,
        ].join("\n"),
      );
      return;
    }

    const provider = await this.prisma.authProvider.findFirst({
      where: { provider: "DISCORD", providerId: interaction.user.id },
      select: { userId: true },
    });
    if (!provider) {
      await interaction.editReply(
        [
          "❌ 이 디스코드 계정과 연결된 NEXUS 계정을 찾지 못했습니다.",
          `${appUrl} 에서 디스코드로 로그인한 뒤 다시 시도해주세요.`,
        ].join("\n"),
      );
      return;
    }

    // 남의 클랜을 마음대로 붙일 수 없게, 본인이 운영하는 클랜만 후보로 둔다.
    const memberships = await this.prisma.clanMember.findMany({
      where: { userId: provider.userId, role: { in: ["OWNER", "OFFICER"] } },
      select: { clan: { select: { id: true, name: true, tag: true } } },
      orderBy: { joinedAt: "asc" },
    });
    if (memberships.length === 0) {
      await interaction.editReply(
        [
          "❌ 연결할 수 있는 클랜이 없습니다.",
          "클랜의 오너 또는 임원만 서버를 연결할 수 있습니다.",
          `클랜 만들기: ${appUrl}/clans`,
        ].join("\n"),
      );
      return;
    }

    const currentLine = link.clan
      ? `현재 연결: **${link.clan.name}** [${link.clan.tag}]`
      : "현재 연결된 클랜이 없습니다.";
    const clanList = memberships
      .map(({ clan }) => `• **${clan.name}** [${clan.tag}]`)
      .join("\n");

    const query = interaction.options.getString("clan")?.trim().toLowerCase();
    if (!query) {
      await interaction.editReply(
        [
          currentLine,
          "",
          "연결할 수 있는 클랜:",
          clanList,
          "",
          "`/nexus linkclan clan:태그` 로 연결해주세요.",
        ].join("\n"),
      );
      return;
    }

    // 태그·이름 정확히 일치를 먼저 보고, 없으면 이름 부분 일치로 넓힌다.
    const matched =
      memberships.find(
        ({ clan }) =>
          clan.tag.toLowerCase() === query || clan.name.toLowerCase() === query,
      ) ??
      memberships.find(({ clan }) => clan.name.toLowerCase().includes(query));
    if (!matched) {
      await interaction.editReply(
        [
          `❌ \`${query}\` 와 맞는 클랜을 찾지 못했습니다.`,
          "",
          "연결할 수 있는 클랜:",
          clanList,
        ].join("\n"),
      );
      return;
    }

    await this.prisma.discordGuildLink.update({
      where: { guildId: interaction.guildId },
      data: { clanId: matched.clan.id },
    });

    await interaction.editReply(
      [
        `✅ 이 서버를 **${matched.clan.name}** [${matched.clan.tag}] 클랜과 연결했습니다.`,
        `클랜 페이지: ${appUrl}/clans/${matched.clan.id}`,
      ].join("\n"),
    );
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

  hasGuild(guildId: string): boolean {
    return this.client.guilds.cache.has(guildId);
  }

  /**
   * 봇이 외부 길드에서 추방/제거됨. 봇이 없는 연동은 삭제한다(재설치하면 새로 자동 승인).
   * 단, 관리자가 취소(DISABLED)한 기록은 남겨 재설치해도 자동 재활성화되지 않게 한다.
   */
  private async handleGuildDelete(guild: { id: string }) {
    try {
      await this.prisma.discordGuildLink.deleteMany({
        where: { guildId: guild.id, status: { not: "DISABLED" } },
      });
      console.log(`[DiscordBot] 길드 연동 삭제(봇 추방): ${guild.id}`);
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
        )
        .addSubcommand((sub) =>
          sub
            .setName("setannounce")
            .setDescription("내전 모집 공지를 받을 채널 지정")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("공지를 받을 텍스트 채널 (비우면 현재 채널)")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
            )
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("모집 공지에 멘션할 역할 (선택)")
                .setRequired(false),
            )
            .addBooleanOption((opt) =>
              opt
                .setName("crossguild")
                .setDescription(
                  "다른 서버에서 열린 내전 공지도 받을지 (기본: 받음)",
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("schedule")
            .setDescription("내전을 예약 개설하고 모집 공지를 올린다")
            .addStringOption((opt) =>
              opt
                .setName("time")
                .setDescription(
                  "예: 21:00 / 9시 / 내일 20:30 / 9월 3일 21시 / 2시간 뒤",
                )
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("mode")
                .setDescription("팀 구성 방식")
                .setRequired(true)
                .addChoices(
                  { name: "경매 드래프트", value: "AUCTION" },
                  { name: "스네이크 드래프트", value: "SNAKE_DRAFT" },
                  { name: "자동 밸런스", value: "AUTO_BALANCE" },
                  { name: "자유 팀 선택", value: "MANUAL_TEAM" },
                ),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("size")
                .setDescription("정원 (기본: 10명)")
                .setRequired(false)
                .addChoices(
                  { name: "10명 (5v5)", value: 10 },
                  { name: "15명 (3팀)", value: 15 },
                  { name: "20명 (4팀)", value: 20 },
                  { name: "30명 (6팀)", value: 30 },
                  { name: "40명 (8팀)", value: 40 },
                ),
            )
            .addStringOption((opt) =>
              opt
                .setName("name")
                .setDescription("방 이름 (비우면 예정 시각으로 자동 생성)")
                .setMaxLength(50)
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("linkclan")
            .setDescription("이 서버를 내 클랜과 연결 (관리자)")
            .addStringOption((opt) =>
              opt
                .setName("clan")
                .setDescription(
                  "클랜 태그 또는 이름 (비우면 연결 가능한 클랜 목록)",
                )
                .setMaxLength(50)
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("serverstats")
            .setDescription("최근 30일 이 서버의 내전 기록 요약"),
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
      if (interaction.customId === SET_ANNOUNCE_BUTTON_ID) {
        await this.handleSetAnnounceButton(interaction);
      }
      if (interaction.customId.startsWith(JOIN_ROOM_BUTTON_PREFIX)) {
        await this.handleJoinRoomButton(interaction);
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
          case "setannounce":
            await this.handleSetAnnounceCommand(interaction);
            break;
          case "setupverifypanel":
            await this.handleSetupVerifyPanelCommand(interaction);
            break;
          case "schedule":
            await this.handleScheduleCommand(interaction);
            break;
          case "linkclan":
            await this.handleLinkClanCommand(interaction);
            break;
          case "serverstats":
            await this.handleServerStatsCommand(interaction);
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
            "`/nexus serverstats` - 최근 30일 이 서버 내전 기록",
          ].join("\n"),
        },
        {
          name: "🏠 방 관련",
          value: [
            "`/nexus rooms` - 활성 방 목록 (대기~역할선택~진행중)",
            "`/nexus schedule <시간> <모드>` - 내전 예약 개설",
            "`/nexus team` - 현재 팀 정보",
            "`/nexus rules` - 서버 규칙 게시 (관리자)",
            "`/nexus verify` - 서버 기본 역할 받기",
            "`/nexus setuproles` - 티어/라인 역할 자동 생성 (관리자)",
            "`/nexus setannounce` - 모집 공지 채널 지정 (관리자)",
            "`/nexus linkclan` - 이 서버를 내 클랜과 연결 (관리자)",
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

  /**
   * 내전 모집 메시지를 보낸다. 커스텀 이모지 확보 → V2 컨테이너 조립 → 전송까지
   * 여기서 처리해, 호출부(room.service)가 Discord 세부사항을 몰라도 되게 한다.
   */
  async sendRoomRecruitMessage(
    guildId: string,
    channelId: string,
    args: {
      roomId: string;
      roomName: string;
      hostName: string;
      maxPlayers: number;
      teamMode: string;
      isPrivate: boolean;
      participants: string[];
      voiceChannelId?: string | null;
      originGuildName?: string | null;
      /** 예고 방의 예정 시각. 없으면 지금 바로 여는 방이다. */
      scheduledAt?: Date | string | null;
    },
  ): Promise<string | null> {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;

    const emojis = await this.emojiService.ensureRecruitEmojis(guild);
    const mentionRoleId = await this.getAnnounceRoleId(guildId);
    const payload = this.buildRoomRecruitMessage(
      args.roomId,
      args.roomName,
      args.hostName,
      args.maxPlayers,
      args.teamMode,
      args.isPrivate,
      args.participants,
      // 사본에는 음성채널 버튼을 달지 않는다 — 그 서버 멤버는 원 서버
      // 음성채널에 들어갈 수 없어 눌러도 아무 일이 없다.
      !args.originGuildName && args.voiceChannelId
        ? { guildId, channelId: args.voiceChannelId }
        : undefined,
      emojis,
      mentionRoleId,
      args.originGuildName ?? null,
      args.scheduledAt ?? null,
    );

    const message = await channel.send(payload);
    return message.id;
  }

  /**
   * 방 참가에 필요한 최소 인터페이스.
   * RoomModule이 이미 DiscordModule을 임포트하므로 반대 방향 임포트는 순환이 된다.
   * 기존 setVoiceService와 같은 세터 주입 방식으로 배선한다.
   */
  private roomJoiner?: {
    joinRoom(userId: string, dto: { roomId: string }): Promise<unknown>;
    /**
     * 예약 개설용. 반환 타입은 RoomService 쪽 변환 결과(방 상세/요약)라
     * 형태가 고정되지 않아 여기서는 id만 쓴다.
     */
    createRoom?(
      hostId: string,
      dto: {
        name: string;
        maxParticipants: number;
        teamMode: any;
        discordGuildId?: string;
        scheduledAt?: string;
      },
    ): Promise<any>;
  };

  setRoomJoiner(joiner: NonNullable<DiscordBotService["roomJoiner"]>) {
    this.roomJoiner = joiner;
  }

  /**
   * 모집 공지의 "참가하기" 버튼.
   *
   * 기존에는 웹 로비로 가는 링크뿐이라 디스코드 → 브라우저 → 로그인 → 참가로
   * 이어졌다. 그 사이 이탈이 커서, 연동된 계정이면 버튼 한 번으로 끝나게 한다.
   */
  private async handleJoinRoomButton(interaction: ButtonInteraction) {
    const roomId = interaction.customId.slice(JOIN_ROOM_BUTTON_PREFIX.length);
    if (!roomId) return;

    await interaction.deferReply({ ephemeral: true });

    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";
    const lobbyUrl = `${appUrl}/tournaments/${roomId}/lobby`;

    const provider = await this.prisma.authProvider.findFirst({
      where: { provider: "DISCORD", providerId: interaction.user.id },
      select: { userId: true },
    });
    if (!provider) {
      await interaction.editReply(
        [
          "❌ 이 디스코드 계정과 연결된 NEXUS 계정을 찾지 못했습니다.",
          `${appUrl} 에서 디스코드로 로그인한 뒤 다시 시도해주세요.`,
        ].join("\n"),
      );
      return;
    }

    if (!this.roomJoiner) {
      await interaction.editReply(
        `참가 처리를 준비 중입니다. 잠시 후 다시 시도하거나 ${lobbyUrl} 에서 참가해주세요.`,
      );
      return;
    }

    try {
      await this.roomJoiner.joinRoom(provider.userId, { roomId });
      await interaction.editReply(
        [`✅ 참가했습니다.`, `로비: ${lobbyUrl}`].join("\n"),
      );
    } catch (error: any) {
      // joinRoom은 정원 초과·이미 참가·비밀번호 필요 등을 예외 메시지로 준다.
      // 사용자가 다음에 뭘 하면 되는지 알 수 있게 그대로 보여주고 로비 링크를 붙인다.
      const reason =
        typeof error?.response?.message === "string"
          ? error.response.message
          : typeof error?.message === "string"
            ? error.message
            : "참가에 실패했습니다.";
      await interaction.editReply(
        [`❌ ${reason}`, `로비에서 시도: ${lobbyUrl}`].join("\n"),
      );
    }
  }

  /**
   * `/nexus schedule` — 디스코드 안에서 예약 내전을 연다.
   *
   * 사용자들이 이미 방 제목에 "9시 시작"을 적어 우회하고 있던 것을 정식 기능으로
   * 만든다. 웹으로 넘어가지 않고 명령 한 줄로 끝나야 의미가 있다.
   */
  private async handleScheduleCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    await interaction.deferReply({ ephemeral: true });

    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";

    if (!interaction.guildId) {
      await interaction.editReply(
        "❌ 서버 안에서만 사용할 수 있는 명령어입니다.",
      );
      return;
    }

    const provider = await this.prisma.authProvider.findFirst({
      where: { provider: "DISCORD", providerId: interaction.user.id },
      select: { userId: true },
    });
    if (!provider) {
      await interaction.editReply(
        [
          "❌ 이 디스코드 계정과 연결된 NEXUS 계정을 찾지 못했습니다.",
          `${appUrl} 에서 디스코드로 로그인한 뒤 다시 시도해주세요.`,
        ].join("\n"),
      );
      return;
    }

    if (!this.roomJoiner?.createRoom) {
      await interaction.editReply(
        "예약 개설을 준비 중입니다. 잠시 후 다시 시도해주세요.",
      );
      return;
    }

    const rawTime = interaction.options.getString("time", true);
    const scheduledAt = parseKstSchedule(rawTime);
    if (!scheduledAt) {
      await interaction.editReply(
        [
          `❌ 시각 \`${rawTime}\` 을 이해하지 못했습니다.`,
          "이렇게 적어주세요: `21:00` `9시` `내일 20:30` `9월 3일 21시` `2시간 뒤`",
        ].join("\n"),
      );
      return;
    }

    const teamMode = interaction.options.getString("mode", true);
    const maxParticipants = interaction.options.getInteger("size") ?? 10;
    const name =
      interaction.options.getString("name")?.trim() ||
      `${formatKst(scheduledAt)} 내전`;

    // 방의 원 서버로 지정하려면 그 길드 연동의 소유자여야 한다. 소유자가 아니면
    // 원 서버 없이 만들고, 교차 공지를 통해 이 서버에도 공지가 올라간다.
    const ownedLink = await this.prisma.discordGuildLink.findFirst({
      where: {
        guildId: interaction.guildId,
        ownerId: provider.userId,
        status: "ACTIVE",
      },
      select: { guildId: true },
    });

    try {
      const room = await this.roomJoiner.createRoom(provider.userId, {
        name,
        maxParticipants,
        teamMode,
        ...(ownedLink ? { discordGuildId: ownedLink.guildId } : {}),
        scheduledAt: scheduledAt.toISOString(),
      });

      const unix = Math.floor(scheduledAt.getTime() / 1000);
      await interaction.editReply(
        [
          `✅ **${name}** 예약 완료 — <t:${unix}:F> (<t:${unix}:R>)`,
          "모집 공지를 올렸습니다. 시작 1시간 전과 10분 전에 다시 알려드릴게요.",
          `로비: ${appUrl}/tournaments/${room?.id}/lobby`,
        ].join("\n"),
      );
    } catch (error: any) {
      // createRoom은 Discord/Riot 미연동·정원 오류 등을 예외 메시지로 준다.
      // 접두어(`RIOT_NOT_LINKED::`)는 웹 전용이라 떼고 보여준다.
      const raw =
        typeof error?.response?.message === "string"
          ? error.response.message
          : typeof error?.message === "string"
            ? error.message
            : "예약에 실패했습니다.";
      const reason = raw.includes("::") ? raw.split("::").pop() : raw;
      await interaction.editReply(`❌ ${reason}`);
    }
  }

  /** 모집 공지에 멘션할 역할 ID. 미설정이면 null. */
  private async getAnnounceRoleId(guildId: string): Promise<string | null> {
    const link = await this.prisma.discordGuildLink.findUnique({
      where: { guildId },
      select: { announceRoleId: true },
    });
    return link?.announceRoleId ?? null;
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

  /** 방 하나가 여러 서버에 공지되므로 엔트리를 배열로 보관한다. */
  storeRoomNotifications(roomId: string, entries: RoomNotifEntry[]) {
    this.roomNotifMap.set(roomId, entries);
    void this.redis
      .set(
        `${ROOM_NOTIFICATION_CACHE_PREFIX}${roomId}`,
        JSON.stringify(entries),
        ROOM_NOTIFICATION_TTL_SECONDS,
      )
      .catch((error: unknown) => {
        console.warn(
          `[DiscordBot] 방 알림 캐시 저장 실패 (${roomId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  /** 단일 엔트리 저장 (기존 호출부 호환) */
  storeRoomNotification(roomId: string, entry: RoomNotifEntry) {
    this.storeRoomNotifications(roomId, [entry]);
  }

  private async getRoomNotifications(
    roomId: string,
  ): Promise<RoomNotifEntry[]> {
    const inMemory = this.roomNotifMap.get(roomId);
    if (inMemory) return inMemory;

    try {
      const cached = await this.redis.get(
        `${ROOM_NOTIFICATION_CACHE_PREFIX}${roomId}`,
      );
      if (!cached) return [];
      // 배포 시점에 이미 캐시에 있던 방은 단일 객체 형태다. 둘 다 받아준다.
      const parsed = JSON.parse(cached) as RoomNotifEntry | RoomNotifEntry[];
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      this.roomNotifMap.set(roomId, entries);
      return entries;
    } catch (error: unknown) {
      console.warn(
        `[DiscordBot] 방 알림 캐시 조회 실패 (${roomId}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async updateRoomNotification(
    roomId: string,
    participants?: string[],
  ): Promise<void> {
    const previous = this.roomNotifUpdateQueue.get(roomId) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(() => this.performRoomNotificationUpdate(roomId, participants));
    this.roomNotifUpdateQueue.set(roomId, current);

    try {
      await current;
    } finally {
      if (this.roomNotifUpdateQueue.get(roomId) === current) {
        this.roomNotifUpdateQueue.delete(roomId);
      }
    }
  }

  private async performRoomNotificationUpdate(
    roomId: string,
    fallbackParticipants?: string[],
  ): Promise<void> {
    const notifs = await this.getRoomNotifications(roomId);
    if (notifs.length === 0) return;
    try {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: {
          name: true,
          maxParticipants: true,
          teamMode: true,
          isPrivate: true,
          scheduledAt: true,
          host: { select: { username: true } },
          participants: {
            where: { role: "PLAYER" },
            select: { user: { select: { username: true } } },
            orderBy: { joinedAt: "asc" },
          },
          discordChannels: {
            where: { teamName: "Lobby" },
            select: { channelId: true },
            take: 1,
          },
        },
      });
      const latestParticipants = room
        ? room.participants.map((participant) => participant.user.username)
        : (fallbackParticipants ?? []);

      const latestNotifs: RoomNotifEntry[] = notifs.map((notif) =>
        room
          ? {
              ...notif,
              roomName: room.name,
              hostName: room.host.username,
              maxPlayers: room.maxParticipants,
              teamMode: room.teamMode,
              isPrivate: room.isPrivate,
              scheduledAt: room.scheduledAt
                ? room.scheduledAt.toISOString()
                : null,
              voiceChannelId:
                room.discordChannels[0]?.channelId ?? notif.voiceChannelId,
            }
          : notif,
      );
      this.storeRoomNotifications(roomId, latestNotifs);

      // 한 서버 갱신이 실패해도 나머지는 갱신되어야 한다.
      // (봇 추방·채널 삭제·권한 회수는 서버마다 개별적으로 일어난다)
      await Promise.allSettled(
        latestNotifs.map(async (notif) => {
          const guild = await this.client.guilds.fetch(notif.guildId);
          const channel = await guild.channels.fetch(notif.channelId);
          if (!channel?.isTextBased()) return;
          const message = await channel.messages.fetch(notif.messageId);
          const emojis = await this.emojiService.ensureRecruitEmojis(guild);
          // 갱신에서는 역할을 멘션하지 않는다. 인원이 바뀔 때마다 핑이 가면
          // 알림 역할이 곧 소음이 되어 사람들이 역할을 떼어버린다.
          const payload = this.buildRoomRecruitMessage(
            roomId,
            notif.roomName,
            notif.hostName,
            notif.maxPlayers,
            notif.teamMode,
            notif.isPrivate,
            latestParticipants,
            // 타 서버 사본에는 음성채널 버튼을 달지 않는다. 그 서버 멤버는
            // 원 서버 음성채널에 들어갈 수 없어 눌러도 아무 일이 없다.
            notif.isOrigin !== false && notif.voiceChannelId
              ? { guildId: notif.guildId, channelId: notif.voiceChannelId }
              : undefined,
            emojis,
            null,
            notif.isOrigin === false ? notif.originGuildName : null,
            notif.scheduledAt ?? null,
          );
          // V2 로 전환하기 전에 보낸 메시지는 플래그를 나중에 붙일 수 없어 edit 이
          // 실패한다. 그 방들은 다음 모집부터 새 형식이 된다.
          await message.edit(payload);
        }),
      );
    } catch (err: any) {
      console.warn(
        `[DiscordBot] 방 알림 업데이트 실패 (${roomId}): ${err?.message}`,
      );
    }
  }

  /**
   * 예약 내전 리마인드를 모집 공지가 올라간 모든 서버에 새 메시지로 보낸다.
   *
   * 기존 공지를 edit하지 않고 새로 보내는 이유: edit는 알림이 가지 않는다.
   * 리마인드의 목적 자체가 "지금 봐야 한다"를 알리는 것이다.
   *
   * @returns 실제로 전송된 서버 수
   */
  async sendRoomScheduleReminder(
    roomId: string,
    phase: "1h" | "10m",
  ): Promise<number> {
    const notifs = await this.getRoomNotifications(roomId);
    if (notifs.length === 0) return 0;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        name: true,
        maxParticipants: true,
        scheduledAt: true,
        participants: {
          where: { role: "PLAYER" },
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
          orderBy: { joinedAt: "asc" },
        },
        discordChannels: {
          where: { teamName: "Lobby" },
          select: { channelId: true },
          take: 1,
        },
      },
    });
    if (!room?.scheduledAt) return 0;

    const unix = Math.floor(room.scheduledAt.getTime() / 1000);
    const current = room.participants.length;
    const remaining = Math.max(0, room.maxParticipants - current);
    const participantIds = room.participants
      .map((participant) => participant.user.authProviders[0]?.providerId)
      .filter((id): id is string => !!id);
    const lobbyChannelId = room.discordChannels[0]?.channelId ?? null;
    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";

    const results = await Promise.allSettled(
      notifs.map(async (notif) => {
        const guild = await this.client.guilds.fetch(notif.guildId);
        const channel = await guild.channels.fetch(notif.channelId);
        if (!channel?.isTextBased()) return false;

        const isOrigin = notif.isOrigin !== false;
        // 참가자 멘션은 원 서버에서만 한다. 사본 서버에는 그 사람들이 없어
        // 멘션이 깨진 이름으로 남을 뿐이다.
        const mentionUsers = isOrigin ? participantIds : [];
        // 아직 자리가 남은 1시간 전에만 알림 역할을 다시 부른다.
        // 정원이 찼거나 10분 전이면 참가할 수 없는 사람에게는 소음이다.
        const roleId =
          phase === "1h" && remaining > 0
            ? await this.getAnnounceRoleId(notif.guildId)
            : null;

        const lines: string[] = [];
        if (roleId) lines.push(`<@&${roleId}>`);
        lines.push(
          phase === "1h"
            ? `⏰ **${notif.roomName}** 시작 1시간 전 · <t:${unix}:t> (<t:${unix}:R>)`
            : `🔔 **${notif.roomName}** 곧 시작합니다 · <t:${unix}:R>`,
        );
        lines.push(
          remaining > 0
            ? `모집 현황 **${current}** / ${room.maxParticipants} — ${remaining}자리 남았습니다`
            : `모집 완료 **${current}** / ${room.maxParticipants}`,
        );
        if (phase === "10m" && isOrigin && lobbyChannelId) {
          lines.push(
            `음성 대기실: https://discord.com/channels/${notif.guildId}/${lobbyChannelId}`,
          );
        }
        lines.push(`로비: ${appUrl}/tournaments/${roomId}/lobby`);
        if (mentionUsers.length > 0) {
          lines.push(mentionUsers.map((id) => `<@${id}>`).join(" "));
        }

        await channel.send({
          content: lines.join("\n"),
          allowedMentions: {
            users: mentionUsers,
            roles: roleId ? [roleId] : [],
          },
        });
        return true;
      }),
    );

    return results.filter(
      (result) => result.status === "fulfilled" && result.value,
    ).length;
  }

  /**
   * 정원을 못 채운 채 식어버린 방의 모집 공지를 닫는다.
   *
   * 메시지를 지우지 않고 "모집 종료"로 바꿔 남긴다 — 공지를 지우면 그 서버에서
   * 내전이 열렸던 사실 자체가 사라진다. 참가 버튼만 걷어내 더 이상 들어올 수
   * 없게 하고, 이후 인원 변동이 카드를 되살리지 않도록 캐시도 비운다.
   *
   * @returns 실제로 닫은 서버 수
   */
  async closeRoomRecruitMessages(roomId: string): Promise<number> {
    const notifs = await this.getRoomNotifications(roomId);
    if (notifs.length === 0) return 0;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        name: true,
        maxParticipants: true,
        participants: { where: { role: "PLAYER" }, select: { id: true } },
      },
    });
    const current = room?.participants.length ?? 0;

    const results = await Promise.allSettled(
      notifs.map(async (notif) => {
        const guild = await this.client.guilds.fetch(notif.guildId);
        const channel = await guild.channels.fetch(notif.channelId);
        if (!channel?.isTextBased()) return false;
        const message = await channel.messages.fetch(notif.messageId);

        const container = new ContainerBuilder()
          .setAccentColor(0x6b7280)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `## ${room?.name ?? notif.roomName}`,
                "-# 모집이 종료되었습니다",
                `정원을 채우지 못했습니다. (**${current}** / ${
                  room?.maxParticipants ?? notif.maxPlayers
                })`,
              ].join("\n"),
            ),
          );

        await message.edit({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { roles: [] },
        });
        return true;
      }),
    );

    // 캐시를 비워야 이후 인원 변동이 닫힌 카드를 다시 그리지 않는다.
    this.clearRoomNotification(roomId);

    return results.filter(
      (result) => result.status === "fulfilled" && result.value,
    ).length;
  }

  /**
   * 디스코드 DM 발송. DM을 막아둔 사용자에게는 실패하는 게 정상이라
   * 한 명의 실패가 나머지를 막지 않게 개별 처리한다.
   *
   * @returns 실제로 전달된 수
   */
  async sendDirectMessages(
    discordUserIds: string[],
    content: string,
  ): Promise<number> {
    const results = await Promise.allSettled(
      discordUserIds.map(async (discordUserId) => {
        const user = await this.client.users.fetch(discordUserId);
        await user.send(content);
      }),
    );
    return results.filter((result) => result.status === "fulfilled").length;
  }

  clearRoomNotification(roomId: string) {
    this.roomNotifMap.delete(roomId);
    void this.redis
      .del(`${ROOM_NOTIFICATION_CACHE_PREFIX}${roomId}`)
      .catch(() => {});
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

  /**
   * 내전 모집 메시지를 Components V2 컨테이너로 만든다.
   *
   * 클래식 임베드는 버튼이 항상 메시지 하단(임베드 바깥)에 붙어 카드가 두 동강
   * 나 보였다. V2 컨테이너는 액센트 바를 유지하면서 버튼까지 안에 품는다.
   *
   * 주의: V2 메시지는 content/embeds 를 같이 보낼 수 없고
   * MessageFlags.IsComponentsV2 가 반드시 필요하다. 반환값을 그대로
   * send()/edit() 에 넘기면 된다.
   *
   * @param emojis 길드에 등록된 커스텀 이모지 맵. 비어 있으면 텍스트로 폴백한다.
   */
  buildRoomRecruitMessage(
    roomId: string,
    roomName: string,
    hostName: string,
    maxPlayers: number,
    teamMode: string,
    isPrivate: boolean,
    participants: string[] = [],
    voiceChannel?: { guildId: string; channelId: string },
    emojis: EmojiMap = {},
    mentionRoleId?: string | null,
    /** 타 서버로 퍼진 사본일 때 원 서버 이름. null이면 원 서버 공지다. */
    originGuildName?: string | null,
    /** 예고 방의 예정 시각. null이면 지금 바로 여는 방이다. */
    scheduledAt?: Date | string | null,
  ): {
    components: ContainerBuilder[];
    flags: number;
    allowedMentions: { roles: string[] };
  } {
    const appUrl =
      this.configService.get("APP_URL") || "https://labs-nexus.com";
    const lobbyUrl = `${appUrl}/tournaments/${roomId}/lobby`;

    const MODE_LABEL: Record<string, string> = {
      AUCTION: "경매 드래프트",
      SNAKE_DRAFT: "스네이크 드래프트",
      AUTO_BALANCE: "자동 밸런스",
      MANUAL_TEAM: "자유 팀 선택",
    };
    const MODE_EMOJI: Record<string, RecruitEmojiName> = {
      AUCTION: "nx_mode_auction",
      SNAKE_DRAFT: "nx_mode_snake",
      AUTO_BALANCE: "nx_mode_balance",
      MANUAL_TEAM: "nx_mode_manual",
    };

    const modeLabel = MODE_LABEL[teamMode] ?? teamMode;
    const modeIcon = emojis[MODE_EMOJI[teamMode]];
    const currentPlayers = participants.length;
    const remainingSlots = Math.max(0, maxPlayers - currentPlayers);
    const isFull = remainingSlots === 0;

    // ─── 모집 게이지 ───
    // 커스텀 이모지가 있으면 이미지 눈금으로, 없으면 유니코드로 폴백한다.
    // (▰▱ 는 클라이언트 폰트에 따라 두부로 깨질 수 있어 이모지가 우선)
    const GAUGE_SLOTS = 10;
    const filledSlots =
      maxPlayers > 0
        ? Math.min(
            GAUGE_SLOTS,
            Math.round((currentPlayers / maxPlayers) * GAUGE_SLOTS),
          )
        : 0;
    const pipOn = emojis.nx_pip_on ?? "▰";
    const pipOff = emojis.nx_pip_off ?? "▱";
    const gauge =
      pipOn.repeat(filledSlots) + pipOff.repeat(GAUGE_SLOTS - filledSlots);

    // ─── 참가자 명단 ───
    // V2 에는 임베드의 inline 필드 같은 다단 레이아웃이 없다. 소규모는 번호를
    // 붙인 세로 목록이 읽기 좋고, 대규모는 세로로 늘어지므로 흐름 텍스트로 접는다.
    const LIST_LIMIT = 12;
    const rosterBody =
      currentPlayers === 0
        ? "-# 아직 참가자가 없습니다"
        : currentPlayers <= LIST_LIMIT
          ? participants
              // 번호를 코드 스팬으로 감싸면 자릿수가 달라도 이름 시작 위치가 맞는다.
              .map(
                (name, index) =>
                  `\`${String(index + 1).padStart(2, " ")}\` ${name.slice(0, 48)}`,
              )
              .join("\n")
          : participants.map((name) => name.slice(0, 24)).join(" · ");

    // Link 버튼은 Discord 사양상 색을 바꿀 수 없어(항상 회색) 아이콘으로 살린다.
    // 이모지가 등록돼 있지 않으면 라벨만 있는 기본 버튼으로 둔다.
    const withEmoji = (button: ButtonBuilder, mention?: string) => {
      const ref = parseEmojiRef(mention);
      return ref ? button.setEmoji(ref) : button;
    };

    // ─── 컨테이너 ───
    const container = new ContainerBuilder().setAccentColor(
      isFull ? 0x22c55e : 0x667eea,
    );

    // 헤더: 방 이름을 제목으로 올리고 모드/방장은 요약 줄로. 참가 버튼을 우측에 붙여
    // 스크롤 없이 바로 누를 수 있게 한다.
    // Components V2 메시지는 content를 가질 수 없어 멘션도 TextDisplay로 넣는다.
    // 정원이 찬 뒤에는 멘션하지 않는다 — 참가할 수 없는 알림은 소음일 뿐이다.
    if (mentionRoleId && !isFull) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`<@&${mentionRoleId}>`),
      );
    }

    const headerLines = [
      `## ${isPrivate ? "🔒 " : ""}${roomName}`,
      `${modeIcon ? `${modeIcon} ` : ""}${modeLabel}  ·  방장 **${hostName}**`,
    ];
    // 예고 방은 언제 시작하는지가 참가 판단의 첫 번째 정보다.
    // Discord 타임스탬프로 넣으면 보는 사람의 시간대로 알아서 렌더된다.
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledDate && !Number.isNaN(scheduledDate.getTime())) {
      const unix = Math.floor(scheduledDate.getTime() / 1000);
      headerLines.push(`🗓️ <t:${unix}:F> 시작 · <t:${unix}:R>`);
    }
    // 다른 서버에서 열린 내전임을 밝힌다. 출처를 숨기면 우리 서버 공지로
    // 오해하고 들어왔다가 낯선 사람들과 만나게 된다.
    if (originGuildName) {
      headerLines.push(`-# 🌐 **${originGuildName}** 서버에서 열린 내전입니다`);
    }
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(headerLines.join("\n")),
        )
        .setButtonAccessory(
          withEmoji(
            new ButtonBuilder()
              .setLabel("룸 참가")
              .setStyle(ButtonStyle.Link)
              .setURL(lobbyUrl),
            emojis.nx_btn_join,
          ),
        ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**모집 현황**  ${isFull ? "· 모집 완료" : `· ${remainingSlots}자리 남음`}`,
          `${gauge}  **${currentPlayers}** / ${maxPlayers}`,
        ].join("\n"),
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**참가자**${currentPlayers > 0 ? ` ${currentPlayers}명` : ""}\n${rosterBody}`,
      ),
    );

    // 하단 액션 로우.
    // "참가하기"는 디스코드 안에서 바로 참가시키는 버튼이다. 헤더의 "룸 참가"는
    // 웹 로비로 가는 링크로 남겨둔다 — 비밀방 비밀번호 입력처럼 버튼으로
    // 처리할 수 없는 경우의 경로가 필요하다.
    const actionButtons: ButtonBuilder[] = [];
    if (!isFull) {
      actionButtons.push(
        withEmoji(
          new ButtonBuilder()
            .setCustomId(`${JOIN_ROOM_BUTTON_PREFIX}${roomId}`)
            .setLabel("참가하기")
            .setStyle(ButtonStyle.Success),
          emojis.nx_btn_join,
        ),
      );
    }
    if (voiceChannel) {
      actionButtons.push(
        withEmoji(
          new ButtonBuilder()
            .setLabel("음성채널 참가")
            .setStyle(ButtonStyle.Link)
            .setURL(
              `https://discord.com/channels/${voiceChannel.guildId}/${voiceChannel.channelId}`,
            ),
          emojis.nx_btn_voice,
        ),
      );
    }
    if (actionButtons.length > 0) {
      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(false)
          .setSpacing(SeparatorSpacingSize.Small),
      );
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(...actionButtons),
      );
    }

    // 임베드 footer 대응 — `-# ` 는 작은 회색 텍스트로 렌더된다.
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        originGuildName
          ? // 사본에서는 음성채널 버튼을 뺐으므로 어디로 가야 하는지 알려준다.
            [
              "-# 참가자 변경 시 자동으로 업데이트됩니다.",
              `-# 음성 채널은 **${originGuildName}** 서버에 있습니다. 참가 후 로비에서 안내를 확인하세요.`,
            ].join("\n")
          : "-# 참가자 변경 시 자동으로 업데이트됩니다.",
      ),
    );

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      // 지정된 역할만 실제로 핑한다. @everyone/@here 오남용을 구조적으로 막는다.
      allowedMentions: {
        roles: mentionRoleId && !isFull ? [mentionRoleId] : [],
      },
    };
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

  /**
   * @param seriesLabel 다전제 진행 중인 세트면 "2세트" 같은 라벨.
   *                    주면 시리즈가 아직 안 끝났다는 뜻이므로 문구를 낮춘다.
   */
  buildMatchResultEmbed(
    winnerName: string,
    loserName: string,
    score?: string,
    seriesLabel?: string,
  ) {
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(seriesLabel ? `⚔️ ${seriesLabel} 종료` : "🏆 매치 종료!")
      .setDescription(
        seriesLabel
          ? `**${winnerName}** 팀이 ${seriesLabel}를 가져갔습니다.`
          : `**${winnerName}** 팀이 승리했습니다!`,
      )
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
