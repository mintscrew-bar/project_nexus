import { Test, TestingModule } from "@nestjs/testing";
import { MatchService } from "./match.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { RiotTournamentService } from "../riot/riot-tournament.service";
import { RiotSpectatorService } from "../riot/riot-spectator.service";
import { MatchDataCollectionService } from "./match-data-collection.service";
import { NotificationService } from "../notification/notification.service";
import { MatchBracketService } from "./match-bracket.service";
import { MatchAdvancementService } from "./match-advancement.service";
import { RankingService } from "../ranking/ranking.service";
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
    };

    // 각 외부 의존 서비스 mock — 실제 동작 불필요
    const mockConfigService = { get: jest.fn().mockReturnValue(null) };
    const mockRiotTournamentService = {
      createTournamentCode: jest.fn().mockResolvedValue("NEXUS-TEST"),
    };
    const mockRiotSpectatorService = {
      findActiveGameByPUUIDs: jest.fn().mockResolvedValue({ isLive: false }),
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
    const mockRankingService = {
      updateRanking: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RiotTournamentService, useValue: mockRiotTournamentService },
        {
          provide: RiotSpectatorService,
          useValue: mockRiotSpectatorService,
        },
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
        { provide: RankingService, useValue: mockRankingService },
        // Optional 의존성 — Discord 서비스는 테스트에서 불필요
        { provide: "DISCORD_BOT_SERVICE", useValue: null },
        { provide: "DISCORD_VOICE_SERVICE", useValue: null },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
  });

  describe("getRpsContext", () => {
    it("봇 캡틴 여부와 username을 포함해 반환한다", async () => {
      prisma.match.findUnique.mockResolvedValue({
        teamAId: "team-a",
        teamBId: "team-b",
        status: "PENDING",
        blueSideTeamId: null,
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
          roomId: { not: null },
          riotMatchId: { not: null },
          OR: [
            { teamA: { members: { some: { userId: "user-1" } } } },
            { teamB: { members: { some: { userId: "user-1" } } } },
          ],
        },
        select: { riotMatchId: true },
      });
      expect(prisma.matchParticipant.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(["KR_100", "KR_200"]);
    });
  });
});
