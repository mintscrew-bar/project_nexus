import { explicitGameFromLocation } from "@nexus/types";

/**
 * 주소에 명시된 게임 (배그 탭 테마, 2026-10-05).
 * 테마는 이 값만 따른다. 마지막으로 본 게임 같은 추정이 섞이면 배그를 마지막으로 본 사람이
 * 중립인 종합 홈에 와도 배그 테마가 된다 — 그래서 명시된 게 없으면 반드시 null 이어야 한다.
 * (웹·공유 패키지에는 테스트 러너가 없어 API 의 jest 로 검증한다.)
 */
describe("explicitGameFromLocation", () => {
  it.each([
    ["/pubg", "PUBG"],
    ["/pubg/tournaments", "PUBG"],
    ["/pubg/tournaments/abc/lobby", "PUBG"],
    ["/lol", "LOL"],
    ["/lol/ranking", "LOL"],
  ])("경로 첫 칸의 게임: %s → %s", (pathname, expected) => {
    expect(explicitGameFromLocation(pathname)).toBe(expected);
  });

  it("경로의 게임이 ?game= 보다 우선한다", () => {
    expect(explicitGameFromLocation("/pubg/profile", "lol")).toBe("PUBG");
    expect(explicitGameFromLocation("/lol/profile", "pubg")).toBe("LOL");
  });

  it.each([
    ["/community", "pubg", "PUBG"],
    ["/clans", "pubg", "PUBG"],
    ["/streamers", "pubg", "PUBG"],
    ["/me", "pubg", "PUBG"],
    ["/users/abc", "pubg", "PUBG"],
    ["/community/post-1", "lol", "LOL"],
  ])(
    "공용 섹션은 ?game= 으로: %s?game=%s → %s",
    (pathname, param, expected) => {
      expect(explicitGameFromLocation(pathname, param)).toBe(expected);
    },
  );

  it("게임 계정 관리 화면은 경로의 게임을 쓴다", () => {
    expect(explicitGameFromLocation("/settings/game-accounts/pubg")).toBe(
      "PUBG",
    );
    expect(explicitGameFromLocation("/settings/game-accounts/lol")).toBe("LOL");
    // 게임이 안 붙은 관리 화면은 모른다
    expect(explicitGameFromLocation("/settings/game-accounts")).toBeNull();
    expect(explicitGameFromLocation("/settings/game-accounts/")).toBeNull();
  });

  it.each([
    ["/", null],
    ["/dashboard", null],
    ["/settings", null],
    ["/partners", null],
    ["/community", null],
    ["/community", undefined],
    ["/community", ""],
  ])("명시된 게임이 없으면 null(추정 금지): %s ?game=%s", (pathname, param) => {
    expect(explicitGameFromLocation(pathname, param)).toBeNull();
  });

  it("모르는 값·비슷한 값은 게임으로 보지 않는다", () => {
    expect(explicitGameFromLocation("/pubgx/rooms")).toBeNull();
    expect(explicitGameFromLocation("/community", "starcraft")).toBeNull();
    // 쿼리는 슬러그(소문자)만 받는다
    expect(explicitGameFromLocation("/me", "PUBG")).toBeNull();
    expect(explicitGameFromLocation("/api/pubg")).toBeNull();
  });
});
