import { GAMES, getPubgGameMode, type GameTitle } from "@nexus/types";

/** 방 정원 선택지 한 칸 */
export interface RoomSizeOption {
  value: number;
  label: string;
  /** 정원 카드에 붙는 설명 (예: "5 vs 5", "4팀 · 4인 스쿼드") */
  description: string;
  teams: number;
  /** 이 정원에서 경기가 어떻게 굴러가는지 */
  format: string;
  /** 더블 엘리미네이션을 고를 수 있는 정원인지 */
  supportsDE: boolean;
}

/**
 * 롤은 정원마다 대진 방식이 달라 표현이 제각각이라 표를 그대로 둔다.
 * (여기 문구를 게임 설정에서 기계적으로 만들면 "5 vs 5"가 "2팀 · 5인"으로 바뀐다.)
 */
const LOL_OPTIONS: RoomSizeOption[] = [
  {
    value: 10,
    label: "10명",
    description: "5 vs 5",
    teams: 2,
    format: "단판",
    supportsDE: false,
  },
  {
    value: 15,
    label: "15명",
    description: "3팀 리그전",
    teams: 3,
    format: "리그전",
    supportsDE: false,
  },
  {
    value: 20,
    label: "20명",
    description: "4팀 토너먼트",
    teams: 4,
    format: "준결승+결승",
    supportsDE: true,
  },
  {
    value: 30,
    label: "30명",
    description: "6팀 리그전",
    teams: 6,
    format: "리그전",
    supportsDE: false,
  },
  {
    value: 40,
    label: "40명",
    description: "8팀 토너먼트",
    teams: 8,
    format: "8강+4강+결승",
    supportsDE: true,
  },
];

/**
 * 배그는 4인 스쿼드가 기본이고, 정원이 커져도 대진 방식이 갈리지 않는다
 * (팀이 몇이든 한 매치에 다 들어가 순위·킬로 점수를 매긴다).
 * 그래서 정원 표를 손으로 적지 않고 게임 설정에서 만든다.
 */
function generatedOptions(game: GameTitle): RoomSizeOption[] {
  const def = GAMES[game];
  return def.roomSizes.map((value) => {
    const teams = Math.floor(value / def.teamSize);
    return {
      value,
      label: `${value}명`,
      description: `${teams}팀 · ${def.teamSize}인 스쿼드`,
      teams,
      format: "순위·킬 리더보드",
      supportsDE: false,
    };
  });
}

/**
 * 킬내기 정원 선택지.
 *
 * 4인 스쿼드 단위로 팀 수를 늘린다.
 */
export function killMatchSizeOptions(): RoomSizeOption[] {
  return getPubgGameMode("KILL_MATCH").roomSizes.map((value) => {
    return {
      value,
      label: `${value}명`,
      description: `${value / 4}팀 · 4인 스쿼드`,
      teams: value / 4,
      format: "시간제 · 킬 · 사망 · 치킨 누적",
      supportsDE: false,
    };
  });
}

/** 게임별 정원 선택지 */
export function roomSizeOptions(game: GameTitle): RoomSizeOption[] {
  return game === "LOL" ? LOL_OPTIONS : generatedOptions(game);
}
