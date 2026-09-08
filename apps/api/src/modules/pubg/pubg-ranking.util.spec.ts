import {
  aggregatePubgRanking,
  placeTeams,
  sortPubgRanking,
  type ScrimForRanking,
} from "./pubg-ranking.util";

describe("배그 랭킹 집계", () => {
  const scrim = (
    scrimId: string,
    teams: {
      teamId: string;
      points: number;
      kills: number;
      members: string[];
    }[],
  ): ScrimForRanking => ({
    scrimId,
    teams: teams.map((team) => ({
      teamId: team.teamId,
      points: team.points,
      kills: team.kills,
      deaths: 0,
    })),
    membersByTeam: new Map(teams.map((team) => [team.teamId, team.members])),
  });

  describe("팀 순위", () => {
    it("총점 순으로 매긴다", () => {
      const placement = placeTeams([
        { teamId: "a", points: 10, kills: 3, deaths: 0 },
        { teamId: "b", points: 20, kills: 1, deaths: 0 },
        { teamId: "c", points: 5, kills: 9, deaths: 0 },
      ]);
      expect(placement.get("b")).toBe(1);
      expect(placement.get("a")).toBe(2);
      expect(placement.get("c")).toBe(3);
    });

    it("총점이 같으면 킬로 가른다", () => {
      const placement = placeTeams([
        { teamId: "a", points: 10, kills: 3, deaths: 0 },
        { teamId: "b", points: 10, kills: 7, deaths: 0 },
      ]);
      expect(placement.get("b")).toBe(1);
      expect(placement.get("a")).toBe(2);
    });

    it("완전 동점이면 같은 등수를 준다", () => {
      // 이름 가나다순으로 갈리면 "왜 우리가 뒤냐"는 말이 나온다.
      const placement = placeTeams([
        { teamId: "a", points: 10, kills: 3, deaths: 0 },
        { teamId: "b", points: 10, kills: 3, deaths: 0 },
        { teamId: "c", points: 4, kills: 1, deaths: 0 },
      ]);
      expect(placement.get("a")).toBe(1);
      expect(placement.get("b")).toBe(1);
      // 공동 1위 뒤는 2등이 아니라 3번째 자리를 그대로 쓴다.
      expect(placement.get("c")).toBe(3);
    });
  });

  describe("사람별 누적", () => {
    it("팀 성적을 팀원 전원에게 준다", () => {
      const rows = aggregatePubgRanking([
        scrim("s1", [
          { teamId: "t1", points: 20, kills: 8, members: ["u1", "u2"] },
          { teamId: "t2", points: 10, kills: 4, members: ["u3"] },
        ]),
      ]);
      const u1 = rows.find((row) => row.userId === "u1")!;
      const u2 = rows.find((row) => row.userId === "u2")!;
      expect(u1.totalPoints).toBe(20);
      expect(u2.totalPoints).toBe(20);
      expect(u1.wins).toBe(1);
      expect(rows.find((row) => row.userId === "u3")!.wins).toBe(0);
    });

    it("여러 스크림을 누적하고 평균 순위를 낸다", () => {
      const rows = aggregatePubgRanking([
        scrim("s1", [
          { teamId: "t1", points: 20, kills: 8, members: ["u1"] },
          { teamId: "t2", points: 10, kills: 2, members: ["u2"] },
        ]),
        scrim("s2", [
          { teamId: "t3", points: 5, kills: 1, members: ["u1"] },
          { teamId: "t4", points: 30, kills: 9, members: ["u2"] },
        ]),
      ]);
      const u1 = rows.find((row) => row.userId === "u1")!;
      expect(u1.scrims).toBe(2);
      expect(u1.totalPoints).toBe(25);
      expect(u1.totalKills).toBe(9);
      // 1등 한 번 + 2등 한 번 = 평균 1.5
      expect(u1.averagePlacement).toBe(1.5);
      expect(u1.averageKills).toBe(4.5);
    });

    it("결과가 없는 스크림은 참가 횟수에 넣지 않는다", () => {
      // 라운드만 열어두고 결과를 안 넣은 방까지 세면 순위가 뒤틀린다.
      const rows = aggregatePubgRanking([
        { scrimId: "s1", teams: [], membersByTeam: new Map() },
      ]);
      expect(rows).toEqual([]);
    });
  });

  describe("정렬", () => {
    it("누적 포인트 → 평균 순위 → 총킬", () => {
      const rows = sortPubgRanking([
        {
          userId: "low",
          scrims: 1,
          averagePlacement: 1,
          wins: 1,
          totalPoints: 10,
          totalKills: 5,
          totalDeaths: 0,
          averageKills: 5,
        },
        {
          userId: "high",
          scrims: 3,
          averagePlacement: 2,
          wins: 1,
          totalPoints: 40,
          totalKills: 3,
          totalDeaths: 0,
          averageKills: 1,
        },
      ]);
      // 많이 참가해 많이 쌓은 쪽이 위로 온다 — 내전 랭킹의 취지다.
      expect(rows[0].userId).toBe("high");
    });
  });
});
