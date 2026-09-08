import { DEFAULT_GAME, GAMES, type GameTitle } from "@nexus/types";

/**
 * 게임별 경로 조립. 훅이 아니라 순수 함수라 서버 컴포넌트에서도 쓸 수 있다.
 * `gamePath("LOL", "/tournaments")` → `/lol/tournaments`
 */
export function gamePath(game: GameTitle, path: string): string {
  return `/${GAMES[game].slug}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * 기본 게임의 URL 프리픽스.
 *
 * 게임과 무관한 화면(랜딩·소개·푸터·404)에서 "내전"이나 "가이드"로 보낼 때 쓴다.
 * 그 화면들에는 따라갈 게임 컨텍스트가 없다.
 */
export const DEFAULT_GAME_PREFIX = `/${GAMES[DEFAULT_GAME].slug}`;
