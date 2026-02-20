import { Test, TestingModule } from "@nestjs/testing";
import { MatchBracketService } from "./match-bracket.service";
import { PrismaService } from "../prisma/prisma.service";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

const makeTeam = (id: string, memberCount = 5) => ({
  id,
  name: `Team ${id}`,
  members: Array.from({ length: memberCount }, (_, i) => ({
    id: `member-${id}-${i}`,
  })),
});

describe("MatchBracketService", () => {
  let service: MatchBracketService;
  let prisma: {
    room: { findUnique: jest.Mock; update: jest.Mock };
    match: { findMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      room: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchBracketService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MatchBracketService>(MatchBracketService);
  });

  const setupRoom = (
    teamCount: number,
    overrides: Record<string, any> = {},
  ) => {
    const teams = Array.from({ length: teamCount }, (_, i) =>
      makeTeam(`team-${i}`),
    );
    prisma.room.findUnique.mockResolvedValue({
      id: "room-1",
      hostId: "host-1",
      status: "ROLE_SELECTION",
      bracketFormat: null,
      teams,
      ...overrides,
    });
    return teams;
  };

  describe("generateBracket - validation", () => {
    it("방을 찾지 못하면 NotFoundException 발생", async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.generateBracket("host-1", "room-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("호스트가 아닌 유저가 호출하면 ForbiddenException 발생", async () => {
      setupRoom(2);
      await expect(
        service.generateBracket("not-host", "room-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("ROLE_SELECTION 상태가 아니면 BadRequestException 발생", async () => {
      setupRoom(2, { status: "WAITING" });
      await expect(
        service.generateBracket("host-1", "room-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("팀원이 5명이 아닌 팀이 있으면 BadRequestException 발생", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        hostId: "host-1",
        status: "ROLE_SELECTION",
        bracketFormat: null,
        teams: [makeTeam("team-0", 5), makeTeam("team-1", 3)],
      });
      prisma.match.findMany.mockResolvedValue([]);

      await expect(
        service.generateBracket("host-1", "room-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("지원하지 않는 팀 수(1팀)이면 BadRequestException 발생", async () => {
      setupRoom(1);
      await expect(
        service.generateBracket("host-1", "room-1"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("generateBracket - 2 teams (Single Match)", () => {
    it("1개의 SINGLE 매치를 생성한다", async () => {
      setupRoom(2);
      const bracket = await service.generateBracket("host-1", "room-1");

      expect(bracket.type).toBe("SINGLE");
      expect(bracket.matches).toHaveLength(1);
      expect(bracket.matches[0].round).toBe(1);
      expect(bracket.matches[0].matchNumber).toBe(1);
      expect(bracket.matches[0].status).toBe("PENDING");
    });

    it("양 팀이 매치에 배정된다", async () => {
      setupRoom(2);
      const bracket = await service.generateBracket("host-1", "room-1");
      const match = bracket.matches[0];

      const teamIds = [match.teamAId, match.teamBId].sort();
      expect(teamIds).toEqual(["team-0", "team-1"]);
    });
  });

  describe("generateBracket - 3 teams (Round Robin)", () => {
    it("3C2 = 3개의 매치를 생성한다", async () => {
      setupRoom(3);
      const bracket = await service.generateBracket("host-1", "room-1");

      expect(bracket.type).toBe("ROUND_ROBIN");
      expect(bracket.matches).toHaveLength(3);
    });

    it("모든 팀이 서로 한 번씩 대결한다", async () => {
      setupRoom(3);
      const bracket = await service.generateBracket("host-1", "room-1");

      const pairs = bracket.matches.map((m) =>
        [m.teamAId, m.teamBId].sort().join("-"),
      );
      const uniquePairs = new Set(pairs);
      expect(uniquePairs.size).toBe(3);
    });
  });

  describe("generateBracket - 5 teams (Round Robin)", () => {
    it("5C2 = 10개의 매치를 생성한다", async () => {
      setupRoom(5);
      const bracket = await service.generateBracket("host-1", "room-1");

      expect(bracket.type).toBe("ROUND_ROBIN");
      expect(bracket.matches).toHaveLength(10);
    });
  });

  describe("generateBracket - 4 teams (Single Elimination)", () => {
    it("3개의 매치를 생성한다 (2 semi + 1 final)", async () => {
      setupRoom(4);
      const bracket = await service.generateBracket("host-1", "room-1");

      expect(bracket.type).toBe("SINGLE_ELIMINATION");
      expect(bracket.matches).toHaveLength(3);
    });

    it("준결승에는 팀이 배정되고, 결승은 TBD이다", async () => {
      setupRoom(4);
      const bracket = await service.generateBracket("host-1", "room-1");

      const round1 = bracket.matches.filter((m) => m.round === 1);
      const round2 = bracket.matches.filter((m) => m.round === 2);

      expect(round1).toHaveLength(2);
      round1.forEach((m) => {
        expect(m.teamAId).toBeDefined();
        expect(m.teamBId).toBeDefined();
      });

      expect(round2).toHaveLength(1);
      expect(round2[0].teamAId).toBeUndefined();
      expect(round2[0].teamBId).toBeUndefined();
    });
  });

  describe("generateBracket - 4 teams (Double Elimination)", () => {
    it("6개의 매치를 생성한다", async () => {
      setupRoom(4, { bracketFormat: "DOUBLE_ELIMINATION" });
      const bracket = await service.generateBracket("host-1", "room-1");

      expect(bracket.type).toBe("DOUBLE_ELIMINATION");
      expect(bracket.matches).toHaveLength(6);
    });

    it("올바른 bracket section이 배정된다", async () => {
      setupRoom(4, { bracketFormat: "DOUBLE_ELIMINATION" });
      const bracket = await service.generateBracket("host-1", "room-1");

      const sections = bracket.matches.map((m) => m.bracketSection);
      expect(sections).toEqual(
        expect.arrayContaining(["WB_R1", "WB_F", "LB_R1", "LB_F", "GF"]),
      );
      expect(sections.filter((s) => s === "WB_R1")).toHaveLength(2);
    });
  });

  describe("generateBracket - 8 teams (Single Elimination)", () => {
    it("7개의 매치를 생성한다 (4 quarter + 2 semi + 1 final)", async () => {
      setupRoom(8);
      const bracket = await service.generateBracket("host-1", "room-1");

      expect(bracket.type).toBe("SINGLE_ELIMINATION");
      expect(bracket.matches).toHaveLength(7);
    });

    it("1라운드에만 팀이 배정된다", async () => {
      setupRoom(8);
      const bracket = await service.generateBracket("host-1", "room-1");

      const round1 = bracket.matches.filter((m) => m.round === 1);
      expect(round1).toHaveLength(4);
      round1.forEach((m) => {
        expect(m.teamAId).toBeDefined();
        expect(m.teamBId).toBeDefined();
      });

      const laterRounds = bracket.matches.filter((m) => m.round > 1);
      laterRounds.forEach((m) => {
        expect(m.teamAId).toBeUndefined();
        expect(m.teamBId).toBeUndefined();
      });
    });
  });

  describe("generateBracket - 8 teams (Double Elimination)", () => {
    it("14개의 매치를 생성한다", async () => {
      setupRoom(8, { bracketFormat: "DOUBLE_ELIMINATION" });
      const bracket = await service.generateBracket("host-1", "room-1");

      expect(bracket.type).toBe("DOUBLE_ELIMINATION");
      expect(bracket.matches).toHaveLength(14);
    });

    it("WB_R1에 4개, WB_R2에 2개, WB_F에 1개 매치가 있다", async () => {
      setupRoom(8, { bracketFormat: "DOUBLE_ELIMINATION" });
      const bracket = await service.generateBracket("host-1", "room-1");

      const countBySection = (section: string) =>
        bracket.matches.filter((m) => m.bracketSection === section).length;

      expect(countBySection("WB_R1")).toBe(4);
      expect(countBySection("WB_R2")).toBe(2);
      expect(countBySection("WB_F")).toBe(1);
      expect(countBySection("LB_R1")).toBe(2);
      expect(countBySection("LB_R2")).toBe(2);
      expect(countBySection("LB_SEMI")).toBe(1);
      expect(countBySection("LB_F")).toBe(1);
      expect(countBySection("GF")).toBe(1);
    });
  });

  describe("DB 저장", () => {
    it("트랜잭션 내에서 매치를 생성하고 방 상태를 변경한다", async () => {
      setupRoom(2);
      await service.generateBracket("host-1", "room-1");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.match.create).toHaveBeenCalledTimes(1);
      expect(prisma.room.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "IN_PROGRESS" },
        }),
      );
    });
  });
});
