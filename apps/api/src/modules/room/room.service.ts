import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  Optional,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ShutdownService } from "../common/shutdown.service";
import {
  RoomStatus,
  TeamMode,
  TeamCaptainSelection,
  BracketType,
  MatchStatus,
  Role,
  GameTitle,
  PubgPlatform,
} from "@nexus/database";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomInt } from "crypto";
import {
  normalizeSeriesPreset,
  teamCountForRoomSize,
  isValidRoomSize,
  getGame,
} from "@nexus/types";
import { StreamerService } from "../streamer/streamer.service";
import { RedisService } from "../redis/redis.service";
import { BalanceScoreService } from "../common/balance-score.service";
import { StatsService } from "../stats/stats.service";
import { BALANCE_ROLES } from "../common/balance-score.util";

/** 예고 방 최소 리드타임. 이보다 가까우면 그냥 지금 열면 된다. */
const MIN_SCHEDULE_MINUTES_AHEAD = 10;
/** 예고 방 최대 리드타임. 너무 먼 예약은 잊혀진 채 빈 방으로 남는다. */
const MAX_SCHEDULE_DAYS_AHEAD = 14;

export interface CreateRoomDto {
  name: string;
  password?: string;
  maxParticipants: number;
  teamMode: TeamMode;
  allowSpectators?: boolean;
  discordGuildId?: string;
  /** 어떤 게임의 내전인지. 생략하면 롤이다. */
  gameTitle?: GameTitle;
  pubgPlatform?: PubgPlatform;
  /** 예고제: 내전 예정 시각(ISO 8601). 없으면 지금 바로 여는 방이다. */
  scheduledAt?: string;

  // Auction Settings
  startingPoints?: number;
  minBidIncrement?: number;
  bidTimeLimit?: number;

  // Snake Draft Settings
  pickTimeLimit?: number;
  captainSelection?: TeamCaptainSelection;

  // Tournament bracket format
  bracketFormat?: BracketType;

  // 다전제 프리셋 (@nexus/types의 SeriesPreset 키)
  seriesPreset?: string;
}

export interface JoinRoomDto {
  roomId: string;
  password?: string;
  asSpectator?: boolean;
}

interface AutoBalancePlayer {
  participant: {
    id: string;
    userId: string;
  };
  scores: Record<Role, number>;
  mainRole: Role | null;
  subRole: Role | null;
  registeredRoleTiers: Role[];
}

interface AutoBalancePlacement {
  player: AutoBalancePlayer;
  role: Role;
  score: number;
}

interface AutoBalanceAssignment {
  score: number;
  players: AutoBalancePlacement[];
}

/**
 * 평가 루프에서 쓰는 사전 계산 캐시.
 *
 * evaluateAutoBalanceSlots 는 40인 방 기준 37만 회 호출된다. 그 안에서
 * `scores[role]`(문자열 키 조회)과 registeredRoleTiers.includes() 를 매번 돌면
 * 호출당 비용이 그대로 곱해지므로, 라인 인덱스로 바로 꺼내 쓰도록 미리 편다.
 */
interface PreparedAutoBalancePlayer extends AutoBalancePlayer {
  /** BALANCE_ROLES 순서의 라인별 점수 */
  roleScores: number[];
  /** BALANCE_ROLES 순서의 라인 선호 페널티 */
  rolePenalties: number[];
}

/** 평가 때마다 새로 만들지 않고 재사용하는 계산용 버퍼 */
interface AutoBalanceScratch {
  teamScores: Float64Array;
  lineMin: Float64Array;
  lineMax: Float64Array;
}

/** 되감기용 편성 스냅샷 (팀 생성 순서대로) */
interface AutoBalanceSnapshot {
  teams: Array<{
    captainId: string;
    members: Array<{ userId: string; assignedRole: Role | null }>;
  }>;
}

interface AutoBalanceQuality {
  quality: number;
  teamSpread: number;
  teamDeviation: number;
  lineSpread: number;
  preferencePenalty: number;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private discordBotService: any; // DiscordBotService (optional dependency)
  private discordVoiceService: any; // DiscordVoiceService (optional dependency)

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly shutdownService: ShutdownService,
    private readonly streamerService: StreamerService,
    private readonly balanceScores: BalanceScoreService,
    private readonly statsService: StatsService,
    private readonly redis: RedisService,
    @Optional() @Inject("DISCORD_BOT_SERVICE") discordBot?: any,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordBotService = discordBot;
    this.discordVoiceService = discordVoice;
  }

  /**
   * 동시성 충돌(P2034) 발생 시 직렬화 트랜잭션을 재시도한다.
   */
  private async runSerializableTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        if (error?.code === "P2034" && attempt < maxRetries) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException("트랜잭션 재시도 한도를 초과했습니다.");
  }

  private readonly teamColors = [
    "#60A5FA",
    "#F87171",
    "#34D399",
    "#FBBF24",
    "#A78BFA",
    "#F472B6",
    "#22D3EE",
    "#FB923C",
  ];

  private async createManualTeamSlots(
    tx: Prisma.TransactionClient,
    roomId: string,
    hostId: string,
    maxParticipants: number,
  ) {
    const numTeams = Math.floor(maxParticipants / 5);
    for (let index = 0; index < numTeams; index++) {
      await tx.team.create({
        data: {
          roomId,
          captainId: hostId,
          name: `Team ${index + 1}`,
          color: this.teamColors[index % this.teamColors.length],
        },
      });
    }
  }

  private async clearTeamSetup(
    tx: Prisma.TransactionClient,
    roomId: string,
    resetReady = false,
  ) {
    await tx.roomParticipant.updateMany({
      where: { roomId },
      data: {
        teamId: null,
        isCaptain: false,
        ...(resetReady && { isReady: false }),
      },
    });
    await tx.snakeDraftPick.deleteMany({ where: { roomId } });
    await tx.auctionBid.deleteMany({ where: { roomId } });
    await tx.team.deleteMany({ where: { roomId } });
  }

  private async preserveCompletedMatchesForReuse(
    tx: Prisma.TransactionClient,
    roomId: string,
  ) {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      include: { host: { select: { id: true, username: true } } },
    });
    if (!room) return;

    const [matches, teams] = await Promise.all([
      tx.match.findMany({
        where: { roomId, status: MatchStatus.COMPLETED },
        select: {
          id: true,
          roomName: true,
          teamAId: true,
          teamAIdSnapshot: true,
          teamBId: true,
          teamBIdSnapshot: true,
          winnerId: true,
          winnerIdSnapshot: true,
          _count: { select: { rosterSnapshots: true } },
        },
      }),
      tx.team.findMany({
        where: { roomId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  riotAccounts: {
                    where: { isPrimary: true },
                    take: 1,
                    select: { puuid: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const teamsById = new Map(teams.map((team) => [team.id, team]));

    for (const match of matches) {
      const teamAId = match.teamAId ?? match.teamAIdSnapshot;
      const teamBId = match.teamBId ?? match.teamBIdSnapshot;
      const winnerId = match.winnerId ?? match.winnerIdSnapshot;
      const teamA = teamAId ? teamsById.get(teamAId) : null;
      const teamB = teamBId ? teamsById.get(teamBId) : null;
      const winner = winnerId ? teamsById.get(winnerId) : null;

      await tx.match.update({
        where: { id: match.id },
        data: {
          isInternal: true,
          roomIdSnapshot: room.id,
          roomName: match.roomName ?? room.name,
          roomTeamMode: room.teamMode,
          roomHostId: room.host.id,
          roomHostName: room.host.username,
          teamAIdSnapshot: teamAId,
          teamAName: teamA?.name,
          teamBIdSnapshot: teamBId,
          teamBName: teamB?.name,
          winnerIdSnapshot: winnerId,
          winnerName: winner?.name,
          roomId: null,
          teamAId: null,
          teamBId: null,
          winnerId: null,
        },
      });

      if (match._count.rosterSnapshots === 0) {
        const roster = [
          ...(teamA?.members ?? []).map((member) => ({
            matchId: match.id,
            userId: member.userId,
            username: member.user.username,
            puuid: member.user.riotAccounts[0]?.puuid ?? null,
            // 라인별 전적용 — assignedRole 은 방과 함께 사라지므로 여기서 복사한다
            assignedRole: member.assignedRole ?? null,
            teamSlot: "A",
            teamIdSnapshot: teamAId,
            teamName: teamA?.name ?? "Team A",
          })),
          ...(teamB?.members ?? []).map((member) => ({
            matchId: match.id,
            userId: member.userId,
            username: member.user.username,
            puuid: member.user.riotAccounts[0]?.puuid ?? null,
            assignedRole: member.assignedRole ?? null,
            teamSlot: "B",
            teamIdSnapshot: teamBId,
            teamName: teamB?.name ?? "Team B",
          })),
        ];
        if (roster.length > 0) {
          await tx.matchRosterSnapshot.createMany({ data: roster });
        }
      }

      for (const [teamId, team] of [
        [teamAId, teamA],
        [teamBId, teamB],
      ] as const) {
        if (!teamId) continue;
        const data = {
          teamIdSnapshot: teamId,
          teamName: team?.name,
          teamId: null,
        };
        await tx.matchParticipant.updateMany({
          where: { matchId: match.id, teamId },
          data,
        });
        await tx.matchTeamStats.updateMany({
          where: { matchId: match.id, teamId },
          data,
        });
      }
    }
  }

  async deleteRoomData(roomId: string) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { host: { select: { id: true, username: true } } },
      });
      if (!room) return;

      const matches = await tx.match.findMany({
        where: { roomId },
        select: {
          id: true,
          status: true,
          roomName: true,
          teamAId: true,
          teamAIdSnapshot: true,
          teamBId: true,
          teamBIdSnapshot: true,
          winnerId: true,
          winnerIdSnapshot: true,
          _count: { select: { rosterSnapshots: true } },
        },
      });
      const teams = await tx.team.findMany({
        where: { roomId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  riotAccounts: {
                    where: { isPrimary: true },
                    take: 1,
                    select: { puuid: true },
                  },
                },
              },
            },
          },
        },
      });

      const completedMatches = matches.filter(
        (match) => match.status === MatchStatus.COMPLETED,
      );
      const disposableMatchIds = matches
        .filter((match) => match.status !== MatchStatus.COMPLETED)
        .map((match) => match.id);
      const teamIds = teams.map((team) => team.id);
      const teamsById = new Map(teams.map((team) => [team.id, team]));

      // 완료 매치는 방/팀 삭제 전에 독립 스냅샷을 확정하고 FK만 분리한다.
      for (const match of completedMatches) {
        const teamAId = match.teamAId ?? match.teamAIdSnapshot;
        const teamBId = match.teamBId ?? match.teamBIdSnapshot;
        const winnerId = match.winnerId ?? match.winnerIdSnapshot;
        const teamA = teamAId ? teamsById.get(teamAId) : null;
        const teamB = teamBId ? teamsById.get(teamBId) : null;
        const winner = winnerId ? teamsById.get(winnerId) : null;

        await tx.match.update({
          where: { id: match.id },
          data: {
            isInternal: true,
            roomIdSnapshot: room.id,
            roomName: match.roomName ?? room.name,
            roomTeamMode: room.teamMode,
            roomHostId: room.host.id,
            roomHostName: room.host.username,
            teamAIdSnapshot: teamAId,
            teamAName: teamA?.name,
            teamBIdSnapshot: teamBId,
            teamBName: teamB?.name,
            winnerIdSnapshot: winnerId,
            winnerName: winner?.name,
            roomId: null,
            teamAId: null,
            teamBId: null,
            winnerId: null,
          },
        });

        if (match._count.rosterSnapshots === 0) {
          const roster = [
            ...(teamA?.members ?? []).map((member) => ({
              matchId: match.id,
              userId: member.userId,
              username: member.user.username,
              puuid: member.user.riotAccounts[0]?.puuid ?? null,
              // 라인별 전적용 — assignedRole 은 방과 함께 사라지므로 여기서 복사한다
              assignedRole: member.assignedRole ?? null,
              teamSlot: "A",
              teamIdSnapshot: teamAId,
              teamName: teamA?.name ?? "Team A",
            })),
            ...(teamB?.members ?? []).map((member) => ({
              matchId: match.id,
              userId: member.userId,
              username: member.user.username,
              puuid: member.user.riotAccounts[0]?.puuid ?? null,
              assignedRole: member.assignedRole ?? null,
              teamSlot: "B",
              teamIdSnapshot: teamBId,
              teamName: teamB?.name ?? "Team B",
            })),
          ];
          if (roster.length > 0) {
            await tx.matchRosterSnapshot.createMany({ data: roster });
          }
        }

        if (teamAId) {
          await tx.matchParticipant.updateMany({
            where: { matchId: match.id, teamId: teamAId },
            data: {
              teamIdSnapshot: teamAId,
              teamName: teamA?.name,
              teamId: null,
            },
          });
          await tx.matchTeamStats.updateMany({
            where: { matchId: match.id, teamId: teamAId },
            data: {
              teamIdSnapshot: teamAId,
              teamName: teamA?.name,
              teamId: null,
            },
          });
        }
        if (teamBId) {
          await tx.matchParticipant.updateMany({
            where: { matchId: match.id, teamId: teamBId },
            data: {
              teamIdSnapshot: teamBId,
              teamName: teamB?.name,
              teamId: null,
            },
          });
          await tx.matchTeamStats.updateMany({
            where: { matchId: match.id, teamId: teamBId },
            data: {
              teamIdSnapshot: teamBId,
              teamName: teamB?.name,
              teamId: null,
            },
          });
        }
      }

      if (disposableMatchIds.length > 0) {
        await tx.userReport.updateMany({
          where: { matchId: { in: disposableMatchIds } },
          data: { matchId: null },
        });
        await tx.userRating.deleteMany({
          where: { matchId: { in: disposableMatchIds } },
        });
        await tx.matchVote.deleteMany({
          where: { matchId: { in: disposableMatchIds } },
        });
        await tx.matchTeamStats.deleteMany({
          where: { matchId: { in: disposableMatchIds } },
        });
        await tx.matchParticipant.deleteMany({
          where: { matchId: { in: disposableMatchIds } },
        });
        await tx.match.deleteMany({
          where: { id: { in: disposableMatchIds } },
        });
      }

      await tx.snakeDraftPick.deleteMany({ where: { roomId } });
      await tx.auctionBid.deleteMany({ where: { roomId } });

      if (teamIds.length > 0) {
        await tx.teamMember.deleteMany({
          where: { teamId: { in: teamIds } },
        });
      }

      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: { teamId: null },
      });
      await tx.roomParticipant.deleteMany({ where: { roomId } });
      await tx.roomDiscordChannel.deleteMany({ where: { roomId } });
      await tx.chatMessage.updateMany({
        where: { roomId },
        data: { roomId: null },
      });
      await tx.team.deleteMany({ where: { roomId } });
      await tx.room.delete({ where: { id: roomId } });
    });
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = randomInt(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  private getRolePreferencePenalty(
    player: AutoBalancePlayer,
    role: Role,
  ): number {
    if (player.mainRole === role) return 0;
    if (player.subRole === role) return 0.75;
    if (player.registeredRoleTiers.includes(role)) return 1.25;
    if (!player.mainRole && !player.subRole) return 1.5;
    return 4;
  }

  /** 선수마다 라인별 점수·페널티를 한 번만 펴 둔다 (평가 루프 진입 전 1회) */
  private prepareAutoBalancePlayers(
    players: AutoBalancePlayer[],
  ): PreparedAutoBalancePlayer[] {
    return players.map((player) => ({
      ...player,
      roleScores: BALANCE_ROLES.map((role) => player.scores[role]),
      rolePenalties: BALANCE_ROLES.map((role) =>
        this.getRolePreferencePenalty(player, role),
      ),
    }));
  }

  /**
   * 슬롯 배치의 품질을 계산한다. 값이 작을수록 좋다.
   *
   * 이 함수는 힐클라이밍 내부에서 40인 방 기준 37만 회 이상 호출되므로
   * 호출당 할당이 없어야 한다. 팀 점수 버퍼는 재사용하고, 라인 편차는
   * 배열에 모아 max/min 을 다시 구하는 대신 순회하면서 최소·최대만 갱신한다.
   */
  private evaluateAutoBalanceSlots(
    slotPlayers: PreparedAutoBalancePlayer[],
    teamCount: number,
    scratch: AutoBalanceScratch,
  ): AutoBalanceQuality {
    const roleCount = BALANCE_ROLES.length;
    const { teamScores, lineMin, lineMax } = scratch;
    teamScores.fill(0);
    lineMin.fill(Number.POSITIVE_INFINITY);
    lineMax.fill(Number.NEGATIVE_INFINITY);

    let preferencePenalty = 0;
    let totalScore = 0;

    for (let index = 0; index < slotPlayers.length; index++) {
      const player = slotPlayers[index];
      const teamIndex = (index / roleCount) | 0;
      const roleIndex = index % roleCount;
      const score = player.roleScores[roleIndex];

      teamScores[teamIndex] += score;
      totalScore += score;
      if (score < lineMin[roleIndex]) lineMin[roleIndex] = score;
      if (score > lineMax[roleIndex]) lineMax[roleIndex] = score;
      preferencePenalty += player.rolePenalties[roleIndex];
    }

    const averageTeamScore = totalScore / teamCount;
    let teamMin = Number.POSITIVE_INFINITY;
    let teamMax = Number.NEGATIVE_INFINITY;
    let squaredSum = 0;
    for (let team = 0; team < teamCount; team++) {
      const score = teamScores[team];
      if (score < teamMin) teamMin = score;
      if (score > teamMax) teamMax = score;
      const diff = score - averageTeamScore;
      squaredSum += diff * diff;
    }

    let lineSpreadSum = 0;
    for (let roleIndex = 0; roleIndex < roleCount; roleIndex++) {
      lineSpreadSum += lineMax[roleIndex] - lineMin[roleIndex];
    }

    const teamSpread = teamMax - teamMin;
    const teamDeviation = Math.sqrt(squaredSum / teamCount);
    const lineSpread = lineSpreadSum / roleCount;

    return {
      teamSpread,
      teamDeviation,
      lineSpread,
      preferencePenalty,
      quality:
        teamSpread * 6 +
        teamDeviation * 3 +
        lineSpread * 2 +
        preferencePenalty * 2,
    };
  }

  private buildAutoBalanceAssignments(
    slotPlayers: PreparedAutoBalancePlayer[],
    teamCount: number,
  ): AutoBalanceAssignment[] {
    return Array.from({ length: teamCount }, (_, teamIndex) => {
      const players = BALANCE_ROLES.map((role, roleIndex) => {
        const player =
          slotPlayers[teamIndex * BALANCE_ROLES.length + roleIndex];
        return { player, role, score: player.scores[role] };
      });
      return {
        players,
        score: players.reduce((sum, placement) => sum + placement.score, 0),
      };
    });
  }

  /**
   * 슬롯 배열을 만든다. 고정된 선수는 지정된 자리에 먼저 앉히고 나머지만 섞는다.
   * (방장이 마음에 드는 배치를 남기고 나머지만 다시 돌리는 "주사위" 동작)
   */
  private createRoleAwareAutoBalanceSlots(
    players: PreparedAutoBalancePlayer[],
    teamCount: number,
    lockedSlots?: Map<number, PreparedAutoBalancePlayer>,
  ): PreparedAutoBalancePlayer[] {
    const roleCount = BALANCE_ROLES.length;

    if (lockedSlots && lockedSlots.size > 0) {
      const slots = new Array<PreparedAutoBalancePlayer | undefined>(
        teamCount * roleCount,
      );
      const lockedPlayers = new Set(lockedSlots.values());
      for (const [slotIndex, player] of lockedSlots) {
        slots[slotIndex] = player;
      }

      // 고정되지 않은 선수를 남은 자리에 섞어 넣는다.
      const free = this.shuffle(
        players.filter((player) => !lockedPlayers.has(player)),
      );
      let cursor = 0;
      for (let index = 0; index < slots.length; index++) {
        if (!slots[index]) slots[index] = free[cursor++];
      }
      return slots.filter((player): player is PreparedAutoBalancePlayer =>
        Boolean(player),
      );
    }

    const remaining = new Set(players);
    const roleBuckets = new Map<Role, PreparedAutoBalancePlayer[]>();
    const rolesByScarcity = [...BALANCE_ROLES].sort((left, right) => {
      const preferredCount = (role: Role) =>
        players.filter(
          (player) => player.mainRole === role || player.subRole === role,
        ).length;
      return preferredCount(left) - preferredCount(right);
    });

    for (const role of rolesByScarcity) {
      const candidates = this.shuffle([...remaining]).sort(
        (left, right) =>
          this.getRolePreferencePenalty(left, role) -
          this.getRolePreferencePenalty(right, role),
      );
      const selected = candidates.slice(0, teamCount);
      roleBuckets.set(role, this.shuffle(selected));
      selected.forEach((player) => remaining.delete(player));
    }

    return Array.from({ length: teamCount }, (_, teamIndex) =>
      BALANCE_ROLES.map((role) => roleBuckets.get(role)?.[teamIndex]),
    )
      .flat()
      .filter((player): player is PreparedAutoBalancePlayer => Boolean(player));
  }

  /**
   * @param pins 고정할 배치 (userId → 팀 인덱스/라인). 다시 편성할 때 방장이
   *   마음에 드는 자리를 남기고 나머지만 돌리기 위한 것.
   */
  private chooseAutoBalancedAssignments(
    players: AutoBalancePlayer[],
    teamCount: number,
    pins?: Map<string, { teamIndex: number; role: Role }>,
  ): AutoBalanceAssignment[] {
    const expectedSlots = teamCount * BALANCE_ROLES.length;
    if (players.length !== expectedSlots) {
      // 슬롯 인덱스로 팀·라인을 역산하므로 인원이 정확히 맞지 않으면 배치가
      // 통째로 밀린다. 조용히 어긋나면 추적이 어려워 여기서 끊는다.
      throw new BadRequestException(
        `자동 밸런스는 ${expectedSlots}명이 정확히 필요합니다. (현재 ${players.length}명)`,
      );
    }

    const prepared = this.prepareAutoBalancePlayers(players);
    const scratch: AutoBalanceScratch = {
      teamScores: new Float64Array(teamCount),
      lineMin: new Float64Array(BALANCE_ROLES.length),
      lineMax: new Float64Array(BALANCE_ROLES.length),
    };

    // 고정 배치를 슬롯 인덱스로 환산한다. 잘못된 팀/라인 지정은 무시하고
    // 자유 슬롯으로 흘려보낸다 (방 구성이 바뀐 뒤의 오래된 요청 대비).
    const lockedSlots = new Map<number, PreparedAutoBalancePlayer>();
    const lockedSlotIndices = new Set<number>();
    if (pins && pins.size > 0) {
      for (const player of prepared) {
        const pin = pins.get(player.participant.userId);
        if (!pin) continue;
        const roleIndex = BALANCE_ROLES.indexOf(pin.role);
        if (roleIndex < 0) continue;
        if (pin.teamIndex < 0 || pin.teamIndex >= teamCount) continue;

        const slotIndex = pin.teamIndex * BALANCE_ROLES.length + roleIndex;
        // 같은 자리에 둘을 고정할 수는 없다. 먼저 온 쪽을 살린다.
        if (lockedSlots.has(slotIndex)) continue;
        lockedSlots.set(slotIndex, player);
        lockedSlotIndices.add(slotIndex);
      }
    }

    const restartCount = teamCount <= 4 ? 36 : 24;
    const maxPasses = teamCount <= 4 ? 30 : 20;
    let bestSlots: PreparedAutoBalancePlayer[] | null = null;
    let bestQuality = Number.POSITIVE_INFINITY;

    for (let restart = 0; restart < restartCount; restart++) {
      const slots = this.createRoleAwareAutoBalanceSlots(
        prepared,
        teamCount,
        lockedSlots,
      );
      let current = this.evaluateAutoBalanceSlots(slots, teamCount, scratch);

      for (let pass = 0; pass < maxPasses; pass++) {
        let bestSwap: [number, number] | null = null;
        let passBestQuality = current.quality;

        for (let left = 0; left < slots.length - 1; left++) {
          if (lockedSlotIndices.has(left)) continue;
          for (let right = left + 1; right < slots.length; right++) {
            if (lockedSlotIndices.has(right)) continue;
            [slots[left], slots[right]] = [slots[right], slots[left]];
            const candidate = this.evaluateAutoBalanceSlots(
              slots,
              teamCount,
              scratch,
            );
            [slots[left], slots[right]] = [slots[right], slots[left]];

            if (candidate.quality + 0.0001 < passBestQuality) {
              passBestQuality = candidate.quality;
              bestSwap = [left, right];
            }
          }
        }

        if (!bestSwap) break;
        [slots[bestSwap[0]], slots[bestSwap[1]]] = [
          slots[bestSwap[1]],
          slots[bestSwap[0]],
        ];
        current = this.evaluateAutoBalanceSlots(slots, teamCount, scratch);
      }

      if (current.quality < bestQuality) {
        bestQuality = current.quality;
        bestSlots = [...slots];
      }
    }

    if (!bestSlots) {
      throw new BadRequestException("자동 밸런스 팀 구성을 만들 수 없습니다.");
    }

    return this.buildAutoBalanceAssignments(bestSlots, teamCount);
  }

  // Transform room data to flatten participant info for frontend
  /**
   * 미리 계산해 둔 라인별 밸런스 점수를 읽는다.
   *
   * 자동 밸런스가 쓰는 값과 같은 캐시라, 화면에 보이는 점수와 팀을 나눌 때 쓰는
   * 점수가 항상 일치한다. 라이엇 계정이 없거나 아직 계산 전이면 null 이다.
   */
  private buildParticipantBalance(user: any) {
    const account = user?.riotAccounts?.[0];
    if (!account) return null;

    // 저장된 캐시만 읽는다. 값이 없거나 산식 버전이 다르면 표시하지 않는다.
    // (계정 갱신·내전 종료 때 BalanceScoreService 가 다시 채운다)
    const byRole = this.balanceScores.readCached(account);
    if (!byRole) return null;

    // 대표 점수: 주라인 → 부라인 → 가장 높은 라인 순으로 고른다.
    const primaryRole: Role | null =
      account.mainRole ?? account.subRole ?? null;
    const primaryScore = primaryRole
      ? byRole[primaryRole]
      : Math.max(...Object.values(byRole));

    return { byRole, primaryRole, primaryScore };
  }

  private transformRoomData(room: any) {
    if (!room) return room;

    // 팀이 짜인 뒤에는 배정된 라인이 곧 그 사람의 자리다. 대표 라인 점수 대신
    // 배정 라인 점수를 보여줘야 호버 없이도 팀 구성 근거가 읽힌다.
    const assignedRoleByUser = new Map<string, Role>();
    for (const team of room.teams ?? []) {
      for (const member of team.members ?? []) {
        if (member.userId && member.assignedRole) {
          assignedRoleByUser.set(member.userId, member.assignedRole);
        }
      }
    }

    // 팀별 밸런스 합계 — 방장이 편성을 확인할 때 팀 간 격차를 바로 보게 한다.
    const teamBalanceTotals = new Map<string, number>();
    for (const team of room.teams ?? []) {
      let total = 0;
      let counted = 0;
      for (const member of team.members ?? []) {
        const scores = this.balanceScores.readCached(
          member.user?.riotAccounts?.[0] ?? {},
        );
        const role = member.assignedRole;
        if (!scores || !role) continue;
        total += scores[role as Role];
        counted += 1;
      }
      // 한 명이라도 점수를 못 읽으면 합계가 오해를 부르므로 표시하지 않는다.
      if (counted === (team.members?.length ?? 0) && counted > 0) {
        teamBalanceTotals.set(team.id, Math.round(total * 10) / 10);
      }
    }

    return {
      ...room,
      teams: room.teams?.map((team: any) => ({
        ...team,
        balanceTotal: teamBalanceTotals.get(team.id) ?? null,
      })),
      participants: room.participants?.map((p: any) => {
        const balance = this.buildParticipantBalance(p.user);
        const assignedRole = assignedRoleByUser.get(p.userId) ?? null;
        const displayRole = assignedRole ?? balance?.primaryRole ?? null;
        const displayScore =
          displayRole && balance ? balance.byRole[displayRole] : null;
        return {
          id: p.id,
          userId: p.userId,
          username: p.user?.username || "Unknown",
          avatar: p.user?.avatar || null,
          isHost: p.userId === room.hostId,
          isReady: p.isReady,
          isCaptain: p.isCaptain,
          teamId: p.teamId,
          role: p.role,
          riotAccount: p.user?.riotAccounts?.[0] || null,
          pubgAccount: p.user?.pubgAccounts?.[0] || null,
          assignedRole,
          // 자동 밸런스와 같은 캐시에서 읽은 라인별 점수
          balanceScores: balance?.byRole ?? null,
          // 표시용 대표 점수 — 배정 라인이 있으면 그 라인, 없으면 주/부라인 기준
          balanceScore: displayScore ?? balance?.primaryScore ?? null,
          balanceScoreRole: displayRole,
        };
      }),
    };
  }

  // ========================================
  // Room Creation & Management
  // ========================================

  async createRoom(hostId: string, dto: CreateRoomDto) {
    // 서버 종료 진행 중이면 신규 방 생성 차단
    if (this.shutdownService.isShuttingDown()) {
      throw new ServiceUnavailableException(
        "서버가 점검 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    // 게임마다 팀 인원·계정 요구사항이 다르다.
    const gameTitle = dto.gameTitle ?? GameTitle.LOL;
    const game = getGame(gameTitle);
    const roomName =
      gameTitle === GameTitle.PUBG && dto.pubgPlatform
        ? `[${dto.pubgPlatform === "STEAM" ? "스배" : "카배"}] ${dto.name.trim()}`
        : dto.name.trim();
    if (roomName.length > 50) {
      throw new BadRequestException(
        "플랫폼 접두사를 포함한 방 제목은 50자를 초과할 수 없습니다.",
      );
    }

    // ========================================
    // Discord + 게임 계정 연동 필수 체크 (관리자는 면제)
    // ========================================
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { role: true },
    });
    const isAdmin = host?.role === "ADMIN";

    if (!isAdmin) {
      const discordProvider = await this.prisma.authProvider.findFirst({
        where: { userId: hostId, provider: "DISCORD" },
      });
      if (!discordProvider) {
        throw new BadRequestException(
          "DISCORD_NOT_LINKED::Discord 계정 연동이 필요합니다. 설정 페이지에서 Discord 계정을 연동해주세요.",
        );
      }

      if (gameTitle === GameTitle.PUBG) {
        const pubgAccount = await this.prisma.pubgAccount.findFirst({
          where: { userId: hostId },
        });
        if (!pubgAccount) {
          throw new BadRequestException(
            "PUBG_NOT_LINKED::PUBG 계정 등록이 필요합니다. PUBG 프로필에서 Steam 또는 Kakao 계정을 등록해주세요.",
          );
        }
      } else {
        const riotAccount = await this.prisma.riotAccount.findFirst({
          where: { userId: hostId, isPrimary: true },
        });
        if (!riotAccount) {
          throw new BadRequestException(
            "RIOT_NOT_LINKED::Riot 계정 연동이 필요합니다. 프로필 페이지에서 Riot 계정을 연동해주세요.",
          );
        }
      }
    }

    // 게임마다 팀 인원이 달라 고를 수 있는 정원도 다르다.
    if (!game.enabled) {
      throw new BadRequestException(`${game.label} 내전은 아직 준비 중입니다.`);
    }
    if (!isValidRoomSize(dto.maxParticipants, gameTitle)) {
      throw new BadRequestException(
        `정원은 ${game.roomSizes.join(", ")}명 중에서 골라주세요.`,
      );
    }

    // 게임 설정값 서비스 레이어 재검증 — ValidationPipe 우회 방어
    this.validateGameSettings(dto);

    // 예고제: 예정 시각 검증. 지난 시각은 리마인드가 즉시 몰리고,
    // 너무 먼 예약은 아무도 기억하지 못한 채 빈 방으로 남는다.
    let scheduledAt: Date | null = null;
    if (dto.scheduledAt) {
      const parsed = new Date(dto.scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException("예정 시각을 해석할 수 없습니다.");
      }
      const minutesAhead = (parsed.getTime() - Date.now()) / 60000;
      if (minutesAhead < MIN_SCHEDULE_MINUTES_AHEAD) {
        throw new BadRequestException(
          `예정 시각은 지금부터 ${MIN_SCHEDULE_MINUTES_AHEAD}분 이후로 잡아주세요.`,
        );
      }
      if (minutesAhead > MAX_SCHEDULE_DAYS_AHEAD * 24 * 60) {
        throw new BadRequestException(
          `예정 시각은 최대 ${MAX_SCHEDULE_DAYS_AHEAD}일 뒤까지만 지정할 수 있습니다.`,
        );
      }
      scheduledAt = parsed;
    }

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (dto.password) {
      hashedPassword = await bcrypt.hash(dto.password, 10);
    }

    // null means Nexus home server; explicit guild IDs must belong to the host.
    let resolvedDiscordGuildId: string | null = null;
    if (dto.discordGuildId) {
      const activeGuildLink = await this.prisma.discordGuildLink.findFirst({
        where: {
          ownerId: hostId,
          guildId: dto.discordGuildId,
          status: "ACTIVE",
        },
        select: { guildId: true },
      });

      if (!activeGuildLink) {
        throw new BadRequestException(
          "DISCORD_GUILD_NOT_ALLOWED::선택한 Discord 서버를 사용할 수 없습니다.",
        );
      }

      resolvedDiscordGuildId = activeGuildLink.guildId;
    }

    // 방(Room) + 자유 팀 슬롯을 하나의 트랜잭션으로 묶는다.
    // 슬롯 생성 등 중간 단계에서 예외가 나면 Room까지 통째로 롤백돼
    // "방 생성 실패"인데 orphan 방만 남는 상황을 막는다.
    const room = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const created = await tx.room.create({
          data: {
            name: roomName,
            hostId,
            password: hashedPassword,
            maxParticipants: dto.maxParticipants,
            isPrivate: !!dto.password,
            teamMode: dto.teamMode,
            allowSpectators: dto.allowSpectators ?? true,
            discordGuildId: resolvedDiscordGuildId,
            gameTitle,
            pubgPlatform:
              gameTitle === GameTitle.PUBG ? dto.pubgPlatform : null,
            scheduledAt,

            // Draft settings
            startingPoints: dto.startingPoints,
            minBidIncrement: dto.minBidIncrement,
            bidTimeLimit: dto.bidTimeLimit,
            pickTimeLimit: dto.pickTimeLimit,
            captainSelection: dto.captainSelection,
            ...(dto.bracketFormat && { bracketFormat: dto.bracketFormat }),
            // 팀 수에 맞지 않는 프리셋은 단판으로 떨어뜨린다.
            seriesPreset: normalizeSeriesPreset(
              dto.seriesPreset,
              teamCountForRoomSize(dto.maxParticipants, gameTitle),
            ),

            participants: {
              create: {
                userId: hostId,
                role: "PLAYER",
                isReady: true,
              },
            },
          },
          include: {
            host: {
              select: {
                id: true,
                username: true,
                avatar: true,
                reputation: true,
              },
            },
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                    reputation: true,
                  },
                },
              },
            },
          },
        });

        if (dto.teamMode === TeamMode.MANUAL_TEAM) {
          await this.createManualTeamSlots(
            tx,
            created.id,
            hostId,
            dto.maxParticipants,
          );
        }

        return created;
      },
    );

    // Discord 봇 연동: 팀별 음성채널 생성
    // 예고 방은 여기서 만들지 않는다. 몇 시간 뒤 내전 때문에 지금부터
    // 빈 채널이 서버에 방치되면 예약이 쌓일수록 채널 목록이 무너진다.
    // 시작 10분 전 리마인드와 같은 타이밍에 DiscordScheduleService가 만든다.
    let lobbyVoiceChannelId: string | undefined;
    try {
      if (this.discordVoiceService && !scheduledAt) {
        const numTeams = Math.floor(dto.maxParticipants / 5);

        // 카테고리 + 내전 대기실 + 팀별 음성채널 생성
        const channelData = await this.discordVoiceService.createRoomChannels(
          room.id,
          room.name,
          numTeams,
        );
        lobbyVoiceChannelId = channelData.lobbyChannelId;

        // 룸에 Discord 카테고리 ID 저장
        await this.prisma.room.update({
          where: { id: room.id },
          data: {
            discordCategoryId: channelData.categoryId,
          },
        });
      }
    } catch (error) {
      // Discord 채널 생성 실패해도 룸 생성은 성공
      this.logger.warn("Failed to create Discord channels for room:", error);
    }

    // Send Discord notification (if bot is configured)
    try {
      if (this.discordBotService) {
        // 사본에 "어느 서버에서 열린 내전인지"를 표시하기 위한 원 서버 이름.
        const originLink = room.discordGuildId
          ? await this.prisma.discordGuildLink.findUnique({
              where: { guildId: room.discordGuildId },
              select: { guildName: true },
            })
          : null;
        const originGuildName = originLink?.guildName ?? null;

        // 서버 하나로는 5v5 정원 10명을 채우기 어렵다(실측: 방 4개 최대 참가 5명).
        // 원 서버 + 교차 공지를 허용한 연동 서버들에 함께 모집을 올린다.
        const targets =
          (await this.discordVoiceService?.getRoomAnnounceTargets?.(room.id)) ??
          [];

        // 한 서버 발송이 실패해도 나머지는 올라가야 한다.
        const results = await Promise.allSettled(
          targets.map(async (target: any) => {
            const messageId =
              await this.discordBotService.sendRoomRecruitMessage(
                target.guildId,
                target.channelId,
                {
                  roomId: room.id,
                  roomName: room.name,
                  hostName: room.host.username,
                  maxPlayers: room.maxParticipants,
                  teamMode: room.teamMode,
                  isPrivate: room.isPrivate,
                  participants: [room.host.username], // 방 생성 시 방장 1명
                  voiceChannelId: lobbyVoiceChannelId,
                  scheduledAt,
                  // 사본에는 원 서버 이름을 표시한다. 출처를 숨기면 우리 서버
                  // 공지로 오해하고 들어왔다가 낯선 사람들과 만나게 된다.
                  originGuildName: target.isOrigin
                    ? null
                    : (originGuildName ?? null),
                },
              );

            if (!messageId) {
              this.logger.warn(
                `[RoomNotify] room ${room.id}: 전송 실패 (guild=${target.guildId} channel=${target.channelId}) — 채널 미존재/텍스트 아님(봇 권한 포함)`,
              );
              return null;
            }

            return {
              guildId: target.guildId,
              channelId: target.channelId,
              messageId,
              roomName: room.name,
              hostName: room.host.username,
              maxPlayers: room.maxParticipants,
              teamMode: room.teamMode,
              isPrivate: room.isPrivate,
              voiceChannelId: lobbyVoiceChannelId,
              scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
              isOrigin: target.isOrigin,
              originGuildName: target.isOrigin ? null : originGuildName,
            };
          }),
        );

        const entries = results
          .filter(
            (r): r is PromiseFulfilledResult<any> =>
              r.status === "fulfilled" && r.value !== null,
          )
          .map((r) => r.value);

        if (entries.length > 0) {
          this.discordBotService.storeRoomNotifications(room.id, entries);
          this.logger.log(
            `[RoomNotify] room ${room.id}: ${entries.length}/${targets.length}개 서버에 모집 공지 발송`,
          );
        }
      }
    } catch (error) {
      // Don't fail room creation if Discord notification fails
      this.logger.warn(
        "Failed to send Discord room creation notification:",
        error,
      );
    }

    return dto.teamMode === TeamMode.MANUAL_TEAM
      ? this.getRoomById(room.id)
      : this.transformRoomData(room);
  }

  /**
   * 방 목록용 요약 데이터 조회 (delta update 전송 시 사용)
   * listRooms()와 동일한 select 구조로 단일 방만 조회한다.
   */
  async getRoomSummary(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        host: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        participants: {
          select: {
            id: true,
            userId: true,
            role: true,
          },
        },
      },
    });
  }

  /** WAITING 상태 방과 참가자 목록 조회 (좀비 정리용) */
  async getWaitingRoomsWithParticipants() {
    return this.prisma.room.findMany({
      where: { status: RoomStatus.WAITING },
      select: {
        id: true,
        participants: {
          select: { userId: true },
        },
      },
    });
  }

  /** COMPLETED 상태이면서 참가자가 남아있는 방 목록 반환 (좀비 정리용) */
  async getCompletedRoomsWithParticipants() {
    return this.prisma.room.findMany({
      where: { status: RoomStatus.COMPLETED },
      select: {
        id: true,
        participants: {
          select: { userId: true },
        },
      },
    });
  }

  /** 방 상태만 빠르게 조회 (disconnect 등 경량 체크용) */
  async getRoomStatus(roomId: string): Promise<RoomStatus | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { status: true },
    });
    return room?.status ?? null;
  }

  async getRoomById(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        host: {
          select: {
            id: true,
            username: true,
            avatar: true,
            reputation: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                reputation: true,
                riotAccounts: {
                  where: { isPrimary: true },
                  select: {
                    gameName: true,
                    tagLine: true,
                    tier: true,
                    rank: true,
                    lp: true,
                    peakTier: true,
                    peakRank: true,
                    mainRole: true,
                    subRole: true,
                    // 미리 계산해 둔 라인별 밸런스 점수 (BalanceScoreService)
                    balanceScores: true,
                    balanceScoreVersion: true,
                    roleTiers: {
                      select: { role: true, tier: true, rank: true, lp: true },
                    },
                    championPreferences: {
                      select: {
                        role: true,
                        championId: true,
                        order: true,
                      },
                      orderBy: { order: "asc" },
                      take: 15, // 역할당 3개 × 5역할 = 최대 15개로 제한
                    },
                  },
                },
                pubgAccounts: {
                  orderBy: { createdAt: "asc" },
                  take: 2,
                  select: {
                    platform: true,
                    playerName: true,
                    verificationStatus: true,
                    pubgTier: true,
                    nexusTier: true,
                    nexusScore: true,
                    combatScore: true,
                    iglScore: true,
                    teamplayScore: true,
                    consistencyScore: true,
                    experienceScore: true,
                  },
                },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        teams: {
          include: {
            captain: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
            members: {
              select: {
                id: true,
                userId: true,
                assignedRole: true,
                pickOrder: true,
                soldPrice: true,
                joinedAt: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                    riotAccounts: {
                      where: { isPrimary: true },
                      select: {
                        gameName: true,
                        tagLine: true,
                        tier: true,
                        rank: true,
                        peakTier: true,
                        peakRank: true,
                        mainRole: true,
                        subRole: true,
                        // 팀 합계 계산용 밸런스 점수 캐시
                        balanceScores: true,
                        balanceScoreVersion: true,
                        roleTiers: {
                          select: {
                            role: true,
                            tier: true,
                            rank: true,
                            lp: true,
                          },
                        },
                        championPreferences: {
                          select: {
                            role: true,
                            championId: true,
                            order: true,
                          },
                          orderBy: { order: "asc" },
                          take: 15,
                        },
                      },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    return this.transformRoomData(room);
  }

  private readonly validRoomStatuses = new Set<RoomStatus>([
    "WAITING",
    "TEAM_SELECTION",
    "DRAFT",
    "DRAFT_COMPLETED",
    "ROLE_SELECTION",
    "IN_PROGRESS",
    "COMPLETED",
  ]);
  private readonly validTeamModes = new Set<TeamMode>([
    "SNAKE_DRAFT",
    "AUCTION",
    "AUTO_BALANCE",
    "MANUAL_TEAM",
  ]);

  async listRoomsPage(filters?: {
    gameTitle?: "LOL" | "PUBG";
    status?: "WAITING" | "IN_PROGRESS" | "COMPLETED";
    teamMode?: TeamMode;
    includePrivate?: boolean;
    search?: string;
    sort?: "newest" | "oldest" | "mostPlayers" | "leastPlayers";
    cursor?: string;
    limit?: number;
  }) {
    try {
      const where: Prisma.RoomWhereInput = {};

      if (filters?.gameTitle) {
        where.gameTitle = filters.gameTitle;
      }

      if (filters?.status === "IN_PROGRESS") {
        where.status = {
          in: [
            "IN_PROGRESS",
            "TEAM_SELECTION",
            "DRAFT",
            "DRAFT_COMPLETED",
            "ROLE_SELECTION",
          ],
        };
      } else if (
        filters?.status &&
        this.validRoomStatuses.has(filters.status)
      ) {
        where.status = filters.status;
      }
      if (filters?.teamMode && this.validTeamModes.has(filters.teamMode)) {
        where.teamMode = filters.teamMode;
      }
      if (!filters?.includePrivate) {
        where.isPrivate = false;
      }

      const search = filters?.search?.trim();
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { host: { username: { contains: search, mode: "insensitive" } } },
        ];
      }

      const orderBy: Prisma.RoomOrderByWithRelationInput[] =
        filters?.sort === "oldest"
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : filters?.sort === "mostPlayers"
            ? [
                { participants: { _count: "desc" } },
                { createdAt: "desc" },
                { id: "desc" },
              ]
            : filters?.sort === "leastPlayers"
              ? [
                  { participants: { _count: "asc" } },
                  { createdAt: "desc" },
                  { id: "desc" },
                ]
              : [{ createdAt: "desc" }, { id: "desc" }];
      const limit = Math.min(Math.max(filters?.limit ?? 24, 10), 50);

      const [rooms, total] = await Promise.all([
        this.prisma.room.findMany({
          where,
          include: {
            host: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
            participants: {
              select: {
                id: true,
                userId: true,
                role: true,
              },
            },
          },
          orderBy,
          ...(filters?.cursor
            ? { cursor: { id: filters.cursor }, skip: 1 }
            : {}),
          take: limit + 1,
        }),
        this.prisma.room.count({ where }),
      ]);

      const hasMore = rooms.length > limit;
      const items = hasMore ? rooms.slice(0, limit) : rooms;

      // 호스트가 방송 중이면 방 목록 카드에 🔴 뱃지를 붙인다.
      // 캐시된 값만 읽으므로(폴링이 갱신 담당) 목록 응답이 느려지지 않는다.
      const hostLive = await this.streamerService.getHostLiveMap(
        items.map((room) => room.hostId),
      );

      return {
        items: items.map((room) => ({
          ...room,
          hostLive: hostLive.get(room.hostId) ?? null,
        })),
        total,
        nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error listing rooms: ${err?.message ?? String(error)}`,
        err?.stack,
      );
      throw error;
    }
  }

  // 소켓 초기 동기화 등 기존 호출부는 최신 공개 방 목록 배열을 계속 사용한다.
  // 페이지 UI는 listRoomsPage()로 커서·필터 메타데이터까지 받는다.
  async listRooms() {
    const page = await this.listRoomsPage({ limit: 50 });
    return page.items;
  }

  // ========================================
  // Room Joining & Leaving
  // ========================================

  /** Discord 모집 메시지의 플레이어 수와 명단을 최신 DB 상태로 갱신한다. */
  private refreshDiscordRoomNotification(roomId: string): void {
    if (!this.discordBotService) return;

    void this.discordBotService
      .updateRoomNotification(roomId)
      .catch((error: unknown) =>
        this.logger.warn(
          `Discord room notification refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  async joinRoom(userId: string, dto: JoinRoomDto) {
    const joinAsSpectator = dto.asSpectator === true;

    const switchResult = await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: dto.roomId },
        include: {
          participants: true,
        },
      });

      if (!room) {
        throw new NotFoundException("Room not found");
      }

      if (joinAsSpectator && !room.allowSpectators) {
        throw new BadRequestException("이 방은 관전을 허용하지 않습니다.");
      }

      // 정원 체크: PLAYER만 카운트 (관전자는 정원에 포함되지 않음)
      const playerCount = room.participants.filter(
        (p: (typeof room.participants)[number]) => p.role === "PLAYER",
      ).length;
      if (!joinAsSpectator && playerCount >= room.maxParticipants) {
        throw new BadRequestException("Room is full");
      }

      if (room.status !== RoomStatus.WAITING) {
        throw new BadRequestException("Room has already started");
      }

      const existing = room.participants.find(
        (p: (typeof room.participants)[number]) => p.userId === userId,
      );
      if (existing) {
        throw new BadRequestException("Already in room");
      }

      // Verify password for private rooms
      if (room.isPrivate && room.password) {
        if (!dto.password) {
          throw new BadRequestException("Password required");
        }

        const isValid = await bcrypt.compare(dto.password, room.password);
        if (!isValid) {
          throw new BadRequestException("Invalid password");
        }
      }

      const discordProvider = await tx.authProvider.findFirst({
        where: { userId, provider: "DISCORD" },
      });

      if (!discordProvider) {
        throw new BadRequestException(
          "DISCORD_NOT_LINKED::Discord 계정 연동이 필요합니다. 설정 페이지에서 Discord 계정을 연동해주세요.",
        );
      }

      const riotAccount = await tx.riotAccount.findFirst({
        where: { userId, isPrimary: true },
      });

      if (!riotAccount) {
        throw new BadRequestException(
          "RIOT_NOT_LINKED::Riot 계정 연동이 필요합니다. 프로필 페이지에서 Riot 계정을 연동해주세요.",
        );
      }

      const otherParticipations = await tx.roomParticipant.findMany({
        where: {
          userId,
          roomId: { not: room.id },
        },
        include: {
          room: {
            include: {
              participants: {
                include: {
                  user: { select: { username: true } },
                },
              },
            },
          },
        },
      });

      const activeParticipation = otherParticipations.find(
        (participation: any) =>
          participation.room.status !== RoomStatus.WAITING &&
          participation.room.status !== RoomStatus.COMPLETED,
      );
      if (activeParticipation) {
        throw new BadRequestException(
          `ACTIVE_ROOM_EXISTS::${activeParticipation.room.id}::진행 중인 내전 '${activeParticipation.room.name}'에 먼저 복귀해주세요.`,
        );
      }

      const previousWaitingParticipations = otherParticipations.filter(
        (participation: any) =>
          participation.room.status === RoomStatus.WAITING,
      );

      await tx.roomParticipant.create({
        data: {
          roomId: room.id,
          userId,
          role: joinAsSpectator ? "SPECTATOR" : "PLAYER",
        },
      });

      const roomsToDelete: string[] = [];
      for (const participation of previousWaitingParticipations as any[]) {
        const previousRoom = participation.room;
        const remainingParticipants = previousRoom.participants.filter(
          (candidate: any) => candidate.userId !== userId,
        );
        const onlyBotsRemain =
          remainingParticipants.length > 0 &&
          remainingParticipants.every((candidate: any) =>
            /^testbot_\d+$/.test(candidate.user?.username ?? ""),
          );

        await tx.roomParticipant.deleteMany({
          where: { roomId: previousRoom.id, userId },
        });

        if (remainingParticipants.length === 0 || onlyBotsRemain) {
          roomsToDelete.push(previousRoom.id);
          continue;
        }

        if (previousRoom.hostId === userId) {
          const nextHost =
            remainingParticipants.find(
              (candidate: any) =>
                !/^testbot_\d+$/.test(candidate.user?.username ?? ""),
            ) ?? remainingParticipants[0];
          await tx.room.update({
            where: { id: previousRoom.id },
            data: { hostId: nextHost.userId },
          });
        }
      }

      return {
        joinedRoomId: room.id,
        previousRoomIds: previousWaitingParticipations.map(
          (participation: any) => participation.roomId,
        ),
        roomsToDelete,
      };
    });

    for (const previousRoomId of switchResult.roomsToDelete) {
      try {
        if (this.discordVoiceService) {
          await this.discordVoiceService.deleteRoomChannels(previousRoomId);
        }
        await this.deleteRoomData(previousRoomId);
        this.discordBotService?.clearRoomNotification(previousRoomId);
      } catch (error) {
        this.logger.warn(
          `[Room] Failed to clean empty previous room ${previousRoomId} after room switch: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const roomData = await this.getRoomById(switchResult.joinedRoomId);

    this.refreshDiscordRoomNotification(switchResult.joinedRoomId);
    for (const previousRoomId of switchResult.previousRoomIds) {
      if (!switchResult.roomsToDelete.includes(previousRoomId)) {
        this.refreshDiscordRoomNotification(previousRoomId);
      }
    }
    this.warmRankedScanForUser(userId);

    return {
      ...roomData,
      switchedFromRoomIds: switchResult.previousRoomIds,
    };
  }

  /**
   * 새 방 입장 시 정리할 기존 대기방을 DB 참가 기록 기준으로 찾는다.
   *
   * 사용자가 로비에서 사이트 내부의 다른 페이지로 이동하면 소켓 연결은 끊기지만
   * 참가 슬롯은 유지한다. 따라서 새 방에 들어올 때는 Gateway의 현재 소켓 추적만으로
   * 이전 방을 찾을 수 없고, 영속화된 참가 기록을 기준으로 조회해야 한다.
   */
  async getOtherWaitingRoomIdsForUser(
    userId: string,
    targetRoomId: string,
  ): Promise<string[]> {
    const participants = await this.prisma.roomParticipant.findMany({
      where: {
        userId,
        roomId: { not: targetRoomId },
        room: { status: RoomStatus.WAITING },
      },
      select: { roomId: true },
    });

    return [...new Set(participants.map((participant) => participant.roomId))];
  }

  /**
   * 방에 들어온 사람의 솔랭 매치 수집을 미리 걸어둔다.
   *
   * 밸런스 점수의 라인 차별화는 라인별 솔랭 전적에서 나오는데, 수집은 지금까지
   * 누군가 그 사람의 전적 화면을 열어야만 시작됐다. 방에 들어온 시점부터
   * 시작이 눌릴 때까지 보통 몇 분은 있으므로, 그 사이에 채워두면 이번 편성부터
   * 반영될 수 있다. 사람이 기다리는 조회(우선순위 0)보다 앞서도록 5를 준다.
   *
   * 실패해도 입장 자체는 영향받지 않게 삼킨다.
   */
  private warmRankedScanForUser(userId: string): void {
    void (async () => {
      try {
        const accounts = await this.prisma.riotAccount.findMany({
          where: { userId, puuid: { not: "" } },
          select: { puuid: true },
        });
        const puuids = accounts
          .map((account) => account.puuid)
          .filter((puuid): puuid is string => !!puuid);
        if (puuids.length === 0) return;

        await this.statsService.enqueueChampionScanForPuuids(puuids, 5);
      } catch (error) {
        this.logger.warn(`솔랭 스캔 큐잉 실패 userId=${userId}: ${error}`);
      }
    })();
  }

  /** PLAYER ↔ SPECTATOR 역할 전환 */
  async toggleSpectator(userId: string, roomId: string) {
    const newRole = await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { participants: true },
      });

      if (!room) {
        throw new NotFoundException("Room not found");
      }

      if (room.status !== RoomStatus.WAITING) {
        throw new BadRequestException(
          "게임 진행 중에는 역할을 변경할 수 없습니다.",
        );
      }

      const participant = room.participants.find(
        (p: (typeof room.participants)[number]) => p.userId === userId,
      );
      if (!participant) {
        throw new BadRequestException("Not in room");
      }

      const nextRole = participant.role === "PLAYER" ? "SPECTATOR" : "PLAYER";

      if (nextRole === "PLAYER") {
        const playerCount = room.participants.filter(
          (p: (typeof room.participants)[number]) => p.role === "PLAYER",
        ).length;
        if (playerCount >= room.maxParticipants) {
          throw new BadRequestException("플레이어 정원이 가득 찼습니다.");
        }
      }

      if (nextRole === "SPECTATOR" && !room.allowSpectators) {
        throw new BadRequestException("이 방은 관전을 허용하지 않습니다.");
      }

      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: {
          role: nextRole,
          isReady: false,
          ...(nextRole === "SPECTATOR" && {
            teamId: null,
            isCaptain: false,
          }),
        },
      });

      return nextRole;
    });

    const room = await this.getRoomById(roomId);
    this.refreshDiscordRoomNotification(roomId);

    return {
      userId,
      newRole,
      room,
    };
  }

  async leaveRoom(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // Check if user is in room
    const participant = room.participants.find(
      (p: (typeof room.participants)[number]) => p.userId === userId,
    );
    if (!participant) {
      throw new BadRequestException("Not in room");
    }

    // COMPLETED 상태는 게임이 완전히 끝난 상태이므로 슬롯 보존 없이 실제 퇴장 처리.
    // PLAYING/DRAFT 등 진행 중인 단계에서만 슬롯을 보존해 재접속을 허용한다.
    if (
      room.status !== RoomStatus.WAITING &&
      room.status !== RoomStatus.COMPLETED
    ) {
      const remainingParticipants = room.participants.filter(
        (p: (typeof room.participants)[number]) => p.userId !== userId,
      );
      const allRemainingAreBots =
        remainingParticipants.length > 0 &&
        remainingParticipants.every((p: any) =>
          /^testbot_\d+$/.test(p.user?.username || ""),
        );

      if (allRemainingAreBots || remainingParticipants.length === 0) {
        if (this.discordVoiceService) {
          await this.discordVoiceService.deleteRoomChannels(roomId);
        }
        await this.deleteRoomData(roomId);
        return { message: "Room deleted (only bots remaining)" };
      }

      const realRemaining = remainingParticipants.filter(
        (p: any) => !/^testbot_\d+$/.test(p.user?.username || ""),
      );
      if (realRemaining.length < 2) {
        this.logger.warn(
          `[Room] Room ${roomId} has only ${realRemaining.length} real participant(s) during active session (status: ${room.status}). Host may need to abort.`,
        );
      }

      // 게임 진행 중에 호스트가 명시적으로 나갈 경우, 다음 실제 유저(또는 임의 참가자)에게 호스트 이양.
      // 참가자 슬롯은 보존되지만 호스트 권한이 사라지면 방 운영(시작/강퇴/중단 등) 자체가 막힘.
      let newHostId: string | null = null;
      if (room.hostId === userId) {
        const nextHost =
          remainingParticipants.find(
            (p: any) => !/^testbot_\d+$/.test(p.user?.username || ""),
          ) ?? remainingParticipants[0];
        if (nextHost) {
          await this.prisma.room.update({
            where: { id: roomId },
            data: { hostId: nextHost.userId },
          });
          newHostId = nextHost.userId;
        }
      }

      return {
        message: "Left realtime session, participant preserved",
        preserved: true,
        remainingRealCount: realRemaining.length,
        newHostId,
      };
    }

    // Remove participant first
    await this.prisma.roomParticipant.delete({
      where: { id: participant.id },
    });

    // Check remaining participants
    const remainingCount = room.participants.length - 1;
    const remainingParticipants = room.participants.filter(
      (p: (typeof room.participants)[number]) => p.userId !== userId,
    );
    const allRemainingAreBots =
      remainingParticipants.length > 0 &&
      remainingParticipants.every((p: any) =>
        /^testbot_\d+$/.test(p.user?.username || ""),
      );

    const username = participant.user?.username ?? "";

    // If no participants left, delete the room regardless of status (prevents zombie rooms)
    if (remainingCount === 0) {
      if (this.discordVoiceService) {
        await this.discordVoiceService.deleteRoomChannels(roomId);
      }
      await this.deleteRoomData(roomId);
      this.discordBotService?.clearRoomNotification(roomId);
      return {
        message: "Room deleted (no participants)",
        username,
        roomDeleted: true,
      };
    }

    // If only bots remain, delete room immediately
    if (allRemainingAreBots) {
      if (this.discordVoiceService) {
        await this.discordVoiceService.deleteRoomChannels(roomId);
      }
      await this.deleteRoomData(roomId);
      this.discordBotService?.clearRoomNotification(roomId);
      return {
        message: "Room deleted (only bots remaining)",
        username,
        roomDeleted: true,
      };
    }

    // If host leaves but others remain, transfer host to next real (non-bot) participant
    let newHostId: string | null = null;
    if (room.hostId === userId && remainingCount > 0) {
      const nextHost =
        remainingParticipants.find(
          (p: any) => !/^testbot_\d+$/.test(p.user?.username || ""),
        ) ?? remainingParticipants[0];
      if (nextHost) {
        await this.prisma.room.update({
          where: { id: roomId },
          data: { hostId: nextHost.userId },
        });
        newHostId = nextHost.userId;
      }
    }

    this.refreshDiscordRoomNotification(roomId);

    return { message: "Left room successfully", username, newHostId };
  }

  /**
   * 게임 진행 중(비WAITING) 상태에서 호스트가 나갔을 때 다음 호스트로 이양.
   * 반환값: 새 호스트 userId (이양 성공), null (이양 불필요 또는 실패)
   */
  async transferActiveRoomHost(
    roomId: string,
    departingUserId: string,
  ): Promise<string | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: { user: { select: { username: true } } },
        },
      },
    });

    if (!room || room.hostId !== departingUserId) return null;

    const nextHost = room.participants.find(
      (p: any) =>
        p.userId !== departingUserId &&
        !/^testbot_\d+$/.test(p.user?.username || ""),
    );

    if (!nextHost) return null;

    await this.prisma.room.update({
      where: { id: roomId },
      data: { hostId: nextHost.userId },
    });

    return nextHost.userId;
  }

  // ========================================
  // Room Settings
  // ========================================

  // ── 방송 오버레이 토큰 ──────────────────────────────────────
  // 원문 토큰은 저장하지 않고 sha256 hash만 저장한다. 원문은 생성 응답에서 1회만 노출.
  /**
   * "이 방 고정 송출" 토글. 호스트만.
   * 방송 토큰은 유저에 귀속되고 기본은 최근 활성 방 자동 추종이라,
   * 동시에 여러 방을 열었을 때 어느 방을 송출할지 명시하는 수동 오버라이드다.
   * - live=true: 유저의 broadcastLiveRoomId를 이 방으로 지정
   * - live=false: 현재 이 방을 가리킬 때만 해제(다른 방을 가리키면 건드리지 않음)
   */
  async setBroadcastLiveRoom(userId: string, roomId: string, live: boolean) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, hostId: true },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== userId) {
      throw new ForbiddenException("호스트만 방송 송출을 제어할 수 있습니다.");
    }

    if (live) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { broadcastLiveRoomId: roomId },
      });
      return { pinned: true };
    }

    // 다른 방으로 이미 옮겨갔다면 그대로 두고, 이 방을 가리킬 때만 해제
    await this.prisma.user.updateMany({
      where: { id: userId, broadcastLiveRoomId: roomId },
      data: { broadcastLiveRoomId: null },
    });
    return { pinned: false };
  }

  /** 로비 방송 상태: 토큰 발급 여부 + 이 방이 고정 송출 중인지. 호스트만. */
  async getBroadcastLiveState(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== userId) {
      throw new ForbiddenException("호스트만 방송 상태를 조회할 수 있습니다.");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { broadcastTokenHash: true, broadcastLiveRoomId: true },
    });
    return {
      hasToken: !!user?.broadcastTokenHash,
      pinned: user?.broadcastLiveRoomId === roomId,
    };
  }

  /** 호스트가 방송 중계 중인 경기(focus)를 설정/해제. 호스트만. */
  async setBroadcastFocus(
    userId: string,
    roomId: string,
    matchId: string | null,
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, hostId: true },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== userId) {
      throw new ForbiddenException("호스트만 중계 경기를 설정할 수 있습니다.");
    }
    // matchId가 있으면 이 방의 경기인지 검증
    if (matchId) {
      const match = await this.prisma.match.findFirst({
        where: { id: matchId, roomId },
        select: { id: true },
      });
      if (!match) throw new NotFoundException("경기를 찾을 수 없습니다.");
    }
    await this.prisma.room.update({
      where: { id: roomId },
      data: {
        broadcastFocusMatchId: matchId,
        broadcastFocusChangedAt: matchId ? new Date() : null,
      },
    });
    return { focusMatchId: matchId };
  }

  async updateRoomSettings(
    userId: string,
    roomId: string,
    updates: Partial<CreateRoomDto>,
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== userId) {
      throw new ForbiddenException("Only host can update room settings");
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Cannot update room after it has started");
    }

    // 게임 설정값 서비스 레이어 재검증 — ValidationPipe 우회 방어
    this.validateGameSettings(updates);

    const data: any = {};

    if (updates.name) {
      data.name = updates.name;
    }

    if (updates.maxParticipants) {
      if (![10, 15, 20, 30, 40].includes(updates.maxParticipants)) {
        throw new BadRequestException(
          "Max participants must be 10, 15, 20, 30, or 40",
        );
      }
      data.maxParticipants = updates.maxParticipants;
    }

    if (updates.teamMode) {
      data.teamMode = updates.teamMode;
    }

    if (updates.allowSpectators !== undefined) {
      data.allowSpectators = updates.allowSpectators;
    }

    if (updates.password !== undefined) {
      if (updates.password) {
        data.password = await bcrypt.hash(updates.password, 10);
        data.isPrivate = true;
      } else {
        data.password = null;
        data.isPrivate = false;
      }
    }

    // Auction settings
    if (updates.startingPoints !== undefined)
      data.startingPoints = updates.startingPoints;
    if (updates.minBidIncrement !== undefined)
      data.minBidIncrement = updates.minBidIncrement;
    if (updates.bidTimeLimit !== undefined)
      data.bidTimeLimit = updates.bidTimeLimit;

    // Snake draft settings
    if (updates.pickTimeLimit !== undefined)
      data.pickTimeLimit = updates.pickTimeLimit;
    if (updates.captainSelection !== undefined)
      data.captainSelection = updates.captainSelection;

    // Bracket format
    if (updates.bracketFormat !== undefined)
      data.bracketFormat = updates.bracketFormat;

    // 다전제 프리셋.
    // 방 크기가 바뀌면 이전 프리셋이 새 팀 수에서 유효하지 않을 수 있으므로,
    // 프리셋을 안 건드렸더라도 크기 변경 시 함께 재검증한다.
    const nextMaxParticipants = updates.maxParticipants ?? room.maxParticipants;
    if (
      updates.seriesPreset !== undefined ||
      updates.maxParticipants !== undefined
    ) {
      data.seriesPreset = normalizeSeriesPreset(
        updates.seriesPreset ?? room.seriesPreset,
        teamCountForRoomSize(nextMaxParticipants, room.gameTitle),
      );
    }

    await this.prisma.room.update({
      where: { id: roomId },
      data,
    });

    const nextTeamMode = updates.teamMode ?? room.teamMode;
    const manualSetupChanged =
      (room.teamMode === TeamMode.MANUAL_TEAM ||
        nextTeamMode === TeamMode.MANUAL_TEAM) &&
      ((updates.teamMode !== undefined && updates.teamMode !== room.teamMode) ||
        (updates.maxParticipants !== undefined &&
          updates.maxParticipants !== room.maxParticipants));

    if (manualSetupChanged) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await this.clearTeamSetup(tx, roomId, true);
        if (nextTeamMode === TeamMode.MANUAL_TEAM) {
          await this.createManualTeamSlots(
            tx,
            roomId,
            room.hostId,
            updates.maxParticipants ?? room.maxParticipants,
          );
        }
      });
    }

    // Discord 봇 채널 동기화
    if (this.discordVoiceService) {
      // 인원 변경 → 팀 채널 수 조정
      if (updates.maxParticipants) {
        const newNumTeams = Math.floor(updates.maxParticipants / 5);
        this.discordVoiceService
          .updateRoomChannels(roomId, newNumTeams)
          .catch((err: Error) =>
            this.logger.warn(`Discord channel update failed: ${err.message}`),
          );
      }
      // 방 이름 변경 → 카테고리 이름 동기화
      if (updates.name) {
        this.discordVoiceService
          .updateCategoryName(roomId, updates.name)
          .catch((err: Error) =>
            this.logger.warn(
              `Discord category name update failed: ${err.message}`,
            ),
          );
      }
    }

    // getRoomById로 참가자 상세 정보(riotAccount, avatar 등) 포함된 전체 데이터 반환
    return this.getRoomById(roomId);
  }

  async kickParticipant(hostId: string, roomId: string, participantId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can kick participants");
    }

    // Prevent kick during active sessions (draft, auction, role selection, match)
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException(
        "Cannot kick participants while a session is active. Abort the session first.",
      );
    }

    const participant = await this.prisma.roomParticipant.findUnique({
      where: { id: participantId },
    });

    if (!participant || participant.roomId !== roomId) {
      throw new NotFoundException("Participant not found");
    }

    if (participant.userId === hostId) {
      throw new BadRequestException("Cannot kick yourself");
    }

    await this.prisma.roomParticipant.delete({
      where: { id: participantId },
    });

    this.refreshDiscordRoomNotification(roomId);

    return { message: "Participant kicked" };
  }

  // ========================================
  // Ready Status
  // ========================================

  async toggleReady(userId: string, roomId: string) {
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId },
      include: {
        room: {
          select: {
            teamMode: true,
            status: true,
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException("Not in room");
    }

    // 관전자는 레디 불가
    if (participant.role === "SPECTATOR") {
      throw new BadRequestException("관전자는 준비 상태를 변경할 수 없습니다.");
    }

    if (
      participant.room.teamMode === TeamMode.MANUAL_TEAM &&
      participant.room.status === RoomStatus.WAITING &&
      !participant.teamId &&
      !participant.isReady
    ) {
      throw new BadRequestException("팀을 선택한 뒤 준비해주세요.");
    }

    const updated = await this.prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { isReady: !participant.isReady },
    });

    return updated;
  }

  async checkAllReady(roomId: string): Promise<boolean> {
    const participants = await this.prisma.roomParticipant.findMany({
      where: { roomId, role: "PLAYER" },
    });

    return (
      participants.length > 0 &&
      participants.every((p: (typeof participants)[number]) => p.isReady)
    );
  }

  async selectManualTeam(
    userId: string,
    roomId: string,
    teamId: string | null,
  ) {
    await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { teams: true },
      });
      if (!room) {
        throw new NotFoundException("Room not found");
      }
      if (
        room.teamMode !== TeamMode.MANUAL_TEAM ||
        room.status !== RoomStatus.WAITING
      ) {
        throw new BadRequestException(
          "자유 팀 선택 모드의 대기실에서만 팀을 이동할 수 있습니다.",
        );
      }

      const participant = await tx.roomParticipant.findFirst({
        where: { roomId, userId },
      });
      if (!participant || participant.role !== "PLAYER") {
        throw new BadRequestException("플레이어만 팀을 선택할 수 있습니다.");
      }

      if (teamId) {
        if (!room.teams.some((team) => team.id === teamId)) {
          throw new BadRequestException("유효하지 않은 팀입니다.");
        }
        if (participant.teamId !== teamId) {
          const memberCount = await tx.roomParticipant.count({
            where: { roomId, teamId, role: "PLAYER" },
          });
          if (memberCount >= 5) {
            throw new BadRequestException("선택한 팀은 이미 가득 찼습니다.");
          }
        }
      }

      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: { teamId, isCaptain: false, isReady: false },
      });
    });

    return { teamId };
  }

  /**
   * 고정할 유저를 현재 배치(팀 순서 + 배정 라인)로 환산한다.
   *
   * 팀은 재편성마다 다시 만들어지므로 팀 id 로는 고정할 수 없다. 대신 팀 생성
   * 순서(createdAt)를 인덱스로 삼는다 — 편성 로직이 같은 순서로 팀을 만든다.
   * 아직 편성 전이거나 배정 라인이 없는 유저는 고정 대상에서 빠진다.
   */
  private async resolveAutoBalancePins(
    roomId: string,
    pinnedUserIds: string[],
  ): Promise<Map<string, { teamIndex: number; role: Role }>> {
    const pins = new Map<string, { teamIndex: number; role: Role }>();
    if (pinnedUserIds.length === 0) return pins;

    const teams = await this.prisma.team.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        members: { select: { userId: true, assignedRole: true } },
      },
    });

    const wanted = new Set(pinnedUserIds);
    teams.forEach((team, teamIndex) => {
      for (const member of team.members) {
        if (!wanted.has(member.userId) || !member.assignedRole) continue;
        pins.set(member.userId, { teamIndex, role: member.assignedRole });
      }
    });

    return pins;
  }

  /**
   * 자동 밸런스 팀 편성. 이미 편성된 방(DRAFT_COMPLETED)에서 다시 호출하면
   * 재편성("주사위")이 된다. pinnedUserIds 로 지정한 인원은 현재 팀·라인을
   * 그대로 유지하고 나머지만 다시 배치한다.
   */
  async createAutoBalancedTeams(
    hostId: string,
    roomId: string,
    pinnedUserIds: string[] = [],
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: {
            user: {
              include: {
                // 점수는 캐시(balanceScores)를 읽으므로 전적 조인은 필요 없다.
                // roleTiers 는 라인 선호 페널티 계산에 여전히 쓴다.
                riotAccounts: {
                  where: { isPrimary: true },
                  take: 1,
                  include: { roleTiers: { select: { role: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!room) {
      throw new NotFoundException("Room not found");
    }
    if (room.hostId !== hostId || room.teamMode !== TeamMode.AUTO_BALANCE) {
      throw new ForbiddenException("자동 밸런스 팀 구성을 시작할 수 없습니다.");
    }
    // startGame()이 WAITING → DRAFT로 원자 전환 후 호출되므로 DRAFT도 수용.
    // DRAFT_COMPLETED는 재편성(주사위) 경로 — 대진표를 만들기 전까지만 허용한다.
    if (
      room.status !== RoomStatus.WAITING &&
      room.status !== RoomStatus.DRAFT &&
      room.status !== RoomStatus.DRAFT_COMPLETED
    ) {
      throw new BadRequestException("Room has already started");
    }

    // 대진표가 생긴 뒤에는 팀을 흔들면 매치와 어긋나므로 막는다.
    if (room.status === RoomStatus.DRAFT_COMPLETED) {
      const existingMatches = await this.prisma.match.count({
        where: { roomId },
      });
      if (existingMatches > 0) {
        throw new BadRequestException(
          "대진표가 이미 생성되어 팀을 다시 편성할 수 없습니다.",
        );
      }
    }
    if (room.participants.length !== room.maxParticipants) {
      throw new BadRequestException(
        "자동 밸런스 모드는 모든 팀 자리가 채워져야 시작할 수 있습니다.",
      );
    }

    const configuredTeamCount = Math.floor(room.maxParticipants / 5);
    const teamCount = configuredTeamCount;
    // 밸런스 점수는 계정·전적이 바뀔 때 미리 계산해 둔다(BalanceScoreService).
    // 화면에 보이는 점수와 여기서 팀을 나눌 때 쓰는 점수가 같아야 하므로
    // 같은 캐시를 읽는다. 아직 계산 전인 계정만 이 자리에서 채운다.
    // 방 참가 자체가 대표 라이엇 계정(isPrimary)을 요구하므로 여기서는 전원
    // 계정이 있어야 정상이다. 참가 뒤에 대표 계정이 바뀌거나 삭제되면 비는데,
    // 임의 점수로 때우면 밸런스가 조용히 틀어지므로 누구인지 짚어 중단한다.
    const missingAccount = room.participants
      .filter((participant) => !participant.user.riotAccounts[0])
      .map((participant) => participant.user.username);
    if (missingAccount.length > 0) {
      throw new BadRequestException(
        `대표 라이엇 계정이 없는 참가자가 있어 자동 밸런스를 만들 수 없습니다: ${missingAccount.join(", ")}`,
      );
    }

    const rankedPlayers = await Promise.all(
      room.participants.map(async (participant) => {
        const account = participant.user.riotAccounts[0];
        // 캐시가 비어 있는 계정만 이 자리에서 채운다.
        const scores =
          this.balanceScores.readCached(account) ??
          (await this.balanceScores.refreshAccount(account.id));

        if (!scores) {
          throw new BadRequestException(
            `${participant.user.username} 님의 밸런스 점수를 계산하지 못했습니다.`,
          );
        }

        return {
          participant,
          scores,
          mainRole: account.mainRole ?? null,
          subRole: account.subRole ?? null,
          registeredRoleTiers:
            account.roleTiers?.map((entry: { role: Role }) => entry.role) ?? [],
        };
      }),
    );
    // 이미 편성된 방에서 다시 부른 것이면 재편성이다.
    const isReroll = room.status === RoomStatus.DRAFT_COMPLETED;

    // 다시 돌리기 전에 지금 배치를 이력에 남긴다 (되감기용).
    if (isReroll) {
      await this.pushAutoBalanceHistory(roomId);
    }

    // 고정 요청을 현재 배치(팀 순서 + 배정 라인)로 환산한다.
    const pins = await this.resolveAutoBalancePins(roomId, pinnedUserIds);
    const assignments = this.chooseAutoBalancedAssignments(
      rankedPlayers,
      teamCount,
      pins,
    );

    // 팀장명 기준 네이밍용 userId→username 맵 (AutoBalancePlayer.participant엔 username이 없음)
    const usernameByUserId = new Map(
      room.participants.map((p) => [p.userId, p.user.username]),
    );

    // 교체와 같은 격리 수준을 쓴다. 재편성은 팀을 지우고 다시 만드는 작업이라
    // 동시에 두 번 들어오면 팀이 중복 생성될 수 있다.
    await this.runSerializableTx(async (tx: Prisma.TransactionClient) => {
      await this.clearTeamSetup(tx, roomId);
      for (let index = 0; index < assignments.length; index++) {
        const assignment = assignments[index];
        const captain = [...assignment.players].sort(
          (left, right) => right.score - left.score,
        )[0]?.player.participant;
        if (!captain) continue;
        const team = await tx.team.create({
          data: {
            roomId,
            captainId: captain.userId,
            // 경매와 동일하게 팀장명 기준 네이밍 (v1.2.0 '팀명=팀장명' 일관성)
            name: `${usernameByUserId.get(captain.userId) ?? `Team ${index + 1}`} 팀`,
            color: this.teamColors[index % this.teamColors.length],
          },
        });
        await tx.roomParticipant.updateMany({
          where: {
            roomId,
            userId: {
              in: assignment.players.map(
                (placement) => placement.player.participant.userId,
              ),
            },
          },
          data: { teamId: team.id },
        });
        await tx.roomParticipant.updateMany({
          where: { roomId, userId: captain.userId },
          data: { isCaptain: true },
        });
        await tx.teamMember.createMany({
          data: assignment.players.map((placement) => ({
            teamId: team.id,
            userId: placement.player.participant.userId,
            assignedRole: placement.role,
          })),
        });
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.DRAFT_COMPLETED,
          // 최초 편성은 0, 다시 돌릴 때마다 1씩 올린다. 참가자 전원에게 보인다.
          ...(isReroll
            ? { autoBalanceRerollCount: { increment: 1 } }
            : { autoBalanceRerollCount: 0 }),
        },
      });
    });

    // 음성채널 분리는 여기서 하지 않는다. 확인 단계에서 다시 돌리거나 교체할 수
    // 있는데 그때마다 사람들을 옮기면 통화가 계속 끊긴다.
    // 방장이 확정할 때(confirmAutoBalancedTeams) 한 번만 옮긴다.
    return this.getRoomById(roomId);
  }

  /**
   * 자동 밸런스 편성 확정 — 이 시점에 팀별 음성채널로 인원을 옮긴다.
   * 대진표 생성은 호출부가 이어서 처리한다.
   */
  async confirmAutoBalancedTeams(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true, teamMode: true, status: true },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.hostId !== hostId) {
      throw new ForbiddenException("방장만 편성을 확정할 수 있습니다.");
    }
    if (room.teamMode !== TeamMode.AUTO_BALANCE) {
      throw new BadRequestException("자동 밸런스 방이 아닙니다.");
    }

    // 확정을 원자적으로 잠근다.
    //
    // 확정은 곧바로 대진표를 만드는데, 그 사이 재편성이 진행 중이면 반쯤 쓰인
    // 팀 구성으로 대진표가 생성될 수 있다. DRAFT_COMPLETED 에서만 통과하는
    // 조건부 갱신으로 바꿔, 재편성이나 다른 확정과 겹치면 여기서 끊는다.
    const { count } = await this.prisma.room.updateMany({
      where: {
        id: roomId,
        status: RoomStatus.DRAFT_COMPLETED,
        teamMode: TeamMode.AUTO_BALANCE,
      },
      data: { status: RoomStatus.ROLE_SELECTION },
    });
    if (count === 0) {
      throw new BadRequestException(
        "편성이 변경 중이거나 이미 확정되었습니다. 화면을 새로고침해주세요.",
      );
    }

    await this.moveAssignedTeamsToVoice(roomId);
    // 확정했으면 되감기 이력은 필요 없다.
    await this.redis.del(this.autoBalanceHistoryKey(roomId)).catch(() => {});
  }

  async restoreAutoBalanceReview(roomId: string) {
    const { count } = await this.prisma.room.updateMany({
      where: {
        id: roomId,
        teamMode: TeamMode.AUTO_BALANCE,
        status: RoomStatus.ROLE_SELECTION,
      },
      data: { status: RoomStatus.DRAFT_COMPLETED },
    });

    return count > 0 ? this.getRoomById(roomId) : null;
  }

  /** 편성 되감기 이력 키 — 방 단위, 확정되면 지운다 */
  private autoBalanceHistoryKey(roomId: string) {
    return `room:auto-balance-history:${roomId}`;
  }

  /** 되감기 이력 보관 한도. 너무 깊게 쌓아둘 이유가 없다. */
  private readonly AUTO_BALANCE_HISTORY_LIMIT = 10;
  private readonly AUTO_BALANCE_HISTORY_TTL_SEC = 2 * 60 * 60;

  /**
   * 현재 편성을 되감기 이력에 쌓는다.
   *
   * 다시 돌리기·교체 직전에 호출한다. 무작위 재편성이라 "방금 게 더 나았는데"가
   * 반드시 나오는데, 다시 돌려서 같은 배치를 뽑을 방법이 없기 때문이다.
   * 확정 전까지만 쓰는 임시 상태라 DB 대신 Redis 에 둔다.
   */
  private async pushAutoBalanceHistory(roomId: string): Promise<void> {
    try {
      const teams = await this.prisma.team.findMany({
        where: { roomId },
        orderBy: { createdAt: "asc" },
        select: {
          captainId: true,
          members: { select: { userId: true, assignedRole: true } },
        },
      });
      if (teams.length === 0) return;

      const key = this.autoBalanceHistoryKey(roomId);
      const raw = await this.redis.get(key);
      const history: AutoBalanceSnapshot[] = raw ? JSON.parse(raw) : [];

      history.push({
        teams: teams.map((team) => ({
          captainId: team.captainId,
          members: team.members.map((member) => ({
            userId: member.userId,
            assignedRole: member.assignedRole,
          })),
        })),
      });

      await this.redis.set(
        key,
        JSON.stringify(history.slice(-this.AUTO_BALANCE_HISTORY_LIMIT)),
        this.AUTO_BALANCE_HISTORY_TTL_SEC,
      );
    } catch (error) {
      // 이력 저장 실패가 편성 자체를 막으면 안 된다.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`편성 이력 저장 실패 roomId=${roomId}: ${message}`);
    }
  }

  /** 남아 있는 되감기 횟수 */
  async getAutoBalanceHistoryDepth(roomId: string): Promise<number> {
    try {
      const raw = await this.redis.get(this.autoBalanceHistoryKey(roomId));
      return raw ? (JSON.parse(raw) as AutoBalanceSnapshot[]).length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 편성을 한 단계 되감는다.
   *
   * 다시 돌리기는 무작위라 되돌아갈 방법이 없으므로, 직전 배치들을 쌓아두고
   * 하나씩 꺼내 복원한다. 팀은 지우고 다시 만들되 저장된 팀장·라인을 그대로 쓴다.
   */
  async undoAutoBalancedTeams(hostId: string, roomId: string) {
    const key = this.autoBalanceHistoryKey(roomId);

    await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: { hostId: true, teamMode: true, status: true },
      });
      if (!room) throw new NotFoundException("Room not found");
      if (room.hostId !== hostId) {
        throw new ForbiddenException("방장만 편성을 되감을 수 있습니다.");
      }
      if (room.teamMode !== TeamMode.AUTO_BALANCE) {
        throw new BadRequestException("자동 밸런스 방이 아닙니다.");
      }
      if (room.status !== RoomStatus.DRAFT_COMPLETED) {
        throw new BadRequestException("되감을 편성이 없습니다.");
      }

      const existingMatches = await tx.match.count({ where: { roomId } });
      if (existingMatches > 0) {
        throw new BadRequestException(
          "대진표가 이미 생성되어 되감을 수 없습니다.",
        );
      }

      const raw = await this.redis.get(key);
      const history: AutoBalanceSnapshot[] = raw ? JSON.parse(raw) : [];
      const snapshot = history.pop();
      if (!snapshot) {
        throw new BadRequestException("더 되감을 편성이 없습니다.");
      }

      const usernameByUserId = new Map(
        (
          await tx.roomParticipant.findMany({
            where: { roomId },
            select: { userId: true, user: { select: { username: true } } },
          })
        ).map((participant) => [participant.userId, participant.user.username]),
      );

      await this.clearTeamSetup(tx, roomId);
      for (let index = 0; index < snapshot.teams.length; index++) {
        const saved = snapshot.teams[index];
        const team = await tx.team.create({
          data: {
            roomId,
            captainId: saved.captainId,
            name: `${usernameByUserId.get(saved.captainId) ?? `Team ${index + 1}`} 팀`,
            color: this.teamColors[index % this.teamColors.length],
          },
        });
        await tx.roomParticipant.updateMany({
          where: {
            roomId,
            userId: { in: saved.members.map((member) => member.userId) },
          },
          data: { teamId: team.id },
        });
        await tx.roomParticipant.updateMany({
          where: { roomId, userId: saved.captainId },
          data: { isCaptain: true },
        });
        await tx.teamMember.createMany({
          data: saved.members.map((member) => ({
            teamId: team.id,
            userId: member.userId,
            assignedRole: member.assignedRole,
          })),
        });
      }

      // 되감았으니 재편성 횟수도 함께 줄인다 (표시가 실제와 어긋나지 않게).
      await tx.room.update({
        where: { id: roomId },
        data: { autoBalanceRerollCount: { decrement: 1 } },
      });

      await this.redis.set(
        key,
        JSON.stringify(history),
        this.AUTO_BALANCE_HISTORY_TTL_SEC,
      );
    });

    return this.getRoomById(roomId);
  }

  /**
   * 자동 밸런스 편성에서 두 인원의 자리를 맞바꾼다.
   *
   * 고정 + 다시 돌리기로는 "이 둘만 바꾸고 싶다"를 표현하기 어렵다. 재편성은
   * 결국 무작위라 원하는 교환이 나올 때까지 돌려야 하기 때문이다.
   *
   * 같은 팀이면 라인만, 다른 팀이면 팀과 라인을 함께 바꾼다.
   */
  async swapAutoBalanceMembers(
    hostId: string,
    roomId: string,
    userIdA: string,
    userIdB: string,
  ) {
    if (userIdA === userIdB) {
      throw new BadRequestException("서로 다른 두 명을 선택해주세요.");
    }

    // 교체 전 배치를 이력에 남긴다 (되감기용).
    await this.pushAutoBalanceHistory(roomId);

    await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        select: { hostId: true, teamMode: true, status: true },
      });
      if (!room) throw new NotFoundException("Room not found");
      if (room.hostId !== hostId || room.teamMode !== TeamMode.AUTO_BALANCE) {
        throw new ForbiddenException("방장만 편성을 바꿀 수 있습니다.");
      }
      if (room.status !== RoomStatus.DRAFT_COMPLETED) {
        throw new BadRequestException(
          "편성 확인 단계에서만 자리를 바꿀 수 있습니다.",
        );
      }

      // 대진표가 생긴 뒤에 팀을 흔들면 매치와 어긋난다.
      const existingMatches = await tx.match.count({ where: { roomId } });
      if (existingMatches > 0) {
        throw new BadRequestException(
          "대진표가 이미 생성되어 자리를 바꿀 수 없습니다.",
        );
      }

      const members = await tx.teamMember.findMany({
        where: {
          userId: { in: [userIdA, userIdB] },
          team: { roomId },
        },
        select: {
          id: true,
          userId: true,
          teamId: true,
          assignedRole: true,
          team: { select: { id: true, captainId: true } },
        },
      });

      const memberA = members.find((member) => member.userId === userIdA);
      const memberB = members.find((member) => member.userId === userIdB);
      if (!memberA || !memberB) {
        throw new BadRequestException("두 명 모두 편성된 인원이어야 합니다.");
      }

      // 자리 교환: 팀과 배정 라인을 서로 바꾼다.
      await tx.teamMember.update({
        where: { id: memberA.id },
        data: { teamId: memberB.teamId, assignedRole: memberB.assignedRole },
      });
      await tx.teamMember.update({
        where: { id: memberB.id },
        data: { teamId: memberA.teamId, assignedRole: memberA.assignedRole },
      });

      if (memberA.teamId !== memberB.teamId) {
        await tx.roomParticipant.updateMany({
          where: { roomId, userId: userIdA },
          data: { teamId: memberB.teamId },
        });
        await tx.roomParticipant.updateMany({
          where: { roomId, userId: userIdB },
          data: { teamId: memberA.teamId },
        });

        // 팀장이 팀을 옮기면 그 팀에 팀장이 없어진다. 들어온 쪽이 이어받고
        // 팀명도 함께 바꾼다 (팀명=팀장명 규칙 유지).
        await this.transferCaptaincyOnSwapTx(tx, roomId, memberA, memberB);
        await this.transferCaptaincyOnSwapTx(tx, roomId, memberB, memberA);
      }
    });

    return this.getRoomById(roomId);
  }

  /** 교환으로 팀장이 빠진 자리를 상대 인원이 이어받게 한다 */
  private async transferCaptaincyOnSwapTx(
    tx: Prisma.TransactionClient,
    roomId: string,
    leaving: { userId: string; teamId: string; team: { captainId: string } },
    incoming: { userId: string },
  ) {
    if (leaving.team.captainId !== leaving.userId) return;

    const username = await tx.user
      .findUnique({
        where: { id: incoming.userId },
        select: { username: true },
      })
      .then((user) => user?.username);

    await tx.team.update({
      where: { id: leaving.teamId },
      data: {
        captainId: incoming.userId,
        ...(username ? { name: `${username} 팀` } : {}),
      },
    });
    await tx.roomParticipant.updateMany({
      where: { roomId, userId: leaving.userId },
      data: { isCaptain: false },
    });
    await tx.roomParticipant.updateMany({
      where: { roomId, userId: incoming.userId },
      data: { isCaptain: true },
    });
  }

  async finalizeManualTeams(hostId: string, roomId: string) {
    await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          participants: { where: { role: "PLAYER" } },
          teams: true,
        },
      });
      if (!room) {
        throw new NotFoundException("Room not found");
      }
      if (room.hostId !== hostId || room.teamMode !== TeamMode.MANUAL_TEAM) {
        throw new ForbiddenException("자유 팀 구성을 확정할 수 없습니다.");
      }
      // startGame()이 WAITING → DRAFT로 원자 전환 후 호출되므로 DRAFT도 수용
      if (
        room.status !== RoomStatus.WAITING &&
        room.status !== RoomStatus.DRAFT
      ) {
        throw new BadRequestException("Room has already started");
      }
      if (room.participants.length !== room.maxParticipants) {
        throw new BadRequestException(
          "자유 팀 선택 모드는 모든 팀 자리가 채워져야 시작할 수 있습니다.",
        );
      }
      if (room.participants.some((participant) => !participant.teamId)) {
        throw new BadRequestException(
          "모든 플레이어가 팀을 선택한 뒤 시작해주세요.",
        );
      }

      const teamsWithPlayers = room.teams
        .map((team) => ({
          team,
          players: room.participants.filter(
            (participant) => participant.teamId === team.id,
          ),
        }))
        .filter((entry) => entry.players.length > 0);
      if (
        teamsWithPlayers.length !== room.teams.length ||
        teamsWithPlayers.some((entry) => entry.players.length !== 5)
      ) {
        throw new BadRequestException(
          "모든 팀에 플레이어 5명씩 배정한 뒤 시작해주세요.",
        );
      }

      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: { isCaptain: false },
      });
      const usedTeamIds = teamsWithPlayers.map((entry) => entry.team.id);
      await tx.team.deleteMany({
        where: { roomId, id: { notIn: usedTeamIds } },
      });
      for (const entry of teamsWithPlayers) {
        const captain =
          entry.players.find((player) => player.userId === hostId) ??
          entry.players[0];
        await tx.team.update({
          where: { id: entry.team.id },
          data: { captainId: captain.userId },
        });
        await tx.roomParticipant.update({
          where: { id: captain.id },
          data: { isCaptain: true },
        });
        await tx.teamMember.createMany({
          data: entry.players.map((player) => ({
            teamId: entry.team.id,
            userId: player.userId,
          })),
        });
      }
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT_COMPLETED },
      });
    });

    await this.moveAssignedTeamsToVoice(roomId);
    return this.getRoomById(roomId);
  }

  private async moveAssignedTeamsToVoice(roomId: string) {
    if (!this.discordVoiceService) return;
    try {
      await this.discordVoiceService.handleTeamAssignment(roomId);
    } catch (error) {
      this.logger.warn(
        `Discord team voice assignment failed for room ${roomId}: ${String(error)}`,
      );
    }
  }

  // ========================================
  // Game Start
  // ========================================

  async startGame(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can start the game");
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room has already started");
    }

    // Check if all players are ready
    const allReady = room.participants.every(
      (p: (typeof room.participants)[number]) => p.isReady,
    );
    if (!allReady) {
      throw new BadRequestException("Not all players are ready");
    }

    if (
      (room.teamMode === TeamMode.AUTO_BALANCE ||
        room.teamMode === TeamMode.MANUAL_TEAM) &&
      room.participants.length !== room.maxParticipants
    ) {
      throw new BadRequestException(
        "이 모드는 모든 팀 자리가 채워져야 시작할 수 있습니다.",
      );
    }

    if (room.teamMode === TeamMode.MANUAL_TEAM) {
      if (room.participants.some((participant) => !participant.teamId)) {
        throw new BadRequestException(
          "모든 플레이어가 팀을 선택한 뒤 시작해주세요.",
        );
      }
      if (
        new Set(room.participants.map((participant) => participant.teamId))
          .size < 2
      ) {
        throw new BadRequestException("최소 두 팀에 플레이어가 있어야 합니다.");
      }
    }

    if (this.discordVoiceService) {
      const voiceValidation =
        await this.discordVoiceService.validateVoicePresence(roomId);
      if (!voiceValidation.valid) {
        const missing = voiceValidation.missingUsernames.join(", ");
        throw new BadRequestException({
          message: `음성채널 미참가 유저가 있습니다: ${missing}`,
          missingVoiceUsers: voiceValidation.missingUsernames,
        });
      }
    }

    // 검증을 통과한 즉시 WAITING → DRAFT로 원자적 상태 전환.
    // updateMany의 WHERE 조건이 DB 레벨 게이트 역할을 해서
    // 동시 startGame 요청 중 두 번째는 count=0으로 걸러진다.
    const claimed = await this.prisma.room.updateMany({
      where: { id: roomId, status: RoomStatus.WAITING },
      data: { startedAt: new Date(), status: RoomStatus.DRAFT },
    });
    if (claimed.count === 0) {
      throw new BadRequestException("이미 게임 시작 처리 중입니다.");
    }

    return {
      success: true,
      roomId,
      teamMode: room.teamMode,
    };
  }

  // ========================================
  // Chat Messages
  // ========================================

  async getChatMessages(roomId: string, limit = 50, offset = 0) {
    return this.prisma.chatMessage.findMany({
      where: { roomId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async rollbackToWaiting(roomId: string) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      await this.clearTeamSetup(tx, roomId, true);
      if (room?.teamMode === TeamMode.MANUAL_TEAM) {
        await this.createManualTeamSlots(
          tx,
          roomId,
          room.hostId,
          room.maxParticipants,
        );
      }

      await tx.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.WAITING,
          startedAt: null,
        },
      });
    });
  }

  async sendChatMessage(userId: string, roomId: string, content: string) {
    // Check if user is in room
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId },
    });

    if (!participant) {
      throw new ForbiddenException("Not in room");
    }

    // Validate message
    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Message cannot be empty");
    }

    if (content.length > 500) {
      throw new BadRequestException("Message too long (max 500 characters)");
    }

    // 방 이름 조회 (방 삭제 후에도 기록 식별용)
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { name: true },
    });

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        roomName: room?.name,
        userId,
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    // Transform for frontend - flatten user data
    return {
      id: message.id,
      userId: message.userId,
      username: message.user?.username || "Unknown",
      avatar: message.user?.avatar || null,
      message: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  // ========================================
  // Close Room (host explicit close)
  // ========================================

  /** 참여자 여부 확인 — 컨트롤러/게이트웨이에서 재사용 가능한 공용 헬퍼 */
  async assertParticipant(userId: string, roomId: string) {
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { userId, roomId },
      select: { id: true },
    });
    if (!participant) {
      throw new ForbiddenException("방 참여자만 이 작업을 수행할 수 있습니다.");
    }
  }

  /** 호스트 여부 확인 — 컨트롤러에서 재사용 가능한 공용 헬퍼 */
  async assertHost(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) {
      throw new NotFoundException("Room not found");
    }
    if (room.hostId !== userId) {
      throw new ForbiddenException("호스트만 이 작업을 수행할 수 있습니다.");
    }
  }

  async closeRoom(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can close the room");
    }

    // Clean up Discord channels (Discord auto-removes users from deleted channels)
    if (this.discordVoiceService) {
      await this.discordVoiceService.deleteRoomChannels(roomId);
    }

    await this.deleteRoomData(roomId);
    return { message: "Room closed" };
  }

  /**
   * 토너먼트 완료(COMPLETED) 후 방 상태를 WAITING으로 리셋하여 로비로 복귀시킨다.
   * abortActiveSession과 달리 호스트가 아니어도 호출 가능하며,
   * 이미 WAITING으로 복귀된 경우에는 중복 호출도 성공으로 처리한다.
   */
  async returnToLobby(requesterId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: true,
        teams: {
          include: {
            captain: {
              include: {
                authProviders: {
                  where: { provider: "DISCORD" },
                  select: { providerId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // 참가자이기만 하면 누구나 복귀 가능 (결과창 카운트다운/버튼 클릭 시 선착순 처리)
    const isParticipant = room.participants.some(
      (p: (typeof room.participants)[number]) => p.userId === requesterId,
    );
    if (!isParticipant) {
      throw new ForbiddenException("방 참가자만 로비로 복귀시킬 수 있습니다.");
    }

    // 여러 참가자의 결과 화면 카운트다운이 동시에 끝날 수 있으므로,
    // 첫 요청이 이미 WAITING으로 돌려놓은 경우 중복 호출은 성공으로 본다.
    if (room.status === RoomStatus.WAITING) {
      return {
        message: "Room already returned to lobby",
        room: await this.getRoomById(roomId),
      };
    }

    // COMPLETED 상태에서만 로비 복귀 허용
    if (room.status !== RoomStatus.COMPLETED) {
      throw new BadRequestException(
        `Room is not in COMPLETED state (current: ${room.status}). Use abort-to-lobby for active sessions.`,
      );
    }

    // Discord 팀장 역할 정리용
    const captainDiscordIds = room.teams
      .map(
        (team: (typeof room.teams)[number]) =>
          team.captain.authProviders[0]?.providerId,
      )
      .filter((providerId: string | undefined): providerId is string =>
        Boolean(providerId),
      );

    // 트랜잭션으로 방 상태를 WAITING으로 리셋
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 참가자 팀 배정 해제 및 레디 상태 초기화
      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: {
          teamId: null,
          isCaptain: false,
          isReady: false,
        },
      });

      await this.preserveCompletedMatchesForReuse(tx, roomId);

      // 완료되지 않은 대진만 폐기한다. 완료 매치는 방과 분리되어 전적으로 남는다.
      await tx.match.deleteMany({
        where: { roomId, status: { not: MatchStatus.COMPLETED } },
      });

      await tx.matchSeries.deleteMany({
        where: { roomId },
      });

      // 드래프트/경매 데이터 삭제
      await tx.snakeDraftPick.deleteMany({
        where: { roomId },
      });

      await tx.auctionBid.deleteMany({
        where: { roomId },
      });

      // 팀 삭제
      await tx.team.deleteMany({
        where: { roomId },
      });

      if (room.teamMode === TeamMode.MANUAL_TEAM) {
        await this.createManualTeamSlots(
          tx,
          roomId,
          room.hostId,
          room.maxParticipants,
        );
      }

      // 방 상태를 WAITING으로 리셋
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.WAITING,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    // Discord 팀장 역할 해제 및 로비 채널로 이동
    try {
      if (this.discordVoiceService) {
        await Promise.all(
          captainDiscordIds.map((providerId: string) =>
            this.discordVoiceService.removeCaptainRole(roomId, providerId),
          ),
        );
        await this.discordVoiceService.moveAllToLobby(roomId);
      }
    } catch (error) {
      this.logger.warn(
        "Failed to clean up Discord state after return to lobby:",
        error,
      );
    }

    this.logger.log(
      `Room returned to lobby after completion: roomId=${roomId}, requestedBy=${requesterId}`,
    );

    const updatedRoom = await this.getRoomById(roomId);
    return {
      message: "Room returned to lobby after tournament completion",
      room: updatedRoom,
    };
  }

  async abortActiveSession(requesterId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
        },
        teams: {
          include: {
            captain: {
              include: {
                authProviders: {
                  where: { provider: "DISCORD" },
                  select: { providerId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== requesterId) {
      throw new ForbiddenException(
        "Only the room host can abort the active session",
      );
    }

    // 이미 대기실이면 성공으로 본다(멱등).
    // 응답이 늦어 방장이 한 번 더 누르는 경우가 실제로 있는데, 여기서 400을 내면
    // 클라이언트가 실패로 처리해 로비로 이동하지 못하고 대진표에 갇힌다.
    if (room.status === RoomStatus.WAITING) {
      return {
        message: "Room is already in lobby state",
        room: await this.getRoomById(roomId),
      };
    }

    // COMPLETED rooms can also return to lobby for reuse

    const captainDiscordIds = room.teams
      .map(
        (team: (typeof room.teams)[number]) =>
          team.captain.authProviders[0]?.providerId,
      )
      .filter((providerId: string | undefined): providerId is string =>
        Boolean(providerId),
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: {
          teamId: null,
          isCaptain: false,
          isReady: false,
        },
      });

      await this.preserveCompletedMatchesForReuse(tx, roomId);
      await tx.match.deleteMany({
        where: { roomId, status: { not: MatchStatus.COMPLETED } },
      });

      await tx.matchSeries.deleteMany({
        where: { roomId },
      });

      await tx.snakeDraftPick.deleteMany({
        where: { roomId },
      });

      await tx.auctionBid.deleteMany({
        where: { roomId },
      });

      await tx.team.deleteMany({
        where: { roomId },
      });

      if (room.teamMode === TeamMode.MANUAL_TEAM) {
        await this.createManualTeamSlots(
          tx,
          roomId,
          room.hostId,
          room.maxParticipants,
        );
      }

      await tx.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.WAITING,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    // Discord 정리는 응답을 막지 않는다.
    // 방 상태는 위 트랜잭션에서 이미 WAITING 으로 확정됐고, 역할 제거·채널 이동은
    // 외부 API라 느리거나 실패할 수 있다. 이걸 await 하면 종료 요청이 수십 초씩
    // 걸려 방장이 "안 됐다"고 판단해 다시 누르게 된다(운영 실측 32초).
    if (this.discordVoiceService) {
      void (async () => {
        try {
          await Promise.all(
            captainDiscordIds.map((providerId: string) =>
              this.discordVoiceService.removeCaptainRole(roomId, providerId),
            ),
          );
          await this.discordVoiceService.moveAllToLobby(roomId);
        } catch (error) {
          this.logger.warn(
            "Failed to clean up Discord state after session abort:",
            error,
          );
        }
      })();
    }

    this.logger.warn(
      `Room session aborted: roomId=${roomId}, previousStatus=${room.status}, abortedBy=${requesterId}`,
    );

    const updatedRoom = await this.getRoomById(roomId);
    return {
      message: "Session aborted and room returned to lobby",
      room: updatedRoom,
    };
  }

  // ========================================
  // 내부 검증 헬퍼
  // ========================================

  /**
   * 방 생성/수정 시 게임 설정값의 허용 범위를 서비스 레이어에서 재검증한다.
   * DTO의 ValidationPipe가 우회되는 경우를 대비한 이중 방어선.
   */
  private validateGameSettings(
    dto: Partial<{
      bidTimeLimit?: number;
      pickTimeLimit?: number;
      startingPoints?: number;
      minBidIncrement?: number;
    }>,
  ): void {
    if (dto.bidTimeLimit !== undefined) {
      if (dto.bidTimeLimit < 5 || dto.bidTimeLimit > 120) {
        throw new BadRequestException(
          "bidTimeLimit은 5~120초 사이여야 합니다.",
        );
      }
    }
    if (dto.pickTimeLimit !== undefined) {
      if (dto.pickTimeLimit < 5 || dto.pickTimeLimit > 300) {
        throw new BadRequestException(
          "pickTimeLimit은 5~300초 사이여야 합니다.",
        );
      }
    }
    if (dto.startingPoints !== undefined) {
      if (dto.startingPoints < 100 || dto.startingPoints > 100000) {
        throw new BadRequestException(
          "startingPoints는 100~100,000 사이여야 합니다.",
        );
      }
    }
    if (dto.minBidIncrement !== undefined) {
      if (dto.minBidIncrement < 10 || dto.minBidIncrement > 10000) {
        throw new BadRequestException(
          "minBidIncrement는 10~10,000 사이여야 합니다.",
        );
      }
    }
  }
}
