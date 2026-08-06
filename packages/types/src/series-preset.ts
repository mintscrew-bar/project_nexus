// 내전 다전제 프리셋 (웹·API 공유 단일 소스)
//
// 대진 슬롯 하나가 곧 시리즈이고, 시리즈는 bestOf만큼의 세트(Match)로 이뤄진다.
// bestOf는 대진 생성 시점에 각 시리즈 row에 확정해서 써넣는다 — SE는 라운드 번호,
// DE는 섹션 문자열, 리그전은 전부 round 1이라 런타임에 되짚으면 키 체계가 셋 다 달라진다.
//
// 프리셋 목록은 룸 사이즈(=팀 수)마다 다르다. 10명 방에는 "결승만 3판 2선"이
// 성립하지 않고, 40명 방에 "전 경기 3판 2선"을 열어주면 최대 21게임이 나온다.

export type SeriesPreset =
  | "ALL_BO1"
  | "ALL_BO3"
  | "ALL_BO5"
  | "FINAL_BO3"
  | "FINAL_BO5"
  | "SEMI_BO3_FINAL_BO5"
  | "SEMI_UP_BO3";

/** 기본값 — 기존 단판과 완전히 동일하게 동작한다. */
export const DEFAULT_SERIES_PRESET: SeriesPreset = "ALL_BO1";

export interface SeriesPresetInfo {
  key: SeriesPreset;
  label: string;
  description: string;
  /** 예상 게임 수 (최소~최대) */
  minGames: number;
  maxGames: number;
  /** 호스트에게 권장 표시할 프리셋 */
  recommended?: boolean;
}

/**
 * 싱글 엘리미네이션 라운드별 경기 수.
 * 2팀 → [1], 4팀 → [2,1], 8팀 → [4,2,1].
 * 엘리미네이션이 아닌 팀 수(리그전 3·5·6·7팀)는 null.
 */
export function getEliminationRoundSizes(teamCount: number): number[] | null {
  if (teamCount < 2) return null;
  // 2의 거듭제곱만 엘리미네이션 트리가 된다.
  if ((teamCount & (teamCount - 1)) !== 0) return null;

  const sizes: number[] = [];
  for (let remaining = teamCount; remaining >= 2; remaining /= 2) {
    sizes.push(remaining / 2);
  }
  return sizes;
}

/**
 * 프리셋을 라운드별 bestOf로 해석한다.
 * @param round       1-base 라운드 번호
 * @param totalRounds 마지막 라운드(=결승) 번호
 */
export function resolveSeriesBestOf(
  preset: SeriesPreset,
  round: number,
  totalRounds: number,
): number {
  switch (preset) {
    case "ALL_BO3":
      return 3;
    case "ALL_BO5":
      return 5;
    case "FINAL_BO3":
      return round === totalRounds ? 3 : 1;
    case "FINAL_BO5":
      return round === totalRounds ? 5 : 1;
    case "SEMI_BO3_FINAL_BO5":
      if (round === totalRounds) return 5;
      if (round === totalRounds - 1) return 3;
      return 1;
    case "SEMI_UP_BO3":
      // 4강(결승 직전)부터 3판 2선. 8강 이하는 단판.
      return round >= totalRounds - 1 ? 3 : 1;
    case "ALL_BO1":
    default:
      return 1;
  }
}

/** 시리즈를 이기는 데 필요한 승수. 3판 2선 → 2 */
export function winsNeededFor(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

/** 프리셋 적용 시 예상 게임 수 (최소~최대) */
export function estimateSeriesGames(
  preset: SeriesPreset,
  teamCount: number,
): { min: number; max: number } {
  const roundSizes = getEliminationRoundSizes(teamCount);
  if (!roundSizes) {
    // 리그전은 단판 고정 — 모든 팀이 서로 한 번씩.
    const games = (teamCount * (teamCount - 1)) / 2;
    return { min: games, max: games };
  }

  const totalRounds = roundSizes.length;
  let min = 0;
  let max = 0;
  roundSizes.forEach((matchCount, index) => {
    const bestOf = resolveSeriesBestOf(preset, index + 1, totalRounds);
    min += matchCount * winsNeededFor(bestOf);
    max += matchCount * bestOf;
  });
  return { min, max };
}

// 팀 수별로 고를 수 있는 프리셋. 여기 없는 프리셋은 서버에서 거부된다.
//
// 40명(8팀)에서 "전 경기 3판 2선"(14~21게임)과 "4강 3판 2선 + 결승 5판 3선"(11~17게임)은
// 일부러 뺐다. 게임당 30분이면 7~10.5시간이라 완주가 사실상 불가능하고,
// 선택지에 있는 것만으로 사고가 난다.
const PRESETS_BY_TEAM_COUNT: Record<number, SeriesPreset[]> = {
  2: ["ALL_BO1", "ALL_BO3", "ALL_BO5"],
  4: ["ALL_BO1", "FINAL_BO3", "FINAL_BO5", "SEMI_BO3_FINAL_BO5", "ALL_BO3"],
  8: ["ALL_BO1", "FINAL_BO3", "FINAL_BO5", "SEMI_UP_BO3"],
};

// 팀 수에 따라 같은 프리셋도 이름이 달라진다. 2팀 방에는 "결승"이라는 개념이 없어
// "전 경기 3판 2선"이 아니라 그냥 "3판 2선"이다.
const PRESET_TEXT: Record<
  SeriesPreset,
  { label: string; description: string }
> = {
  ALL_BO1: { label: "전 경기 단판", description: "모든 경기를 한 판으로" },
  ALL_BO3: {
    label: "전 경기 3판 2선",
    description: "모든 경기를 2선승제로",
  },
  ALL_BO5: { label: "5판 3선", description: "3선승제" },
  FINAL_BO3: {
    label: "결승만 3판 2선",
    description: "결승 전까지는 단판, 결승만 2선승제",
  },
  FINAL_BO5: {
    label: "결승만 5판 3선",
    description: "결승 전까지는 단판, 결승만 3선승제",
  },
  SEMI_BO3_FINAL_BO5: {
    label: "준결승 3판 2선 + 결승 5판 3선",
    description: "준결승부터 다전제, 결승은 3선승제",
  },
  SEMI_UP_BO3: {
    label: "4강부터 3판 2선",
    description: "8강은 단판, 4강과 결승은 2선승제",
  },
};

// 2팀 방 전용 문구 — 슬롯이 하나뿐이라 "전 경기"라는 말이 어색하다.
const TWO_TEAM_TEXT: Partial<
  Record<SeriesPreset, { label: string; description: string }>
> = {
  ALL_BO1: { label: "단판", description: "한 판으로 끝" },
  ALL_BO3: { label: "3판 2선", description: "2선승제" },
};

// 팀 수별 권장 프리셋. 시간이 과하지 않으면서 결승에 무게를 주는 쪽.
const RECOMMENDED_BY_TEAM_COUNT: Record<number, SeriesPreset> = {
  2: "ALL_BO3",
  4: "FINAL_BO3",
  8: "FINAL_BO3",
};

/** 해당 팀 수에서 고를 수 있는 프리셋 목록 (UI 표시 순서대로) */
export function getSeriesPresetsForTeamCount(
  teamCount: number,
): SeriesPresetInfo[] {
  const keys = PRESETS_BY_TEAM_COUNT[teamCount];
  // 리그전 등 다전제 미지원 팀 수는 단판만.
  if (!keys) {
    const games = estimateSeriesGames("ALL_BO1", teamCount);
    return [
      {
        key: "ALL_BO1",
        ...PRESET_TEXT.ALL_BO1,
        minGames: games.min,
        maxGames: games.max,
      },
    ];
  }

  const recommended = RECOMMENDED_BY_TEAM_COUNT[teamCount];
  return keys.map((key) => {
    const text =
      (teamCount === 2 ? TWO_TEAM_TEXT[key] : undefined) ?? PRESET_TEXT[key];
    const games = estimateSeriesGames(key, teamCount);
    return {
      key,
      ...text,
      minGames: games.min,
      maxGames: games.max,
      recommended: key === recommended,
    };
  });
}

/** 해당 팀 수에서 이 프리셋을 쓸 수 있는지 */
export function isSeriesPresetAllowed(
  preset: string,
  teamCount: number,
): preset is SeriesPreset {
  if (preset === "ALL_BO1") return true;
  return (PRESETS_BY_TEAM_COUNT[teamCount] ?? []).includes(
    preset as SeriesPreset,
  );
}

/**
 * 저장된 프리셋 값을 안전하게 읽는다.
 * 팀 수에 맞지 않거나 알 수 없는 값이면 단판으로 떨어뜨린다.
 */
export function normalizeSeriesPreset(
  preset: string | null | undefined,
  teamCount: number,
): SeriesPreset {
  if (!preset) return DEFAULT_SERIES_PRESET;
  return isSeriesPresetAllowed(preset, teamCount)
    ? preset
    : DEFAULT_SERIES_PRESET;
}

/** 룸 최대 인원 → 팀 수 (5인 1팀) */
export function teamCountForRoomSize(maxParticipants: number): number {
  return Math.floor(maxParticipants / 5);
}
