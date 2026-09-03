import { DEFAULT_GAME, GAMES, type GameTitle } from "@nexus/types";

/**
 * 게임별 화면 URL 을 만든다.
 *
 * 내전 화면은 `/lol/tournaments/:id/lobby` 처럼 게임 슬러그가 앞에 붙는다.
 * 디스코드 공지처럼 **밖으로 나가는 링크**는 한 번 보내면 고칠 수 없으므로
 * 경로를 문자열로 직접 조립하지 말고 이 헬퍼를 쓴다.
 *
 * gameTitle 을 넘기지 않으면 기본 게임(롤)으로 떨어진다 — `Room.gameTitle` 의
 * 스키마 기본값과 같다. 방 정보를 들고 있다면 반드시 넘길 것.
 */
export function gameSlug(gameTitle?: GameTitle | null): string {
  return GAMES[gameTitle ?? DEFAULT_GAME].slug;
}

/** 앱 절대 URL. `appUrl` 은 보통 ConfigService 의 APP_URL. */
export function gameUrl(
  appUrl: string,
  path: string,
  gameTitle?: GameTitle | null,
): string {
  const base = appUrl.replace(/\/+$/, "");
  const rest = path.replace(/^\/+/, "");
  return `${base}/${gameSlug(gameTitle)}/${rest}`;
}

/** 방 로비 URL */
export function roomLobbyUrl(
  appUrl: string,
  roomId: string,
  gameTitle?: GameTitle | null,
): string {
  return gameUrl(appUrl, `tournaments/${roomId}/lobby`, gameTitle);
}

/** 방 대진표 URL */
export function roomBracketUrl(
  appUrl: string,
  roomId: string,
  gameTitle?: GameTitle | null,
): string {
  return gameUrl(appUrl, `tournaments/${roomId}/bracket`, gameTitle);
}
