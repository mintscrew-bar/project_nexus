import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  RoomStatus,
  ScrimRoundStatus,
  ScrimStatus,
} from "@nexus/database";
import {
  DEFAULT_PUBG_POINT_RULE,
  KILL_MATCH_POINT_RULE,
  calculateScrimPoints,
  isValidPointRule,
  sortScrimLeaderboard,
  type PubgPointRule,
  type ScrimLeaderboardRow,
} from "@nexus/types";
import { Inject, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateScrimDto, SubmitRoundResultDto } from "./dto";

/** 결과를 어디서 받았는지. 자동 수집이 붙기 전에는 전부 수동이다. */
const RESULT_SOURCE_MANUAL = "MANUAL";

@Injectable()
export class ScrimService {
  private readonly logger = new Logger(ScrimService.name);

  /** 디스코드 봇 (선택 의존). 봇이 꺼져 있어도 스크림은 굴러가야 한다. */
  private readonly discordBot?: {
    sendRoomResultNotification: (
      roomId: string,
      result: { title: string; lines: string[] },
    ) => Promise<number>;
  };

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject("DISCORD_BOT_SERVICE") discordBot?: any,
  ) {
    this.discordBot = discordBot;
  }

  /**
   * 스크림 생성.
   *
   * 팀 편성이 끝난 배그 배틀로얄 방에서만 만들 수 있다. 팀이 없으면
   * 라운드 결과를 어느 팀에 붙일지가 없어 리더보드가 성립하지 않는다.
   */
  async createScrim(hostId: string, roomId: string, dto: CreateScrimDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { teams: { select: { id: true } }, scrim: true },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== hostId) {
      throw new ForbiddenException("방장만 스크림을 시작할 수 있습니다.");
    }
    // 배틀로얄과 킬내기가 같은 모델을 쓴다 — 둘 다 라운드를 반복하며 포인트를
    // 누적한다. 자유 매치만 결과를 남기지 않는다.
    if (
      room.gameTitle !== "PUBG" ||
      (room.pubgGameMode !== "BATTLE_ROYALE" &&
        room.pubgGameMode !== "KILL_MATCH")
    ) {
      throw new BadRequestException(
        "배틀로얄 내전 또는 킬내기 방에서만 스크림을 만들 수 있습니다.",
      );
    }
    if (room.scrim) {
      throw new BadRequestException("이미 스크림이 시작된 방입니다.");
    }
    if (room.teams.length < 2) {
      throw new BadRequestException(
        "팀 편성을 먼저 끝내야 스크림을 시작할 수 있습니다.",
      );
    }

    // 킬내기와 배틀로얄은 점수 규칙이 아예 다르다(킬내기는 사망이 감점).
    const pointRule =
      dto.pointRule ??
      (room.pubgGameMode === "KILL_MATCH"
        ? KILL_MATCH_POINT_RULE
        : DEFAULT_PUBG_POINT_RULE);
    if (!isValidPointRule(pointRule)) {
      throw new BadRequestException("포인트 규칙표가 올바르지 않습니다.");
    }

    const totalRounds = dto.totalRounds ?? 3;

    return this.prisma.scrim.create({
      data: {
        roomId,
        totalRounds,
        pointRule: pointRule as unknown as Prisma.InputJsonValue,
        status: ScrimStatus.IN_PROGRESS,
        // 라운드는 미리 다 만들어 둔다. 몇 판 남았는지가 화면에 바로 보여야 한다.
        rounds: {
          create: Array.from({ length: totalRounds }, (_, index) => ({
            roundNumber: index + 1,
          })),
        },
      },
      include: { rounds: { orderBy: { roundNumber: "asc" } } },
    });
  }

  /** 방 기준 스크림 조회 + 누적 리더보드 */
  async getScrimByRoom(roomId: string) {
    const scrim = await this.prisma.scrim.findUnique({
      where: { roomId },
      include: {
        rounds: {
          orderBy: { roundNumber: "asc" },
          include: {
            results: { orderBy: { placement: "asc" } },
          },
        },
      },
    });
    if (!scrim) return null;

    const teams = await this.prisma.team.findMany({
      where: { roomId },
      select: { id: true, name: true, color: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      ...scrim,
      pointRule: this.readPointRule(scrim.pointRule),
      leaderboard: this.buildLeaderboard(scrim, teams),
    };
  }

  /** 라운드 시작 — 호스트가 인게임에서 커스텀 매치를 여는 시점 */
  async startRound(hostId: string, roomId: string, roundNumber: number) {
    const { scrim } = await this.findOwnedScrim(hostId, roomId);

    const round = await this.prisma.scrimRound.findUnique({
      where: { scrimId_roundNumber: { scrimId: scrim.id, roundNumber } },
    });
    if (!round) throw new NotFoundException("라운드를 찾을 수 없습니다.");
    if (round.status === ScrimRoundStatus.COMPLETED) {
      throw new BadRequestException("이미 결과가 확정된 라운드입니다.");
    }

    // 여러 라운드가 동시에 진행 중이면 결과를 어느 라운드에 붙일지 알 수 없다.
    const running = await this.prisma.scrimRound.findFirst({
      where: {
        scrimId: scrim.id,
        status: ScrimRoundStatus.IN_PROGRESS,
        roundNumber: { not: roundNumber },
      },
      select: { roundNumber: true },
    });
    if (running) {
      throw new BadRequestException(
        `${running.roundNumber}라운드가 진행 중입니다. 먼저 끝내주세요.`,
      );
    }

    return this.prisma.scrimRound.update({
      where: { id: round.id },
      data: {
        status: ScrimRoundStatus.IN_PROGRESS,
        // 시작 시각은 나중에 매치를 특정할 때 기준이 된다.
        startedAt: round.startedAt ?? new Date(),
      },
    });
  }

  /**
   * 라운드 결과 입력(수동).
   *
   * 자동 매칭이 붙기 전에는 유일한 경로이고, 붙은 뒤에도 실패했을 때의 보험이다.
   * 커스텀 매치 기록은 2주만 보존돼서 놓치면 영영 못 받는다.
   */
  async submitRoundResult(
    hostId: string,
    roomId: string,
    roundNumber: number,
    dto: SubmitRoundResultDto,
  ) {
    const { scrim, teams } = await this.findOwnedScrim(hostId, roomId);

    const round = await this.prisma.scrimRound.findUnique({
      where: { scrimId_roundNumber: { scrimId: scrim.id, roundNumber } },
    });
    if (!round) throw new NotFoundException("라운드를 찾을 수 없습니다.");

    const teamById = new Map(teams.map((team) => [team.id, team]));
    const unknown = dto.results.filter((row) => !teamById.has(row.teamId));
    if (unknown.length > 0) {
      throw new BadRequestException("이 방에 없는 팀이 포함되어 있습니다.");
    }

    const teamIds = new Set(dto.results.map((row) => row.teamId));
    if (teamIds.size !== dto.results.length) {
      throw new BadRequestException("같은 팀이 두 번 들어 있습니다.");
    }

    // 순위가 겹치면 리더보드 순서가 뒤집힌다. 여기서 막지 않으면 나중에 못 고친다.
    const placements = dto.results.map((row) => row.placement);
    if (new Set(placements).size !== placements.length) {
      throw new BadRequestException("순위가 중복됩니다.");
    }

    const rule = this.readPointRule(scrim.pointRule);

    await this.prisma.$transaction(async (tx) => {
      // 다시 입력하면 통째로 갈아끼운다. 부분 수정은 합계가 어긋나기 쉽다.
      await tx.scrimTeamResult.deleteMany({ where: { roundId: round.id } });
      await tx.scrimTeamResult.createMany({
        data: dto.results.map((row) => ({
          roundId: round.id,
          teamId: row.teamId,
          // 팀이 지워져도 리더보드를 읽을 수 있어야 한다.
          teamName: teamById.get(row.teamId)?.name ?? "삭제된 팀",
          placement: row.placement,
          kills: row.kills,
          deaths: row.deaths ?? 0,
          points: calculateScrimPoints(
            row.placement,
            row.kills,
            rule,
            row.deaths ?? 0,
          ),
        })),
      });
      await tx.scrimRound.update({
        where: { id: round.id },
        data: {
          status: ScrimRoundStatus.COMPLETED,
          endedAt: new Date(),
          pubgMatchId: dto.pubgMatchId ?? round.pubgMatchId,
          resultSource: RESULT_SOURCE_MANUAL,
        },
      });
    });

    return this.getScrimByRoom(roomId);
  }

  /**
   * 스크림 확정 — 더 이상 결과를 받지 않는다.
   * 남은 라운드가 있어도 방장이 끝낼 수 있다(사람이 빠져 못 채우는 일이 흔하다).
   */
  async completeScrim(hostId: string, roomId: string) {
    const { scrim } = await this.findOwnedScrim(hostId, roomId);

    const completed = await this.prisma.scrimRound.count({
      where: { scrimId: scrim.id, status: ScrimRoundStatus.COMPLETED },
    });
    if (completed === 0) {
      throw new BadRequestException(
        "결과가 입력된 라운드가 없어 확정할 수 없습니다.",
      );
    }

    await this.prisma.$transaction([
      this.prisma.scrim.update({
        where: { id: scrim.id },
        data: { status: ScrimStatus.COMPLETED },
      }),
      this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.COMPLETED },
      }),
    ]);

    const finished = await this.getScrimByRoom(roomId);

    // 모집 공지가 나갔던 채널에 결과를 그대로 보낸다.
    // 공지 실패로 확정이 막히면 안 되므로 붙잡지 않는다.
    void this.announceResult(roomId, finished).catch((error: Error) =>
      this.logger.warn(`스크림 결과 공지 실패: ${error.message}`),
    );

    return finished;
  }

  /**
   * 포인트 규칙 변경 — 이미 입력된 결과의 포인트를 다시 계산해 덮는다.
   *
   * 규칙만 바꾸고 결과를 그대로 두면 화면의 합계와 저장된 포인트가 어긋난다.
   */
  async updatePointRule(hostId: string, roomId: string, rule: PubgPointRule) {
    const { scrim } = await this.findOwnedScrim(hostId, roomId);
    if (!isValidPointRule(rule)) {
      throw new BadRequestException("포인트 규칙표가 올바르지 않습니다.");
    }

    const results = await this.prisma.scrimTeamResult.findMany({
      where: { round: { scrimId: scrim.id } },
      select: { id: true, placement: true, kills: true, deaths: true },
    });

    await this.prisma.$transaction([
      this.prisma.scrim.update({
        where: { id: scrim.id },
        data: { pointRule: rule as unknown as Prisma.InputJsonValue },
      }),
      ...results.map((row) =>
        this.prisma.scrimTeamResult.update({
          where: { id: row.id },
          data: {
            points: calculateScrimPoints(
              row.placement,
              row.kills,
              rule,
              row.deaths,
            ),
          },
        }),
      ),
    ]);

    return this.getScrimByRoom(roomId);
  }

  /** 디스코드 결과 공지 — 누적 리더보드 상위권을 그대로 옮긴다. */
  private async announceResult(
    roomId: string,
    scrim: Awaited<ReturnType<ScrimService["getScrimByRoom"]>>,
  ) {
    if (!this.discordBot || !scrim) return;
    const lines = scrim.leaderboard.map(
      (row, index) =>
        `**${index + 1}위** ${row.teamName} — ${row.totalPoints}점 (킬 ${row.totalKills})`,
    );
    const rounds = scrim.rounds.filter(
      (round) => round.status === ScrimRoundStatus.COMPLETED,
    ).length;
    await this.discordBot.sendRoomResultNotification(roomId, {
      title: `배틀로얄 ${rounds}라운드 결과`,
      lines,
    });
  }

  private async findOwnedScrim(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        scrim: true,
        teams: { select: { id: true, name: true } },
      },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== hostId) {
      throw new ForbiddenException("방장만 스크림을 조작할 수 있습니다.");
    }
    if (!room.scrim) throw new NotFoundException("시작된 스크림이 없습니다.");
    if (room.scrim.status === ScrimStatus.COMPLETED) {
      throw new BadRequestException("이미 확정된 스크림입니다.");
    }
    return { room, scrim: room.scrim, teams: room.teams };
  }

  /** 저장된 규칙이 깨져 있으면 기본표로 떨어뜨린다. 화면이 비는 것보다 낫다. */
  private readPointRule(value: unknown): PubgPointRule {
    if (isValidPointRule(value)) return value;
    this.logger.warn("스크림 포인트 규칙이 올바르지 않아 기본표를 씁니다.");
    return DEFAULT_PUBG_POINT_RULE;
  }

  /**
   * 누적 리더보드.
   *
   * 결과가 없는 라운드는 0점이 아니라 null 로 둔다. "아직 안 한 판"과
   * "0점을 받은 판"은 다르고, 합계에도 다르게 들어가야 한다.
   */
  private buildLeaderboard(
    scrim: {
      rounds: {
        roundNumber: number;
        results: {
          teamId: string | null;
          teamName: string;
          placement: number;
          kills: number;
          deaths: number;
          points: number;
        }[];
      }[];
    },
    teams: { id: string; name: string }[],
  ): ScrimLeaderboardRow[] {
    const roundCount = scrim.rounds.length;
    const rows = new Map<string, ScrimLeaderboardRow>();

    // 결과가 아직 없는 팀도 리더보드에 나와야 한다. 빠져 있으면 누가 몇 팀인지 안 보인다.
    for (const team of teams) {
      rows.set(team.id, {
        teamId: team.id,
        teamName: team.name,
        roundPoints: Array(roundCount).fill(null),
        totalPoints: 0,
        totalKills: 0,
        totalDeaths: 0,
        placementSum: 0,
        bestPlacement: null,
        wins: 0,
      });
    }

    scrim.rounds.forEach((round, index) => {
      for (const result of round.results) {
        // 팀이 지워진 기록은 이름 스냅샷으로 자리를 유지한다.
        const key = result.teamId ?? `removed:${result.teamName}`;
        let row = rows.get(key);
        if (!row) {
          row = {
            teamId: result.teamId,
            teamName: result.teamName,
            roundPoints: Array(roundCount).fill(null),
            totalPoints: 0,
            totalKills: 0,
            totalDeaths: 0,
            placementSum: 0,
            bestPlacement: null,
            wins: 0,
          };
          rows.set(key, row);
        }
        row.roundPoints[index] = result.points;
        row.totalPoints += result.points;
        row.totalKills += result.kills;
        row.totalDeaths += result.deaths;
        row.placementSum += result.placement;
        row.bestPlacement =
          row.bestPlacement === null
            ? result.placement
            : Math.min(row.bestPlacement, result.placement);
        if (result.placement === 1) row.wins += 1;
      }
    });

    return sortScrimLeaderboard([...rows.values()]);
  }
}
