import { GAMES, type GameTitle } from "@nexus/types";

function gameQuery(game?: GameTitle | null): string {
  return game ? `?game=${GAMES[game].slug}` : "";
}

/** 게임별 프로필을 만들지 않고 하나의 내 프로필에서 처음 열 탭만 지정한다. */
export function myProfilePath(game?: GameTitle | null): string {
  return `/me${gameQuery(game)}`;
}

/** 공개 프로필도 사용자 URL 하나를 유지하고 게임은 탭 힌트로만 전달한다. */
export function userProfilePath(
  userId: string,
  game?: GameTitle | null,
): string {
  return `/users/${encodeURIComponent(userId)}${gameQuery(game)}`;
}

/** 프로필 표시와 분리된 게임 계정 등록·수정 화면. */
export function gameAccountSettingsPath(game: GameTitle): string {
  return `/settings/game-accounts/${GAMES[game].slug}`;
}
