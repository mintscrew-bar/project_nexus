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

describe("RoomService", () => {
  let service: RoomService;
  let prisma: any;
  let shutdownService: any;
  let balanceScores: any;

  const baseDto = {
    name: "테스트 방",
    maxParticipants: 10,
    teamMode: TeamMode.AUCTION,
  };

  beforeEach(async () => {
    balanceScores = {
      readCached: jest.fn().mockReturnValue(null),
      refreshAccount: jest.fn().mockResolvedValue(null),
      refreshUser: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      user: { findUnique: jest.fn() },
      authProvider: { findFirst: jest.fn() },
      riotAccount: { findFirst: jest.fn() },
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
        findFirst: jest.fn(),
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
      ],
    }).compile();

    service = module.get<RoomService>(RoomService);
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
