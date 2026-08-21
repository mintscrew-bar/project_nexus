import { Test, TestingModule } from "@nestjs/testing";
import { MatchService } from "./match.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { RiotTournamentService } from "../riot/riot-tournament.service";
import { MatchDataCollectionService } from "./match-data-collection.service";
import { NotificationService } from "../notification/notification.service";
import { MatchBracketService } from "./match-bracket.service";
import { MatchAdvancementService } from "./match-advancement.service";
import { MatchSeriesService } from "./match-series.service";
import { BalanceScoreService } from "../common/balance-score.service";
import {
  getChampionKoreanName,
  getSummonerSpellKoreanName,
} from "@nexus/types";

describe("MatchService", () => {
  let service: MatchService;
  let prisma: any;

  beforeEach(async () => {
    // Prisma mock — 실제 DB 연결 없이 단위 테스트
    prisma = {
      match: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      matchParticipant: {
        findMany: jest.fn(),
      },
      matchRosterSnapshot: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      matchDraftSnapshot: {
        createMany: jest.fn(),
      },
      team: {
        findUnique: jest.fn(),
      },
      teamMember: {
        findMany: jest.fn(),
      },
      room: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prisma),
      ),
    };

    // 각 외부 의존 서비스 mock — 실제 동작 불필요
    const mockConfigService = { get: jest.fn().mockReturnValue(null) };
    const mockRiotTournamentService = {
      createTournamentCode: jest.fn().mockResolvedValue("NEXUS-TEST"),
    };
    const mockMatchDataCollectionService = {
      collectMatchData: jest.fn().mockResolvedValue(undefined),
    };
    const mockNotificationService = {
      notifyMatchStarting: jest.fn().mockResolvedValue(undefined),
      notifyMatchResult: jest.fn().mockResolvedValue(undefined),
    };
    const mockMatchBracketService = {
      generateBracket: jest.fn(),
    };
    const mockMatchAdvancementService = {
      advanceWinnerToNextRound: jest.fn().mockResolvedValue(false),
      advanceDoubleElimination: jest.fn().mockResolvedValue(undefined),
      checkBracketCompletion: jest.fn().mockResolvedValue(false),
    };
    const mockMatchSeriesService = {
      applyGameResult: jest.fn().mockResolvedValue(null),
      getRoomSeriesScores: jest.fn().mockResolvedValue([]),
      assignTeam: jest.fn().mockResolvedValue(undefined),
      hasSeries: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RiotTournamentService, useValue: mockRiotTournamentService },
        {
          provide: MatchDataCollectionService,
          useValue: mockMatchDataCollectionService,
        },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: MatchBracketService, useValue: mockMatchBracketService },
        {
          provide: MatchAdvancementService,
          useValue: mockMatchAdvancementService,
        },
        { provide: MatchSeriesService, useValue: mockMatchSeriesService },
        {
          provide: BalanceScoreService,
          useValue: { readCached: jest.fn().mockReturnValue(null) },
        },
        // Optional 의존성 — Discord 서비스는 테스트에서 불필요
        { provide: "DISCORD_BOT_SERVICE", useValue: null },
        { provide: "DISCORD_VOICE_SERVICE", useValue: null },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
  });

  describe("방이 정리된 매치의 투표", () => {
    // 운영 실측: 완료된 내전 8건 전부 teamAId/winnerId 가 NULL 이고
    // 팀·팀멤버 행이 0개다. 그래서 투표·평가가 전원 차단돼 있었다.
    const archived = {
      id: "match-1",
      status: "COMPLETED",
      teamAId: null,
      teamBId: null,
      winnerId: null,
      teamAIdSnapshot: "team-a",
      teamBIdSnapshot: "team-b",
      winnerIdSnapshot: "team-a",
      teamA: null,
      teamB: null,
      rosterSnapshots: [
        { userId: "winner-1", teamSlot: "A" },
        { userId: "winner-2", teamSlot: "A" },
        { userId: "loser-1", teamSlot: "B" },
      ],
    };

    beforeEach(() => {
      prisma.match.findUnique.mockResolvedValue(archived);
      prisma.matchVote = { create: jest.fn(), findMany: jest.fn() };
      prisma.match.update = jest.fn();
    });

    it("스냅샷 참가자의 MVP 투표를 허용한다", async () => {
      jest
        .spyOn(service as any, "recalculateVoteWinnerTx")
        .mockResolvedValue(undefined);

      await expect(
        service.submitVote("winner-2", "match-1", "winner-1", "MVP" as never),
      ).resolves.toEqual({ message: "투표가 완료되었습니다." });
    });

    it("참가하지 않은 유저는 여전히 막는다", async () => {
      await expect(
        service.submitVote("outsider", "match-1", "winner-1", "MVP" as never),
      ).rejects.toThrow("해당 경기 참가자만 투표할 수 있습니다.");
    });

    it("MVP 대상이 진 팀이면 막는다", async () => {
      await expect(
        service.submitVote("winner-2", "match-1", "loser-1", "MVP" as never),
      ).rejects.toThrow("MVP는 이긴 팀 멤버만 선택할 수 있습니다.");
    });

    it("ACE 대상이 이긴 팀이면 막는다", async () => {
      await expect(
        service.submitVote("winner-2", "match-1", "winner-1", "ACE" as never),
      ).rejects.toThrow("ACE는 진 팀 멤버만 선택할 수 있습니다.");
    });
  });

  describe("매치 종료 스냅샷", () => {
    it("상태 전환과 방, 팀, 승자, 로스터를 한 트랜잭션에서 기록한다", async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: "match-1",
        winnerId: "team-a",
        room: {
          id: "room-1",
          name: "여름 내전",
          isPrivate: false,
          teamMode: "MANUAL_TEAM",
          host: { id: "host-1", username: "방장" },
        },
        teamA: {
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
        teamB: {
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
      });
      prisma.match.updateMany.mockResolvedValue({ count: 1 });

      await (service as any).completeInternalMatchWithSnapshot(
        "match-1",
        "team-a",
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.match.updateMany).toHaveBeenCalledWith({
        where: { id: "match-1", status: "IN_PROGRESS" },
        data: expect.objectContaining({
          status: "COMPLETED",
          winnerId: "team-a",
        }),
      });
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "match-1" },
        data: expect.objectContaining({
          isInternal: true,
          roomIdSnapshot: "room-1",
          roomName: "여름 내전",
          roomIsPrivate: false,
          teamAIdSnapshot: "team-a",
          teamBIdSnapshot: "team-b",
          winnerIdSnapshot: "team-a",
          winnerName: "A팀",
        }),
      });
      expect(prisma.matchRosterSnapshot.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: "user-a",
            puuid: "puuid-a",
            teamIdSnapshot: "team-a",
          }),
          expect.objectContaining({
            userId: "user-b",
            puuid: "puuid-b",
            teamIdSnapshot: "team-b",
          }),
        ]),
      });
    });
  });

  describe("공개 완료 경기", () => {
    it("공개 여부가 확인되고 실제 기록이 있는 경기만 사이트맵 후보로 반환한다", async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: "match-public",
          completedAt: new Date("2026-08-20T12:00:00.000Z"),
          updatedAt: new Date("2026-08-20T12:05:00.000Z"),
        },
      ]);

      const result = await service.getPublicCompletedMatches(100);

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isInternal: true,
            status: "COMPLETED",
            OR: expect.arrayContaining([{ roomIsPrivate: false }]),
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { participants: { some: {} } },
                  { draftSnapshots: { some: {} } },
                ]),
              }),
            ]),
          }),
          take: 100,
        }),
      );
      expect(result).toHaveLength(1);
    });

    it("비공개이거나 공개 여부를 확인할 수 없는 경기는 공개 상세에서 거부한다", async () => {
      prisma.match.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublicMatchDetails("match-private"),
      ).rejects.toThrow("Public match not found");
    });
  });

  describe("getUserMatches", () => {
    it("방 재사용 뒤에도 로스터 스냅샷으로 내 경기를 복원한다", async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: "match-1",
          room: null,
          roomIdSnapshot: "room-old",
          roomName: "지난 내전",
          teamA: null,
          teamAIdSnapshot: "team-a",
          teamAName: "A팀",
          teamB: null,
          teamBIdSnapshot: "team-b",
          teamBName: "B팀",
          winner: null,
          winnerIdSnapshot: "team-a",
          winnerName: "A팀",
          rosterSnapshots: [
            {
              userId: "user-1",
              username: "선수1",
              teamSlot: "A",
              user: { id: "user-1", username: "선수1", avatar: null },
            },
          ],
        },
      ]);

      const result = await service.getUserMatches("user-1");

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { rosterSnapshots: { some: { userId: "user-1" } } },
            ]),
          }),
        }),
      );
      expect(result[0]).toEqual(
        expect.objectContaining({
          room: { id: "room-old", name: "지난 내전" },
          teamA: expect.objectContaining({ id: "team-a", name: "A팀" }),
          winner: { id: "team-a", name: "A팀" },
        }),
      );
    });
  });

  describe("getRpsContext", () => {
    it("봇 캡틴 여부와 username을 포함해 반환한다", async () => {
      prisma.match.findUnique.mockResolvedValue({
        teamAId: "team-a",
        teamBId: "team-b",
        status: "PENDING",
        blueSideTeamId: null,
        seriesId: null,
        gameNumber: 1,
        teamA: {
          captainId: "captain-a",
          name: "팀A",
          captain: { id: "captain-a", username: "testbot_12" },
        },
        teamB: {
          captainId: "captain-b",
          name: "팀B",
          captain: { id: "captain-b", username: "real_user" },
        },
        room: { hostId: "host-1" },
      });

      const result = await service.getRpsContext("match-1");

      expect(result.captainAUsername).toBe("testbot_12");
      expect(result.captainBUsername).toBe("real_user");
      expect(result.captainAIsBot).toBe(true);
      expect(result.captainBIsBot).toBe(false);
    });

    it("다전제 2세트는 저장된 자동 교대 진영으로 시작한다", async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: "match-2",
        teamAId: "team-a",
        teamBId: "team-b",
        status: "PENDING",
        blueSideTeamId: "team-b",
        seriesId: "series-1",
        gameNumber: 2,
        teamA: {
          captainId: "captain-a",
          name: "팀A",
          captain: { id: "captain-a", username: "captain_a" },
        },
        teamB: {
          captainId: "captain-b",
          name: "팀B",
          captain: { id: "captain-b", username: "captain_b" },
        },
        room: { hostId: "host-1" },
      });

      const result = await service.getRpsContext("match-2");

      expect(result.autoSideSwap).toBe(true);
      expect(result.blueSideTeamId).toBe("team-b");
      expect(prisma.match.findFirst).not.toHaveBeenCalled();
    });

    it("진영이 비어 있는 2세트는 직전 세트 반대 진영으로 복구한다", async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: "match-2",
        teamAId: "team-a",
        teamBId: "team-b",
        status: "PENDING",
        blueSideTeamId: null,
        seriesId: "series-1",
        gameNumber: 2,
        teamA: {
          captainId: "captain-a",
          name: "팀A",
          captain: { id: "captain-a", username: "captain_a" },
        },
        teamB: {
          captainId: "captain-b",
          name: "팀B",
          captain: { id: "captain-b", username: "captain_b" },
        },
        room: { hostId: "host-1" },
      });
      prisma.match.findFirst.mockResolvedValue({
        blueSideTeamId: "team-a",
      });
      prisma.match.update.mockResolvedValue({});

      const result = await service.getRpsContext("match-2");

      expect(result.blueSideTeamId).toBe("team-b");
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "match-2" },
        data: { blueSideTeamId: "team-b" },
      });
    });
  });

  // ============================================================
  // getUserMatchHistory — 한글 필드 포함 검증
  // ============================================================

  describe("getUserMatchHistory", () => {
    const userId = "user-1";

    it("응답의 participant에 championNameKorean 필드가 포함된다", async () => {
      // 아리를 사용한 매치 기록 mock
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 4, // 점멸
          summoner2Id: 14, // 점화
          position: "MIDDLE",
          kills: 8,
          deaths: 2,
          assists: 10,
          win: true,
          totalDamageDealtToChampions: 28000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: { id: "team-a", name: "팀A" },
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      // participant에 championNameKorean이 있어야 함
      expect(result[0].participant).toHaveProperty("championNameKorean");
    });

    it("championName이 Ahri일 때 championNameKorean이 '아리'다", async () => {
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 4,
          summoner2Id: 14,
          position: "MIDDLE",
          kills: 8,
          deaths: 2,
          assists: 10,
          win: true,
          totalDamageDealtToChampions: 28000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: { id: "team-a", name: "팀A" },
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      // 하드코딩 금지 — 매핑 함수 결과와 비교
      expect(result[0].participant.championNameKorean).toBe(
        getChampionKoreanName("Ahri"),
      );
      expect(result[0].participant.championNameKorean).toBe("아리");
    });

    it("응답의 participant에 summoner1Korean, summoner2Korean 필드가 포함된다", async () => {
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 4,
          summoner2Id: 14,
          position: "MIDDLE",
          kills: 8,
          deaths: 2,
          assists: 10,
          win: true,
          totalDamageDealtToChampions: 28000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: { id: "team-a", name: "팀A" },
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      expect(result[0].participant).toHaveProperty("summoner1Korean");
      expect(result[0].participant).toHaveProperty("summoner2Korean");
    });

    it("summoner1Id가 4이면 summoner1Korean이 '점멸'이다", async () => {
      // summoner1Id=4 → 점멸(SummonerFlash)
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 4, // SummonerFlash — 점멸
          summoner2Id: 14, // SummonerDot — 점화
          position: "MIDDLE",
          kills: 5,
          deaths: 3,
          assists: 7,
          win: true,
          totalDamageDealtToChampions: 20000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: null,
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      // 하드코딩 금지 — 매핑 함수 결과와 비교
      expect(result[0].participant.summoner1Korean).toBe(
        getSummonerSpellKoreanName(4),
      );
      expect(result[0].participant.summoner1Korean).toBe("점멸");
    });

    it("summoner2Id가 14이면 summoner2Korean이 '점화'다", async () => {
      // summoner2Id=14 → 점화(SummonerDot)
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 4,
          summoner2Id: 14,
          position: "MIDDLE",
          kills: 5,
          deaths: 3,
          assists: 7,
          win: false,
          totalDamageDealtToChampions: 18000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: null,
          },
          team: { id: "team-b", name: "팀B", color: "red" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      expect(result[0].participant.summoner2Korean).toBe(
        getSummonerSpellKoreanName(14),
      );
      expect(result[0].participant.summoner2Korean).toBe("점화");
    });

    it("summoner1Id=11(강타), summoner2Id=12(순간이동) 올바르게 변환된다", async () => {
      // 정글러 소환사 주문 조합 — 강타 + 순간이동
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 60,
          championName: "Elise",
          summoner1Id: 11, // SummonerSmite — 강타
          summoner2Id: 12, // SummonerTeleport — 순간이동
          position: "JUNGLE",
          kills: 3,
          deaths: 1,
          assists: 8,
          win: true,
          totalDamageDealtToChampions: 12000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: { id: "team-a", name: "팀A" },
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      expect(result[0].participant.summoner1Korean).toBe(
        getSummonerSpellKoreanName(11),
      );
      expect(result[0].participant.summoner1Korean).toBe("강타");
      expect(result[0].participant.summoner2Korean).toBe(
        getSummonerSpellKoreanName(12),
      );
      expect(result[0].participant.summoner2Korean).toBe("순간이동");
    });

    it("매핑이 없는 소환사 주문 ID는 숫자 문자열로 반환된다", async () => {
      // 매핑에 없는 가상의 소환사 주문 ID
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 9999, // 매핑에 없는 ID
          summoner2Id: 8888, // 매핑에 없는 ID
          position: "MIDDLE",
          kills: 5,
          deaths: 2,
          assists: 6,
          win: true,
          totalDamageDealtToChampions: 22000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: null,
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      // 매핑이 없으면 getSummonerSpellKoreanName이 숫자 문자열을 반환
      expect(result[0].participant.summoner1Korean).toBe(
        getSummonerSpellKoreanName(9999),
      );
      expect(result[0].participant.summoner2Korean).toBe(
        getSummonerSpellKoreanName(8888),
      );
    });

    it("여러 매치 기록에서 모든 participant의 한글 필드가 올바르게 설정된다", async () => {
      // 서로 다른 챔피언과 소환사 주문 조합으로 2개 매치 기록
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 4, // 점멸
          summoner2Id: 14, // 점화
          position: "MIDDLE",
          kills: 8,
          deaths: 2,
          assists: 10,
          win: true,
          totalDamageDealtToChampions: 28000,
          createdAt: new Date("2026-04-14"),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: { id: "team-a", name: "팀A" },
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
        {
          matchId: "match-2",
          championId: 238,
          championName: "Zed",
          summoner1Id: 4, // 점멸
          summoner2Id: 6, // 유체화(고스트)
          position: "MIDDLE",
          kills: 12,
          deaths: 4,
          assists: 3,
          win: false,
          totalDamageDealtToChampions: 35000,
          createdAt: new Date("2026-04-13"),
          match: {
            teamA: { id: "team-c", name: "팀C", color: "green" },
            teamB: { id: "team-d", name: "팀D", color: "purple" },
            winner: { id: "team-d", name: "팀D" },
          },
          team: { id: "team-c", name: "팀C", color: "green" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      expect(result).toHaveLength(2);

      // 첫 번째 매치 — 아리, 점멸/점화
      expect(result[0].participant.championNameKorean).toBe("아리");
      expect(result[0].participant.summoner1Korean).toBe("점멸");
      expect(result[0].participant.summoner2Korean).toBe("점화");

      // 두 번째 매치 — Zed, 점멸/유체화
      expect(result[1].participant.championNameKorean).toBe(
        getChampionKoreanName("Zed"),
      );
      expect(result[1].participant.summoner1Korean).toBe(
        getSummonerSpellKoreanName(4),
      );
      expect(result[1].participant.summoner2Korean).toBe(
        getSummonerSpellKoreanName(6),
      );
      expect(result[1].participant.summoner2Korean).toBe("유체화");
    });

    it("매치 기록이 없으면 빈 배열을 반환한다", async () => {
      prisma.matchParticipant.findMany.mockResolvedValue([]);

      const result = await service.getUserMatchHistory(userId);

      expect(result).toEqual([]);
    });

    it("KDA가 사망 0일 때 kills+assists로 계산된다", async () => {
      // deaths=0인 경우 퍼펙트 게임
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          matchId: "match-1",
          championId: 103,
          championName: "Ahri",
          summoner1Id: 4,
          summoner2Id: 14,
          position: "MIDDLE",
          kills: 10,
          deaths: 0, // 무사망
          assists: 5,
          win: true,
          totalDamageDealtToChampions: 40000,
          createdAt: new Date(),
          match: {
            teamA: { id: "team-a", name: "팀A", color: "blue" },
            teamB: { id: "team-b", name: "팀B", color: "red" },
            winner: { id: "team-a", name: "팀A" },
          },
          team: { id: "team-a", name: "팀A", color: "blue" },
        },
      ]);

      const result = await service.getUserMatchHistory(userId);

      // deaths=0이면 KDA = kills + assists (나누기 없음)
      expect(result[0].participant.kda).toBe(15);
      // 한글 필드도 함께 확인
      expect(result[0].participant.championNameKorean).toBe("아리");
    });
  });

  describe("getUserRiotMatchIds", () => {
    it("참가자 전적 저장 전에도 대진 팀 멤버십으로 연결된 내전을 반환한다", async () => {
      prisma.match.findMany.mockResolvedValue([
        { riotMatchId: "KR_100" },
        { riotMatchId: "KR_200" },
      ]);

      const result = await service.getUserRiotMatchIds("user-1");

      expect(prisma.match.findMany).toHaveBeenCalledWith({
        where: {
          isInternal: true,
          riotMatchId: { not: null },
          OR: [
            { teamA: { members: { some: { userId: "user-1" } } } },
            { teamB: { members: { some: { userId: "user-1" } } } },
            { rosterSnapshots: { some: { userId: "user-1" } } },
          ],
        },
        select: { riotMatchId: true },
      });
      expect(prisma.matchParticipant.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(["KR_100", "KR_200"]);
    });
  });
});
