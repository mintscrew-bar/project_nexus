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

/**
 * 게임 계정 등록·수정 자리.
 * 2026-11 게임 계정 관리 화면을 내 프로필로 합쳐, 내 프로필의 그 게임 탭이 곧 관리 화면이다.
 * 옛 주소(/settings/game-accounts/:game)도 여기로 넘긴다.
 */
export function gameAccountSettingsPath(game: GameTitle): string {
  return myProfilePath(game);
}
