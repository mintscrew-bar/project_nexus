import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

/*
 * 모집이 끝난 뒤의 내전 패널.
 *
 * 모집 공지(buildRoomRecruitMessage)는 방이 WAITING 인 동안만 쓴다. 그 뒤로는
 * 같은 메시지를 이 파일의 카드로 바꿔 그린다 — 팀 구성 중 → 경기 진행 중 →
 * 종료. 새 메시지를 보내지 않고 수정만 한다(운영자 결정, 2026-09-22).
 *
 * DB·Discord 호출 없이 스냅샷만 받아 그리는 순수 함수로 둔다. 무엇을 어떻게
 * 보여주는지를 테스트로 고정하기 위해서다. 스냅샷은 DiscordBotService 가 채운다.
 */

/** 패널이 따라가는 방 상태. WAITING 은 모집 공지가 맡는다. */
export type RoomProgressStatus =
  | "TEAM_SELECTION"
  | "DRAFT"
  | "DRAFT_COMPLETED"
  | "ROLE_SELECTION"
  | "IN_PROGRESS"
  | "COMPLETED";

export interface RoomProgressTeam {
  id: string;
  name: string;
  captainName: string | null;
  /** 팀장을 뺀 팀원. 팀장은 captainName 으로 따로 온다. */
  members: string[];
}

/** 롤 대진 한 칸(= 시리즈). 단판도 bestOf 1 인 시리즈다. */
export interface RoomProgressSeries {
  round: number;
  matchNumber: number;
  bracketRound: string | null;
  bracketType: string | null;
  teamAId: string | null;
  teamAName: string | null;
  teamBId: string | null;
  teamBName: string | null;
  /** 시리즈 안에서 각 팀이 이긴 세트 수 */
  winsA: number;
  winsB: number;
  bestOf: number;
  status: string;
  winnerId: string | null;
}

/** 배그 스크림 진행 상황. 순위는 이미 정렬돼서 온다(ScrimService 기준). */
export interface RoomProgressScrim {
  status: string;
  totalRounds: number;
  completedRounds: number;
  /** 킬내기(시간제)면 true. 라운드 수 대신 종료 시각으로 진행을 보여준다. */
  timed: boolean;
  cutoffAt: Date | null;
  standings: { teamName: string; totalPoints: number; totalKills: number }[];
}

export interface RoomProgressSnapshot {
  roomName: string;
  hostName: string;
  gameTitle: "LOL" | "PUBG";
  teamMode: string;
  isPrivate: boolean;
  status: RoomProgressStatus;
  /** 종료 시각. 배그 스크림 확정은 completedAt 을 안 남겨서 updatedAt 으로 대신한다. */
  finishedAt: Date | null;
  teams: RoomProgressTeam[];
  series: RoomProgressSeries[];
  scrim: RoomProgressScrim | null;
}

export interface RoomProgressLinks {
  lobbyUrl: string;
  /** 롤은 대진표, 배그는 스크림(리더보드) 페이지 */
  resultUrl: string;
  /** 원 서버 공지에만 단다. 사본 서버 멤버는 원 서버 음성채널에 못 들어간다. */
  voiceUrl?: string | null;
  /** 다른 서버로 퍼진 사본이면 원 서버 이름 */
  originGuildName?: string | null;
}

export interface PanelPayload {
  components: ContainerBuilder[];
  flags: number;
  allowedMentions: { roles: string[] };
}

// 단계별 액센트 색. 모집 공지는 보라(모집 중)·초록(정원 참)을 쓴다.
const COLOR = {
  building: 0xf59e0b, // 팀 구성 중
  ready: 0x3b82f6, // 팀 확정, 경기 대기
  live: 0xef4444, // 경기 진행 중
  done: 0xeab308, // 종료
  closed: 0x6b7280, // 해산
} as const;

/** 팀을 이만큼 넘게 편성하면 명단 대신 개수만 쓴다(배그 25스쿼드 방 대비). */
const TEAM_ROSTER_LIMIT = 8;
/** 대진 줄 상한. 8팀 더블 일리미네이션이 14경기라 그걸 넘겨 잡는다. */
const SERIES_LINE_LIMIT = 16;
/** 배그 순위 줄 상한 */
const STANDINGS_LIMIT = 5;

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const unix = (date: Date) => Math.floor(date.getTime() / 1000);

/**
 * 대진 칸 이름.
 *
 * 웹의 방송 제어 화면(broadcast-control stageLabel)과 같은 규칙이다. 두 곳이
 * 다르게 부르면 디스코드에서 본 "4강"이 웹에서는 "준결승"이 된다.
 */
export function seriesStageLabel(
  series: Pick<RoomProgressSeries, "bracketRound" | "bracketType" | "round">,
  maxRound: number,
): string {
  // 2팀 단판은 대진이 하나뿐이라 "결승"이라고 부르면 어색하다.
  if (series.bracketType === "SINGLE") return "매치";
  if (series.bracketType === "ROUND_ROBIN") return `리그 ${series.round}R`;

  const section = series.bracketRound ?? "";
  if (section === "GF" || section.includes("FINAL")) return "결승";
  if (section === "WB_F") return "승자조 결승";
  if (section === "LB_F") return "패자조 결승";
  if (section.startsWith("WB")) return "승자조";
  if (section.startsWith("LB")) return "패자조";

  if (!series.round || !maxRound) return "경기";
  if (series.round === maxRound) return "결승";
  if (series.round === maxRound - 1) return "4강";
  if (series.round === maxRound - 2) return "8강";
  return `${series.round}라운드`;
}

/**
 * 롤 우승 팀.
 *
 * 토너먼트는 마지막 시리즈(더블 일리미네이션은 그랜드 파이널)의 승자,
 * 리그는 시리즈 승수 → 세트 득실 순으로 가른다.
 */
export function lolChampionId(series: RoomProgressSeries[]): string | null {
  const finished = series.filter((item) => item.winnerId);
  if (finished.length === 0) return null;

  const isLeague = series.some((item) => item.bracketType === "ROUND_ROBIN");
  if (!isLeague) {
    const grandFinal = finished.find((item) => item.bracketRound === "GF");
    if (grandFinal) return grandFinal.winnerId;
    return [...finished].sort(
      (a, b) => b.round - a.round || b.matchNumber - a.matchNumber,
    )[0].winnerId;
  }

  const table = new Map<string, { wins: number; diff: number }>();
  const bump = (teamId: string | null, win: boolean, diff: number) => {
    if (!teamId) return;
    const row = table.get(teamId) ?? { wins: 0, diff: 0 };
    row.wins += win ? 1 : 0;
    row.diff += diff;
    table.set(teamId, row);
  };
  for (const item of finished) {
    const aWon = item.winnerId === item.teamAId;
    bump(item.teamAId, aWon, item.winsA - item.winsB);
    bump(item.teamBId, !aWon, item.winsB - item.winsA);
  }
  const [top] = [...table.entries()].sort(
    ([, a], [, b]) => b.wins - a.wins || b.diff - a.diff,
  );
  return top?.[0] ?? null;
}

const MODE_LABEL: Record<string, string> = {
  AUCTION: "경매 드래프트",
  SNAKE_DRAFT: "스네이크 드래프트",
  AUTO_BALANCE: "자동 밸런스",
  MANUAL_TEAM: "자유 팀 선택",
};

/** 헤더 아래 한 줄. 지금 어느 단계인지가 패널에서 가장 먼저 읽혀야 한다. */
function statusLine(snapshot: RoomProgressSnapshot): string {
  const { status, teamMode, gameTitle, scrim } = snapshot;
  const unit = gameTitle === "PUBG" ? "스쿼드" : "팀";
  switch (status) {
    case "TEAM_SELECTION":
      return `🧩 **${unit} 선택 중**`;
    case "DRAFT":
      if (teamMode === "AUCTION") return "💰 **경매 진행 중**";
      if (teamMode === "SNAKE_DRAFT") return "🐍 **스네이크 드래프트 진행 중**";
      if (teamMode === "AUTO_BALANCE") return "⚖️ **자동 밸런스 편성 확인 중**";
      return `🧩 **${unit} 확정 중**`;
    case "DRAFT_COMPLETED":
      return gameTitle === "PUBG"
        ? "✅ **스쿼드 구성 완료** · 경기 준비 중"
        : "✅ **팀 구성 완료** · 대진 준비 중";
    case "ROLE_SELECTION":
      return "🎯 **역할 선택 중**";
    case "IN_PROGRESS":
      if (scrim?.timed) {
        if (scrim.status === "PENDING") return "⏳ **킬내기 시작 대기**";
        return scrim.cutoffAt
          ? `⚔️ **킬내기 진행 중** · <t:${unix(scrim.cutoffAt)}:R> 종료`
          : "⚔️ **킬내기 진행 중**";
      }
      if (scrim) {
        const current = Math.min(scrim.completedRounds + 1, scrim.totalRounds);
        return `⚔️ **${current}라운드 진행 중** · 총 ${scrim.totalRounds}판`;
      }
      return "⚔️ **경기 진행 중**";
    case "COMPLETED":
      return "🏆 **내전 종료**";
  }
}

function accentFor(status: RoomProgressStatus): number {
  if (status === "COMPLETED") return COLOR.done;
  if (status === "IN_PROGRESS") return COLOR.live;
  if (status === "DRAFT_COMPLETED" || status === "ROLE_SELECTION") {
    return COLOR.ready;
  }
  return COLOR.building;
}

/** 팀 명단. 팀장은 왕관으로 앞에 세운다. */
function teamsBlock(snapshot: RoomProgressSnapshot): string | null {
  const { teams, gameTitle } = snapshot;
  if (teams.length === 0) return null;
  const unit = gameTitle === "PUBG" ? "스쿼드" : "팀";

  if (teams.length > TEAM_ROSTER_LIMIT) {
    return `**${unit}** ${teams.length}개 편성\n-# 명단은 웹에서 확인하세요`;
  }

  const lines = teams.map((team) => {
    const people = [
      team.captainName ? `👑 ${clip(team.captainName, 20)}` : null,
      ...team.members.map((name) => clip(name, 20)),
    ].filter(Boolean);
    return `**${clip(team.name, 24)}**  ${
      people.length > 0 ? people.join(" · ") : "_아직 없음_"
    }`;
  });
  return [`**${unit} 명단**`, ...lines].join("\n");
}

/** 롤 대진과 스코어 */
function seriesBlock(snapshot: RoomProgressSnapshot): string | null {
  const { series } = snapshot;
  if (series.length === 0) return null;

  const ordered = [...series].sort(
    (a, b) => a.round - b.round || a.matchNumber - b.matchNumber,
  );
  const maxRound = Math.max(...ordered.map((item) => item.round), 0);

  const lines = ordered.slice(0, SERIES_LINE_LIMIT).map((item) => {
    const stage = `\`${seriesStageLabel(item, maxRound)}\``;
    const a = clip(item.teamAName ?? "미정", 20);
    const b = clip(item.teamBName ?? "미정", 20);
    // `-# ` 작은 글씨는 줄 맨 앞에서만 먹는다. 줄 끝 표기는 괄호로 둔다.
    const bo = item.bestOf > 1 ? ` (BO${item.bestOf})` : "";

    if (item.winnerId) {
      const aWon = item.winnerId === item.teamAId;
      return `${stage} ${aWon ? `**${a}**` : a} ${item.winsA} : ${item.winsB} ${
        aWon ? b : `**${b}**`
      }${bo}`;
    }
    const started =
      item.status === "IN_PROGRESS" || item.winsA + item.winsB > 0;
    if (started) {
      return `${stage} ${a} ${item.winsA} : ${item.winsB} ${b} · 🔴 진행 중${bo}`;
    }
    return `${stage} ${a} vs ${b}${bo}`;
  });

  const rest = ordered.length - SERIES_LINE_LIMIT;
  if (rest > 0) lines.push(`-# …외 ${rest}경기`);
  return ["**대진**", ...lines].join("\n");
}

/** 배그 순위 */
function standingsBlock(snapshot: RoomProgressSnapshot): string | null {
  const { scrim } = snapshot;
  if (!scrim || scrim.standings.length === 0) return null;
  // 한 판도 끝나기 전 순위는 전원 0점이라 보여줄 의미가 없다.
  if (scrim.completedRounds === 0) return null;

  const title = scrim.timed
    ? `**순위** · ${scrim.completedRounds}판 집계`
    : `**순위** · ${scrim.completedRounds} / ${scrim.totalRounds}판`;
  const lines = scrim.standings
    .slice(0, STANDINGS_LIMIT)
    .map(
      (row, index) =>
        `\`${index + 1}\` ${clip(row.teamName, 24)} — **${row.totalPoints}**점 · 킬 ${row.totalKills}`,
    );
  return [title, ...lines].join("\n");
}

/** 종료 카드의 우승 줄 */
function championBlock(snapshot: RoomProgressSnapshot): string | null {
  if (snapshot.status !== "COMPLETED") return null;

  if (snapshot.gameTitle === "PUBG") {
    const top = snapshot.scrim?.standings[0];
    return top
      ? `🏆 **1위 ${clip(top.teamName, 24)}** — ${top.totalPoints}점 · 킬 ${top.totalKills}`
      : null;
  }

  const championId = lolChampionId(snapshot.series);
  const team = snapshot.teams.find((item) => item.id === championId);
  if (!team) return null;
  const roster = [team.captainName, ...team.members]
    .filter(Boolean)
    .map((name) => clip(name as string, 20))
    .join(" · ");
  return `🏆 **우승 ${clip(team.name, 24)}**${roster ? `\n-# ${roster}` : ""}`;
}

/**
 * 모집이 끝난 뒤의 패널.
 *
 * 순서: 헤더(방 이름·모드·단계) → 우승(종료 시) → 대진/순위 → 명단.
 * 종료 카드에서는 명단을 뺀다 — 우승 팀 명단이 이미 위에 있고, 팀 전체 명단까지
 * 붙이면 결과보다 명단이 더 길어진다.
 */
export function buildRoomProgressPanel(
  snapshot: RoomProgressSnapshot,
  links: RoomProgressLinks,
): PanelPayload {
  const container = new ContainerBuilder().setAccentColor(
    accentFor(snapshot.status),
  );

  const modeLabel = MODE_LABEL[snapshot.teamMode] ?? snapshot.teamMode;
  const headerLines = [
    `## ${snapshot.isPrivate ? "🔒 " : ""}${snapshot.roomName}`,
    `${modeLabel}  ·  방장 **${snapshot.hostName}**`,
    statusLine(snapshot),
  ];
  if (links.originGuildName) {
    headerLines.push(
      `-# 🌐 **${links.originGuildName}** 서버에서 열린 내전입니다`,
    );
  }

  // 팀이 정해지기 전에는 대진표·리더보드가 비어 있다. 그때는 로비로 보낸다.
  const hasResultPage = snapshot.series.length > 0 || snapshot.scrim !== null;
  const headerButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setURL(hasResultPage ? links.resultUrl : links.lobbyUrl)
    .setLabel(
      !hasResultPage
        ? "로비 보기"
        : snapshot.gameTitle === "PUBG"
          ? "리더보드 보기"
          : "대진표 보기",
    );

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerLines.join("\n")),
      )
      .setButtonAccessory(headerButton),
  );

  const blocks = [
    championBlock(snapshot),
    snapshot.gameTitle === "PUBG"
      ? standingsBlock(snapshot)
      : seriesBlock(snapshot),
    snapshot.status === "COMPLETED" ? null : teamsBlock(snapshot),
  ].filter((block): block is string => Boolean(block));

  for (const block of blocks) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(block),
    );
  }

  // 끝난 방은 음성채널로 부를 일이 없다. 종료 시 참가자는 대기실로 돌아간다.
  if (links.voiceUrl && snapshot.status !== "COMPLETED") {
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(false)
        .setSpacing(SeparatorSpacingSize.Small),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("음성채널 참가")
          .setStyle(ButtonStyle.Link)
          .setURL(links.voiceUrl),
      ),
    );
  }

  const footer =
    snapshot.status === "COMPLETED"
      ? snapshot.finishedAt
        ? `-# <t:${unix(snapshot.finishedAt)}:f> 종료`
        : "-# 내전이 종료되었습니다"
      : "-# 진행 상황에 따라 자동으로 업데이트됩니다.";
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(footer),
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    // 진행 갱신은 수정이라 알림이 안 가지만, 혹시라도 핑이 섞이지 않게 막는다.
    allowedMentions: { roles: [] },
  };
}

/**
 * 방이 사라졌을 때의 카드.
 *
 * 공지를 지우지 않는다 — 그 서버에서 내전이 열렸다는 사실까지 없어진다.
 * 버튼을 전부 걷어내 죽은 방으로 들어가려는 시도를 막는다.
 */
export function buildRoomDissolvedPanel(roomName: string): PanelPayload {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR.closed)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${roomName}`,
          "-# 방이 해산되었습니다",
          "이 내전은 더 이상 진행되지 않습니다.",
        ].join("\n"),
      ),
    );
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [] },
  };
}
