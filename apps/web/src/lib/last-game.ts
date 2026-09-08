import { DEFAULT_GAME, gameFromSlug, type GameTitle } from "@nexus/types";

/**
 * 마지막으로 본 게임.
 *
 * 게임을 한 번 고른 사람에게 매번 다시 고르라고 하지 않기 위한 값이다.
 * 브라우저에만 남기고 서버로 보내지 않는다 — 계정 설정으로 만들면 기기마다
 * 다른 게임을 보는 사람이 오히려 불편해진다.
 */
const KEY = "nexus:last-game";

/** 저장. 값이 이상하면 아무것도 하지 않는다. */
export function rememberGame(game: GameTitle): void {
  try {
    window.localStorage.setItem(KEY, game);
  } catch {
    // 사파리 시크릿 모드 등에서 저장이 막힌다. 기억 못 하는 건 치명적이지 않다.
  }
}

/**
 * 읽기. 저장된 적이 없거나 모르는 값이면 null.
 *
 * 기본 게임으로 떨어뜨리지 않고 null 을 돌려주는 이유는, 호출하는 쪽이
 * "고른 적 없음"과 "롤을 골랐음"을 구분해야 하기 때문이다.
 */
export function readLastGame(): GameTitle | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    // 슬러그가 아니라 GameTitle 을 저장하지만, 옛 값이 섞여도 걸러낸다.
    return raw === "LOL" || raw === "PUBG"
      ? (raw as GameTitle)
      : gameFromSlug(raw.toLowerCase());
  } catch {
    return null;
  }
}

/** 기억이 없으면 기본 게임 */
export function lastGameOrDefault(): GameTitle {
  return readLastGame() ?? DEFAULT_GAME;
}
