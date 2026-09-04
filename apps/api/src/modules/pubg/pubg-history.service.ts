import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  calculateScrimPoints,
  isValidPointRule,
  DEFAULT_PUBG_POINT_RULE,
  type PubgPointRule,
} from "@nexus/types";

/** 한 번에 돌려주는 전적 수. 배그는 라운드가 많아 한 스크림이 여러 줄이 된다. */
const DEFAULT_LIMIT = 20;

export interface PubgScrimHistoryItem {
  kind: "SCRIM";
  roomId: string;
  roomName: string;
  pubgPlatform: string | null;
  teamName: string;
  /** 이 스크림에서 우리 팀의 최종 순위 (리더보드 기준) */
  finalRank: number | null;
  totalTeams: number;
  totalPoints: number;
  totalKills: number;
  rounds: number;
  completedAt: Date | null;
}

export interface PubgKillMatchHistoryItem {
  kind: "KILL_MATCH";
  matchId: string;
  roomId: string | null;
  roomName: string;
  pubgPlatform: string | null;
  teamName: string;
  opponentName: string;
  win: boolean;
  teamKills: number;
  opponentKills: number;
  /** 개인 킬. 입력하지 않았으면 null — 0킬과 구분해야 한다. */
  playerKills: number | null;
  completedAt: Date | null;
}

export type PubgHistoryItem = PubgScrimHistoryItem | PubgKillMatchHistoryItem;

/**
 * 배그 전적.
 *
 * 롤 전적(`riot_match_cache` 기반)과 완전히 다른 자료를 읽는다.
 * 배틀로얄은 라운드 누적 포인트, 킬내기는 2팀 승패 + 킬 수다.
 */
@Injectable()
export class PubgHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserHistory(userId: string, limit = DEFAULT_LIMIT) {
    const [scrims, killMatches] = await Promise.all([
      this.getScrimHistory(userId, limit),
      this.getKillMatchHistory(userId, limit),
    ]);

    // 두 종류를 시간순으로 섞는다. 종류별로 나눠 보여주면
    // "최근에 뭘 했는지"가 한눈에 안 들어온다.
    const items = [...scrims, ...killMatches].sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    );

    return {
      items: items.slice(0, limit),
      summary: this.summarize(items),
    };
  }

  private async getScrimHistory(
    userId: string,
    limit: number,
  ): Promise<PubgScrimHistoryItem[]> {
    // 내가 속했던 팀을 찾고, 그 팀이 낸 라운드 결과를 모은다.
    const memberships = await this.prisma.teamMember.findMany({
      where: {
        userId,
        team: { room: { gameTitle: "PUBG", scrim: { isNot: null } } },
      },
      select: {
        team: {
          select: {
            id: true,
            name: true,
            roomId: true,
            room: {
              select: {
                id: true,
                name: true,
                pubgPlatform: true,
                scrim: {
                  select: {
                    id: true,
                    pointRule: true,
                    updatedAt: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
      take: limit,
    });

    const items: PubgScrimHistoryItem[] = [];

    for (const membership of memberships) {
      const team = membership.team;
      const scrim = team?.room?.scrim;
      if (!team || !scrim) continue;

      // 이 스크림 전체 결과를 읽어 우리 팀의 최종 순위를 낸다.
      const results = await this.prisma.scrimTeamResult.findMany({
        where: { round: { scrimId: scrim.id } },
        select: { teamId: true, points: true, kills: true },
      });
      if (results.length === 0) continue;

      const totals = new Map<string, { points: number; kills: number }>();
      for (const result of results) {
        const key = result.teamId ?? "unknown";
        const current = totals.get(key) ?? { points: 0, kills: 0 };
        current.points += result.points;
        current.kills += result.kills;
        totals.set(key, current);
      }

      const ranked = [...totals.entries()].sort(
        (a, b) => b[1].points - a[1].points,
      );
      const myIndex = ranked.findIndex(([teamId]) => teamId === team.id);
      const mine = totals.get(team.id);

      const roundCount = await this.prisma.scrimRound.count({
        where: { scrimId: scrim.id, status: "COMPLETED" },
      });

      items.push({
        kind: "SCRIM",
        roomId: team.room!.id,
        roomName: team.room!.name,
        pubgPlatform: team.room!.pubgPlatform,
        teamName: team.name,
        finalRank: myIndex >= 0 ? myIndex + 1 : null,
        totalTeams: ranked.length,
        totalPoints: mine?.points ?? 0,
        totalKills: mine?.kills ?? 0,
        rounds: roundCount,
        completedAt: scrim.updatedAt,
      });
    }

    return items;
  }

  private async getKillMatchHistory(
    userId: string,
    limit: number,
  ): Promise<PubgKillMatchHistoryItem[]> {
    const memberships = await this.prisma.teamMember.findMany({
      where: {
        userId,
        team: { room: { gameTitle: "PUBG", pubgGameMode: "KILL_MATCH" } },
      },
      select: { teamId: true },
      orderBy: { joinedAt: "desc" },
      take: limit * 2,
    });
    const myTeamIds = new Set(memberships.map((m) => m.teamId));
    if (myTeamIds.size === 0) return [];

    const matches = await this.prisma.match.findMany({
      where: {
        status: "COMPLETED",
        OR: [
          { teamAId: { in: [...myTeamIds] } },
          { teamBId: { in: [...myTeamIds] } },
        ],
      },
      select: {
        id: true,
        roomId: true,
        winnerId: true,
        completedAt: true,
        teamAId: true,
        teamBId: true,
        room: { select: { name: true, pubgPlatform: true } },
        pubgTeamKills: true,
        pubgPlayerKills: { where: { userId } },
      },
      orderBy: { completedAt: "desc" },
      take: limit,
    });

    return matches.map((match) => {
      const myTeamId = myTeamIds.has(match.teamAId ?? "")
        ? match.teamAId
        : match.teamBId;
      const mine = match.pubgTeamKills.find((row) => row.teamId === myTeamId);
      const theirs = match.pubgTeamKills.find((row) => row.teamId !== myTeamId);

      return {
        kind: "KILL_MATCH" as const,
        matchId: match.id,
        roomId: match.roomId,
        roomName: match.room?.name ?? "삭제된 방",
        pubgPlatform: match.room?.pubgPlatform ?? null,
        teamName: mine?.teamName ?? "우리 팀",
        opponentName: theirs?.teamName ?? "상대 팀",
        win: !!myTeamId && match.winnerId === myTeamId,
        teamKills: mine?.kills ?? 0,
        opponentKills: theirs?.kills ?? 0,
        // 개인 킬은 선택 입력이다. 안 넣었으면 0이 아니라 null 이다.
        playerKills: match.pubgPlayerKills[0]?.kills ?? null,
        completedAt: match.completedAt,
      };
    });
  }

  /**
   * 프로필 요약.
   *
   * 배그는 "승률"보다 평균 순위·평균 킬이 실력을 더 잘 드러낸다.
   * 표본이 적을 때 평균은 쉽게 흔들리므로 판수를 함께 내보낸다.
   */
  private summarize(items: PubgHistoryItem[]) {
    const scrims = items.filter(
      (item): item is PubgScrimHistoryItem => item.kind === "SCRIM",
    );
    const killMatches = items.filter(
      (item): item is PubgKillMatchHistoryItem => item.kind === "KILL_MATCH",
    );

    const rankedScrims = scrims.filter((item) => item.finalRank !== null);
    const averageRank =
      rankedScrims.length > 0
        ? rankedScrims.reduce((sum, item) => sum + (item.finalRank ?? 0), 0) /
          rankedScrims.length
        : null;

    const scrimKills = scrims.reduce((sum, item) => sum + item.totalKills, 0);
    const scrimRounds = scrims.reduce((sum, item) => sum + item.rounds, 0);

    return {
      scrimCount: scrims.length,
      killMatchCount: killMatches.length,
      /** 스크림 최종 순위 평균. 판수가 적으면 크게 흔들린다. */
      averageScrimRank:
        averageRank === null ? null : Math.round(averageRank * 10) / 10,
      /** 라운드당 팀 킬 평균 */
      averageKillsPerRound:
        scrimRounds > 0
          ? Math.round((scrimKills / scrimRounds) * 10) / 10
          : null,
      killMatchWins: killMatches.filter((item) => item.win).length,
    };
  }

  /** 저장된 규칙이 깨져 있으면 기본표로 떨어뜨린다. */
  readPointRule(value: unknown): PubgPointRule {
    return isValidPointRule(value) ? value : DEFAULT_PUBG_POINT_RULE;
  }

  /** 규칙표가 바뀐 뒤 다시 계산할 때 쓴다. */
  recalculate(placement: number, kills: number, rule: PubgPointRule) {
    return calculateScrimPoints(placement, kills, rule);
  }
}
