import { DEFAULT_GAME, GAMES, gameFromSlug, type GameTitle } from "@nexus/types";
import { absoluteUrl } from "@/lib/seo";

/**
 * 가이드 경로.
 *
 * 롤·배그가 각자 문안을 갖게 되면서 정규 URL도 게임마다 갈린다.
 * 같은 글이 두 URL 로 색인되면 안 되므로 canonical 은 항상 그 게임 경로다.
 */

/** 게임을 특정할 수 없는 자리(푸터 등)에서 쓰는 기본 프리픽스 */
export const GUIDE_BASE = `/${GAMES[DEFAULT_GAME].slug}`;

/** URL 슬러그(`lol`·`pubg`)를 게임으로. 모르는 값이면 기본 게임. */
export function guideGame(slug: string | undefined | null): GameTitle {
  return gameFromSlug(slug) ?? DEFAULT_GAME;
}

/** 그 게임의 가이드 경로 프리픽스 */
export function guideBase(game: GameTitle): string {
  return `/${GAMES[game].slug}`;
}

/**
 * 가이드 화면의 정규 URL.
 * 옛 경로(`/guide`)는 308 로 튕기므로 canonical 에 쓰면 안 된다.
 */
export function guideUrl(path: string, game: GameTitle = DEFAULT_GAME): string {
  return absoluteUrl(`${guideBase(game)}${path}`);
}
