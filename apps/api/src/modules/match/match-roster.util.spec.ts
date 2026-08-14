import {
  resolveMatchMembers,
  resolveWinnerSlot,
  isMatchParticipant,
} from "./match-roster.util";

describe("match-roster.util", () => {
  const liveMatch = {
    teamAId: "team-a",
    teamBId: "team-b",
    winnerId: "team-a",
    teamA: { members: [{ userId: "u1" }, { userId: "u2" }] },
    teamB: { members: [{ userId: "u3" }] },
    rosterSnapshots: [],
  };

  // 방이 정리된 뒤의 실제 운영 모습: 팀 관계와 winnerId가 전부 NULL이고
  // 스냅샷 컬럼만 남는다.
  const archivedMatch = {
    teamAId: null,
    teamBId: null,
    winnerId: null,
    teamAIdSnapshot: "team-a",
    teamBIdSnapshot: "team-b",
    winnerIdSnapshot: "team-b",
    teamA: null,
    teamB: null,
    rosterSnapshots: [
      { userId: "u1", teamSlot: "A" },
      { userId: "u2", teamSlot: "A" },
      { userId: "u3", teamSlot: "B" },
    ],
  };

  describe("resolveMatchMembers", () => {
    it("라이브 팀 관계에서 참가자를 뽑는다", () => {
      expect(resolveMatchMembers(liveMatch)).toEqual([
        { userId: "u1", slot: "A" },
        { userId: "u2", slot: "A" },
        { userId: "u3", slot: "B" },
      ]);
    });

    it("팀이 삭제됐으면 로스터 스냅샷으로 복원한다", () => {
      expect(resolveMatchMembers(archivedMatch)).toEqual([
        { userId: "u1", slot: "A" },
        { userId: "u2", slot: "A" },
        { userId: "u3", slot: "B" },
      ]);
    });

    it("userId가 없는 스냅샷(탈퇴 유저)은 건너뛴다", () => {
      const members = resolveMatchMembers({
        ...archivedMatch,
        rosterSnapshots: [
          { userId: null, teamSlot: "A" },
          { userId: "u3", teamSlot: "B" },
        ],
      });
      expect(members).toEqual([{ userId: "u3", slot: "B" }]);
    });

    it("라이브와 스냅샷에 같은 유저가 있으면 중복되지 않는다", () => {
      const members = resolveMatchMembers({
        ...liveMatch,
        rosterSnapshots: [{ userId: "u1", teamSlot: "A" }],
      });
      expect(members.filter((m) => m.userId === "u1")).toHaveLength(1);
    });
  });

  describe("resolveWinnerSlot", () => {
    it("라이브 winnerId로 판별한다", () => {
      expect(resolveWinnerSlot(liveMatch)).toBe("A");
    });

    it("winnerId가 NULL이면 스냅샷으로 판별한다", () => {
      expect(resolveWinnerSlot(archivedMatch)).toBe("B");
    });

    it("결과가 없으면 null", () => {
      expect(
        resolveWinnerSlot({ ...archivedMatch, winnerIdSnapshot: null }),
      ).toBeNull();
    });
  });

  describe("isMatchParticipant", () => {
    it("방이 정리된 매치에서도 참가자를 인정한다", () => {
      // 이 폴백이 없어서 완료된 내전의 투표·평가가 전원 차단됐다.
      expect(isMatchParticipant(archivedMatch, "u2")).toBe(true);
      expect(isMatchParticipant(archivedMatch, "outsider")).toBe(false);
    });
  });
});
