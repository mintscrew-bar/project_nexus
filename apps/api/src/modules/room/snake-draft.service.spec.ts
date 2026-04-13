import { Test, TestingModule } from "@nestjs/testing";
import { SnakeDraftService } from "./snake-draft.service";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamMode } from "@nexus/database";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

describe("SnakeDraftService", () => {
  let service: SnakeDraftService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      room: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      team: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      roomParticipant: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      teamMember: {
        create: jest.fn(),
      },
      snakeDraftPick: {
        create: jest.fn(),
      },
      authProvider: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnakeDraftService,
        { provide: PrismaService, useValue: prisma },
        { provide: "DISCORD_VOICE_SERVICE", useValue: null },
      ],
    }).compile();

    service = module.get<SnakeDraftService>(SnakeDraftService);
  });

  describe("generatePickOrder (순환형 스네이크 공정성 검증)", () => {
    it("2팀일 때 표준 스네이크와 동일하게 동작한다 (1-2-2-1 반복)", () => {
      const teamIds = ["T1", "T2"];
      const order = (service as any).generatePickOrder(teamIds, 2);
      
      // R0 (start T1): T1, T2
      // R1 (start T2): T2, T1 -> T2 더블
      // R2 (start T1): T1, T2 -> T1 더블
      // R3 (start T2): T2, T1 -> T2 더블
      expect(order.slice(0, 8)).toEqual(["T1", "T2", "T2", "T1", "T1", "T2", "T2", "T1"]);
    });

    it("3팀일 때 12픽 내에서 모든 팀(T1, T2, T3)이 정확히 한 번씩 연속 픽을 갖는다", () => {
      const teamIds = ["T1", "T2", "T3"];
      const order = (service as any).generatePickOrder(teamIds, 3);
      
      // R0 (start T1): T1, T2, T3
      // R1 (start T3): T3, T1, T2 (T3 더블: index 2, 3)
      // R2 (start T2): T2, T3, T1 (T2 더블: index 5, 6)
      // R3 (start T1): T1, T2, T3 (T1 더블: index 8, 9)
      
      const expected = [
        "T1", "T2", "T3", // R0
        "T3", "T1", "T2", // R1 (T3 연속)
        "T2", "T3", "T1", // R2 (T2 연속)
        "T1", "T2", "T3"  // R3 (T1 연속)
      ];
      
      expect(order.slice(0, 12)).toEqual(expected);

      // 연속 픽 지점 검증
      expect(order[2]).toBe(order[3]); // T3 연속 (3, 4번째 픽)
      expect(order[5]).toBe(order[6]); // T2 연속 (6, 7번째 픽)
      expect(order[8]).toBe(order[9]); // T1 연속 (9, 10번째 픽)
    });
  });

  describe("startSnakeDraft", () => {
    const hostId = "host-1";
    const roomId = "room-1";

    it("정상 시작 시 팀을 생성하고 순환형 스네이크 순서를 생성한다", async () => {
      const players = new Array(10).fill(0).map((_, i) => ({
        id: `p${i}`,
        userId: `u${i}`,
        role: "PLAYER",
        user: { username: `user${i}`, riotAccounts: [{ isPrimary: true, mainRole: "TOP" }] },
      }));

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        hostId,
        status: RoomStatus.WAITING,
        teamMode: TeamMode.SNAKE_DRAFT,
        participants: players,
        teams: [],
        captainSelection: "RANDOM",
      });

      prisma.team.create.mockImplementation((args: any) => ({
        id: `team-${args.data.captainId}`,
        captainId: args.data.captainId,
      }));

      const result = await service.startSnakeDraft(hostId, roomId);

      expect(result.teams).toHaveLength(2);
      expect(result.pickOrder).toHaveLength(8);
      // 첫 4픽은 T1, T2, T2, T1 순서여야 함
      const t1Id = result.teams[0].id;
      const t2Id = result.teams[1].id;
      expect(result.pickOrder.slice(0, 4)).toEqual([t1Id, t2Id, t2Id, t1Id]);
    });
  });
});
