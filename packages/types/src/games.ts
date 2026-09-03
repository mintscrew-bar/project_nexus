/**
 * 게임별로 달라지는 값을 한 곳에 모은다.
 *
 * 롤 전용으로 만들어진 코드에 배그를 얹으면서, "5인 1팀"·"라인 5개" 같은 가정이
 * 여기저기 흩어져 있으면 게임을 하나 더 붙일 때마다 같은 곳을 다시 찾아야 한다.
 * 게임에 따라 갈리는 판단은 전부 이 표를 거치게 한다.
 */

/** 사이트가 지원하는 게임. Prisma의 `GameTitle` enum과 값이 일치해야 한다. */
export type GameTitle = "LOL" | "PUBG";

export const GAME_TITLES: readonly GameTitle[] = ["LOL", "PUBG"] as const;

/** 팀 편성 방식. Prisma의 `TeamMode` enum과 값이 일치해야 한다. */
export type GameTeamMode =
  | "AUCTION"
  | "SNAKE_DRAFT"
  | "AUTO_BALANCE"
  | "MANUAL_TEAM";

/** 경기가 끝난 뒤 승부를 가리는 방식 */
export type GameResultShape =
  /** 팀 대 팀 승패 → 대진표 */
  | "BRACKET"
  /** 여러 팀이 한 매치에 들어가 순위·킬로 포인트 → 리더보드 */
  | "POINT_LEADERBOARD";

export interface GameDefinition {
  title: GameTitle;
  /** URL 프리픽스. `/lol/tournaments` 처럼 쓰인다. */
  slug: string;
  label: string;
  /** 한 팀의 인원 */
  teamSize: number;
  /** 방 정원으로 고를 수 있는 값 */
  roomSizes: readonly number[];
  /** 포지션(라인) 개념이 있는지. 없으면 역할 선택 단계를 건너뛴다. */
  hasPositions: boolean;
  /** 이 게임에서 고를 수 있는 팀 편성 방식 */
  teamModes: readonly GameTeamMode[];
  resultShape: GameResultShape;
  /** 사이트에 노출할지. 준비 중인 게임은 false로 두고 UI에서 "준비 중"으로 표시한다. */
  enabled: boolean;
}

const LOL: GameDefinition = {
  title: "LOL",
  slug: "lol",
  label: "리그 오브 레전드",
  teamSize: 5,
  roomSizes: [10, 15, 20, 30, 40],
  hasPositions: true,
  teamModes: ["AUCTION", "SNAKE_DRAFT", "AUTO_BALANCE", "MANUAL_TEAM"],
  resultShape: "BRACKET",
  enabled: true,
};

const PUBG: GameDefinition = {
  title: "PUBG",
  slug: "pubg",
  label: "배틀그라운드",
  teamSize: 4,
  // 스쿼드 4인 기준. 실제 커스텀 매치 정원은 Phase 0 실측 뒤 조정한다.
  roomSizes: [16, 32, 48, 64],
  hasPositions: false,
  // 자동 밸런스는 라인별 점수에 기대는 방식이라 포지션이 없는 게임에서는 쓸 수 없다.
  // 배그용 밸런스 지표를 세운 뒤에 다시 넣는다.
  teamModes: ["AUCTION", "SNAKE_DRAFT", "MANUAL_TEAM"],
  resultShape: "POINT_LEADERBOARD",
  // 계정 식별자 등록과 방 생성 틀을 사용할 수 있다. 외부 전적 검증은 별도 상태다.
  enabled: true,
};

export const GAMES: Record<GameTitle, GameDefinition> = { LOL, PUBG };

/** 기본 게임. 게임을 특정할 수 없는 경로에서 이 값으로 떨어진다. */
export const DEFAULT_GAME: GameTitle = "LOL";

export function getGame(title: GameTitle): GameDefinition {
  return GAMES[title];
}

/** URL 프리픽스(`lol`, `pubg`)로 게임을 찾는다. 모르는 값이면 null. */
export function gameFromSlug(slug: string | undefined | null): GameTitle | null {
  if (!slug) return null;
  const found = GAME_TITLES.find((title) => GAMES[title].slug === slug);
  return found ?? null;
}

/** 실제로 방을 만들 수 있는 게임만 */
export function enabledGames(): GameDefinition[] {
  return GAME_TITLES.map((title) => GAMES[title]).filter((game) => game.enabled);
}

/** 방 정원 → 팀 수 */
export function teamCountForRoomSize(
  maxParticipants: number,
  game: GameTitle = DEFAULT_GAME,
): number {
  return Math.floor(maxParticipants / GAMES[game].teamSize);
}

/** 이 게임에서 고를 수 있는 정원인지 */
export function isValidRoomSize(
  maxParticipants: number,
  game: GameTitle = DEFAULT_GAME,
): boolean {
  return GAMES[game].roomSizes.includes(maxParticipants);
}
