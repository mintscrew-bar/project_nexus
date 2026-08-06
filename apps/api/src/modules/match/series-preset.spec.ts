import {
  estimateSeriesGames,
  getEliminationRoundSizes,
  getSeriesPresetsForTeamCount,
  isSeriesPresetAllowed,
  normalizeSeriesPreset,
  resolveSeriesBestOf,
  teamCountForRoomSize,
  winsNeededFor,
} from "@nexus/types";

describe("다전제 프리셋", () => {
  describe("getEliminationRoundSizes", () => {
    it("2의 거듭제곱 팀 수는 라운드별 경기 수를 반환한다", () => {
      expect(getEliminationRoundSizes(2)).toEqual([1]);
      expect(getEliminationRoundSizes(4)).toEqual([2, 1]);
      expect(getEliminationRoundSizes(8)).toEqual([4, 2, 1]);
    });

    it("리그전 팀 수는 null (엘리미네이션 트리가 아님)", () => {
      for (const teamCount of [3, 5, 6, 7]) {
        expect(getEliminationRoundSizes(teamCount)).toBeNull();
      }
    });
  });

  describe("resolveSeriesBestOf", () => {
    it("ALL_BO1은 모든 라운드가 단판", () => {
      expect(resolveSeriesBestOf("ALL_BO1", 1, 3)).toBe(1);
      expect(resolveSeriesBestOf("ALL_BO1", 3, 3)).toBe(1);
    });

    it("FINAL_BO3는 결승만 3판", () => {
      expect(resolveSeriesBestOf("FINAL_BO3", 1, 3)).toBe(1);
      expect(resolveSeriesBestOf("FINAL_BO3", 2, 3)).toBe(1);
      expect(resolveSeriesBestOf("FINAL_BO3", 3, 3)).toBe(3);
    });

    it("SEMI_BO3_FINAL_BO5는 준결승 3판 · 결승 5판 (4팀)", () => {
      expect(resolveSeriesBestOf("SEMI_BO3_FINAL_BO5", 1, 2)).toBe(3);
      expect(resolveSeriesBestOf("SEMI_BO3_FINAL_BO5", 2, 2)).toBe(5);
    });

    it("SEMI_UP_BO3는 8강 단판 · 4강부터 3판 (8팀)", () => {
      expect(resolveSeriesBestOf("SEMI_UP_BO3", 1, 3)).toBe(1);
      expect(resolveSeriesBestOf("SEMI_UP_BO3", 2, 3)).toBe(3);
      expect(resolveSeriesBestOf("SEMI_UP_BO3", 3, 3)).toBe(3);
    });
  });

  describe("winsNeededFor", () => {
    it("선취해야 하는 승수", () => {
      expect(winsNeededFor(1)).toBe(1);
      expect(winsNeededFor(3)).toBe(2);
      expect(winsNeededFor(5)).toBe(3);
    });
  });

  describe("estimateSeriesGames", () => {
    // 문서(docs/features/TODO_series_match.md)의 룸 사이즈별 표와 일치해야 한다.
    it("2팀 (10명)", () => {
      expect(estimateSeriesGames("ALL_BO1", 2)).toEqual({ min: 1, max: 1 });
      expect(estimateSeriesGames("ALL_BO3", 2)).toEqual({ min: 2, max: 3 });
      expect(estimateSeriesGames("ALL_BO5", 2)).toEqual({ min: 3, max: 5 });
    });

    it("4팀 (20명)", () => {
      expect(estimateSeriesGames("ALL_BO1", 4)).toEqual({ min: 3, max: 3 });
      expect(estimateSeriesGames("FINAL_BO3", 4)).toEqual({ min: 4, max: 5 });
      expect(estimateSeriesGames("FINAL_BO5", 4)).toEqual({ min: 5, max: 7 });
      expect(estimateSeriesGames("SEMI_BO3_FINAL_BO5", 4)).toEqual({
        min: 7,
        max: 11,
      });
      expect(estimateSeriesGames("ALL_BO3", 4)).toEqual({ min: 6, max: 9 });
    });

    it("8팀 (40명)", () => {
      expect(estimateSeriesGames("ALL_BO1", 8)).toEqual({ min: 7, max: 7 });
      expect(estimateSeriesGames("FINAL_BO3", 8)).toEqual({ min: 8, max: 9 });
      expect(estimateSeriesGames("FINAL_BO5", 8)).toEqual({ min: 9, max: 11 });
      expect(estimateSeriesGames("SEMI_UP_BO3", 8)).toEqual({
        min: 10,
        max: 13,
      });
    });

    it("리그전은 단판 고정 경기 수", () => {
      expect(estimateSeriesGames("ALL_BO1", 3)).toEqual({ min: 3, max: 3 });
      expect(estimateSeriesGames("ALL_BO1", 6)).toEqual({ min: 15, max: 15 });
    });
  });

  describe("getSeriesPresetsForTeamCount", () => {
    it("2팀은 '전 경기' 표현 없이 시리즈 길이만 고른다", () => {
      const presets = getSeriesPresetsForTeamCount(2);
      expect(presets.map((p) => p.key)).toEqual([
        "ALL_BO1",
        "ALL_BO3",
        "ALL_BO5",
      ]);
      expect(presets[0].label).toBe("단판");
      expect(presets[1].label).toBe("3판 2선");
    });

    it("8팀에는 완주 불가능한 프리셋을 내주지 않는다", () => {
      const keys = getSeriesPresetsForTeamCount(8).map((p) => p.key);
      expect(keys).not.toContain("ALL_BO3");
      expect(keys).not.toContain("SEMI_BO3_FINAL_BO5");
    });

    it("리그전 팀 수는 단판만", () => {
      expect(getSeriesPresetsForTeamCount(6).map((p) => p.key)).toEqual([
        "ALL_BO1",
      ]);
    });

    it("팀 수마다 권장 프리셋이 하나씩 있다", () => {
      for (const teamCount of [2, 4, 8]) {
        const recommended = getSeriesPresetsForTeamCount(teamCount).filter(
          (p) => p.recommended,
        );
        expect(recommended).toHaveLength(1);
      }
    });
  });

  describe("isSeriesPresetAllowed / normalizeSeriesPreset", () => {
    it("팀 수에 맞지 않는 프리셋은 거부한다", () => {
      expect(isSeriesPresetAllowed("SEMI_BO3_FINAL_BO5", 2)).toBe(false);
      expect(isSeriesPresetAllowed("SEMI_UP_BO3", 4)).toBe(false);
      expect(isSeriesPresetAllowed("ALL_BO5", 4)).toBe(false);
    });

    it("단판은 어떤 팀 수에서도 허용된다", () => {
      for (const teamCount of [2, 3, 4, 6, 8]) {
        expect(isSeriesPresetAllowed("ALL_BO1", teamCount)).toBe(true);
      }
    });

    it("알 수 없거나 맞지 않는 값은 단판으로 떨어뜨린다", () => {
      expect(normalizeSeriesPreset(null, 4)).toBe("ALL_BO1");
      expect(normalizeSeriesPreset("NOPE", 4)).toBe("ALL_BO1");
      // 4팀 방에서 8팀 전용 프리셋을 들고 있으면 무시한다.
      expect(normalizeSeriesPreset("SEMI_UP_BO3", 4)).toBe("ALL_BO1");
      expect(normalizeSeriesPreset("FINAL_BO3", 4)).toBe("FINAL_BO3");
    });
  });

  describe("teamCountForRoomSize", () => {
    it("5인 1팀", () => {
      expect(teamCountForRoomSize(10)).toBe(2);
      expect(teamCountForRoomSize(15)).toBe(3);
      expect(teamCountForRoomSize(20)).toBe(4);
      expect(teamCountForRoomSize(30)).toBe(6);
      expect(teamCountForRoomSize(40)).toBe(8);
    });
  });
});
