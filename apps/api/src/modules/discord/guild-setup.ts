import {
  ActionRowBuilder,
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  NewsChannel,
  PermissionFlagsBits,
  RoleSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { PrismaService } from "../prisma/prisma.service";
import { BOT_PERMISSIONS } from "./bot-permissions";
import {
  ALERT_OFF_ID,
  ALERT_ON_ID,
  CHANNEL_NAME_PLACEHOLDER,
  DEFAULT_ALERT_ROLE_NAME,
  SETUP_CHANNEL_NAME_INPUT,
  SETUP_MODAL_PREFIX,
  SETUP_PREFIX,
  SETUP_STEPS,
  buildAlertOptInPanel,
  buildSetupDonePanel,
  buildSetupStartPanel,
  buildSetupStatusPanel,
  buildSetupStepPanel,
  needsFirstSetup,
  normalizeChannelName,
  parseSetupId,
  type GuildSetupSnapshot,
  type SetupMode,
  type SetupPanelPayload,
  type SetupStep,
} from "./guild-setup-panel";

type PostableChannel = TextChannel | NewsChannel;
type SetupComponentInteraction =
  ButtonInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction;

export interface GuildSetupDeps {
  prisma: PrismaService;
  client: Client;
  /** APP_URL — 카드의 「웹사이트」 버튼 */
  appUrl: () => string;
  /** 권한 다시 주기 초대 링크에 쓰는 애플리케이션 ID */
  clientId: () => string;
}

/**
 * 서버 초기 설정 흐름 — 카드 그리기는 guild-setup-panel.ts, 여기서는 상태 읽기와
 * 버튼·선택·모달 처리만 한다. DiscordBotService 가 customId 접두사로 넘겨준다.
 *
 * 카드는 버튼을 누를 때마다 **같은 메시지를 고친다**(새 메시지를 쌓지 않는다).
 * 화면이 무엇이었는지는 customId 에 담아 서버에 상태를 따로 두지 않는다.
 */
export class GuildSetupFlow {
  constructor(private readonly deps: GuildSetupDeps) {}

  static isSetupCustomId(customId: string) {
    return (
      customId.startsWith(SETUP_PREFIX) ||
      customId.startsWith(SETUP_MODAL_PREFIX) ||
      customId === ALERT_ON_ID ||
      customId === ALERT_OFF_ID
    );
  }

  /** 이 서버로 고정된 "권한 다시 주기" 초대 링크 */
  reinviteUrl(guildId: string) {
    return (
      "https://discord.com/oauth2/authorize" +
      `?client_id=${this.deps.clientId()}` +
      `&scope=${encodeURIComponent("bot applications.commands")}` +
      `&permissions=${BOT_PERMISSIONS}` +
      `&guild_id=${guildId}` +
      "&disable_guild_select=true"
    );
  }

  /** 서버 상태를 읽어 카드 스냅샷을 만든다 */
  async snapshot(
    guild: Guild,
    here?: { id: string; type: ChannelType } | null,
  ): Promise<GuildSetupSnapshot> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const link = await this.deps.prisma.discordGuildLink.findUnique({
      where: { guildId: guild.id },
      select: {
        status: true,
        announceChannelId: true,
        announceRoleId: true,
        acceptsCrossGuildRooms: true,
        clanId: true,
      },
    });

    // 공지 채널 — 지워졌는지, 글을 쓸 수 있는지
    let announceExists = false;
    let announceCanPost = false;
    if (link?.announceChannelId) {
      const ch = await guild.channels
        .fetch(link.announceChannelId)
        .catch(() => null);
      if (ch && isPostableType(ch.type)) {
        announceExists = true;
        announceCanPost = canPost(ch as PostableChannel, me);
      }
    }

    // 알림 역할 — 지워졌는지, 봇이 붙여 줄 수 있는지(역할 순서)
    let roleExists = false;
    let roleAssignable = false;
    if (link?.announceRoleId) {
      const role = await guild.roles
        .fetch(link.announceRoleId)
        .catch(() => null);
      if (role) {
        roleExists = true;
        roleAssignable = role.editable;
      }
    }

    // 「지금 이 채널」 선택지 — 글을 쓸 수 있는 텍스트 채널일 때만
    let hereChannelId: string | null = null;
    if (here && isPostableType(here.type)) {
      const ch = await guild.channels.fetch(here.id).catch(() => null);
      if (ch && canPost(ch as PostableChannel, me)) hereChannelId = ch.id;
    }

    return {
      guildName: guild.name,
      botAvatarUrl: this.deps.client.user?.displayAvatarURL() ?? null,
      linkActive: link?.status === "ACTIVE",
      perms: {
        manageChannels: me.permissions.has(PermissionFlagsBits.ManageChannels),
        moveMembers: me.permissions.has(PermissionFlagsBits.MoveMembers),
        manageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
      },
      reinviteUrl: this.reinviteUrl(guild.id),
      announce: {
        channelId: link?.announceChannelId ?? null,
        exists: announceExists,
        canPost: announceCanPost,
      },
      alertRole: {
        roleId: link?.announceRoleId ?? null,
        exists: roleExists,
        assignable: roleAssignable,
      },
      crossGuild: link?.acceptsCrossGuildRooms ?? true,
      clanLinked: Boolean(link?.clanId),
      hereChannelId,
      appUrl: this.deps.appUrl(),
    };
  }

  /** 봇이 서버에 들어올 때 올리는 시작 카드 */
  async buildOnboarding(
    guild: Guild,
    channel: PostableChannel,
  ): Promise<SetupPanelPayload> {
    return buildSetupStartPanel(await this.snapshot(guild, channel));
  }

  /** `/nexus setup` — 처음이면 1단계, 설정한 서버면 상태 화면 */
  async handleCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ 서버 안에서만 쓸 수 있는 명령이에요.",
        ephemeral: true,
      });
      return;
    }
    if (!isGuildAdmin(interaction)) {
      await replyAdminOnly(interaction);
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const s = await this.snapshot(interaction.guild, interaction.channel);
    if (!s.linkActive && !s.announce.channelId) {
      await interaction.editReply({
        content:
          "❌ 이 서버는 아직 NEXUS에 연동되지 않았어요. 웹사이트 설정 → Discord 서버 연동에서 먼저 연동해 주세요.",
      });
      return;
    }
    const panel = needsFirstSetup(s)
      ? buildSetupStepPanel(s, "perm", "w")
      : buildSetupStatusPanel(s);
    await interaction.editReply(panel as never);
  }

  /** 카드의 버튼·선택 목록 */
  async handleComponent(interaction: SetupComponentInteraction) {
    if (interaction.customId === ALERT_ON_ID) {
      return this.handleAlertToggle(interaction as ButtonInteraction, true);
    }
    if (interaction.customId === ALERT_OFF_ID) {
      return this.handleAlertToggle(interaction as ButtonInteraction, false);
    }
    const parsed = parseSetupId(interaction.customId);
    if (!parsed || !interaction.guild) return;
    if (!isGuildAdmin(interaction)) {
      await replyAdminOnly(interaction);
      return;
    }
    const { action, mode, arg } = parsed;
    const guild = interaction.guild;

    // 「새 채널 만들기」 는 모달이 첫 응답이어야 해서 defer 전에 처리한다
    if (action === "new") {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${SETUP_MODAL_PREFIX}${mode}`)
          .setTitle("새 공지 채널 만들기")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(SETUP_CHANNEL_NAME_INPUT)
                .setLabel("채널 이름 (비우면 「내전-모집」)")
                .setPlaceholder(CHANNEL_NAME_PLACEHOLDER)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(100),
            ),
          ),
      );
      return;
    }

    // 나머지는 같은 카드를 고친다 — 디스코드 API 를 부를 수 있어 먼저 응답을 잡아 둔다
    await interaction.deferUpdate();
    let error: string | null = null;
    let next: SetupStep | "status" | "done" | null = null;

    switch (action) {
      case "go":
        next = isStep(arg) ? arg : "perm";
        break;
      case "status":
        next = "status";
        break;
      case "here": {
        const ch = interaction.channel;
        error = ch
          ? await this.setAnnounceChannel(guild, ch.id)
          : "채널을 찾지 못했어요";
        next = afterStep("channel", mode);
        break;
      }
      case "pick": {
        const id = (interaction as ChannelSelectMenuInteraction).values[0];
        error = await this.setAnnounceChannel(guild, id);
        next = afterStep("channel", mode);
        break;
      }
      case "rnew":
        error = await this.createAlertRole(guild);
        next = afterStep("alert", mode);
        break;
      case "rpick": {
        const id = (interaction as RoleSelectMenuInteraction).values[0];
        error = await this.setAlertRole(guild, id);
        next = afterStep("alert", mode);
        break;
      }
      case "rskip":
        await this.deps.prisma.discordGuildLink.update({
          where: { guildId: guild.id },
          data: { announceRoleId: null },
        });
        next = afterStep("alert", mode);
        break;
      case "cross":
        await this.deps.prisma.discordGuildLink.update({
          where: { guildId: guild.id },
          data: { acceptsCrossGuildRooms: arg !== "off" },
        });
        next = afterStep("finish", mode);
        break;
      default:
        return;
    }

    // 실패하면 같은 단계에 머무르고 이유를 따로(나만 보이게) 알린다
    if (error) {
      await interaction.followUp({ content: `❌ ${error}`, ephemeral: true });
      next = stepOfAction(action) ?? next;
    }
    await this.render(interaction, guild, next ?? "status", mode);
  }

  /** 「새 채널 만들기」 모달 제출 */
  async handleModal(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith(SETUP_MODAL_PREFIX)) return;
    if (!interaction.guild) return;
    if (!isGuildAdmin(interaction)) {
      await replyAdminOnly(interaction);
      return;
    }
    const mode: SetupMode =
      interaction.customId.slice(SETUP_MODAL_PREFIX.length) === "f" ? "f" : "w";
    const name = normalizeChannelName(
      interaction.fields.getTextInputValue(SETUP_CHANNEL_NAME_INPUT),
    );
    const guild = interaction.guild;

    if (interaction.isFromMessage()) await interaction.deferUpdate();
    else await interaction.deferReply({ ephemeral: true });

    let error: string | null = null;
    try {
      const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        topic: "NEXUS 내전 모집 공지가 올라오는 채널이에요.",
        reason: "NEXUS 서버 설정 — 내전 모집 공지 채널",
      });
      error = await this.setAnnounceChannel(guild, channel.id);
    } catch {
      error =
        "채널을 만들지 못했어요. 봇에게 채널 관리 권한이 있는지 확인해 주세요.";
    }
    if (error) {
      await interaction.followUp({ content: `❌ ${error}`, ephemeral: true });
    }
    await this.render(
      interaction,
      guild,
      error ? "channel" : afterStep("channel", mode),
      mode,
    );
  }

  /** 화면 이름 → 카드를 그려 원래 메시지를 고친다 */
  private async render(
    interaction: SetupComponentInteraction | ModalSubmitInteraction,
    guild: Guild,
    view: SetupStep | "status" | "done",
    mode: SetupMode,
  ) {
    const s = await this.snapshot(guild, interaction.channel);
    const panel =
      view === "status"
        ? buildSetupStatusPanel(s)
        : view === "done"
          ? buildSetupDonePanel(s)
          : buildSetupStepPanel(s, view, mode);
    await interaction.editReply(panel as never);
  }

  /** 공지 채널 지정 — 봇이 글을 쓸 수 있어야 저장한다. 실패 이유를 돌려준다 */
  private async setAnnounceChannel(
    guild: Guild,
    channelId: string,
  ): Promise<string | null> {
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch || !isPostableType(ch.type)) {
      return "텍스트 채널만 공지 채널로 쓸 수 있어요.";
    }
    const me = guild.members.me ?? (await guild.members.fetchMe());
    if (!canPost(ch as PostableChannel, me)) {
      return `<#${ch.id}> 에 봇이 글을 쓸 수 없어요. 채널 권한에서 봇에게 「채널 보기」「메시지 보내기」를 켜 주세요.`;
    }
    const link = await this.deps.prisma.discordGuildLink.findUnique({
      where: { guildId: guild.id },
      select: { announceChannelId: true, announceRoleId: true },
    });
    if (!link) return "이 서버는 아직 NEXUS에 연동되지 않았어요.";
    await this.deps.prisma.discordGuildLink.update({
      where: { guildId: guild.id },
      data: { announceChannelId: ch.id },
    });
    // 채널을 옮겼고 알림 역할이 있으면 새 채널에도 「알림 받기」 버튼을 올린다
    if (link.announceRoleId && link.announceChannelId !== ch.id) {
      await this.postAlertOptIn(ch as PostableChannel, link.announceRoleId);
    }
    return null;
  }

  /** 「내전 알림」 역할을 새로 만들어 알림 역할로 정한다 */
  private async createAlertRole(guild: Guild): Promise<string | null> {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return "역할 관리 권한이 없어 역할을 만들 수 없어요. 1단계에서 「권한 다시 주기」를 먼저 해 주세요.";
    }
    try {
      // 같은 이름 역할이 이미 있으면(다시 설정하는 경우) 새로 만들지 않고 그걸 쓴다
      const roles = await guild.roles.fetch();
      const existing = roles.find(
        (r) => r.name === DEFAULT_ALERT_ROLE_NAME && r.editable,
      );
      const role =
        existing ??
        (await guild.roles.create({
          name: DEFAULT_ALERT_ROLE_NAME,
          mentionable: true,
          reason: "NEXUS 서버 설정 — 내전 알림 역할",
        }));
      return await this.setAlertRole(guild, role.id);
    } catch {
      return "역할을 만들지 못했어요. 봇 권한을 확인해 주세요.";
    }
  }

  /** 알림 역할 지정 + 공지 채널에 멤버용 「알림 받기」 버튼 올리기 */
  private async setAlertRole(
    guild: Guild,
    roleId: string,
  ): Promise<string | null> {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) return "역할을 찾지 못했어요.";
    if (role.id === guild.id) {
      return "@everyone 은 알림 역할로 쓸 수 없어요. 다른 역할을 골라 주세요.";
    }
    if (role.managed) {
      return "봇·연동이 관리하는 역할은 쓸 수 없어요. 다른 역할을 골라 주세요.";
    }
    const link = await this.deps.prisma.discordGuildLink.update({
      where: { guildId: guild.id },
      data: { announceRoleId: role.id },
      select: { announceChannelId: true },
    });
    if (!role.editable) {
      // 멘션은 되지만 멤버가 버튼으로 받을 수는 없다 — 저장하고 이유를 알린다
      return `<@&${role.id}> 로 정했어요. 다만 봇 역할이 이 역할보다 아래라 멤버가 버튼으로 받을 수 없어요. 서버 설정 → 역할에서 NEXUS 역할을 위로 올려 주세요.`;
    }
    if (link.announceChannelId) {
      const ch = await guild.channels
        .fetch(link.announceChannelId)
        .catch(() => null);
      if (ch && isPostableType(ch.type)) {
        await this.postAlertOptIn(ch as PostableChannel, role.id);
      }
    }
    return null;
  }

  private async postAlertOptIn(channel: PostableChannel, roleId: string) {
    try {
      await channel.send(buildAlertOptInPanel(roleId) as never);
    } catch (err: any) {
      console.warn(
        `[GuildSetup] 알림 받기 카드 게시 실패 (${channel.id}): ${err?.message}`,
      );
    }
  }

  /** 멤버가 누르는 「알림 받기 / 끄기」 */
  private async handleAlertToggle(interaction: ButtonInteraction, on: boolean) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });
    const link = await this.deps.prisma.discordGuildLink.findUnique({
      where: { guildId: interaction.guild.id },
      select: { announceRoleId: true },
    });
    const role = link?.announceRoleId
      ? await interaction.guild.roles
          .fetch(link.announceRoleId)
          .catch(() => null)
      : null;
    if (!role) {
      await interaction.editReply(
        "❌ 이 서버는 지금 알림 역할을 쓰지 않아요. 관리자에게 `/nexus setup` 을 부탁해 주세요.",
      );
      return;
    }
    if (!role.editable) {
      await interaction.editReply(
        "❌ 봇이 이 역할을 붙여 줄 수 없어요. 관리자에게 `/nexus setup` 의 알림 역할을 확인해 달라고 해 주세요.",
      );
      return;
    }
    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id);
    try {
      if (on) await member.roles.add(role, "NEXUS 내전 알림 받기");
      else await member.roles.remove(role, "NEXUS 내전 알림 끄기");
      await interaction.editReply(
        on
          ? "🔔 이제 내전이 열리면 알려 드릴게요."
          : "🔕 내전 알림을 껐어요. 다시 받으려면 「알림 받기」를 눌러 주세요.",
      );
    } catch {
      await interaction.editReply(
        "❌ 역할을 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.",
      );
    }
  }
}

// ── 작은 도우미 ──────────────────────────────────────────

function isStep(v: string | null): v is SetupStep {
  return SETUP_STEPS.includes(v as SetupStep);
}

/** 한 단계를 끝낸 뒤 갈 화면 — 마법사면 다음 단계(마지막이면 완료), 고치기면 상태 화면 */
export function afterStep(
  step: SetupStep,
  mode: SetupMode,
): SetupStep | "status" | "done" {
  if (mode === "f") return "status";
  const i = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[i + 1] ?? "done";
}

/** 동작이 속한 단계 — 실패하면 그 단계에 머무른다 */
function stepOfAction(action: string): SetupStep | null {
  if (action === "here" || action === "pick") return "channel";
  if (action === "rnew" || action === "rpick" || action === "rskip")
    return "alert";
  if (action === "cross") return "finish";
  return null;
}

function isPostableType(type: ChannelType) {
  return (
    type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement
  );
}

function canPost(channel: PostableChannel, me: GuildMember) {
  return Boolean(
    channel
      .permissionsFor(me)
      ?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages),
  );
}

function isGuildAdmin(interaction: {
  memberPermissions: { has(p: bigint): boolean } | null;
}) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

async function replyAdminOnly(interaction: {
  reply(opts: { content: string; flags: number }): Promise<unknown>;
}) {
  await interaction.reply({
    content: "❌ 서버 관리 권한이 있는 분만 설정할 수 있어요.",
    flags: MessageFlags.Ephemeral,
  });
}
