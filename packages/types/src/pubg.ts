/**
 * 배틀그라운드 전용 설정.
 *
 * 롤과 달리 "경기 모드"와 "팀 구성 방식"이 별개다.
 * 모드는 경기 규칙(2팀 킬내기 / 다팀 배틀로얄)이고,
 * 팀 구성은 참가자를 팀에 넣는 방법(경매·스네이크·수동)이다.
 */

import type { GameTeamMode } from "./games";

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

export const PUBG_GAME_MODES: readonly PubgGameMode[] = [
  "BATTLE_ROYALE",
  "KILL_MATCH",
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
    roomSizes: [16, 32, 48, 64],
    resultShape: "POINT_LEADERBOARD",
    teamModes: ["AUCTION", "SNAKE_DRAFT", "AUTO_BALANCE", "MANUAL_TEAM"],
  },
  KILL_MATCH: {
    mode: "KILL_MATCH",
    label: "킬내기",
    description: "두 팀이 붙어 킬 수 또는 승패로 가립니다. 4대4 기준입니다.",
    roomSizes: [8],
    resultShape: "BRACKET",
    teamModes: ["AUCTION", "SNAKE_DRAFT", "AUTO_BALANCE", "MANUAL_TEAM"],
  },
  FREE_MATCH: {
    mode: "FREE_MATCH",
    label: "자유 매치",
    description:
      "팀만 나누고 진행은 방에서 알아서 합니다. 전적에 남기지 않습니다.",
    roomSizes: [8, 16, 32, 48, 64],
    resultShape: "NONE",
    teamModes: ["MANUAL_TEAM"],
  },
};

export const DEFAULT_PUBG_GAME_MODE: PubgGameMode = "BATTLE_ROYALE";

export function getPubgGameMode(mode: PubgGameMode): PubgGameModeDefinition {
  return MODE_DEFINITIONS[mode];
}

export function pubgGameModes(): PubgGameModeDefinition[] {
  return PUBG_GAME_MODES.map((mode) => MODE_DEFINITIONS[mode]);
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
