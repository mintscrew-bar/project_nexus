import { Test, TestingModule } from "@nestjs/testing";
import { MatchAdvancementService } from "./match-advancement.service";
import { MatchSeriesService } from "./match-series.service";
import { PrismaService } from "../prisma/prisma.service";
import { BadRequestException } from "@nestjs/common";

// 이 describe는 시리즈 도입 이전 방(레거시 경로)을 검증한다.
// hasSeries=false면 대진 슬롯이 여전히 Match이므로 기존 동작이 그대로여야 한다.
describe("MatchAdvancementService", () => {
  let service: MatchAdvancementService;
  let prisma: {
    match: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    matchSeries: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let seriesService: {
    hasSeries: jest.Mock;
    assignTeam: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      matchSeries: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    seriesService = {
      hasSeries: jest.fn().mockResolvedValue(false),
      assignTeam: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchAdvancementService,
        { provide: PrismaService, useValue: prisma },
        { provide: MatchSeriesService, useValue: seriesService },
      ],
    }).compile();

    service = module.get<MatchAdvancementService>(MatchAdvancementService);
  });

  describe("advanceWinnerToNextRound (Single Elimination)", () => {
    it("다음 라운드가 없으면 false를 반환한다", async () => {
      prisma.match.findMany.mockResolvedValueOnce([]); // nextRoundMatches empty
      const result = await service.advanceWinnerToNextRound(
        "room-1",
        2,
        3,
        "winner-1",
      );
      expect(result).toBe(false);
    });

    it("짝수 인덱스 매치 승자는 teamA 슬롯에 배정된다", async () => {
      // next round: 1 match
      prisma.match.findMany
        .mockResolvedValueOnce([
          { id: "final", matchNumber: 3, teamAId: null, teamBId: null },
        ])
        .mockResolvedValueOnce([
          { id: "semi1", matchNumber: 1 },
          { id: "semi2", matchNumber: 2 },
        ]);

      const result = await service.advanceWinnerToNextRound(
        "room-1",
        1,
        1,
        "winner-1",
      );

      expect(result).toBe(true);
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "final" },
        data: { teamAId: "winner-1" },
      });
    });

    it("홀수 인덱스 매치 승자는 teamB 슬롯에 배정된다", async () => {
      prisma.match.findMany
        .mockResolvedValueOnce([
          { id: "final", matchNumber: 3, teamAId: null, teamBId: null },
        ])
        .mockResolvedValueOnce([
          { id: "semi1", matchNumber: 1 },
          { id: "semi2", matchNumber: 2 },
        ]);

      const result = await service.advanceWinnerToNextRound(
        "room-1",
        1,
        2,
        "winner-2",
      );

      expect(result).toBe(true);
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "final" },
        data: { teamBId: "winner-2" },
      });
    });

    it("현재 매치 번호를 찾지 못하면 false를 반환한다", async () => {
      prisma.match.findMany
        .mockResolvedValueOnce([{ id: "final", matchNumber: 3 }])
        .mockResolvedValueOnce([{ id: "semi1", matchNumber: 1 }]);

      const result = await service.advanceWinnerToNextRound(
        "room-1",
        1,
        999,
        "winner-1",
      );
      expect(result).toBe(false);
    });
  });

  describe("advanceDoubleElimination", () => {
    it("bracketSection이 null이면 아무 작업도 하지 않는다", async () => {
      await service.advanceDoubleElimination(
        "room-1",
        "match-1",
        null,
        "winner",
        "loser",
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it("알 수 없는 bracketSection이면 BadRequestException 발생", async () => {
      await expect(
        service.advanceDoubleElimination(
          "room-1",
          "match-1",
          "INVALID_SECTION",
          "w",
          "l",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("WB_F 승자는 GF teamA, 패자는 LB_F teamB에 배정된다", async () => {
      prisma.match.findMany.mockImplementation(
        ({ where }: { where: { bracketRound?: string } }) => {
          if (where.bracketRound === "GF")
            return Promise.resolve([{ id: "gf-match", matchNumber: 10 }]);
          if (where.bracketRound === "LB_F")
            return Promise.resolve([{ id: "lbf-match", matchNumber: 9 }]);
          return Promise.resolve([{ id: "match-1", matchNumber: 1 }]);
        },
      );

      await service.advanceDoubleElimination(
        "room-1",
        "match-1",
        "WB_F",
        "wb-winner",
        "wb-loser",
      );

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "gf-match" },
        data: { teamAId: "wb-winner" },
      });
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "lbf-match" },
        data: { teamBId: "wb-loser" },
      });
    });

    it("8팀 LB_R1[1] 승자는 LB_R2[1] teamA에 배정된다 (LB_R1→LB_R2 1:1)", async () => {
      // 형제 조회(LB_R1) → LB_R2 조회 순서로 findMany가 호출된다.
      prisma.match.findMany
        .mockResolvedValueOnce([
          { id: "lbr1-0", matchNumber: 8 },
          { id: "lbr1-1", matchNumber: 9 },
        ])
        .mockResolvedValueOnce([
          { id: "lbr2-0", matchNumber: 10 },
          { id: "lbr2-1", matchNumber: 11 },
        ]);

      await service.advanceDoubleElimination(
        "room-1",
        "lbr1-1",
        "LB_R1",
        "lb-winner",
        "lb-loser",
      );

      // 버그였다면 lbr2-0에 덮어썼을 것 → 반드시 lbr2-1 teamA여야 한다.
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "lbr2-1" },
        data: { teamAId: "lb-winner" },
      });
      expect(prisma.match.update).not.toHaveBeenCalledWith({
        where: { id: "lbr2-0" },
        data: { teamAId: "lb-winner" },
      });
    });

    it("LB_F 승자는 GF teamB에 배정된다", async () => {
      prisma.match.findMany.mockImplementation(
        ({ where }: { where: { bracketRound?: string } }) => {
          if (where.bracketRound === "GF")
            return Promise.resolve([{ id: "gf-match", matchNumber: 10 }]);
          return Promise.resolve([{ id: "match-1", matchNumber: 1 }]);
        },
      );

      await service.advanceDoubleElimination(
        "room-1",
        "match-1",
        "LB_F",
        "lb-winner",
        "lb-loser",
      );

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "gf-match" },
        data: { teamBId: "lb-winner" },
      });
    });

    it("GF 완료 시 DB 업데이트 없이 로그만 남긴다", async () => {
      await service.advanceDoubleElimination(
        "room-1",
        "match-1",
        "GF",
        "champion",
        "runner-up",
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });
  });

  describe("checkBracketCompletion", () => {
    it("미완료 매치가 없으면 true를 반환한다", async () => {
      prisma.match.count.mockResolvedValue(0);

      const result = await service.checkBracketCompletion("room-1");
      expect(result).toBe(true);
    });

    it("하나라도 COMPLETED가 아니면 false를 반환한다", async () => {
      prisma.match.count.mockResolvedValue(1);

      const result = await service.checkBracketCompletion("room-1");
      expect(result).toBe(false);
    });

    it("매치가 없으면 true를 반환한다 (vacuous truth)", async () => {
      prisma.match.count.mockResolvedValue(0);
      const result = await service.checkBracketCompletion("room-1");
      expect(result).toBe(true);
    });
  });

  // ────────────────────────────────────────────────
  // 시리즈(다전제) 방 — 대진 슬롯이 MatchSeries다.
  // ────────────────────────────────────────────────
  describe("시리즈 방", () => {
    beforeEach(() => {
      seriesService.hasSeries.mockResolvedValue(true);
    });

    it("진출은 Match가 아니라 시리즈 슬롯에 배정된다", async () => {
      prisma.matchSeries.findMany
        .mockResolvedValueOnce([{ id: "final-series", matchNumber: 3 }])
        .mockResolvedValueOnce([
          { id: "semi1-series", matchNumber: 1 },
          { id: "semi2-series", matchNumber: 2 },
        ]);

      const result = await service.advanceWinnerToNextRound(
        "room-1",
        1,
        1,
        "winner-1",
      );

      expect(result).toBe(true);
      // 시리즈에 배정하면 아직 시작 전인 세트에도 같이 반영된다.
      expect(seriesService.assignTeam).toHaveBeenCalledWith(
        "final-series",
        true,
        "winner-1",
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it("홀수 인덱스 슬롯 승자는 teamB로 배정된다", async () => {
      prisma.matchSeries.findMany
        .mockResolvedValueOnce([{ id: "final-series", matchNumber: 3 }])
        .mockResolvedValueOnce([
          { id: "semi1-series", matchNumber: 1 },
          { id: "semi2-series", matchNumber: 2 },
        ]);

      await service.advanceWinnerToNextRound("room-1", 1, 2, "winner-2");

      expect(seriesService.assignTeam).toHaveBeenCalledWith(
        "final-series",
        false,
        "winner-2",
      );
    });

    it("완주 판정은 시리즈 단위로 한다 (미실시 세트가 있어도 끝난다)", async () => {
      // 2-0으로 끝난 3판 2선은 3세트를 아예 만들지 않으므로
      // 게임 개수로는 완주를 판정할 수 없다.
      prisma.matchSeries.count.mockResolvedValue(0);

      const result = await service.checkBracketCompletion("room-1");

      expect(result).toBe(true);
      expect(prisma.matchSeries.count).toHaveBeenCalled();
      expect(prisma.match.count).not.toHaveBeenCalled();
    });

    it("끝나지 않은 시리즈가 있으면 false를 반환한다", async () => {
      prisma.matchSeries.count.mockResolvedValue(1);

      expect(await service.checkBracketCompletion("room-1")).toBe(false);
    });

    it("DE 라우팅도 시리즈 슬롯을 대상으로 한다", async () => {
      // WB_F 승자 → GF teamA, 패자 → LB_F teamB
      prisma.matchSeries.findMany.mockImplementation(
        ({ where }: { where: { bracketRound?: string } }) => {
          if (where.bracketRound === "GF")
            return Promise.resolve([{ id: "gf-series", matchNumber: 6 }]);
          if (where.bracketRound === "LB_F")
            return Promise.resolve([{ id: "lbf-series", matchNumber: 5 }]);
          return Promise.resolve([]);
        },
      );

      await service.advanceDoubleElimination(
        "room-1",
        "wbf-series",
        "WB_F",
        "winner",
        "loser",
      );

      expect(seriesService.assignTeam).toHaveBeenCalledWith(
        "gf-series",
        true,
        "winner",
      );
      expect(seriesService.assignTeam).toHaveBeenCalledWith(
        "lbf-series",
        false,
        "loser",
      );
    });
  });
});
