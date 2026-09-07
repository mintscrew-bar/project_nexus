/**
 * 배틀그라운드 전용 설정.
 *
 * 롤과 달리 "경기 모드"와 "팀 구성 방식"이 별개다.
 * 모드는 경기 규칙(2팀 킬내기 / 다팀 배틀로얄)이고,
 * 팀 구성은 참가자를 팀에 넣는 방법(경매·스네이크·수동)이다.
 */

import {
  DEFAULT_GAME,
  GAMES,
  type GameTeamMode,
  type GameTitle,
} from "./games";

/** 배그를 어느 플랫폼에서 하는가. Prisma `PubgPlatform` 과 값이 일치해야 한다. */
export type PubgPlatform = "STEAM" | "KAKAO";

export const PUBG_PLATFORMS: readonly PubgPlatform[] = [
  "STEAM",
  "KAKAO",
] as const;

/** 스팀 배그 = 스배, 카카오 배그 = 카배. 커뮤니티에서 쓰는 줄임말 그대로 쓴다. */
export const PUBG_PLATFORM_LABELS: Record<
  PubgPlatform,
  { short: string; long: string }
> = {
  STEAM: { short: "스배", long: "스팀 배그" },
  KAKAO: { short: "카배", long: "카카오 배그" },
};

/** 배그 경기 모드. Prisma `PubgGameMode` 와 값이 일치해야 한다. */
export type PubgGameMode = "KILL_MATCH" | "BATTLE_ROYALE" | "FREE_MATCH";

/** 목록 순서가 곧 화면 노출 순서다. 킬내기가 가장 많이 열리는 형식이다. */
export const PUBG_GAME_MODES: readonly PubgGameMode[] = [
  "KILL_MATCH",
  "BATTLE_ROYALE",
  "FREE_MATCH",
] as const;

export interface PubgGameModeDefinition {
  mode: PubgGameMode;
  label: string;
  description: string;
  /** 이 모드에서 고를 수 있는 정원. 4인 스쿼드 기준이다. */
  roomSizes: readonly number[];
  /**
   * 결과를 가리는 방식.
   * - `BRACKET` 2팀 승패 → 기존 Match/MatchSeries 재사용
   * - `POINT_LEADERBOARD` 다팀 라운드 누적 → Scrim 계열
   * - `NONE` 결과를 남기지 않는다
   */
  resultShape: "BRACKET" | "POINT_LEADERBOARD" | "NONE";
  teamModes: readonly GameTeamMode[];
  /**
   * 지금 새 방을 열 수 있는 모드인지.
   *
   * 값을 지우지 않고 플래그로 막는다 — 이미 이 모드로 만들어진 방과 기록이
   * 값을 읽어야 하고, `PubgGameMode` enum 에서 빼면 그 행들이 깨진다.
   */
  selectable: boolean;
}

/**
 * 킬내기는 2팀이라 정원이 곧 팀 인원 × 2다.
 * 배틀로얄은 4팀부터 — 2~3팀으로는 순위 점수가 의미를 잃는다.
 * 자유 매치는 방장이 알아서 굴리는 방이라 결과를 남기지 않는다.
 */
const MODE_DEFINITIONS: Record<PubgGameMode, PubgGameModeDefinition> = {
  BATTLE_ROYALE: {
    mode: "BATTLE_ROYALE",
    label: "배틀로얄 내전",
    description:
      "여러 팀이 한 매치에 들어가 라운드를 반복하고 순위·킬 포인트를 누적합니다.",
    // 8팀(32명)부터 인게임 정원 한계인 25팀(100명)까지.
    // 4팀(16명)으로는 순위 점수가 몇 판만에 굳어 리더보드가 의미를 잃는다.
    roomSizes: [32, 40, 48, 64, 80, 100],
    resultShape: "POINT_LEADERBOARD",
    teamModes: ["AUCTION", "SNAKE_DRAFT", "AUTO_BALANCE", "MANUAL_TEAM"],
    selectable: true,
  },
  KILL_MATCH: {
    mode: "KILL_MATCH",
    label: "킬내기",
    description:
      "두 팀이 같은 판에 들어가 대도시에서 싸웁니다. 킬 +1 · 사망 −3 · 치킨 +8 로 라운드마다 누적합니다.",
    // 항상 2팀이라 정원이 곧 팀 인원 × 2다.
    // 6·8 은 한 스쿼드(3대3·4대4), 14·16 은 두 스쿼드가 한 팀인 깐부킬내기다.
    roomSizes: [6, 8, 14, 16],
    resultShape: "POINT_LEADERBOARD",
    teamModes: ["AUCTION", "SNAKE_DRAFT", "AUTO_BALANCE", "MANUAL_TEAM"],
    selectable: true,
  },
  /**
   * 자유 매치는 지금 열 수 없다(`selectable: false`).
   *
   * 결과를 남기지 않는 방이라 팀 확정 뒤 갈 곳이 없다 — 대진표로 보내면
   * 대진표는 2~8팀만 만들 수 있어 12팀(48명)부터 시작 자체가 막히고,
   * 스크림으로 보내면 "전적에 안 남긴다"는 정의가 무너진다.
   * 진행 방식을 정하기 전까지는 목록에서 뺀다.
   */
  FREE_MATCH: {
    mode: "FREE_MATCH",
    label: "자유 매치",
    description:
      "팀만 나누고 진행은 방에서 알아서 합니다. 전적에 남기지 않습니다.",
    roomSizes: [8, 16, 32, 48, 64, 80, 100],
    resultShape: "NONE",
    teamModes: ["MANUAL_TEAM"],
    selectable: false,
  },
};

/**
 * 기본 모드.
 *
 * 킬내기가 배그 내전의 주류다. 배틀로얄은 16명(4팀)부터라 사람이 모여야 열리는데,
 * 킬내기는 6명이면 시작할 수 있어 첫 판을 열기가 훨씬 쉽다.
 */
export const DEFAULT_PUBG_GAME_MODE: PubgGameMode = "KILL_MATCH";

export function getPubgGameMode(mode: PubgGameMode): PubgGameModeDefinition {
  return MODE_DEFINITIONS[mode];
}

/** 지금 새 방을 열 수 있는 모드만. 화면·봇의 선택지는 전부 이걸 쓴다. */
export function pubgGameModes(): PubgGameModeDefinition[] {
  return PUBG_GAME_MODES.map((mode) => MODE_DEFINITIONS[mode]).filter(
    (definition) => definition.selectable,
  );
}

/** 옛 방과 기록까지 포함한 전체 목록 */
export function allPubgGameModes(): PubgGameModeDefinition[] {
  return PUBG_GAME_MODES.map((mode) => MODE_DEFINITIONS[mode]);
}

/** 새 방을 이 모드로 열 수 있는지 */
export function isSelectablePubgGameMode(mode: PubgGameMode): boolean {
  return MODE_DEFINITIONS[mode].selectable;
}

/** 이 모드에서 고를 수 있는 정원인지 */
export function isValidPubgRoomSize(
  maxParticipants: number,
  mode: PubgGameMode,
): boolean {
  return MODE_DEFINITIONS[mode].roomSizes.includes(maxParticipants);
}

/**
 * 방 제목 앞에 붙는 플랫폼 태그.
 *
 * DB 에는 사용자가 적은 원본 이름만 저장한다. 표시할 때 붙이는 이유는,
 * 저장해 두면 방장이 제목을 고칠 때마다 접두사가 겹쳐 붙거나 사라지기 때문이다.
 */
export function pubgRoomTitle(
  name: string,
  platform: PubgPlatform | null | undefined,
): string {
  if (!platform) return name;
  return `[${PUBG_PLATFORM_LABELS[platform].short}] ${name}`;
}

/**
 * 이미 접두사가 붙어 저장된 옛 제목에서 원본을 꺼낸다.
 * (접두사를 저장하던 시절의 방과 마이그레이션에 쓴다.)
 */
export function stripPubgTitlePrefix(title: string): string {
  const shorts = PUBG_PLATFORMS.map((p) => PUBG_PLATFORM_LABELS[p].short);
  const pattern = new RegExp(`^\\[(?:${shorts.join("|")})\\]\\s*`);
  return title.replace(pattern, "");
}


/** 팀 인원·팀 수를 정하는 데 필요한 방 정보 */
export interface RoomTeamShape {
  /** 없으면 기본 게임으로 본다 — 게임 축이 생기기 전 데이터가 남아 있다. */
  gameTitle?: GameTitle | null;
  pubgGameMode?: PubgGameMode | null;
  maxParticipants?: number | null;
}

/**
 * 이 방의 한 팀 인원.
 *
 * 배그는 보통 인게임 스쿼드 정원(4인)이 곧 팀 인원이지만, **킬내기는 다르다.**
 * 항상 두 팀이 붙는 형식이라 팀 인원이 정원을 반으로 나눈 값이다 —
 * 3대3부터 8대8(깐부킬내기, 한 팀이 인게임 2스쿼드)까지 간다.
 */
export function teamSizeForRoom(room: RoomTeamShape): number {
  if (isKillMatch(room)) {
    return Math.max(1, Math.floor((room.maxParticipants ?? 0) / 2));
  }
  return GAMES[room.gameTitle ?? DEFAULT_GAME].teamSize;
}

/**
 * 정원 기준 팀 수.
 *
 * 방 설정·수동 팀 슬롯·디스코드 음성채널처럼 "이 방은 몇 팀짜리인가"를
 * 묻는 자리에서 쓴다.
 */
export function teamCountForRoom(room: RoomTeamShape): number {
  // 킬내기는 정원과 무관하게 두 팀이다.
  if (isKillMatch(room)) return 2;
  return Math.floor(
    (room.maxParticipants ?? 0) / GAMES[room.gameTitle ?? DEFAULT_GAME].teamSize,
  );
}

/**
 * 실제 참가 인원 기준 팀 수.
 *
 * 경매·스네이크는 정원이 덜 찬 상태에서도 돌릴 수 있어야 해서 지금 있는
 * 사람 수로 나눈다. 정원으로 나누면 빈 팀이 생긴다.
 * 킬내기만은 인원과 무관하게 두 팀이다 — 인원에 따라 3팀·4팀으로 늘어나면
 * 킬내기가 아니게 된다.
 */
export function teamCountForRoster(
  room: RoomTeamShape,
  participantCount: number,
): number {
  if (isKillMatch(room)) return 2;
  return Math.max(
    2,
    Math.floor(
      participantCount / GAMES[room.gameTitle ?? DEFAULT_GAME].teamSize,
    ),
  );
}

function isKillMatch(room: RoomTeamShape): boolean {
  return room.gameTitle === "PUBG" && room.pubgGameMode === "KILL_MATCH";
}

/**
 * 깐부킬내기인가 — 한 팀이 인게임 스쿼드 하나에 안 들어가는 구성.
 *
 * 인게임에서는 한 팀이 두 스쿼드로 갈라져 들어가므로, 결과 수집이 로스터
 * 두 개를 같은 Nexus 팀에 붙여야 한다.
 */
export function isSplitSquadTeam(room: RoomTeamShape): boolean {
  return squadCountForRoom(room) > 1;
}

/**
 * 한 팀이 인게임에서 몇 개 스쿼드로 갈라지는가.
 *
 * 인게임 스쿼드 정원은 4명이다. 깐부킬내기 8대8은 한 팀이 4인 스쿼드 둘로
 * 나뉘어 들어가므로, 음성채널도 팀당 하나가 아니라 스쿼드마다 하나가 필요하다.
 * 롤과 배틀로얄은 팀이 곧 스쿼드라 항상 1이다.
 */
export function squadCountForRoom(room: RoomTeamShape): number {
  if (room.gameTitle !== "PUBG") return 1;
  return Math.max(
    1,
    Math.ceil(teamSizeForRoom(room) / GAMES.PUBG.teamSize),
  );
}

/**
 * 스쿼드 하나에 들어갈 인원.
 *
 * 7대7이면 4명 + 3명으로 갈리므로 채널 정원은 큰 쪽(4)에 맞춘다.
 */
export function squadSizeForRoom(room: RoomTeamShape): number {
  return Math.ceil(teamSizeForRoom(room) / squadCountForRoom(room));
}
