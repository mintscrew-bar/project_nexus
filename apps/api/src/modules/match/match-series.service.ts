import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MatchStatus } from "@nexus/database";
import { winsNeededFor } from "@nexus/types";

/** 한 게임(세트) 결과를 반영한 뒤의 시리즈 상태 */
export interface SeriesProgress {
  seriesId: string;
  bestOf: number;
  /** 시리즈 teamA 기준 승수 */
  teamAWins: number;
  teamBWins: number;
  /** 시리즈가 끝났는지 (선취 승수 도달) */
  clinched: boolean;
  seriesWinnerId: string | null;
  /** 다음 세트가 만들어졌으면 그 매치 id */
  nextMatchId: string | null;
  nextGameNumber: number | null;
  /** 다음 세트 블루 팀. 직전 세트와 진영을 자동 교대한다. */
  nextBlueSideTeamId: string | null;
}

/** 시리즈 스코어 (표시용) */
export interface SeriesScore {
  seriesId: string;
  bestOf: number;
  teamAId: string | null;
  teamBId: string | null;
  teamAWins: number;
  teamBWins: number;
  winsNeeded: number;
  status: MatchStatus;
  winnerId: string | null;
  /** 현재 진행 중이거나 다음에 치를 세트 번호 */
  currentGameNumber: number;
}

/**
 * 다전제 시리즈 진행 관리.
 *
 * 대진 슬롯 하나가 시리즈이고, 그 안의 게임(세트)이 Match다.
 * 게임 결과가 들어올 때마다 승수를 세어 시리즈가 끝났는지 판정하고,
 * 안 끝났으면 다음 세트를 만든다. bestOf=1이면 첫 게임에서 바로 클린치되어
 * 기존 단판과 동일하게 동작한다.
 */
@Injectable()
export class MatchSeriesService {
  private readonly logger = new Logger(MatchSeriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 게임 결과를 시리즈에 반영한다.
   *
   * @param matchId 방금 결과가 확정된 게임
   * @returns 시리즈에 속하지 않는 매치(외부 인제스트/시리즈 도입 이전)면 null
   */
  async applyGameResult(matchId: string): Promise<SeriesProgress | null> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        seriesId: true,
        winnerId: true,
        blueSideTeamId: true,
      },
    });

    if (!match?.seriesId) return null;

    const series = await this.prisma.matchSeries.findUnique({
      where: { id: match.seriesId },
      select: {
        id: true,
        roomId: true,
        round: true,
        matchNumber: true,
        bracketRound: true,
        bracketType: true,
        teamAId: true,
        teamBId: true,
        bestOf: true,
        status: true,
      },
    });

    if (!series) {
      this.logger.warn(
        `[Series] 매치 ${matchId}의 시리즈 ${match.seriesId}를 찾을 수 없음`,
      );
      return null;
    }

    const games = await this.prisma.match.findMany({
      where: { seriesId: series.id },
      select: { id: true, gameNumber: true, status: true, winnerId: true },
      orderBy: { gameNumber: "asc" },
    });

    const teamAWins = games.filter(
      (g: { winnerId: string | null }) =>
        g.winnerId !== null && g.winnerId === series.teamAId,
    ).length;
    const teamBWins = games.filter(
      (g: { winnerId: string | null }) =>
        g.winnerId !== null && g.winnerId === series.teamBId,
    ).length;

    const winsNeeded = winsNeededFor(series.bestOf);
    const seriesWinnerId =
      teamAWins >= winsNeeded
        ? series.teamAId
        : teamBWins >= winsNeeded
          ? series.teamBId
          : null;

    if (seriesWinnerId) {
      await this.prisma.matchSeries.update({
        where: { id: series.id },
        data: { status: MatchStatus.COMPLETED, winnerId: seriesWinnerId },
      });

      this.logger.log(
        `[Series] 시리즈 종료 ${series.id} (Bo${series.bestOf}) — 승자 ${seriesWinnerId} ${teamAWins}-${teamBWins}`,
      );

      return {
        seriesId: series.id,
        bestOf: series.bestOf,
        teamAWins,
        teamBWins,
        clinched: true,
        seriesWinnerId,
        nextMatchId: null,
        nextGameNumber: null,
        nextBlueSideTeamId: null,
      };
    }

    // 아직 안 끝났다 — 다음 세트를 만든다.
    const nextGameNumber =
      Math.max(...games.map((g: { gameNumber: number }) => g.gameNumber)) + 1;

    // 2세트부터는 가위바위보나 추가 선택 없이 직전 세트와 진영을 교대한다.
    // 레거시/복구 상태에서 직전 진영이 없으면 teamA를 블루로 정해 흐름을 멈추지 않는다.
    const nextBlueSideTeamId =
      match.blueSideTeamId === series.teamAId
        ? series.teamBId
        : match.blueSideTeamId === series.teamBId
          ? series.teamAId
          : series.teamAId;

    const nextMatch = await this.prisma.match.create({
      data: {
        // 내부 내전 매치 표식. 빠지면 2세트부터 외부 인제스트 매치로 잡혀
        // 전적 조회·수집 대상에서 빠진다.
        isInternal: true,
        roomId: series.roomId,
        seriesId: series.id,
        gameNumber: nextGameNumber,
        // 시리즈에서 미러링 — 방송 오버레이·관리자·전적 수집이 Match만 보고 동작한다.
        round: series.round,
        matchNumber: series.matchNumber,
        bracketRound: series.bracketRound,
        bracketType: series.bracketType,
        teamAId: series.teamAId,
        teamBId: series.teamBId,
        blueSideTeamId: nextBlueSideTeamId,
        status: MatchStatus.PENDING,
      },
      select: { id: true },
    });

    if (series.status !== MatchStatus.IN_PROGRESS) {
      await this.prisma.matchSeries.update({
        where: { id: series.id },
        data: { status: MatchStatus.IN_PROGRESS },
      });
    }

    this.logger.log(
      `[Series] ${series.id} (Bo${series.bestOf}) ${teamAWins}-${teamBWins} — ${nextGameNumber}세트 생성 ${nextMatch.id}`,
    );

    return {
      seriesId: series.id,
      bestOf: series.bestOf,
      teamAWins,
      teamBWins,
      clinched: false,
      seriesWinnerId: null,
      nextMatchId: nextMatch.id,
      nextGameNumber,
      nextBlueSideTeamId,
    };
  }

  /**
   * 세트가 시작되면 시리즈도 진행 중으로 올린다.
   *
   * 이걸 안 하면 시리즈 상태가 결과 보고 때만 갱신돼서 실제 진행보다 한 박자 늦는다.
   * 1세트를 치르는 내내 시리즈가 PENDING으로 남고, 단판(bestOf=1) 시리즈는
   * IN_PROGRESS를 아예 거치지 않고 PENDING에서 COMPLETED로 건너뛴다.
   * 대진표는 시리즈 상태를 슬롯 상태로 쓰기 때문에 그대로 표시 오류가 된다.
   *
   * @returns 시리즈에 속하지 않는 매치면 null, 아니면 시리즈 id
   */
  async markInProgress(matchId: string): Promise<string | null> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { seriesId: true },
    });

    if (!match?.seriesId) return null;

    // 이미 IN_PROGRESS면 건드리지 않는다. COMPLETED된 시리즈를 되돌리지도 않는다
    // (클린치 이후 남은 세트를 실수로 시작해도 시리즈 결과는 유지).
    await this.prisma.matchSeries.updateMany({
      where: { id: match.seriesId, status: MatchStatus.PENDING },
      data: { status: MatchStatus.IN_PROGRESS },
    });

    return match.seriesId;
  }

  /** 방의 모든 시리즈 스코어 (대진표 표시용) */
  async getRoomSeriesScores(roomId: string): Promise<SeriesScore[]> {
    const series = await this.prisma.matchSeries.findMany({
      where: { roomId },
      select: {
        id: true,
        teamAId: true,
        teamBId: true,
        bestOf: true,
        status: true,
        winnerId: true,
        matches: {
          select: { gameNumber: true, winnerId: true, status: true },
          orderBy: { gameNumber: "asc" },
        },
      },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
    });

    return series.map((s: (typeof series)[number]) => {
      const teamAWins = s.matches.filter(
        (m: { winnerId: string | null }) =>
          m.winnerId !== null && m.winnerId === s.teamAId,
      ).length;
      const teamBWins = s.matches.filter(
        (m: { winnerId: string | null }) =>
          m.winnerId !== null && m.winnerId === s.teamBId,
      ).length;

      return {
        seriesId: s.id,
        bestOf: s.bestOf,
        teamAId: s.teamAId,
        teamBId: s.teamBId,
        teamAWins,
        teamBWins,
        winsNeeded: winsNeededFor(s.bestOf),
        status: s.status,
        winnerId: s.winnerId,
        currentGameNumber: Math.max(
          1,
          ...s.matches.map((m: { gameNumber: number }) => m.gameNumber),
        ),
      };
    });
  }

  /**
   * 시리즈에 팀을 배정하고, 아직 시작 전인 세트에도 같은 팀을 반영한다.
   * 진출 로직이 시리즈를 채울 때 1세트 매치도 같이 채워야 하기 때문이다.
   */
  async assignTeam(
    seriesId: string,
    isTeamA: boolean,
    teamId: string,
  ): Promise<void> {
    await this.prisma.matchSeries.update({
      where: { id: seriesId },
      data: isTeamA ? { teamAId: teamId } : { teamBId: teamId },
    });

    await this.prisma.match.updateMany({
      where: { seriesId, status: MatchStatus.PENDING },
      data: isTeamA ? { teamAId: teamId } : { teamBId: teamId },
    });
  }

  /** 시리즈 도입 이후 방인지 (레거시 방은 시리즈 row가 없다) */
  async hasSeries(roomId: string): Promise<boolean> {
    const count = await this.prisma.matchSeries.count({ where: { roomId } });
    return count > 0;
  }
}
