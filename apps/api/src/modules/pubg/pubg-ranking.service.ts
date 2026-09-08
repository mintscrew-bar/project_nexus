import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  aggregatePubgRanking,
  sortPubgRanking,
  type ScrimForRanking,
} from "./pubg-ranking.util";

/** 랭킹에 오르는 최소 참가 횟수. */
const MIN_SCRIMS = 1;

/**
 * 배그 랭킹.
 *
 * 롤 랭킹처럼 미리 계산해 둔 표(`UserRanking`)를 쓰지 않고 요청마다 센다.
 * 배그 내전 기록은 아직 0건이고, 스크림 하나에 팀 25개가 최대라 전부 훑어도
 * 가벼운 조회다. 기록이 쌓여 이 방식이 무거워지면 그때 표로 뺀다 —
 * 표본이 0인 지금 캐시 무효화까지 만드는 건 이르다.
 */
@Injectable()
export class PubgRankingService {
  constructor(private readonly prisma: PrismaService) {}

  async getRanking(page = 1, limit = 50) {
    const scrims = await this.loadScrims();
    const ranked = sortPubgRanking(
      aggregatePubgRanking(scrims).filter((row) => row.scrims >= MIN_SCRIMS),
    );

    const total = ranked.length;
    const start = (page - 1) * limit;
    const slice = ranked.slice(start, start + limit);

    // 이름·아바타는 순위에 오른 사람만 붙인다. 전체를 조인하면 참가자 전원을
    // 읽게 된다.
    const users = await this.prisma.user.findMany({
      where: { id: { in: slice.map((row) => row.userId) } },
      select: {
        id: true,
        username: true,
        avatar: true,
        pubgAccounts: {
          where: { isPrimary: true },
          take: 1,
          select: { playerName: true, nexusTier: true },
        },
      },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      rankings: slice.map((row, index) => ({
        ...row,
        rank: start + index + 1,
        user: byId.get(row.userId) ?? null,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      /** 화면에서 "몇 판부터 오르는지" 설명하는 데 쓴다. */
      minScrims: MIN_SCRIMS,
    };
  }

  /** 결과가 들어간 배그 스크림을 팀 합계·팀원과 함께 읽는다. */
  private async loadScrims(): Promise<ScrimForRanking[]> {
    const scrims = await this.prisma.scrim.findMany({
      where: { room: { gameTitle: "PUBG" } },
      select: {
        id: true,
        room: {
          select: {
            teams: {
              select: { id: true, members: { select: { userId: true } } },
            },
          },
        },
        rounds: {
          select: {
            results: {
              select: {
                teamId: true,
                points: true,
                kills: true,
                deaths: true,
              },
            },
          },
        },
      },
    });

    return scrims.map((scrim) => {
      // 라운드별 결과를 팀 단위로 합친다.
      const totals = new Map<
        string,
        { teamId: string; points: number; kills: number; deaths: number }
      >();
      for (const round of scrim.rounds) {
        for (const result of round.results) {
          // 팀이 지워진 기록은 사람에게 이어붙일 수 없다.
          if (!result.teamId) continue;
          const current = totals.get(result.teamId) ?? {
            teamId: result.teamId,
            points: 0,
            kills: 0,
            deaths: 0,
          };
          current.points += result.points;
          current.kills += result.kills;
          current.deaths += result.deaths;
          totals.set(result.teamId, current);
        }
      }

      return {
        scrimId: scrim.id,
        teams: [...totals.values()],
        membersByTeam: new Map(
          (scrim.room?.teams ?? []).map((team) => [
            team.id,
            team.members.map((member) => member.userId),
          ]),
        ),
      };
    });
  }
}
