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
  calculateScrimPoints,
  defaultPointRuleForMode,
  isValidPointRule,
  sortScrimLeaderboard,
  type PubgPointRule,
  type ScrimLeaderboardRow,
} from "@nexus/types";
import { Inject, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateScrimDto, SubmitRoundResultDto } from "./dto";
import type { KillMatchCollectionState } from "./kill-match-collector.service";
import { PubgApiService } from "../pubg/pubg-api.service";
import { ConfigService } from "@nestjs/config";

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
    @Optional() private readonly pubgApi?: PubgApiService,
    @Optional() private readonly config?: ConfigService,
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
    const teamSizes = await this.prisma.team.findMany({
      where: { roomId },
      include: { _count: { select: { members: true } } },
    });
    if (
      teamSizes.length * 4 !== room.maxParticipants ||
      teamSizes.some((team) => team._count.members !== 4)
    ) {
      throw new BadRequestException(
        "방 정원에 맞게 모든 팀을 4명씩 채운 뒤 시작해주세요.",
      );
    }

    // 킬내기와 배틀로얄은 점수 규칙이 아예 다르다(킬내기는 사망이 감점).
    const pointRule =
      dto.pointRule ??
      defaultPointRuleForMode(room.pubgGameMode ?? "BATTLE_ROYALE");
    if (!isValidPointRule(pointRule)) {
      throw new BadRequestException("포인트 규칙표가 올바르지 않습니다.");
    }

    const timed = room.pubgGameMode === "KILL_MATCH";
    if (
      timed &&
      (!this.pubgApi?.isEnabled ||
        this.config?.get("PUBG_SCRIM_AUTO_COLLECT") === "false")
    ) {
      throw new BadRequestException(
        "배그 자동 수집 연결을 사용할 수 없어 시간제 킬내기를 시작할 수 없습니다.",
      );
    }
    const totalRounds = timed ? 0 : room.battleRoyaleRounds;
    let collection: KillMatchCollectionState | undefined;
    if (timed) {
      const teams = await this.prisma.team.findMany({
        where: { roomId },
        include: {
          members: {
            include: {
              user: {
                include: { pubgAccounts: { where: { isPrimary: true } } },
              },
            },
          },
        },
      });
      if (teams.length < 2 || teams.some((team) => team.members.length !== 4)) {
        throw new BadRequestException(
          "모든 팀을 4인 스쿼드로 편성한 뒤 시작해주세요.",
        );
      }
      const roster: KillMatchCollectionState["roster"] = [];
      for (const team of teams)
        for (const member of team.members) {
          const account = member.user.pubgAccounts[0];
          if (
            !account?.playerId ||
            !account.lastMatchShard ||
            account.lastMatchShard !== room.pubgPlatform
          ) {
            throw new BadRequestException(
              "모든 참가자의 대표 배그 계정과 방 플랫폼을 확인해주세요.",
            );
          }
          roster.push({
            teamId: team.id,
            teamName: team.name,
            playerId: account.playerId,
            platform: account.lastMatchShard,
          });
        }
      if (new Set(roster.map((p) => p.playerId)).size !== roster.length)
        throw new BadRequestException("참가 계정이 중복됩니다.");
      collection = { roster, cursor: 0, pending: [], seen: [] };
      // 시작 전에 기존 경기 ID를 제외해 첫 집계가 과거 기록 탐색으로 밀리지 않게 한다.
      // 각 스쿼드의 네 계정은 같은 경기에 참가하므로 팀당 한 계정의 목록을 조회한다.
      for (const teamId of new Set(roster.map((p) => p.teamId))) {
        const anchor = roster.find((p) => p.teamId === teamId)!;
        collection.seen.push(
          ...(await this.pubgApi!.getPlayerMatchIds(
            anchor.platform,
            anchor.playerId,
            false,
          )),
        );
      }
      collection.seen = [...new Set(collection.seen)];
    }
    const startsAt = timed ? new Date() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.room.updateMany({
        where: { id: roomId, updatedAt: room.updatedAt },
        data: { status: "IN_PROGRESS" },
      });
      if (!changed.count)
        throw new BadRequestException(
          "방 상태가 바뀌었습니다. 팀 편성을 확인하고 다시 시작해주세요.",
        );
      return tx.scrim.create({
        data: {
          roomId,
          totalRounds,
          // 시간제(킬내기)는 팀장이 전원 준비하기 전까지 시계를 돌리지 않는다.
          // 만들자마자 시작하면 아무도 안 모인 채로 제한시간이 흘러간다.
          startsAt: timed ? null : startsAt,
          cutoffAt: null,
          ...(collection && {
            collectorState: collection as unknown as Prisma.InputJsonValue,
          }),
          pointRule: pointRule as unknown as Prisma.InputJsonValue,
          // 시간제는 준비가 끝나야 시작이다.
          status: timed ? ScrimStatus.PENDING : ScrimStatus.IN_PROGRESS,
          // 라운드는 미리 다 만들어 둔다. 몇 판 남았는지가 화면에 바로 보여야 한다.
          rounds: {
            create: Array.from({ length: totalRounds }, (_, index) => ({
              roundNumber: index + 1,
            })),
          },
        },
        include: { rounds: { orderBy: { roundNumber: "asc" } } },
      });
    });
    return { ...created, collectorState: undefined };
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
      collectorState: undefined,
      pointRule: this.readPointRule(scrim.pointRule),
      leaderboard: this.buildLeaderboard(scrim, teams),
      // 시작 전에는 누가 준비했는지가 화면의 전부다.
      ready:
        scrim.status === ScrimStatus.PENDING
          ? await this.getReadyState(roomId)
          : null,
    };
  }

  /**
   * 시간제 킬내기의 팀장 준비.
   *
   * 팀장이 전원 준비를 누르면 그 순간 제한시간이 돈다. 마지막 사람이 누르는
   * 즉시 시작하므로 방장이 따로 시작을 누를 필요가 없다.
   *
   * 준비 상태는 메모리에만 둔다. 시작 전 몇 초짜리 상태라 서버가 내려가면
   * 다시 누르면 그만이고, 이걸 DB 에 넣으면 시작 뒤에도 남아 정리 대상이 된다.
   */
  private readonly readyCaptains = new Map<string, Set<string>>();

  /** 방의 팀장 목록 — 준비를 받을 대상 */
  private async loadCaptains(roomId: string) {
    return this.prisma.team.findMany({
      where: { roomId },
      select: {
        id: true,
        name: true,
        captainId: true,
        captain: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** 준비 현황. 화면이 누가 남았는지 보여준다. */
  async getReadyState(roomId: string) {
    const captains = await this.loadCaptains(roomId);
    const ready = this.readyCaptains.get(roomId) ?? new Set<string>();
    return {
      captains: captains.map((team) => ({
        teamId: team.id,
        teamName: team.name,
        userId: team.captainId,
        username: team.captain?.username ?? "알 수 없음",
        avatar: team.captain?.avatar ?? null,
        ready: ready.has(team.captainId),
      })),
      readyCount: captains.filter((team) => ready.has(team.captainId)).length,
      requiredCount: captains.length,
    };
  }

  /**
   * 준비 토글. 전원이 준비되면 그 자리에서 시작한다.
   *
   * @returns 시작됐는지와 준비 현황
   */
  async toggleReady(userId: string, roomId: string) {
    const scrim = await this.prisma.scrim.findUnique({
      where: { roomId },
      select: { id: true, status: true, cutoffAt: true },
    });
    if (!scrim) throw new NotFoundException("시작된 스크림이 없습니다.");
    if (scrim.status !== ScrimStatus.PENDING) {
      throw new BadRequestException("이미 시작한 경기입니다.");
    }

    const captains = await this.loadCaptains(roomId);
    const isCaptain = captains.some((team) => team.captainId === userId);
    if (!isCaptain) {
      throw new ForbiddenException("팀장만 준비할 수 있습니다.");
    }

    const ready = this.readyCaptains.get(roomId) ?? new Set<string>();
    if (ready.has(userId)) ready.delete(userId);
    else ready.add(userId);
    this.readyCaptains.set(roomId, ready);

    const allReady =
      captains.length > 0 &&
      captains.every((team) => ready.has(team.captainId));

    if (!allReady) {
      return { started: false as const, ...(await this.getReadyState(roomId)) };
    }

    // 마지막 팀장이 누른 순간이 시작이다.
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { killMatchDurationMinutes: true },
    });
    const startsAt = new Date();
    await this.prisma.scrim.update({
      where: { id: scrim.id },
      data: {
        status: ScrimStatus.IN_PROGRESS,
        startsAt,
        cutoffAt: new Date(
          startsAt.getTime() + (room?.killMatchDurationMinutes ?? 60) * 60_000,
        ),
      },
    });
    this.readyCaptains.delete(roomId);

    return { started: true as const, ...(await this.getReadyState(roomId)) };
  }

  /** 라운드 시작 — 호스트가 인게임에서 커스텀 매치를 여는 시점 */
  async startRound(hostId: string, roomId: string, roundNumber: number) {
    const { scrim } = await this.findOwnedScrim(hostId, roomId);
    if (scrim.cutoffAt)
      throw new BadRequestException(
        "시간제 킬내기는 경기를 자동으로 등록합니다.",
      );

    const round = await this.prisma.scrimRound.findUnique({
      where: { scrimId_roundNumber: { scrimId: scrim.id, roundNumber } },
    });
    if (!round) throw new NotFoundException("라운드를 찾을 수 없습니다.");
    if (round.status === ScrimRoundStatus.COMPLETED) {
      throw new BadRequestException("이미 결과가 확정된 라운드입니다.");
    }
    const prior = await this.prisma.scrimRound.count({
      where: {
        scrimId: scrim.id,
        roundNumber: { lt: roundNumber },
        status: "COMPLETED",
      },
    });
    if (prior !== roundNumber - 1)
      throw new BadRequestException("이전 경기 결과를 먼저 확정해주세요.");

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
    if (scrim.cutoffAt) {
      const existing = await this.prisma.scrimTeamResult.findMany({
        where: { roundId: round.id },
        select: { teamId: true },
      });
      if (
        dto.results.length !== existing.length ||
        dto.results.some(
          (row) => !existing.some((r) => r.teamId === row.teamId),
        ) ||
        (dto.pubgMatchId && dto.pubgMatchId !== round.pubgMatchId)
      ) {
        throw new BadRequestException(
          "자동 수집한 경기의 참가팀과 경기 ID는 변경할 수 없습니다.",
        );
      }
    }
    const unknown = dto.results.filter((row) => !teamById.has(row.teamId));
    if (unknown.length > 0) {
      throw new BadRequestException("이 방에 없는 팀이 포함되어 있습니다.");
    }

    const teamIds = new Set(dto.results.map((row) => row.teamId));
    if (
      !scrim.cutoffAt &&
      (teamIds.size !== teams.length ||
        dto.results.some((row) => row.placement > teams.length))
    ) {
      throw new BadRequestException(
        "매 경기 모든 팀의 결과와 유효한 순위를 입력해주세요.",
      );
    }
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
          damage: row.damage ?? 0,
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
   * 배틀로얄은 전 경기 완료, 시간제는 종료 시각 이후 결과 확인이 필요하다.
   */
  async completeScrim(hostId: string, roomId: string) {
    const { scrim } = await this.findOwnedScrim(hostId, roomId);
    if (scrim.cutoffAt && new Date() < scrim.cutoffAt)
      throw new BadRequestException("진행시간이 끝난 뒤 확정할 수 있습니다.");
    if (
      scrim.cutoffAt &&
      (scrim.collectionError ||
        (scrim.collectorState as unknown as KillMatchCollectionState)?.pending
          ?.length)
    ) {
      throw new BadRequestException(
        "수집 중인 경기 기록이 있습니다. 자동 수집이 끝난 뒤 확정해주세요.",
      );
    }

    const completed = await this.prisma.scrimRound.count({
      where: { scrimId: scrim.id, status: ScrimRoundStatus.COMPLETED },
    });
    if (!scrim.cutoffAt && completed !== scrim.totalRounds)
      throw new BadRequestException(
        "예정된 모든 경기의 결과를 입력한 뒤 확정해주세요.",
      );
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
      cutoffAt?: Date | null;
      pointRule?: unknown;
      rounds: {
        roundNumber: number;
        results: {
          teamId: string | null;
          teamName: string;
          placement: number;
          kills: number;
          deaths: number;
          damage?: number;
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
        if (!scrim.cutoffAt) {
          const rule = this.readPointRule(scrim.pointRule);
          row.totalPlacementPoints =
            (row.totalPlacementPoints ?? 0) +
            (rule.placementPoints[result.placement - 1] ?? 0);
          row.lastPlacement = result.placement;
          row.lastDamage = result.damage ?? 0;
        }
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
