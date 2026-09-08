import { DEFAULT_GAME, GAMES } from "@nexus/types";
import { absoluteUrl } from "@/lib/seo";

/**
 * 가이드는 지금 롤 문안만 있고 `[game]/guide/layout.tsx` 가 다른 게임을
 * 준비 중 안내로 막는다. 그래서 가이드의 정규 URL·내부 링크는 롤 경로다.
 *
 * 배그 가이드를 쓰게 되면 이 상수 대신 현재 게임 프리픽스로 바꾼다.
 */
export const GUIDE_BASE = `/${GAMES[DEFAULT_GAME].slug}`;

/** 가이드 화면의 정규 URL. 옛 경로(`/guide`)는 308 로 튕기므로 canonical 에 쓰면 안 된다. */
export function guideUrl(path: string): string {
  return absoluteUrl(`${GUIDE_BASE}${path}`);
}
