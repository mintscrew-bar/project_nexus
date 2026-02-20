import { Test, TestingModule } from "@nestjs/testing";
import { MatchAdvancementService } from "./match-advancement.service";
import { PrismaService } from "../prisma/prisma.service";
import { BadRequestException } from "@nestjs/common";

describe("MatchAdvancementService", () => {
  let service: MatchAdvancementService;
  let prisma: {
    match: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchAdvancementService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MatchAdvancementService>(MatchAdvancementService);
  });

  describe("advanceWinnerToNextRound (Single Elimination)", () => {
    it("다음 라운드가 없으면 false를 반환한다", async () => {
      prisma.match.findMany.mockResolvedValueOnce([]); // nextRoundMatches empty
      const result = await service.advanceWinnerToNextRound(
        "room-1", 2, 3, "winner-1",
      );
      expect(result).toBe(false);
    });

    it("짝수 인덱스 매치 승자는 teamA 슬롯에 배정된다", async () => {
      // next round: 1 match
      prisma.match.findMany
        .mockResolvedValueOnce([{ id: "final", matchNumber: 3, teamAId: null, teamBId: null }])
        .mockResolvedValueOnce([
          { id: "semi1", matchNumber: 1 },
          { id: "semi2", matchNumber: 2 },
        ]);

      const result = await service.advanceWinnerToNextRound(
        "room-1", 1, 1, "winner-1",
      );

      expect(result).toBe(true);
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "final" },
        data: { teamAId: "winner-1" },
      });
    });

    it("홀수 인덱스 매치 승자는 teamB 슬롯에 배정된다", async () => {
      prisma.match.findMany
        .mockResolvedValueOnce([{ id: "final", matchNumber: 3, teamAId: null, teamBId: null }])
        .mockResolvedValueOnce([
          { id: "semi1", matchNumber: 1 },
          { id: "semi2", matchNumber: 2 },
        ]);

      const result = await service.advanceWinnerToNextRound(
        "room-1", 1, 2, "winner-2",
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
        "room-1", 1, 999, "winner-1",
      );
      expect(result).toBe(false);
    });
  });

  describe("advanceDoubleElimination", () => {
    it("bracketSection이 null이면 아무 작업도 하지 않는다", async () => {
      await service.advanceDoubleElimination(
        "room-1", "match-1", null, "winner", "loser",
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it("알 수 없는 bracketSection이면 BadRequestException 발생", async () => {
      await expect(
        service.advanceDoubleElimination(
          "room-1", "match-1", "INVALID_SECTION", "w", "l",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("WB_F 승자는 GF teamA, 패자는 LB_F teamB에 배정된다", async () => {
      prisma.match.findMany.mockResolvedValue([{ id: "match-1", matchNumber: 1 }]);
      prisma.match.findFirst
        .mockResolvedValueOnce({ id: "gf-match", bracketRound: "GF", matchNumber: 10 })
        .mockResolvedValueOnce({ id: "lbf-match", bracketRound: "LB_F", matchNumber: 9 });

      await service.advanceDoubleElimination(
        "room-1", "match-1", "WB_F", "wb-winner", "wb-loser",
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

    it("LB_F 승자는 GF teamB에 배정된다", async () => {
      prisma.match.findMany.mockResolvedValue([{ id: "match-1", matchNumber: 1 }]);
      prisma.match.findFirst.mockResolvedValueOnce({
        id: "gf-match", bracketRound: "GF", matchNumber: 10,
      });

      await service.advanceDoubleElimination(
        "room-1", "match-1", "LB_F", "lb-winner", "lb-loser",
      );

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "gf-match" },
        data: { teamBId: "lb-winner" },
      });
    });

    it("GF 완료 시 DB 업데이트 없이 로그만 남긴다", async () => {
      await service.advanceDoubleElimination(
        "room-1", "match-1", "GF", "champion", "runner-up",
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });
  });

  describe("checkBracketCompletion", () => {
    it("모든 매치가 COMPLETED면 true를 반환한다", async () => {
      prisma.match.findMany.mockResolvedValue([
        { id: "1", status: "COMPLETED" },
        { id: "2", status: "COMPLETED" },
        { id: "3", status: "COMPLETED" },
      ]);

      const result = await service.checkBracketCompletion("room-1");
      expect(result).toBe(true);
    });

    it("하나라도 COMPLETED가 아니면 false를 반환한다", async () => {
      prisma.match.findMany.mockResolvedValue([
        { id: "1", status: "COMPLETED" },
        { id: "2", status: "PENDING" },
        { id: "3", status: "COMPLETED" },
      ]);

      const result = await service.checkBracketCompletion("room-1");
      expect(result).toBe(false);
    });

    it("매치가 없으면 true를 반환한다 (vacuous truth)", async () => {
      prisma.match.findMany.mockResolvedValue([]);
      const result = await service.checkBracketCompletion("room-1");
      expect(result).toBe(true);
    });
  });
});
