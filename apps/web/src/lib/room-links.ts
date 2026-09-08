import { GAMES, DEFAULT_GAME, type GameTitle } from "@nexus/types";

/**
 * 방으로 가는 링크는 **그 방의 게임**을 따라간다.
 *
 * 보고 있는 화면의 게임을 쓰면 안 된다 — 대시보드나 스트리머 목록처럼
 * 게임 무관한 화면에서 배그 방을 눌렀을 때 `/lol/tournaments/...` 로 가버린다.
 * 옛 방 데이터에는 게임이 없을 수 있어 기본 게임으로 떨어뜨린다.
 */
export function roomPath(
  room: { id: string; gameTitle?: GameTitle | null },
  suffix = "/lobby",
): string {
  const game = room.gameTitle ?? DEFAULT_GAME;
  return `/${GAMES[game].slug}/tournaments/${room.id}${suffix}`;
}
