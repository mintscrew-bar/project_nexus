import { Injectable } from "@nestjs/common";
import type { PubgGameMode } from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";

/** 한 번에 돌려주는 전적 수. */
const DEFAULT_LIMIT = 20;

export interface PubgHistoryItem {
  /** 배틀로얄 스크림인지 킬내기인지. 같은 Scrim 모델을 쓰지만 읽는 법이 다르다. */
  mode: PubgGameMode;
  roomId: string;
  roomName: string;
  pubgPlatform: string | null;
  teamName: string;
  /** 이 스크림에서 우리 팀의 최종 순위 (누적 포인트 기준) */
  finalRank: number | null;
  totalTeams: number;
  totalPoints: number;
  totalKills: number;
  totalDeaths: number;
  rounds: number;
  completedAt: Date | null;
}

/**
 * 배그 전적.
 *
 * 배틀로얄과 킬내기가 같은 `Scrim` 모델을 쓴다 — 둘 다 라운드를 반복하며
 * 포인트를 누적하는 구조라서다. 갈리는 건 팀 수(킬내기는 항상 2팀)와
 * 포인트 규칙(킬내기는 사망이 감점)뿐이다.
 */
@Injectable()
export class PubgHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserHistory(userId: string, limit = DEFAULT_LIMIT) {
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
            room: {
              select: {
                id: true,
                name: true,
                pubgPlatform: true,
                pubgGameMode: true,
                scrim: { select: { id: true, updatedAt: true } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
      take: limit,
    });

    const items: PubgHistoryItem[] = [];

    for (const membership of memberships) {
      const team = membership.team;
      const room = team?.room;
      const scrim = room?.scrim;
      if (!team || !room || !scrim) continue;

      const results = await this.prisma.scrimTeamResult.findMany({
        where: { round: { scrimId: scrim.id } },
        select: { teamId: true, points: true, kills: true, deaths: true },
      });
      if (results.length === 0) continue;

      const totals = new Map<
        string,
        { points: number; kills: number; deaths: number }
      >();
      for (const result of results) {
        const key = result.teamId ?? "unknown";
        const current = totals.get(key) ?? { points: 0, kills: 0, deaths: 0 };
        current.points += result.points;
        current.kills += result.kills;
        current.deaths += result.deaths;
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
        mode: (room.pubgGameMode ?? "BATTLE_ROYALE") as PubgGameMode,
        roomId: room.id,
        roomName: room.name,
        pubgPlatform: room.pubgPlatform,
        teamName: team.name,
        finalRank: myIndex >= 0 ? myIndex + 1 : null,
        totalTeams: ranked.length,
        totalPoints: mine?.points ?? 0,
        totalKills: mine?.kills ?? 0,
        totalDeaths: mine?.deaths ?? 0,
        rounds: roundCount,
        completedAt: scrim.updatedAt,
      });
    }

    items.sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    );

    return { items: items.slice(0, limit), summary: this.summarize(items) };
  }

  /**
   * 프로필 요약.
   *
   * 배그는 "승률"보다 평균 순위·평균 킬이 실력을 더 잘 드러낸다.
   * 표본이 적을 때 평균은 쉽게 흔들리므로 판수를 함께 내보낸다.
   *
   * 배틀로얄과 킬내기는 순위의 의미가 달라(16팀 중 3위 ≠ 2팀 중 1위)
   * 평균 순위는 배틀로얄만 센다.
   */
  private summarize(items: PubgHistoryItem[]) {
    const battleRoyale = items.filter((item) => item.mode === "BATTLE_ROYALE");
    const killMatch = items.filter((item) => item.mode === "KILL_MATCH");

    const ranked = battleRoyale.filter((item) => item.finalRank !== null);
    const averageRank =
      ranked.length > 0
        ? ranked.reduce((sum, item) => sum + (item.finalRank ?? 0), 0) /
          ranked.length
        : null;

    const rounds = items.reduce((sum, item) => sum + item.rounds, 0);
    const kills = items.reduce((sum, item) => sum + item.totalKills, 0);

    return {
      scrimCount: battleRoyale.length,
      killMatchCount: killMatch.length,
      /** 배틀로얄 최종 순위 평균. 판수가 적으면 크게 흔들린다. */
      averageScrimRank:
        averageRank === null ? null : Math.round(averageRank * 10) / 10,
      /** 라운드당 팀 킬 평균 (두 모드 합산) */
      averageKillsPerRound:
        rounds > 0 ? Math.round((kills / rounds) * 10) / 10 : null,
      /** 킬내기에서 상대 팀을 앞선 횟수 */
      killMatchWins: killMatch.filter((item) => item.finalRank === 1).length,
    };
  }
}
