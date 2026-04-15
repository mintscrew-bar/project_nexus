import { Test, TestingModule } from "@nestjs/testing";
import { StatsService } from "./stats.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { RiotMatchService } from "../riot/riot-match.service";
import { RiotService } from "../riot/riot.service";
import { NotFoundException } from "@nestjs/common";
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
      user: {
        findUnique: jest.fn(),
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

      expect(ahriStats?.championNameKorean).toBe(
        getChampionKoreanName("Ahri"),
      );
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

  // ============================================================
  // getRankedChampionStats — 랭크 챔피언 통계 한글명 포함 검증
  // ============================================================

  describe("getRankedChampionStats", () => {
    const gameName = "테스터";
    const tagLine = "KR1";

    it("Redis 캐시가 있으면 캐시 데이터를 반환한다", async () => {
      // 캐시에 이미 데이터가 존재하는 시나리오
      const cachedData = [
        {
          championId: 103,
          championName: "Ahri",
          championNameKorean: "아리",
          games: 5,
          wins: 3,
          losses: 2,
          kills: 25,
          deaths: 10,
          assists: 40,
        },
      ];
      redis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getRankedChampionStats(gameName, tagLine);

      // Redis 캐시 히트 시 Riot API를 호출하지 않아야 함
      expect(riotService.getSummonerByRiotId).not.toHaveBeenCalled();
      expect(result).toEqual(cachedData);
    });

    it("소환사를 찾을 수 없으면 NotFoundException을 던진다", async () => {
      redis.get.mockResolvedValue(null);
      riotService.getSummonerByRiotId.mockResolvedValue(null);

      await expect(
        service.getRankedChampionStats(gameName, tagLine),
      ).rejects.toThrow(NotFoundException);
    });

    it("랭크 매치 ID가 없으면 빈 배열을 반환하고 캐시에 저장한다", async () => {
      redis.get.mockResolvedValue(null);
      riotService.getSummonerByRiotId.mockResolvedValue({
        puuid: "test-puuid-123",
      });
      // 매치 ID가 없는 경우
      riotMatchService.getMatchIdsByPuuid.mockResolvedValue([]);

      const result = await service.getRankedChampionStats(gameName, tagLine);

      expect(result).toEqual([]);
      // 빈 배열도 캐시에 저장되어야 함
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining("stats:ranked-champ:"),
        JSON.stringify([]),
        600,
      );
    });

    it("매치 데이터로 집계 시 championNameKorean 필드가 포함된다", async () => {
      redis.get.mockResolvedValue(null);
      riotService.getSummonerByRiotId.mockResolvedValue({
        puuid: "test-puuid-123",
      });
      // 1개의 랭크 매치 ID 반환 (첫 번째 큐 1개, 두 번째 큐 0개)
      riotMatchService.getMatchIdsByPuuid
        .mockResolvedValueOnce(["KR_123456"])
        .mockResolvedValueOnce([]);

      // DB 캐시 확인: 해당 매치 ID가 캐시에 없음
      prisma.riotMatchCache.findMany.mockResolvedValue([]);

      // Riot API에서 매치 상세 조회 결과 mock
      riotMatchService.getMatchById.mockResolvedValue({
        info: {
          participants: [
            {
              puuid: "test-puuid-123",
              championId: 103,
              championName: "Ahri",
              kills: 8,
              deaths: 2,
              assists: 10,
              win: true,
            },
          ],
        },
      });

      const result = await service.getRankedChampionStats(gameName, tagLine);

      expect(result).toHaveLength(1);
      // championNameKorean 필드 존재 확인
      expect(result[0]).toHaveProperty("championNameKorean");
      // 실제 매핑 함수 결과와 일치 확인
      expect(result[0].championNameKorean).toBe(getChampionKoreanName("Ahri"));
      expect(result[0].championNameKorean).toBe("아리");
    });

    it("집계 결과가 게임 수 내림차순으로 정렬된다", async () => {
      redis.get.mockResolvedValue(null);
      riotService.getSummonerByRiotId.mockResolvedValue({
        puuid: "test-puuid-123",
      });
      // 두 개의 매치 ID: Zed 1게임, Ahri 2게임
      riotMatchService.getMatchIdsByPuuid
        .mockResolvedValueOnce(["KR_1", "KR_2", "KR_3"])
        .mockResolvedValueOnce([]);

      prisma.riotMatchCache.findMany.mockResolvedValue([]);

      // 매치별 다른 챔피언 사용 (Ahri 2회, Zed 1회)
      riotMatchService.getMatchById
        .mockResolvedValueOnce({
          info: {
            participants: [
              {
                puuid: "test-puuid-123",
                championId: 103,
                championName: "Ahri",
                kills: 5,
                deaths: 2,
                assists: 7,
                win: true,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          info: {
            participants: [
              {
                puuid: "test-puuid-123",
                championId: 238,
                championName: "Zed",
                kills: 8,
                deaths: 3,
                assists: 2,
                win: false,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          info: {
            participants: [
              {
                puuid: "test-puuid-123",
                championId: 103,
                championName: "Ahri",
                kills: 10,
                deaths: 1,
                assists: 12,
                win: true,
              },
            ],
          },
        });

      const result = await service.getRankedChampionStats(gameName, tagLine);

      // Ahri 2게임, Zed 1게임 → Ahri가 첫 번째여야 함
      expect(result[0].championName).toBe("Ahri");
      expect(result[0].games).toBe(2);
      expect(result[0].championNameKorean).toBe("아리");
      expect(result[1].championName).toBe("Zed");
      expect(result[1].championNameKorean).toBe(getChampionKoreanName("Zed"));
    });
  });
});
