import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { StatsService } from "./stats.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { RiotMatchService } from "../riot/riot-match.service";
import { RiotService } from "../riot/riot.service";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { getChampionKoreanName } from "@nexus/types";

describe("StatsService", () => {
  let service: StatsService;
  let prisma: any;
  let redis: any;
  let riotMatchService: any;
  let riotService: any;

  beforeEach(async () => {
    // Prisma mock — 실제 DB 연결 없이 단위 테스트
    prisma = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn(),
      },
      knownPuuid: {
        findMany: jest.fn(),
      },
      matchStatsCache: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      matchParticipant: {
        findMany: jest.fn(),
      },
      team: {
        count: jest.fn(),
      },
      teamMember: {
        findMany: jest.fn(),
      },
      riotAccount: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      riotMatchCache: {
        findMany: jest.fn(),
      },
    };

    // Redis mock — 캐시 히트/미스 시나리오 제어용
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue("OK"),
    };

    // Riot API mock — 외부 API 호출 방지
    riotMatchService = {
      getMatchHistoryByPuuid: jest.fn(),
      getMatchIdsByPuuid: jest.fn(),
      getMatchById: jest.fn(),
    };

    riotService = {
      getSummonerByRiotId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: RiotMatchService, useValue: riotMatchService },
        { provide: RiotService, useValue: riotService },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
  });

  // ============================================================
  // getUserChampionStats — 챔피언 통계 한글명 포함 검증
  // ============================================================

  describe("getUserChampionStats", () => {
    const userId = "user-1";

    // 기본 유저 mock — 프라이버시 설정 없음(공개 상태)
    const mockUser = {
      id: userId,
      username: "테스터",
      settings: null,
    };

    it("유저가 없으면 NotFoundException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserChampionStats(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("응답에 championNameKorean 필드가 포함된다", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          kills: 5,
          deaths: 2,
          assists: 8,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 10,
          goldEarned: 12000,
          totalDamageDealtToChampions: 25000,
          win: true,
        },
      ]);

      const result = await service.getUserChampionStats(userId);

      // championNameKorean 필드가 존재해야 함
      expect(result[0]).toHaveProperty("championNameKorean");
    });

    it("외부 Riot 인제스트 매치를 제외하고 Nexus 내전만 조회한다", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.matchParticipant.findMany.mockResolvedValue([]);

      await service.getUserChampionStats(userId);

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            match: {
              roomId: { not: null },
            },
          },
        }),
      );
    });

    it("championNameKorean이 getChampionKoreanName('Ahri') 결과와 일치한다", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          kills: 5,
          deaths: 2,
          assists: 8,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 10,
          goldEarned: 12000,
          totalDamageDealtToChampions: 25000,
          win: true,
        },
      ]);

      const result = await service.getUserChampionStats(userId);

      // 하드코딩 금지 — 실제 매핑 함수 결과와 비교
      expect(result[0].championNameKorean).toBe(getChampionKoreanName("Ahri"));
    });

    it("'아리' 챔피언의 한글명이 올바르게 반환된다", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          kills: 5,
          deaths: 2,
          assists: 8,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 10,
          goldEarned: 12000,
          totalDamageDealtToChampions: 25000,
          win: true,
        },
      ]);

      const result = await service.getUserChampionStats(userId);

      expect(result[0].championNameKorean).toBe("아리");
    });

    it("여러 챔피언을 사용한 경우 각각 올바른 한글명을 가진다", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      // 서로 다른 두 챔피언으로 mock 데이터 설정
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          kills: 10,
          deaths: 3,
          assists: 15,
          totalMinionsKilled: 200,
          neutralMinionsKilled: 5,
          goldEarned: 15000,
          totalDamageDealtToChampions: 30000,
          win: true,
        },
        {
          championId: 238,
          championName: "Zed",
          kills: 8,
          deaths: 4,
          assists: 3,
          totalMinionsKilled: 180,
          neutralMinionsKilled: 20,
          goldEarned: 13000,
          totalDamageDealtToChampions: 28000,
          win: false,
        },
      ]);

      const result = await service.getUserChampionStats(userId);

      // 각 챔피언의 한글명이 매핑 함수와 일치해야 함
      const ahriStats = result.find((r) => r.championName === "Ahri");
      const zedStats = result.find((r) => r.championName === "Zed");

      expect(ahriStats?.championNameKorean).toBe(getChampionKoreanName("Ahri"));
      expect(zedStats?.championNameKorean).toBe(getChampionKoreanName("Zed"));
    });

    it("동일 챔피언을 여러 게임 플레이해도 championNameKorean이 유지된다", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      // 같은 챔피언으로 3게임 기록
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          kills: 5,
          deaths: 2,
          assists: 8,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 10,
          goldEarned: 12000,
          totalDamageDealtToChampions: 25000,
          win: true,
        },
        {
          championId: 103,
          championName: "Ahri",
          kills: 3,
          deaths: 5,
          assists: 6,
          totalMinionsKilled: 120,
          neutralMinionsKilled: 8,
          goldEarned: 10000,
          totalDamageDealtToChampions: 18000,
          win: false,
        },
        {
          championId: 103,
          championName: "Ahri",
          kills: 8,
          deaths: 1,
          assists: 12,
          totalMinionsKilled: 200,
          neutralMinionsKilled: 15,
          goldEarned: 18000,
          totalDamageDealtToChampions: 35000,
          win: true,
        },
      ]);

      const result = await service.getUserChampionStats(userId);

      // 3게임이 집계되어 단일 항목으로 반환되어야 함
      expect(result).toHaveLength(1);
      expect(result[0].games).toBe(3);
      // 한글명은 3게임 집계 이후에도 올바르게 유지되어야 함
      expect(result[0].championNameKorean).toBe("아리");
    });

    it("프라이버시 설정(showChampionStats=false)이면 빈 배열을 반환한다", async () => {
      const requesterId = "other-user";
      // showChampionStats를 false로 설정한 유저
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        settings: { showChampionStats: false },
      });

      const result = await service.getUserChampionStats(userId, requesterId);

      expect(result).toEqual([]);
    });

    it("매핑이 없는 챔피언명은 원래 영문명이 그대로 반환된다", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      // 매핑에 없는 가상의 챔피언명 사용
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 9999,
          championName: "UnknownChamp",
          kills: 5,
          deaths: 2,
          assists: 3,
          totalMinionsKilled: 100,
          neutralMinionsKilled: 5,
          goldEarned: 8000,
          totalDamageDealtToChampions: 15000,
          win: true,
        },
      ]);

      const result = await service.getUserChampionStats(userId);

      // 매핑이 없으면 getChampionKoreanName이 원래 영문명을 반환
      expect(result[0].championNameKorean).toBe(
        getChampionKoreanName("UnknownChamp"),
      );
    });
  });

  describe("getUserPositionStats", () => {
    const userId = "user-1";

    it("외부 Riot 인제스트 매치를 제외하고 Nexus 내전만 조회한다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        username: "테스터",
        settings: null,
      });
      prisma.matchParticipant.findMany.mockResolvedValue([]);

      await service.getUserPositionStats(userId);

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            match: {
              roomId: { not: null },
            },
          },
        }),
      );
    });
  });

  // ============================================================
  // getRankedChampionStats — 랭크 챔피언 통계 한글명 포함 검증
  // ============================================================

  describe("getRankedChampionStats", () => {
    const gameName = "테스터";
    const tagLine = "KR1";

    it("랭크 캐시 응답에서 stats 배열만 반환한다", async () => {
      const cacheSpy = jest
        .spyOn(service, "getChampionStatsCacheByRiotId")
        .mockResolvedValue({
          queueGroup: "ranked",
          matchCount: 2,
          isPartial: false,
          computedAt: "2026-04-17T00:00:00.000Z",
          stats: [
            {
              championId: 103,
              championName: "Ahri",
              championNameKorean: "아리",
              games: 2,
              wins: 1,
              losses: 1,
              kills: 12,
              deaths: 6,
              assists: 16,
            },
          ],
        });

      const result = await service.getRankedChampionStats(gameName, tagLine);

      expect(cacheSpy).toHaveBeenCalledWith(gameName, tagLine, "ranked");
      expect(result).toEqual([
        {
          championId: 103,
          championName: "Ahri",
          championNameKorean: "아리",
          games: 2,
          wins: 1,
          losses: 1,
          kills: 12,
          deaths: 6,
          assists: 16,
        },
      ]);
    });

    it("소환사를 찾을 수 없으면 NotFoundException을 그대로 전달한다", async () => {
      jest
        .spyOn(service, "getChampionStatsCacheByRiotId")
        .mockRejectedValue(new NotFoundException("Summoner not found"));

      await expect(
        service.getRankedChampionStats(gameName, tagLine),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getChampionStatsCacheByUserId", () => {
    it("랭크 통계 계산 시 정형 MatchParticipant 행에서 recentGames를 산출한다", async () => {
      prisma.matchStatsCache.findUnique.mockResolvedValue(null);
      prisma.riotAccount.findMany.mockResolvedValue([{ puuid: "puuid-1" }]);
      // 새 경로: riotMatchCache 풀스캔 대신 MatchParticipant를 puuid 기반으로 직접 조회
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          kills: 8,
          deaths: 2,
          assists: 10,
          riotTeamId: 100,
          totalDamageDealtToChampions: 24000,
          win: true,
          match: {
            completedAt: new Date("2026-04-17T12:00:00.000Z"),
            createdAt: new Date("2026-04-17T12:30:00.000Z"),
            participants: [
              { riotTeamId: 100, totalDamageDealtToChampions: 24000 },
              { riotTeamId: 100, totalDamageDealtToChampions: 16000 },
              { riotTeamId: 200, totalDamageDealtToChampions: 30000 },
            ],
          },
        },
        {
          championId: 103,
          championName: "Ahri",
          kills: 4,
          deaths: 4,
          assists: 6,
          riotTeamId: 200,
          totalDamageDealtToChampions: 18000,
          win: false,
          match: {
            completedAt: new Date("2026-04-16T12:00:00.000Z"),
            createdAt: new Date("2026-04-16T12:30:00.000Z"),
            participants: [
              { riotTeamId: 200, totalDamageDealtToChampions: 18000 },
              { riotTeamId: 200, totalDamageDealtToChampions: 22000 },
              { riotTeamId: 100, totalDamageDealtToChampions: 30000 },
            ],
          },
        },
      ]);
      prisma.knownPuuid.findMany.mockResolvedValue([
        {
          rankedFetchedAt: new Date(),
          normalFetchedAt: new Date(),
          aramFetchedAt: new Date(),
        },
      ]);

      await service.getChampionStatsCacheByUserId("user-1", "ranked");

      expect(prisma.matchStatsCache.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            recentGames: {
              last20: {
                wins: 1,
                games: 2,
                avgKda: 5.75,
                avgDamageShare: 0.525,
              },
              lastPlayedAt: "2026-04-17T12:00:00.000Z",
            },
          }),
        }),
      );
    });

    it("custom queueGroup도 캐시에 upsert하고 recentGames를 저장한다", async () => {
      prisma.matchStatsCache.findUnique.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          games: BigInt(1),
          wins: BigInt(1),
          kills: 10,
          deaths: 2,
          assists: 8,
          avgKda: 9,
          avgDamage: 20000,
          avgGold: 0,
        },
      ]);
      prisma.matchParticipant.findMany.mockResolvedValue([
        {
          championId: 103,
          championName: "Ahri",
          kills: 10,
          deaths: 2,
          assists: 8,
          teamId: "team-a",
          totalDamageDealtToChampions: 20000,
          win: true,
          match: {
            createdAt: new Date("2026-04-15T09:00:00.000Z"),
            participants: [
              { teamId: "team-a", totalDamageDealtToChampions: 20000 },
              { teamId: "team-a", totalDamageDealtToChampions: 10000 },
              { teamId: "team-b", totalDamageDealtToChampions: 15000 },
            ],
          },
        },
      ]);

      await service.getChampionStatsCacheByUserId("user-1", "custom");

      expect(prisma.matchStatsCache.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            queueGroup: "custom",
            recentGames: {
              last20: {
                wins: 1,
                games: 1,
                avgKda: 9,
                avgDamageShare: 0.6667,
              },
              lastPlayedAt: "2026-04-15T09:00:00.000Z",
            },
          }),
        }),
      );
    });
  });

  describe("getLabUserProfileFallback", () => {
    it("내전 10판 미만이면 ranked fallback 요약을 반환한다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        settings: { showChampionStats: true },
      });

      jest
        .spyOn(service, "getChampionStatsCacheByUserId")
        .mockResolvedValueOnce({
          queueGroup: "custom",
          matchCount: 4,
          isPartial: false,
          computedAt: "2026-04-17T00:00:00.000Z",
          stats: [],
        })
        .mockResolvedValueOnce({
          queueGroup: "ranked",
          matchCount: 8,
          isPartial: false,
          computedAt: "2026-04-17T00:00:00.000Z",
          stats: [
            {
              championId: 103,
              championName: "Ahri",
              championNameKorean: "아리",
              games: 5,
              wins: 3,
              losses: 2,
              kills: 25,
              deaths: 10,
              assists: 30,
            },
            {
              championId: 238,
              championName: "Zed",
              championNameKorean: "제드",
              games: 3,
              wins: 1,
              losses: 2,
              kills: 18,
              deaths: 12,
              assists: 9,
            },
          ],
        });

      const result = await service.getLabUserProfileFallback(
        "user-1",
        "viewer-1",
      );

      expect(result.customGames).toBe(4);
      expect(result.summary.rankedGames).toBe(8);
      expect(result.summary.wins).toBe(4);
      expect(result.summary.losses).toBe(4);
      expect(result.summary.winRate).toBe(0.5);
      expect(result.summary.avgKda).toBe(3.73);
      expect(result.champions[0].winRate).toBe(0.6);
      expect(result.champions[0].avgKda).toBe(5.5);
    });

    it("내전 10판 이상이면 fallback을 열지 않는다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        settings: { showChampionStats: true },
      });

      jest
        .spyOn(service, "getChampionStatsCacheByUserId")
        .mockResolvedValueOnce({
          queueGroup: "custom",
          matchCount: 10,
          isPartial: false,
          computedAt: "2026-04-17T00:00:00.000Z",
          stats: [],
        })
        .mockResolvedValueOnce({
          queueGroup: "ranked",
          matchCount: 0,
          isPartial: false,
          computedAt: "2026-04-17T00:00:00.000Z",
          stats: [],
        });

      await expect(
        service.getLabUserProfileFallback("user-1", "viewer-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("showChampionStats=false면 fallback도 비공개 처리한다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        settings: { showChampionStats: false },
      });

      await expect(
        service.getLabUserProfileFallback("user-1", "viewer-1"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getLabUserProfileComparison", () => {
    it("ranked와 custom 캐시를 합쳐 비교 응답을 만든다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        settings: { showChampionStats: true },
      });

      jest
        .spyOn(service, "getChampionStatsCacheByUserId")
        .mockResolvedValueOnce({
          queueGroup: "ranked",
          matchCount: 10,
          isPartial: false,
          computedAt: "2026-04-17T00:00:00.000Z",
          stats: [
            {
              championId: 103,
              championName: "Ahri",
              championNameKorean: "아리",
              games: 6,
              wins: 3,
              losses: 3,
              kills: 24,
              deaths: 12,
              assists: 24,
            },
            {
              championId: 238,
              championName: "Zed",
              championNameKorean: "제드",
              games: 4,
              wins: 2,
              losses: 2,
              kills: 20,
              deaths: 12,
              assists: 8,
            },
          ],
        })
        .mockResolvedValueOnce({
          queueGroup: "custom",
          matchCount: 6,
          isPartial: false,
          computedAt: "2026-04-17T00:00:00.000Z",
          stats: [
            {
              championId: 103,
              championName: "Ahri",
              championNameKorean: "아리",
              games: 4,
              wins: 4,
              losses: 0,
              kills: 18,
              deaths: 4,
              assists: 22,
            },
            {
              championId: 266,
              championName: "Aatrox",
              championNameKorean: "아트록스",
              games: 2,
              wins: 1,
              losses: 1,
              kills: 9,
              deaths: 8,
              assists: 10,
            },
          ],
        });

      const result = await service.getLabUserProfileComparison(
        "user-1",
        "viewer-1",
      );

      expect(result.summary.rankedGames).toBe(10);
      expect(result.summary.customGames).toBe(6);
      expect(result.summary.rankedWinRate).toBe(0.5);
      expect(result.summary.customWinRate).toBe(0.8333);
      expect(result.summary.winRateDelta).toBe(0.3333);
      expect(result.champions[0].championName).toBe("Ahri");
      expect(result.champions[0].signal).toBe("scrim-favored");
      expect(result.champions[0].delta.winRate).toBe(0.5);
      expect(result.champions[1].championName).toBe("Zed");
      expect(result.champions[1].signal).toBe("insufficient-data");
    });
  });
});
