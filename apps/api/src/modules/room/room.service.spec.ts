import { Test, TestingModule } from "@nestjs/testing";
import {
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RoomService } from "./room.service";
import { PrismaService } from "../prisma/prisma.service";
import { ShutdownService } from "../common/shutdown.service";
import { Role, RoomStatus, TeamMode } from "@nexus/database";
import { StreamerService } from "../streamer/streamer.service";
import { BalanceScoreService } from "../common/balance-score.service";
import { StatsService } from "../stats/stats.service";
import { RedisService } from "../redis/redis.service";

describe("RoomService", () => {
  let service: RoomService;
  let prisma: any;
  let shutdownService: any;
  let balanceScores: any;
  let redis: any;

  const baseDto = {
    name: "테스트 방",
    maxParticipants: 10,
    teamMode: TeamMode.AUCTION,
  };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    balanceScores = {
      readCached: jest.fn().mockReturnValue(null),
      refreshAccount: jest.fn().mockResolvedValue(null),
      refreshUser: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      user: { findUnique: jest.fn() },
      authProvider: { findFirst: jest.fn() },
      riotAccount: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      discordGuildLink: { findFirst: jest.fn().mockResolvedValue(null) },
      room: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      match: {
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      matchSeries: { deleteMany: jest.fn() },
      matchRosterSnapshot: { createMany: jest.fn() },
      matchParticipant: {
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      matchTeamStats: {
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      matchVote: { deleteMany: jest.fn() },
      userRating: { deleteMany: jest.fn() },
      userReport: { updateMany: jest.fn() },
      roomParticipant: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      snakeDraftPick: { deleteMany: jest.fn() },
      auctionBid: { deleteMany: jest.fn() },
      team: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      teamMember: { createMany: jest.fn(), deleteMany: jest.fn() },
      roomDiscordChannel: { deleteMany: jest.fn() },
      chatMessage: { updateMany: jest.fn() },
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
        {
          provide: StreamerService,
          useValue: { getHostLiveMap: jest.fn().mockResolvedValue(new Map()) },
        },
        {
          // 밸런스 점수는 캐시에서 읽는다. 방 조회 테스트에서는 점수가 없어도
          // 되므로 기본값은 null 이고, 자동 밸런스 테스트에서만 값을 준다.
          provide: BalanceScoreService,
          useValue: balanceScores,
        },
        {
          provide: StatsService,
          useValue: { enqueueChampionScanForPuuids: jest.fn() },
        },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<RoomService>(RoomService);
  });

  describe("getOtherWaitingRoomIdsForUser", () => {
    it("현재 방을 제외한 기존 대기방 참가 기록을 반환한다", async () => {
      prisma.roomParticipant.findMany.mockResolvedValue([
        { roomId: "old-room-1" },
        { roomId: "old-room-2" },
      ]);

      await expect(
        service.getOtherWaitingRoomIdsForUser("user-1", "target-room"),
      ).resolves.toEqual(["old-room-1", "old-room-2"]);

      expect(prisma.roomParticipant.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          roomId: { not: "target-room" },
          room: { status: RoomStatus.WAITING },
        },
        select: { roomId: true },
      });
    });
  });

  describe("joinRoom — 기존 참가방 전환", () => {
    const targetRoom = {
      id: "target-room",
      name: "새 방",
      status: RoomStatus.WAITING,
      isPrivate: false,
      password: null,
      allowSpectators: true,
      maxParticipants: 10,
      participants: [],
    };

    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue(targetRoom);
      prisma.authProvider.findFirst.mockResolvedValue({ id: "discord" });
      prisma.riotAccount.findFirst.mockResolvedValue({ id: "riot" });
      prisma.roomParticipant.create.mockResolvedValue({
        id: "new-participant",
      });
    });

    it("진행 중인 다른 내전이 있으면 새 방 참가를 막는다", async () => {
      prisma.roomParticipant.findMany.mockResolvedValue([
        {
          roomId: "active-room",
          room: {
            id: "active-room",
            name: "진행방",
            status: RoomStatus.IN_PROGRESS,
            participants: [],
          },
        },
      ]);

      await expect(
        service.joinRoom("user-1", { roomId: "target-room" }),
      ).rejects.toThrow("ACTIVE_ROOM_EXISTS::active-room");
      expect(prisma.roomParticipant.create).not.toHaveBeenCalled();
    });

    it("새 참가 생성과 기존 대기방 퇴장을 같은 트랜잭션에서 처리한다", async () => {
      prisma.roomParticipant.findMany.mockResolvedValue([
        {
          roomId: "old-room",
          room: {
            id: "old-room",
            name: "기존 방",
            hostId: "user-1",
            status: RoomStatus.WAITING,
            participants: [
              { userId: "user-1", user: { username: "나" } },
              { userId: "user-2", user: { username: "다음 방장" } },
            ],
          },
        },
      ]);
      jest.spyOn(service, "getRoomById").mockResolvedValue(targetRoom as any);

      const result = await service.joinRoom("user-1", {
        roomId: "target-room",
      });

      expect(prisma.roomParticipant.create).toHaveBeenCalledWith({
        data: {
          roomId: "target-room",
          userId: "user-1",
          role: "PLAYER",
        },
      });
      expect(prisma.roomParticipant.deleteMany).toHaveBeenCalledWith({
        where: { roomId: "old-room", userId: "user-1" },
      });
      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: "old-room" },
        data: { hostId: "user-2" },
      });
      expect(result.switchedFromRoomIds).toEqual(["old-room"]);
    });
  });

  describe("deleteRoomData — 완료 기록 보존", () => {
    it("완료 매치는 스냅샷을 남기고 방/팀 FK만 분리한다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        name: "여름 내전",
        teamMode: TeamMode.MANUAL_TEAM,
        host: { id: "host-1", username: "방장" },
      });
      prisma.match.findMany.mockResolvedValue([
        {
          id: "match-completed",
          status: "COMPLETED",
          roomName: null,
          teamAId: "team-a",
          teamAIdSnapshot: null,
          teamBId: "team-b",
          teamBIdSnapshot: null,
          winnerId: "team-a",
          winnerIdSnapshot: null,
          _count: { rosterSnapshots: 0 },
        },
      ]);
      prisma.team.findMany.mockResolvedValue([
        {
          id: "team-a",
          name: "A팀",
          members: [
            {
              userId: "user-a",
              user: {
                username: "선수A",
                riotAccounts: [{ puuid: "puuid-a" }],
              },
            },
          ],
        },
        {
          id: "team-b",
          name: "B팀",
          members: [
            {
              userId: "user-b",
              user: {
                username: "선수B",
                riotAccounts: [{ puuid: "puuid-b" }],
              },
            },
          ],
        },
      ]);

      await service.deleteRoomData("room-1");

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "match-completed" },
        data: expect.objectContaining({
          isInternal: true,
          roomIdSnapshot: "room-1",
          roomName: "여름 내전",
          teamAIdSnapshot: "team-a",
          teamBIdSnapshot: "team-b",
          winnerIdSnapshot: "team-a",
          roomId: null,
          teamAId: null,
          teamBId: null,
          winnerId: null,
        }),
      });
      expect(prisma.matchRosterSnapshot.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            matchId: "match-completed",
            userId: "user-a",
            teamIdSnapshot: "team-a",
          }),
          expect.objectContaining({
            matchId: "match-completed",
            userId: "user-b",
            teamIdSnapshot: "team-b",
          }),
        ]),
      });
      expect(prisma.match.deleteMany).not.toHaveBeenCalled();
      expect(prisma.room.delete).toHaveBeenCalledWith({
        where: { id: "room-1" },
      });
    });
  });

  describe("returnToLobby — 완료 기록 보존", () => {
    it("완료 매치를 분리하고 미완료 대진만 삭제한다", async () => {
      prisma.room.findUnique
        .mockResolvedValueOnce({
          id: "room-1",
          name: "재사용 방",
          status: RoomStatus.COMPLETED,
          teamMode: TeamMode.AUCTION,
          hostId: "host-1",
          maxParticipants: 10,
          participants: [{ userId: "user-a" }],
          teams: [
            { captain: { authProviders: [] } },
            { captain: { authProviders: [] } },
          ],
        })
        .mockResolvedValueOnce({
          id: "room-1",
          name: "재사용 방",
          teamMode: TeamMode.AUCTION,
          host: { id: "host-1", username: "방장" },
        })
        .mockResolvedValueOnce({
          id: "room-1",
          hostId: "host-1",
          participants: [],
          teams: [],
        });
      prisma.match.findMany.mockResolvedValue([
        {
          id: "match-completed",
          roomName: null,
          teamAId: "team-a",
          teamAIdSnapshot: null,
          teamBId: "team-b",
          teamBIdSnapshot: null,
          winnerId: "team-a",
          winnerIdSnapshot: null,
          _count: { rosterSnapshots: 0 },
        },
      ]);
      prisma.team.findMany.mockResolvedValue([
        {
          id: "team-a",
          name: "A팀",
          members: [
            {
              userId: "user-a",
              user: { username: "선수A", riotAccounts: [{ puuid: "pa" }] },
            },
          ],
        },
        {
          id: "team-b",
          name: "B팀",
          members: [
            {
              userId: "user-b",
              user: { username: "선수B", riotAccounts: [{ puuid: "pb" }] },
            },
          ],
        },
      ]);

      await service.returnToLobby("user-a", "room-1");

      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "match-completed" },
          data: expect.objectContaining({
            roomId: null,
            teamAId: null,
            teamBId: null,
            winnerId: null,
            winnerIdSnapshot: "team-a",
          }),
        }),
      );
      expect(prisma.match.deleteMany).toHaveBeenCalledWith({
        where: {
          roomId: "room-1",
          status: { not: "COMPLETED" },
        },
      });
      expect(prisma.matchSeries.deleteMany).toHaveBeenCalledWith({
        where: { roomId: "room-1" },
      });
    });
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
    it("대기석에 있는 플레이어는 준비할 수 없다", async () => {
      prisma.roomParticipant.findFirst.mockResolvedValue({
        id: "participant-1",
        role: "PLAYER",
        teamId: null,
        isReady: false,
        room: {
          teamMode: TeamMode.MANUAL_TEAM,
          status: RoomStatus.WAITING,
        },
      });

      await expect(service.toggleReady("user-1", "room-1")).rejects.toThrow(
        "팀을 선택한 뒤 준비해주세요.",
      );

      expect(prisma.roomParticipant.update).not.toHaveBeenCalled();
    });

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

  describe("자동 밸런스 확정", () => {
    beforeEach(() => {
      jest
        .spyOn(service as any, "moveAssignedTeamsToVoice")
        .mockResolvedValue(undefined);
    });

    it("확정할 때 팀별 음성채널로 인원을 옮긴다", async () => {
      // 확인 단계에서 재편성·교체를 할 수 있어 편성 직후가 아니라 확정 때 옮긴다.
      prisma.room.findUnique.mockResolvedValue({
        hostId: "host-1",
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.DRAFT_COMPLETED,
      });
      prisma.room.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.confirmAutoBalancedTeams("host-1", "room-1");

      expect((service as any).moveAssignedTeamsToVoice).toHaveBeenCalledWith(
        "room-1",
      );
    });

    it("재편성과 겹치면 확정을 끊는다", async () => {
      // DRAFT_COMPLETED 조건부 갱신이 0건이면 다른 작업이 상태를 바꾼 것이다.
      // 그대로 진행하면 반쯤 쓰인 팀으로 대진표가 만들어진다.
      prisma.room.findUnique.mockResolvedValue({
        hostId: "host-1",
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.DRAFT_COMPLETED,
      });
      prisma.room.updateMany = jest.fn().mockResolvedValue({ count: 0 });

      await expect(
        service.confirmAutoBalancedTeams("host-1", "room-1"),
      ).rejects.toThrow("편성이 변경 중이거나 이미 확정");
      expect((service as any).moveAssignedTeamsToVoice).not.toHaveBeenCalled();
    });

    it("방장이 아니면 확정할 수 없다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        hostId: "host-1",
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.DRAFT_COMPLETED,
      });

      prisma.room.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await expect(
        service.confirmAutoBalancedTeams("other-user", "room-1"),
      ).rejects.toThrow("방장만");
      expect((service as any).moveAssignedTeamsToVoice).not.toHaveBeenCalled();
    });

    it("편성 전에는 확정할 수 없다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        hostId: "host-1",
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.WAITING,
      });

      prisma.room.updateMany = jest.fn().mockResolvedValue({ count: 0 });

      await expect(
        service.confirmAutoBalancedTeams("host-1", "room-1"),
      ).rejects.toThrow("편성이 변경 중이거나 이미 확정");
    });

    it("대진 생성 실패 시 오토밸런싱 검토 상태로 복구한다", async () => {
      prisma.room.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const restoredRoom = {
        id: "room-1",
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.DRAFT_COMPLETED,
      };
      jest.spyOn(service, "getRoomById").mockResolvedValue(restoredRoom as any);

      await expect(service.restoreAutoBalanceReview("room-1")).resolves.toEqual(
        restoredRoom,
      );
      expect(prisma.room.updateMany).toHaveBeenCalledWith({
        where: {
          id: "room-1",
          teamMode: TeamMode.AUTO_BALANCE,
          status: RoomStatus.ROLE_SELECTION,
        },
        data: { status: RoomStatus.DRAFT_COMPLETED },
      });
    });
  });

  describe("자동 밸런스 되감기", () => {
    const snapshot = {
      teams: [
        {
          captainId: "user-a",
          members: [{ userId: "user-a", assignedRole: "TOP" }],
        },
      ],
    };

    const setup = (history: any[], overrides: Record<string, any> = {}) => {
      prisma.room.findUnique.mockResolvedValue({
        hostId: "host-1",
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.DRAFT_COMPLETED,
        ...overrides,
      });
      prisma.match = { count: jest.fn().mockResolvedValue(0) };
      prisma.room.update = jest.fn();
      prisma.team.create = jest.fn().mockResolvedValue({ id: "team-new" });
      prisma.teamMember = { createMany: jest.fn() };
      prisma.roomParticipant.updateMany = jest.fn();
      prisma.roomParticipant.findMany = jest
        .fn()
        .mockResolvedValue([{ userId: "user-a", user: { username: "userA" } }]);
      redis.get.mockResolvedValue(JSON.stringify(history));
      jest.spyOn(service as any, "clearTeamSetup").mockResolvedValue(undefined);
      jest
        .spyOn(service as any, "getRoomById")
        .mockResolvedValue({ id: "room-1" });
    };

    it("직전 편성을 복원하고 이력에서 뺀다", async () => {
      setup([snapshot]);

      await service.undoAutoBalancedTeams("host-1", "room-1");

      // 저장된 팀장·라인 그대로 팀을 다시 만든다.
      expect(prisma.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ captainId: "user-a" }),
        }),
      );
      expect(prisma.teamMember.createMany).toHaveBeenCalledWith({
        data: [{ teamId: "team-new", userId: "user-a", assignedRole: "TOP" }],
      });
      // 되감았으니 재편성 횟수도 줄인다.
      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: "room-1" },
        data: { autoBalanceRerollCount: { decrement: 1 } },
      });
      // 이력에서 하나 빠진 상태로 다시 저장된다.
      expect(redis.set).toHaveBeenCalledWith(
        "room:auto-balance-history:room-1",
        JSON.stringify([]),
        expect.any(Number),
      );
    });

    it("되감을 이력이 없으면 막는다", async () => {
      setup([]);

      await expect(
        service.undoAutoBalancedTeams("host-1", "room-1"),
      ).rejects.toThrow("더 되감을 편성이 없습니다");
    });

    it("방장이 아니면 되감을 수 없다", async () => {
      setup([snapshot]);

      await expect(
        service.undoAutoBalancedTeams("other", "room-1"),
      ).rejects.toThrow("방장만");
    });

    it("대진표가 생성된 뒤에는 되감을 수 없다", async () => {
      setup([snapshot]);
      prisma.match.count.mockResolvedValue(2);

      await expect(
        service.undoAutoBalancedTeams("host-1", "room-1"),
      ).rejects.toThrow("대진표가 이미 생성");
    });
  });

  describe("자동 밸런스 자리 교체", () => {
    const setupRoom = (overrides: Record<string, any> = {}) => {
      prisma.room.findUnique.mockResolvedValue({
        hostId: "host-1",
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.DRAFT_COMPLETED,
        ...overrides,
      });
      prisma.match = { count: jest.fn().mockResolvedValue(0) };
      prisma.teamMember = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "tm-a",
            userId: "user-a",
            teamId: "team-1",
            assignedRole: "TOP",
            team: { id: "team-1", captainId: "user-a" },
          },
          {
            id: "tm-b",
            userId: "user-b",
            teamId: "team-2",
            assignedRole: "MID",
            team: { id: "team-2", captainId: "other" },
          },
        ]),
        update: jest.fn(),
      };
      prisma.roomParticipant.updateMany = jest.fn();
      prisma.team.update = jest.fn();
      prisma.user = {
        findUnique: jest.fn().mockResolvedValue({ username: "userB" }),
      };
      jest
        .spyOn(service as any, "getRoomById")
        .mockResolvedValue({ id: "room-1" });
    };

    it("두 인원의 팀과 배정 라인을 맞바꾼다", async () => {
      setupRoom();

      await service.swapAutoBalanceMembers(
        "host-1",
        "room-1",
        "user-a",
        "user-b",
      );

      const updates = prisma.teamMember.update.mock.calls.map(
        (call: any[]) => call[0],
      );
      expect(updates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            where: { id: "tm-a" },
            data: { teamId: "team-2", assignedRole: "MID" },
          }),
          expect.objectContaining({
            where: { id: "tm-b" },
            data: { teamId: "team-1", assignedRole: "TOP" },
          }),
        ]),
      );
    });

    it("팀장이 팀을 옮기면 상대가 팀장을 이어받는다", async () => {
      setupRoom();

      await service.swapAutoBalanceMembers(
        "host-1",
        "room-1",
        "user-a",
        "user-b",
      );

      // user-a 가 team-1 의 팀장이었으므로 들어온 user-b 가 이어받는다.
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: { captainId: "user-b", name: "userB 팀" },
      });
    });

    it("같은 사람을 두 번 고르면 막는다", async () => {
      await expect(
        service.swapAutoBalanceMembers("host-1", "room-1", "user-a", "user-a"),
      ).rejects.toThrow("서로 다른 두 명");
    });

    it("대진표가 생성된 뒤에는 교체할 수 없다", async () => {
      setupRoom();
      prisma.match.count.mockResolvedValue(3);

      await expect(
        service.swapAutoBalanceMembers("host-1", "room-1", "user-a", "user-b"),
      ).rejects.toThrow("대진표가 이미 생성");
    });

    it("확인 단계가 아니면 막는다", async () => {
      setupRoom({ status: RoomStatus.IN_PROGRESS });

      await expect(
        service.swapAutoBalanceMembers("host-1", "room-1", "user-a", "user-b"),
      ).rejects.toThrow("편성 확인 단계");
    });
  });

  describe("자동 밸런스", () => {
    beforeEach(() => {
      // 밸런스 점수는 미리 계산해 둔 캐시에서 읽는다.
      balanceScores.readCached.mockImplementation(() =>
        Object.fromEntries(Object.values(Role).map((role) => [role, 20])),
      );
    });

    it("대표 라이엇 계정이 없는 참가자가 있으면 누구인지 알려주고 중단한다", async () => {
      // 참가 시점엔 대표 계정을 요구하지만, 이후 계정을 지우거나 대표를 옮기면
      // 비게 된다. 임의 점수로 때우면 밸런스가 조용히 틀어지므로 끊어야 한다.
      const participants = Array.from({ length: 10 }, (_, index) => ({
        userId: `user-${index}`,
        id: `participant-${index}`,
        user: {
          username: `user-${index}`,
          riotAccounts: index === 3 ? [] : [{ id: `riot-${index}` }],
        },
      }));
      prisma.room.findUnique.mockResolvedValueOnce({
        id: "room-1",
        hostId: "host-1",
        maxParticipants: 10,
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.WAITING,
        participants,
      });

      await expect(
        service.createAutoBalancedTeams("host-1", "room-1"),
      ).rejects.toThrow("user-3");
    });

    it("팀 멤버를 편성하고 역할 선택 직전 상태로 전환한다", async () => {
      const participants = Array.from({ length: 10 }, (_, index) => ({
        userId: `user-${index}`,
        id: `participant-${index}`,
        user: {
          username: `user-${index}`,
          riotAccounts: [
            {
              id: `riot-${index}`,
              tier: "GOLD",
              rank: "I",
              lp: 0,
              soloWins: 10,
              soloLosses: 10,
              mainRole: Object.values(Role)[index % 5],
              subRole: null,
              roleTiers: [],
            },
          ],
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
      for (const [call] of prisma.teamMember.createMany.mock.calls) {
        expect(call.data).toHaveLength(5);
        expect(
          new Set(call.data.map((member: any) => member.assignedRole)),
        ).toEqual(new Set(Object.values(Role)));
      }
      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: "room-1" },
        data: { status: RoomStatus.DRAFT_COMPLETED, autoBalanceRerollCount: 0 },
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

    it("팀마다 모든 라인을 한 명씩 배정하고 선수를 중복시키지 않는다", () => {
      const roles = Object.values(Role);
      const players = Array.from({ length: 10 }, (_, index) => {
        const mainRole = roles[index % roles.length];
        return {
          participant: {
            id: `participant-${index}`,
            userId: `user-${index}`,
          },
          scores: Object.fromEntries(
            roles.map((role) => [role, role === mainRole ? 35 : 25]),
          ),
          mainRole,
          subRole: null,
          registeredRoleTiers: [mainRole],
        };
      });

      const assignments = (service as any).chooseAutoBalancedAssignments(
        players,
        2,
      );

      expect(assignments).toHaveLength(2);
      expect(
        new Set(
          assignments.flatMap((assignment: any) =>
            assignment.players.map(
              (placement: any) => placement.player.participant.userId,
            ),
          ),
        ).size,
      ).toBe(10);
      for (const assignment of assignments) {
        expect(
          new Set(assignment.players.map((placement: any) => placement.role)),
        ).toEqual(new Set(roles));
        expect(
          assignment.players.every(
            (placement: any) => placement.role === placement.player.mainRole,
          ),
        ).toBe(true);
      }
    });

    it("주 포지션 분포가 부족하면 오프롤을 허용해 모든 라인을 채운다", () => {
      const roles = Object.values(Role);
      const mainRoles = [
        Role.TOP,
        Role.TOP,
        Role.TOP,
        Role.JUNGLE,
        Role.MID,
        Role.MID,
        Role.ADC,
        Role.ADC,
        Role.SUPPORT,
        Role.SUPPORT,
      ];
      const players = mainRoles.map((mainRole, index) => ({
        participant: {
          id: `participant-${index}`,
          userId: `user-${index}`,
        },
        scores: Object.fromEntries(
          roles.map((role) => [role, role === mainRole ? 35 : 30]),
        ),
        mainRole,
        subRole: null,
        registeredRoleTiers: [mainRole],
      }));

      const assignments = (service as any).chooseAutoBalancedAssignments(
        players,
        2,
      );
      const placements = assignments.flatMap(
        (assignment: any) => assignment.players,
      );

      expect(
        placements.some(
          (placement: any) => placement.role !== placement.player.mainRole,
        ),
      ).toBe(true);
      for (const assignment of assignments) {
        expect(
          new Set(assignment.players.map((placement: any) => placement.role)),
        ).toEqual(new Set(roles));
      }
    });
  });
});
