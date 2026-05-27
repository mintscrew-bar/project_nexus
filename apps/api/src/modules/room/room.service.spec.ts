import { Test, TestingModule } from "@nestjs/testing";
import {
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RoomService } from "./room.service";
import { PrismaService } from "../prisma/prisma.service";
import { ShutdownService } from "../common/shutdown.service";
import { RoomStatus, TeamMode } from "@nexus/database";

describe("RoomService", () => {
  let service: RoomService;
  let prisma: any;
  let shutdownService: any;

  const baseDto = {
    name: "테스트 방",
    maxParticipants: 10,
    teamMode: TeamMode.AUCTION,
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      authProvider: { findFirst: jest.fn() },
      riotAccount: { findFirst: jest.fn() },
      discordGuildLink: { findFirst: jest.fn().mockResolvedValue(null) },
      room: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      roomParticipant: {
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      snakeDraftPick: { deleteMany: jest.fn() },
      auctionBid: { deleteMany: jest.fn() },
      team: {
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      teamMember: { createMany: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prisma),
      ),
    };

    shutdownService = {
      isShuttingDown: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: ShutdownService, useValue: shutdownService },
      ],
    }).compile();

    service = module.get<RoomService>(RoomService);
  });

  // ============================================================
  // createRoom — Graceful Shutdown 가드
  // ============================================================
  describe("createRoom — shutdown 가드", () => {
    it("서버 종료 중이면 ServiceUnavailableException을 던진다", async () => {
      shutdownService.isShuttingDown.mockReturnValue(true);

      await expect(service.createRoom("host-1", baseDto)).rejects.toThrow(
        ServiceUnavailableException,
      );

      // 종료 중에는 DB 조회 없이 즉시 차단해야 한다
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("서버 정상 상태이면 shutdown 가드를 통과하여 이후 로직을 진행한다", async () => {
      shutdownService.isShuttingDown.mockReturnValue(false);
      // ADMIN 유저 → Discord/Riot 연동 면제
      prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
      prisma.room.create.mockResolvedValue({ id: "room-1", name: "테스트 방" });

      // ServiceUnavailableException이 발생하지 않아야 함
      await expect(
        service.createRoom("host-admin", baseDto),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================
  // createRoom — 계정 연동 검증
  // ============================================================
  describe("createRoom — 계정 연동 검증", () => {
    beforeEach(() => {
      shutdownService.isShuttingDown.mockReturnValue(false);
    });

    it("Discord 미연동 일반 유저는 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "USER" });
      prisma.authProvider.findFirst.mockResolvedValue(null); // Discord 미연동

      await expect(service.createRoom("host-1", baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("Riot 미연동 일반 유저는 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "USER" });
      prisma.authProvider.findFirst.mockResolvedValue({
        id: "discord-provider",
      }); // Discord 연동
      prisma.riotAccount.findFirst.mockResolvedValue(null); // Riot 미연동

      await expect(service.createRoom("host-1", baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("ADMIN은 Discord/Riot 연동 없이도 방을 생성할 수 있다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
      prisma.room.create.mockResolvedValue({ id: "room-1", name: "테스트 방" });

      await expect(
        service.createRoom("host-admin", baseDto),
      ).resolves.toBeDefined();

      // ADMIN은 authProvider, riotAccount 조회 없이 바로 방 생성
      expect(prisma.authProvider.findFirst).not.toHaveBeenCalled();
      expect(prisma.riotAccount.findFirst).not.toHaveBeenCalled();
      expect(prisma.room.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discordGuildId: null,
          }),
        }),
      );
    });

    it("유효하지 않은 maxParticipants이면 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });

      await expect(
        service.createRoom("host-admin", { ...baseDto, maxParticipants: 7 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createRoom — Discord 서버 선택", () => {
    beforeEach(() => {
      shutdownService.isShuttingDown.mockReturnValue(false);
      prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
    });

    it("선택한 길드가 본인 ACTIVE 링크이면 해당 guildId로 방을 생성한다", async () => {
      prisma.discordGuildLink.findFirst.mockResolvedValue({
        guildId: "guild-active",
      });
      prisma.room.create.mockResolvedValue({ id: "room-1", name: "테스트 방" });

      await expect(
        service.createRoom("host-admin", {
          ...baseDto,
          discordGuildId: "guild-active",
        }),
      ).resolves.toBeDefined();

      expect(prisma.discordGuildLink.findFirst).toHaveBeenCalledWith({
        where: {
          ownerId: "host-admin",
          guildId: "guild-active",
          status: "ACTIVE",
        },
        select: { guildId: true },
      });
      expect(prisma.room.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discordGuildId: "guild-active",
          }),
        }),
      );
    });

    it("선택한 길드가 본인 ACTIVE 링크가 아니면 방 생성을 거절한다", async () => {
      prisma.discordGuildLink.findFirst.mockResolvedValue(null);

      await expect(
        service.createRoom("host-admin", {
          ...baseDto,
          discordGuildId: "guild-not-owned",
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.room.create).not.toHaveBeenCalled();
    });
  });

  describe("자유 팀 선택", () => {
    it("플레이어가 팀을 선택하면 준비 상태를 해제하고 팀을 갱신한다", async () => {
      prisma.room.findUnique
        .mockResolvedValueOnce({
          id: "room-1",
          teamMode: TeamMode.MANUAL_TEAM,
          status: RoomStatus.WAITING,
          teams: [{ id: "team-1" }],
        })
        .mockResolvedValueOnce({
          id: "room-1",
          hostId: "host-1",
          participants: [],
          teams: [],
        });
      prisma.roomParticipant.findFirst.mockResolvedValue({
        id: "participant-1",
        role: "PLAYER",
        teamId: null,
      });
      prisma.roomParticipant.count.mockResolvedValue(2);

      await service.selectManualTeam("user-1", "room-1", "team-1");

      expect(prisma.roomParticipant.update).toHaveBeenCalledWith({
        where: { id: "participant-1" },
        data: { teamId: "team-1", isCaptain: false, isReady: false },
      });
    });

    it("각 팀이 채워지면 팀 멤버를 확정하고 역할 선택 직전 상태로 전환한다", async () => {
      const participants = Array.from({ length: 10 }, (_, index) => ({
        id: `participant-${index}`,
        userId: `user-${index}`,
        teamId: index < 5 ? "team-1" : "team-2",
      }));
      prisma.room.findUnique
        .mockResolvedValueOnce({
          id: "room-1",
          hostId: "user-0",
          maxParticipants: 10,
          status: RoomStatus.WAITING,
          teamMode: TeamMode.MANUAL_TEAM,
          participants,
          teams: [{ id: "team-1" }, { id: "team-2" }],
        })
        .mockResolvedValueOnce({
          id: "room-1",
          hostId: "user-0",
          participants: [],
          teams: [],
        });

      await service.finalizeManualTeams("user-0", "room-1");

      expect(prisma.teamMember.createMany).toHaveBeenCalledTimes(2);
      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: "room-1" },
        data: { status: RoomStatus.DRAFT_COMPLETED },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: "Serializable" }),
      );
    });
  });

  describe("자동 밸런스", () => {
    it("팀 멤버를 편성하고 역할 선택 직전 상태로 전환한다", async () => {
      const participants = Array.from({ length: 10 }, (_, index) => ({
        userId: `user-${index}`,
        id: `participant-${index}`,
        user: {
          riotAccounts: [{ tier: "GOLD", rank: "I", lp: 0 }],
        },
      }));
      prisma.room.findUnique
        .mockResolvedValueOnce({
          id: "room-1",
          hostId: "host-1",
          maxParticipants: 10,
          status: RoomStatus.WAITING,
          teamMode: TeamMode.AUTO_BALANCE,
          participants,
        })
        .mockResolvedValueOnce({
          id: "room-1",
          hostId: "host-1",
          participants: [],
          teams: [],
        });
      prisma.team.create
        .mockResolvedValueOnce({ id: "team-1" })
        .mockResolvedValueOnce({ id: "team-2" });

      await service.createAutoBalancedTeams("host-1", "room-1");

      expect(prisma.teamMember.createMany).toHaveBeenCalledTimes(2);
      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: "room-1" },
        data: { status: RoomStatus.DRAFT_COMPLETED },
      });
    });

    it("모든 팀 자리가 차지 않으면 편성을 시작하지 않는다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        hostId: "host-1",
        maxParticipants: 10,
        status: RoomStatus.WAITING,
        teamMode: TeamMode.AUTO_BALANCE,
        participants: [{ userId: "user-1", user: { riotAccounts: [] } }],
      });

      await expect(
        service.createAutoBalancedTeams("host-1", "room-1"),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it("선호 포지션이 고르게 배정된 팀의 패널티가 더 낮다", () => {
      const players = [
        ["a", "TOP"],
        ["b", "JUNGLE"],
        ["c", "MID"],
        ["d", "ADC"],
        ["e", "SUPPORT"],
        ["f", "TOP"],
        ["g", "JUNGLE"],
        ["h", "MID"],
        ["i", "ADC"],
        ["j", "SUPPORT"],
      ].map(([userId, mainRole]) => ({
        participant: { id: `participant-${userId}`, userId },
        score: 1000,
        mainRole,
        subRole: null,
      }));
      const balanced = [
        { score: 5000, players: players.slice(0, 5) },
        { score: 5000, players: players.slice(5) },
      ];
      const conflicted = [
        { score: 5000, players: [players[0], ...players.slice(5, 9)] },
        { score: 5000, players: [...players.slice(1, 5), players[9]] },
      ];

      expect((service as any).getAssignmentRolePenalty(balanced)).toBe(0);
      expect(
        (service as any).getAssignmentRolePenalty(conflicted),
      ).toBeGreaterThan(0);
    });
  });
});
