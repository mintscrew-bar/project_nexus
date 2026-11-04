import { pickMvpAce } from "./auto-mvp.util";

const line = (
  userId: string | null,
  win: boolean,
  kills: number,
  assists: number,
  damage: number,
) => ({ userId, win, kills, assists, totalDamageDealtToChampions: damage });

describe("pickMvpAce (기록 기반 MVP·ACE)", () => {
  it("이긴 팀 1위가 MVP, 진 팀 1위가 ACE", () => {
    const result = pickMvpAce([
      line("a", true, 10, 5, 20000), // 30+5+20 = 55
      line("b", true, 2, 15, 9000), // 6+15+9 = 30
      line("c", false, 6, 4, 25000), // 18+4+25 = 47
      line("d", false, 1, 2, 5000),
    ]);
    expect(result).toEqual({ mvpUserId: "a", aceUserId: "c" });
  });

  it("1위가 미연동 참가자면 그 자리는 비운다", () => {
    const result = pickMvpAce([
      line(null, true, 20, 5, 30000),
      line("b", true, 2, 3, 5000),
      line("c", false, 3, 3, 9000),
    ]);
    expect(result).toEqual({ mvpUserId: null, aceUserId: "c" });
  });

  it("참가자가 없으면 둘 다 비운다", () => {
    expect(pickMvpAce([])).toEqual({ mvpUserId: null, aceUserId: null });
  });
});
