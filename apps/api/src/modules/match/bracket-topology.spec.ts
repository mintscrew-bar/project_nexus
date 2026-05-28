import { getDoubleElimFeeders } from "@nexus/types";

// 4팀/8팀 더블 엘리미네이션 섹션별 매치 수.
// match-bracket.service.ts 의 generateDoubleElimination4/8 과 일치한다.
const COUNTS_4: Record<string, number> = {
  WB_R1: 2,
  WB_F: 1,
  LB_R1: 1,
  LB_F: 1,
  GF: 1,
};

const COUNTS_8: Record<string, number> = {
  WB_R1: 4,
  WB_R2: 2,
  WB_F: 1,
  LB_R1: 2,
  LB_R2: 2,
  LB_SEMI: 1,
  LB_F: 1,
  GF: 1,
};

describe("getDoubleElimFeeders (브래킷 토폴로지)", () => {
  describe("4팀", () => {
    it("WB_R1 승자는 WB_F로, 패자는 LB_R1로 (인덱스→슬롯)", () => {
      expect(getDoubleElimFeeders("WB_R1", 0, COUNTS_4)).toEqual({
        winner: { section: "WB_F", slotIndex: 0, slot: "A" },
        loser: { section: "LB_R1", slotIndex: 0, slot: "A" },
      });
      expect(getDoubleElimFeeders("WB_R1", 1, COUNTS_4)).toEqual({
        winner: { section: "WB_F", slotIndex: 0, slot: "B" },
        loser: { section: "LB_R1", slotIndex: 0, slot: "B" },
      });
    });

    it("WB_F 승자→GF teamA, 패자→LB_F teamB", () => {
      expect(getDoubleElimFeeders("WB_F", 0, COUNTS_4)).toEqual({
        winner: { section: "GF", slotIndex: 0, slot: "A" },
        loser: { section: "LB_F", slotIndex: 0, slot: "B" },
      });
    });

    it("LB_R1 승자→LB_F teamA (4팀은 LB_R2 없음), 패자 탈락", () => {
      expect(getDoubleElimFeeders("LB_R1", 0, COUNTS_4)).toEqual({
        winner: { section: "LB_F", slotIndex: 0, slot: "A" },
        loser: null,
      });
    });

    it("LB_F 승자→GF teamB", () => {
      expect(getDoubleElimFeeders("LB_F", 0, COUNTS_4)).toEqual({
        winner: { section: "GF", slotIndex: 0, slot: "B" },
        loser: null,
      });
    });
  });

  describe("8팀", () => {
    it("WB_R1 승자는 WB_R2로 floor(i/2)·짝A홀B, 패자는 LB_R1로 교차(0↔3,1↔2)", () => {
      expect(getDoubleElimFeeders("WB_R1", 0, COUNTS_8)).toEqual({
        winner: { section: "WB_R2", slotIndex: 0, slot: "A" },
        loser: { section: "LB_R1", slotIndex: 0, slot: "A" },
      });
      expect(getDoubleElimFeeders("WB_R1", 1, COUNTS_8)).toEqual({
        winner: { section: "WB_R2", slotIndex: 0, slot: "B" },
        loser: { section: "LB_R1", slotIndex: 1, slot: "A" },
      });
      expect(getDoubleElimFeeders("WB_R1", 2, COUNTS_8)).toEqual({
        winner: { section: "WB_R2", slotIndex: 1, slot: "A" },
        loser: { section: "LB_R1", slotIndex: 1, slot: "B" },
      });
      expect(getDoubleElimFeeders("WB_R1", 3, COUNTS_8)).toEqual({
        winner: { section: "WB_R2", slotIndex: 1, slot: "B" },
        loser: { section: "LB_R1", slotIndex: 0, slot: "B" },
      });
    });

    it("WB_R2 승자→WB_F(i==0?A:B), 패자→LB_R2 같은 인덱스 teamB", () => {
      expect(getDoubleElimFeeders("WB_R2", 0, COUNTS_8)).toEqual({
        winner: { section: "WB_F", slotIndex: 0, slot: "A" },
        loser: { section: "LB_R2", slotIndex: 0, slot: "B" },
      });
      expect(getDoubleElimFeeders("WB_R2", 1, COUNTS_8)).toEqual({
        winner: { section: "WB_F", slotIndex: 0, slot: "B" },
        loser: { section: "LB_R2", slotIndex: 1, slot: "B" },
      });
    });

    it("LB_R1 승자는 LB_R2 같은 인덱스로 1:1 (버그 회귀 방지)", () => {
      expect(getDoubleElimFeeders("LB_R1", 0, COUNTS_8).winner).toEqual({
        section: "LB_R2",
        slotIndex: 0,
        slot: "A",
      });
      // 핵심: LB_R1[1]은 LB_R2[1]로 가야 한다 (floor(1/2)=0 으로 가면 유실).
      expect(getDoubleElimFeeders("LB_R1", 1, COUNTS_8).winner).toEqual({
        section: "LB_R2",
        slotIndex: 1,
        slot: "A",
      });
    });

    it("LB_R2 승자→LB_SEMI(i==0?A:B), LB_SEMI 승자→LB_F teamA", () => {
      expect(getDoubleElimFeeders("LB_R2", 0, COUNTS_8).winner).toEqual({
        section: "LB_SEMI",
        slotIndex: 0,
        slot: "A",
      });
      expect(getDoubleElimFeeders("LB_R2", 1, COUNTS_8).winner).toEqual({
        section: "LB_SEMI",
        slotIndex: 0,
        slot: "B",
      });
      expect(getDoubleElimFeeders("LB_SEMI", 0, COUNTS_8).winner).toEqual({
        section: "LB_F",
        slotIndex: 0,
        slot: "A",
      });
    });
  });

  it("GF는 진출/하강 없음 (종료)", () => {
    expect(getDoubleElimFeeders("GF", 0, COUNTS_8)).toEqual({
      winner: null,
      loser: null,
    });
  });
});
