import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

/*
 * 서버 초기 설정 카드 (`/nexus setup`, 봇이 서버에 들어올 때).
 *
 * 봇을 넣은 관리자들이 설정 명령을 찾지 못해 헤맸다. 명령어 이름·옵션을 외우지 않아도
 * 버튼과 선택 목록만으로 끝나게, 질문 하나씩 묻는 단계형 카드로 만든다.
 *   권한 → 공지 채널 → 알림 역할 → 마무리(다른 서버 내전) → 완료
 * 설정이 끝난 서버에서 다시 열면 "상태" 화면이 뜬다. 항목마다 ✅/❌ 와 「고치기」 버튼이
 * 있어 언제든 문제 있는 부분만 그 단계로 가서 고치고 상태 화면으로 돌아온다.
 *
 * DB·Discord 호출 없이 스냅샷만 받아 그리는 순수 함수로 둔다(room-progress-panel 과 같은
 * 방식). 스냅샷은 guild-setup.ts 가 채운다.
 */

/** 버튼·선택 목록 customId 접두사 */
export const SETUP_PREFIX = "nx_setup:";
/** 「새 채널 만들기」 이름 입력 모달 */
export const SETUP_MODAL_PREFIX = "nx_setup_m:";
export const SETUP_CHANNEL_NAME_INPUT = "nx_setup_name";
/** 멤버용 「내전 알림 받기 / 끄기」 버튼 */
export const ALERT_ON_ID = "nx_alert:on";
export const ALERT_OFF_ID = "nx_alert:off";

/** 새 공지 채널·알림 역할 기본 이름 — 관리자에게는 "예:" 로만 보인다 */
export const DEFAULT_ANNOUNCE_CHANNEL_NAME = "내전-모집";
export const DEFAULT_ALERT_ROLE_NAME = "내전 알림";

export type SetupStep = "perm" | "channel" | "alert" | "finish";
/**
 * w: 처음 설정(마법사) — 고르면 다음 단계로.
 * f: 고치기 — 상태 화면에서 들어왔다. 고르면 상태 화면으로 돌아간다.
 */
export type SetupMode = "w" | "f";

export const SETUP_STEPS: SetupStep[] = ["perm", "channel", "alert", "finish"];
const STEP_LABEL: Record<SetupStep, string> = {
  perm: "권한",
  channel: "공지 채널",
  alert: "알림",
  finish: "마무리",
};

export interface GuildSetupSnapshot {
  guildName: string;
  /** 머리 카드 썸네일(봇 아바타). 없으면 글자만 */
  botAvatarUrl: string | null;
  /** 웹 서버 연동이 활성(ACTIVE)인가 */
  linkActive: boolean;
  perms: {
    /** 음성 대기실·팀 방 만들기/지우기 */
    manageChannels: boolean;
    /** 팀 방으로 사람 옮기기 */
    moveMembers: boolean;
    /** 알림 역할 만들기·붙이기 */
    manageRoles: boolean;
  };
  /** 권한을 다시 주는 초대 링크(이 서버로 고정) */
  reinviteUrl: string;
  announce: {
    channelId: string | null;
    /** 지정한 채널이 아직 있는가(지워졌으면 false) */
    exists: boolean;
    /** 그 채널에 봇이 글을 쓸 수 있는가 */
    canPost: boolean;
  };
  alertRole: {
    roleId: string | null;
    exists: boolean;
    /** 봇이 멤버에게 이 역할을 붙였다 뗄 수 있는가(권한 + 역할 순서) */
    assignable: boolean;
  };
  crossGuild: boolean;
  clanLinked: boolean;
  /** 지금 이 메시지가 있는 채널 — 「지금 이 채널」 선택지. 글을 못 쓰면 null */
  hereChannelId: string | null;
  appUrl: string;
}

export interface SetupPanelPayload {
  components: ContainerBuilder[];
  flags: number;
  allowedMentions: { parse: never[] };
}

/** customId 조립 — `nx_setup:<동작>:<모드>[:<인자>]` */
export function setupId(action: string, mode: SetupMode, arg?: string) {
  return `${SETUP_PREFIX}${action}:${mode}${arg ? `:${arg}` : ""}`;
}

/** customId 해석. 모르는 값이면 null */
export function parseSetupId(
  customId: string,
): { action: string; mode: SetupMode; arg: string | null } | null {
  if (!customId.startsWith(SETUP_PREFIX)) return null;
  const [action, mode, arg] = customId.slice(SETUP_PREFIX.length).split(":");
  if (!action || (mode !== "w" && mode !== "f")) return null;
  return { action, mode, arg: arg ?? null };
}

/** 새 채널 이름 — 비우면 기본값, 디스코드 한도(100자) 안으로 */
export function normalizeChannelName(input: string | null | undefined) {
  const name = (input ?? "").trim().slice(0, 100);
  return name || DEFAULT_ANNOUNCE_CHANNEL_NAME;
}

// ── 상태 판정 ─────────────────────────────────────────────

export type SetupItem = "link" | "perm" | "channel" | "alert";

/**
 * 지금 문제 있는 항목과 그 이유(사람 말로).
 * 알림 역할은 선택이라 "안 정함" 은 문제가 아니다 — 정했는데 못 쓰는 경우만 문제다.
 */
export function setupProblems(
  s: GuildSetupSnapshot,
): { item: SetupItem; reason: string }[] {
  const out: { item: SetupItem; reason: string }[] = [];
  if (!s.linkActive) {
    out.push({ item: "link", reason: "웹에서 서버 연동이 꺼져 있어요" });
  }
  const missing = missingPermLabels(s);
  if (missing.length > 0) {
    out.push({ item: "perm", reason: `${missing.join(", ")} 권한이 없어요` });
  }
  if (!s.announce.channelId) {
    out.push({ item: "channel", reason: "공지 채널을 아직 안 정했어요" });
  } else if (!s.announce.exists) {
    out.push({ item: "channel", reason: "공지 채널이 지워졌어요" });
  } else if (!s.announce.canPost) {
    out.push({ item: "channel", reason: "공지 채널에 글을 쓸 권한이 없어요" });
  }
  if (s.alertRole.roleId && !s.alertRole.exists) {
    out.push({ item: "alert", reason: "알림 역할이 지워졌어요" });
  } else if (s.alertRole.roleId && !s.alertRole.assignable) {
    out.push({
      item: "alert",
      reason: "봇 역할이 알림 역할보다 아래라 멤버에게 붙여 줄 수 없어요",
    });
  }
  return out;
}

function missingPermLabels(s: GuildSetupSnapshot): string[] {
  return [
    !s.perms.manageChannels ? "음성 방 만들기" : null,
    !s.perms.moveMembers ? "멤버 옮기기" : null,
    !s.perms.manageRoles ? "역할 관리" : null,
  ].filter((v): v is string => Boolean(v));
}

/** 처음 설정이 필요한가 — 공지 채널이 없으면 마법사, 있으면 상태 화면 */
export function needsFirstSetup(s: GuildSetupSnapshot): boolean {
  return !s.announce.channelId;
}

// ── 공통 조각 ─────────────────────────────────────────────

const text = (content: string) => new TextDisplayBuilder().setContent(content);
const gap = (divider = false) =>
  new SeparatorBuilder()
    .setDivider(divider)
    .setSpacing(SeparatorSpacingSize.Small);

function button(
  id: string,
  label: string,
  style: ButtonStyle = ButtonStyle.Secondary,
) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function linkButton(url: string, label: string) {
  return new ButtonBuilder()
    .setURL(url)
    .setLabel(label)
    .setStyle(ButtonStyle.Link);
}

/** 맨 위 머리: 봇 아바타 + 제목 + 한 줄 설명 */
function addHeader(c: ContainerBuilder, s: GuildSetupSnapshot, sub: string) {
  const title = text(`## NEXUS 서버 설정\n-# ${sub}`);
  if (s.botAvatarUrl) {
    c.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(title)
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(s.botAvatarUrl).setDescription("NEXUS"),
        ),
    );
  } else {
    c.addTextDisplayComponents(title);
  }
}

/**
 * 진행 표시: `✅ 권한 ─ **❷ 공지 채널** ─ ③ 알림 ─ ④ 마무리`
 * 끝난 단계 ✅, 지금 단계 굵은 검은 숫자, 남은 단계 흰 숫자.
 */
export function progressLine(current: SetupStep | "done"): string {
  const idx =
    current === "done" ? SETUP_STEPS.length : SETUP_STEPS.indexOf(current);
  const open = ["①", "②", "③", "④"];
  const now = ["❶", "❷", "❸", "❹"];
  return SETUP_STEPS.map((step, i) => {
    if (i < idx) return `✅ ${STEP_LABEL[step]}`;
    if (i === idx) return `**${now[i]} ${STEP_LABEL[step]}**`;
    return `${open[i]} ${STEP_LABEL[step]}`;
  }).join("  ─  ");
}

/** 선택지 한 줄: 굵은 제목 + 작은 설명, 오른쪽 버튼 */
function option(
  c: ContainerBuilder,
  title: string,
  desc: string,
  accessory: ButtonBuilder,
) {
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(`**${title}**\n-# ${desc}`))
      .setButtonAccessory(accessory),
  );
}

/** 아래 이동 줄 — 마법사면 「◀ 이전」, 고치기면 「◀ 설정 상태로」 */
function addNav(
  c: ContainerBuilder,
  step: SetupStep,
  mode: SetupMode,
  extra: ButtonBuilder[] = [],
) {
  const idx = SETUP_STEPS.indexOf(step);
  const buttons: ButtonBuilder[] = [];
  if (mode === "f") {
    buttons.push(button(setupId("status", "f"), "◀ 설정 상태로"));
  } else if (idx > 0) {
    buttons.push(button(setupId("go", "w", SETUP_STEPS[idx - 1]), "◀ 이전"));
  }
  buttons.push(...extra);
  c.addSeparatorComponents(gap(true));
  if (buttons.length > 0) {
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    );
  }
  c.addTextDisplayComponents(
    text("-# 언제든 `/nexus setup` 으로 다시 열어 고칠 수 있어요"),
  );
}

function payload(c: ContainerBuilder): SetupPanelPayload {
  return {
    components: [c],
    flags: MessageFlags.IsComponentsV2,
    // 설정 카드는 아무도 멘션하지 않는다(역할 이름을 보여 줘도 울리지 않게)
    allowedMentions: { parse: [] },
  };
}

const ok = (yes: boolean) => (yes ? "✅" : "❌");

// ── 화면 ─────────────────────────────────────────────────

/** 봇이 들어온 직후 카드 — 버튼 하나 */
export function buildSetupStartPanel(s: GuildSetupSnapshot): SetupPanelPayload {
  const c = new ContainerBuilder();
  addHeader(c, s, "1분이면 이 서버에서 내전을 열 수 있어요");
  c.addSeparatorComponents(gap(true));
  c.addTextDisplayComponents(
    text(
      [
        "NEXUS가 들어왔어요! 아래 버튼을 누르면 질문 몇 개로 설정이 끝나요.",
        `-# ${progressLine("perm").replace(/\*\*/g, "")}`,
        "-# 서버 관리 권한이 있는 분만 누를 수 있어요.",
      ].join("\n"),
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(setupId("go", "w", "perm"), "설정 시작", ButtonStyle.Success),
      linkButton(s.appUrl, "웹사이트"),
    ),
  );
  return payload(c);
}

/** 단계 화면 */
export function buildSetupStepPanel(
  s: GuildSetupSnapshot,
  step: SetupStep,
  mode: SetupMode,
): SetupPanelPayload {
  const c = new ContainerBuilder();
  addHeader(
    c,
    s,
    mode === "f"
      ? "고칠 부분만 바꾸면 돼요"
      : "질문에 답하면 다음으로 넘어가요",
  );
  if (mode === "w") c.addTextDisplayComponents(text(progressLine(step)));
  c.addSeparatorComponents(gap(true));

  switch (step) {
    case "perm":
      return payload(stepPerm(c, s, mode));
    case "channel":
      return payload(stepChannel(c, s, mode));
    case "alert":
      return payload(stepAlert(c, s, mode));
    case "finish":
      return payload(stepFinish(c, s, mode));
  }
}

function stepPerm(c: ContainerBuilder, s: GuildSetupSnapshot, mode: SetupMode) {
  const missing = missingPermLabels(s);
  c.addTextDisplayComponents(
    text(
      [
        missing.length === 0
          ? "### 봇 권한이 모두 있어요"
          : "### 봇 권한이 조금 모자라요",
        `${ok(s.perms.manageChannels)} 음성 방 만들기·지우기 — 내전마다 대기실과 팀 방을 만들어요`,
        `${ok(s.perms.moveMembers)} 멤버 옮기기 — 팀이 정해지면 팀 방으로 옮겨 줘요`,
        `${ok(s.perms.manageRoles)} 역할 관리 — 알림 역할을 만들고 멤버에게 붙여 줘요`,
        missing.length > 0
          ? "\n-# 「권한 다시 주기」로 봇을 한 번 더 승인하면 채워져요. 승인한 뒤 「다시 확인」을 눌러 주세요."
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  );
  const extra: ButtonBuilder[] = [];
  if (missing.length > 0) {
    extra.push(
      linkButton(s.reinviteUrl, "권한 다시 주기"),
      button(setupId("go", mode, "perm"), "다시 확인"),
    );
  }
  if (mode === "w") {
    extra.push(
      button(
        setupId("go", "w", "channel"),
        missing.length > 0 ? "이대로 다음" : "다음",
        ButtonStyle.Success,
      ),
    );
  }
  addNav(c, "perm", mode, extra);
  return c;
}

function stepChannel(
  c: ContainerBuilder,
  s: GuildSetupSnapshot,
  mode: SetupMode,
) {
  c.addTextDisplayComponents(
    text(
      [
        "### 모집 공지는 어느 채널에 올릴까요?",
        "내전이 열리면 참가 버튼이 달린 공지가 여기에 올라와요.",
        s.announce.channelId && s.announce.exists
          ? `-# 지금: <#${s.announce.channelId}>`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  );
  c.addSeparatorComponents(gap());
  option(
    c,
    "새 채널 만들기 · 추천",
    s.perms.manageChannels
      ? `이름은 직접 정해요 · 예: ${DEFAULT_ANNOUNCE_CHANNEL_NAME}`
      : "채널을 만들 권한이 없어요 — 1단계에서 권한을 먼저 채워 주세요",
    button(
      setupId("new", mode),
      "만들기",
      s.perms.manageChannels ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
  );
  if (s.hereChannelId) {
    option(
      c,
      "지금 이 채널",
      "이 메시지가 있는 채널에 올려요",
      button(setupId("here", mode), "선택"),
    );
  }
  c.addActionRowComponents(
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(setupId("pick", mode))
        .setPlaceholder("이미 있는 채널에서 고르기")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1),
    ),
  );
  addNav(c, "channel", mode);
  return c;
}

function stepAlert(
  c: ContainerBuilder,
  s: GuildSetupSnapshot,
  mode: SetupMode,
) {
  c.addTextDisplayComponents(
    text(
      [
        "### 내전이 열리면 누구에게 알릴까요?",
        "알림 역할을 정하면 공지에 멘션이 붙어요. 멤버는 공지 채널의 버튼으로 직접 받고 끌 수 있어요.",
        s.alertRole.roleId && s.alertRole.exists
          ? `-# 지금: <@&${s.alertRole.roleId}>`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  );
  c.addSeparatorComponents(gap());
  option(
    c,
    `새 역할 「${DEFAULT_ALERT_ROLE_NAME}」 만들기 · 추천`,
    s.perms.manageRoles
      ? "역할을 만들고 공지 채널에 「알림 받기」 버튼을 올려요"
      : "역할 관리 권한이 없어요 — 1단계에서 권한을 먼저 채워 주세요",
    button(
      setupId("rnew", mode),
      "만들기",
      s.perms.manageRoles ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
  );
  option(
    c,
    "알림 없이 하기",
    s.alertRole.roleId
      ? "멘션을 끄고 공지만 올려요"
      : "공지만 올리고 멘션은 하지 않아요",
    button(
      setupId("rskip", mode),
      s.alertRole.roleId ? "알림 끄기" : "건너뛰기",
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(setupId("rpick", mode))
        .setPlaceholder("이미 있는 역할에서 고르기")
        .setMinValues(1)
        .setMaxValues(1),
    ),
  );
  addNav(c, "alert", mode);
  return c;
}

function stepFinish(
  c: ContainerBuilder,
  s: GuildSetupSnapshot,
  mode: SetupMode,
) {
  c.addTextDisplayComponents(
    text(
      [
        "### 다른 서버에서 열린 내전도 받을까요?",
        "서버 하나로 10명을 채우기는 어려워요. 받으면 NEXUS를 쓰는 다른 서버의 모집 공지도 여기에 올라와요.",
        `-# 지금: ${s.crossGuild ? "받는 중" : "우리 서버 내전만"}`,
      ].join("\n"),
    ),
  );
  c.addSeparatorComponents(gap());
  option(
    c,
    "받기 · 추천",
    "인원이 빨리 차요",
    button(setupId("cross", mode, "on"), "받기", ButtonStyle.Success),
  );
  option(
    c,
    "우리 서버만",
    "이 서버에서 연 내전 공지만 올려요",
    button(setupId("cross", mode, "off"), "우리 서버만"),
  );
  addNav(c, "finish", mode);
  return c;
}

/** 마법사 끝 화면 */
export function buildSetupDonePanel(s: GuildSetupSnapshot): SetupPanelPayload {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(text(progressLine("done")));
  c.addSeparatorComponents(gap(true));
  c.addTextDisplayComponents(
    text(
      [
        "## ✅ 설정 끝! 이제 내전을 열 수 있어요",
        `**공지 채널** ${s.announce.channelId ? `<#${s.announce.channelId}>` : "없음"}`,
        `**알림 역할** ${s.alertRole.roleId ? `<@&${s.alertRole.roleId}>` : "없음"}`,
        `**다른 서버 내전** ${s.crossGuild ? "받기" : "우리 서버만"}`,
      ].join("\n"),
    ),
  );
  c.addSeparatorComponents(gap(true));
  c.addTextDisplayComponents(
    text(
      [
        "**첫 내전 열어 보기**",
        "```/nexus schedule time:오늘 21:00 mode:자동 밸런스```",
        "-# 나중에 해도 돼요 · 클랜 연결 `/nexus linkclan` · 티어 역할 `/nexus setuproles` · 인증 패널 `/nexus setupverifypanel`",
      ].join("\n"),
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(setupId("status", "f"), "설정 상태 보기"),
      linkButton(s.appUrl, "웹사이트"),
    ),
  );
  return payload(c);
}

/**
 * 설정 상태 화면 — 다시 열었을 때. 항목마다 ✅/❌ 와 「고치기·바꾸기」 버튼.
 * 문제가 있으면 맨 위에 몇 개인지와 이유를 먼저 보인다.
 */
export function buildSetupStatusPanel(
  s: GuildSetupSnapshot,
): SetupPanelPayload {
  const problems = setupProblems(s);
  const bad = new Set(problems.map((p) => p.item));
  const c = new ContainerBuilder();
  addHeader(
    c,
    s,
    problems.length === 0
      ? "모두 정상이에요"
      : `고칠 곳이 ${problems.length}개 있어요`,
  );
  if (problems.length > 0) {
    c.addTextDisplayComponents(
      text(problems.map((p) => `❌ ${p.reason}`).join("\n")),
    );
  }
  c.addSeparatorComponents(gap(true));

  const fix = (step: SetupStep, isBad: boolean, okLabel = "바꾸기") =>
    button(
      setupId("go", "f", step),
      isBad ? "고치기" : okLabel,
      isBad ? ButtonStyle.Danger : ButtonStyle.Secondary,
    );

  if (!s.linkActive) {
    option(
      c,
      "❌ 서버 연동",
      "웹에서 서버를 다시 연동해야 내전이 열려요",
      linkButton(s.appUrl, "웹에서 연동"),
    );
  }
  const missing = missingPermLabels(s);
  option(
    c,
    `${ok(!bad.has("perm"))} 봇 권한`,
    missing.length === 0 ? "모두 있어요" : `없음: ${missing.join(", ")}`,
    fix("perm", bad.has("perm"), "확인"),
  );
  option(
    c,
    `${ok(!bad.has("channel"))} 모집 공지 채널`,
    s.announce.channelId && s.announce.exists
      ? `<#${s.announce.channelId}>`
      : "정하지 않았어요",
    fix("channel", bad.has("channel")),
  );
  option(
    c,
    `${bad.has("alert") ? "❌" : s.alertRole.roleId ? "✅" : "➖"} 알림 역할`,
    s.alertRole.roleId && s.alertRole.exists
      ? `<@&${s.alertRole.roleId}>`
      : "없음 — 공지만 올려요",
    fix("alert", bad.has("alert"), s.alertRole.roleId ? "바꾸기" : "정하기"),
  );
  option(
    c,
    `${s.crossGuild ? "🌐" : "🏠"} 다른 서버 내전`,
    s.crossGuild ? "받는 중" : "우리 서버 내전만",
    button(
      setupId("cross", "f", s.crossGuild ? "off" : "on"),
      s.crossGuild ? "끄기" : "켜기",
    ),
  );
  c.addSeparatorComponents(gap(true));
  c.addTextDisplayComponents(
    text(
      `-# ${s.clanLinked ? "✅ 클랜 연결됨" : "클랜 연결 `/nexus linkclan`"} · 티어 역할 \`/nexus setuproles\` · 인증 패널 \`/nexus setupverifypanel\``,
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(setupId("status", "f"), "새로고침"),
      button(setupId("go", "w", "perm"), "처음부터 다시"),
    ),
  );
  return payload(c);
}

/** 공지 채널에 한 번 올리는 멤버용 알림 카드 */
export function buildAlertOptInPanel(roleId: string): SetupPanelPayload {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(
    text(
      [
        "### 🔔 내전 알림 받기",
        `내전이 열리면 <@&${roleId}> 멘션으로 알려 드려요. 언제든 끌 수 있어요.`,
      ].join("\n"),
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(ALERT_ON_ID, "알림 받기", ButtonStyle.Success),
      button(ALERT_OFF_ID, "끄기"),
    ),
  );
  return payload(c);
}

/** 「새 채널 만들기」 를 누르면 뜨는 이름 입력 모달의 설명 문구 */
export const CHANNEL_NAME_PLACEHOLDER = `예: ${DEFAULT_ANNOUNCE_CHANNEL_NAME}`;
