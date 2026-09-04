import { DEFAULT_GAME, GAMES, type GameTitle } from "./games";

/**
 * 로비에서 다음 단계로 넘어갈 때의 경로.
 *
 * 게임별로 갈리는 판단이 모여 있어 따로 뺐다 — 화면 파일 안에 두면
 * 배그 분기를 넣을 때마다 1,400줄짜리 파일을 열어야 하고 테스트도 못 붙인다.
 *
 * 경로는 전부 게임 프리픽스(`/lol` · `/pubg`) 아래에 있다. 프리픽스를 빼먹으면
 * 리다이렉트를 한 번 더 타고, 배그 방에서는 롤 화면으로 샌다.
 */
export type StageRoom = {
  id: string;
  gameTitle?: GameTitle;
  pubgGameMode?: "KILL_MATCH" | "BATTLE_ROYALE" | "FREE_MATCH" | null;
  teamMode: "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
};

/**
 * 팀 편성이 끝난 뒤 어디로 가는가.
 *
 * 롤은 역할 선택 → 대진표. 배그는 역할 선택 단계가 없고,
 * 배틀로얄은 대진표가 아니라 라운드 누적 리더보드(스크림)로 간다.
 */
export function afterTeamsPath(room: StageRoom, gamePrefix: string): string {
  if (GAMES[room.gameTitle ?? DEFAULT_GAME].hasPositions) {
    return `${gamePrefix}/role-selection/${room.id}`;
  }
  if (room.pubgGameMode === "BATTLE_ROYALE") {
    return `${gamePrefix}/tournaments/${room.id}/scrim`;
  }
  return `${gamePrefix}/tournaments/${room.id}/bracket`;
}

/** 팀 편성 방식에 따른 다음 화면 */
export function getTeamModeStagePath(
  room: StageRoom,
  gamePrefix: string,
): string {
  if (room.teamMode === "AUCTION") return `${gamePrefix}/auction/${room.id}`;
  if (room.teamMode === "SNAKE_DRAFT") return `${gamePrefix}/draft/${room.id}`;
  // 자동 밸런스·수동 배정은 픽 단계가 없어 곧바로 편성 이후로 간다.
  return afterTeamsPath(room, gamePrefix);
}

/** 경기가 이미 시작된 방으로 돌아왔을 때 보여줄 화면 */
export function getRoomStagePath(
  room: StageRoom & { status?: string },
  gamePrefix: string,
): string | null {
  if (room.status === "IN_PROGRESS") {
    return room.pubgGameMode === "BATTLE_ROYALE"
      ? `${gamePrefix}/tournaments/${room.id}/scrim`
      : `${gamePrefix}/tournaments/${room.id}/bracket`;
  }

  // 자동 밸런스는 편성 결과를 로비에서 확인하는 동안 그대로 머무른다.
  // 서버는 방장이 확정하고 대진표를 만든 뒤에야 game-starting 을 보낸다.
  if (room.teamMode === "AUTO_BALANCE") {
    return null;
  }

  if (room.status === "ROLE_SELECTION" || room.status === "DRAFT_COMPLETED") {
    // 자동 밸런스는 편성 직후 대진표로 넘기지 않는다. 팀 점수 차나 비선호 라인이
    // 나올 수 있어서 방장이 로비에서 결과를 확인하고 다시 돌리거나 확정한다.
    return afterTeamsPath(room, gamePrefix);
  }

  if (
    room.status === "DRAFT" ||
    room.status === "TEAM_SELECTION" ||
    !room.status
  ) {
    return getTeamModeStagePath(room, gamePrefix);
  }

  return null;
}
