import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ScrimRoundStatus } from "@nexus/database";
import {
  calculateScrimPoints,
  identifyRoundMatch,
  isValidPointRule,
  DEFAULT_PUBG_POINT_RULE,
  type MatchCandidate,
  type PubgPointRule,
} from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";
import { PubgApiService } from "../pubg/pubg-api.service";

/**
 * 한 번의 수집에서 훑어볼 최근 매치 수.
 *
 * 매치 상세 1건 = 예산 1콜이다(전역 10/분). 라운드가 끝난 직후라면
 * 우리 경기는 목록 맨 앞에 있다. 뒤로 갈수록 남의 판일 확률만 올라간다.
 */
const MAX_MATCH_LOOKUPS = 3;

/** 결과 출처 표시 — 수동 입력과 구분해야 나중에 신뢰도를 판단할 수 있다. */
const RESULT_SOURCE_AUTO = "AUTO";

/**
 * 라운드 결과 자동 수집.
 *
 * 기본으로 켜져 있고 `PUBG_SCRIM_AUTO_COLLECT=false` 로 끈다.
 * (Phase 0 Task 3·5 실측 완료 — `isCustomMatch` 판별과 커스텀 개설 권한 확인됨)
 *
 * 켜져 있어도 호스트가 버튼을 눌러야 돈다. 라운드가 끝난 시점을 아는 건
 * 사람이고, 폴링으로 돌리면 10/분 예산을 조용히 태운다.
 * 수동 입력 경로는 그대로 남는다 — 자동이 실패해도 결과를 넣을 수 있어야 한다.
 */
@Injectable()
export class ScrimCollectorService {
  private readonly logger = new Logger(ScrimCollectorService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubgApi: PubgApiService,
    private readonly config: ConfigService,
  ) {
    // 기본 켜짐, 끄려면 명시적으로 false.
    //
    // 2026-09-05 실측으로 `isCustomMatch` 판별과 커스텀 개설 권한이 확인돼
    // opt-in 에서 opt-out 으로 뒤집었다. 시크릿을 안 넣으면 빈 문자열이라
    // opt-in 방식으로는 배포해도 켜지지 않는다.
    this.enabled =
      this.config.get<string>("PUBG_SCRIM_AUTO_COLLECT") !== "false";
    this.logger.log(
      this.enabled
        ? "스크림 자동 수집 활성 (호스트가 누를 때만 동작)."
        : "스크림 자동 수집 비활성. 수동 입력만 동작합니다.",
    );
  }

  get isEnabled(): boolean {
    return this.enabled && this.pubgApi.isEnabled;
  }

  /**
   * 라운드 결과를 인게임 기록에서 찾아 채운다.
   *
   * 찾지 못하면 **아무것도 쓰지 않고** 이유를 돌려준다. 애매한 매치를 주워
   * 리더보드에 올리면 사람이 그걸 찾아내 고치는 게 더 오래 걸린다.
   */
  async collectRound(hostId: string, roomId: string, roundNumber: number) {
    if (!this.isEnabled) {
      throw new BadRequestException(
        "자동 결과 수집을 쓸 수 없는 상태입니다. 결과를 직접 입력해주세요.",
      );
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        scrim: true,
        teams: { select: { id: true, name: true } },
        participants: {
          where: { role: "PLAYER" },
          select: {
            userId: true,
            teamId: true,
            user: {
              select: {
                pubgAccounts: {
                  where: { isPrimary: true },
                  select: {
                    playerId: true,
                    playerName: true,
                    lastMatchShard: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.hostId !== hostId) {
      throw new ForbiddenException("방장만 결과를 수집할 수 있습니다.");
    }
    if (!room.scrim) throw new NotFoundException("시작된 스크림이 없습니다.");

    // 같은 스크림의 다른 라운드 정보가 필요하다.
    // 이미 쓴 매치를 빼고, 직전 라운드 시작 시각을 하한으로 삼는다.
    const rounds = await this.prisma.scrimRound.findMany({
      where: { scrimId: room.scrim.id },
      orderBy: { roundNumber: "asc" },
      select: {
        id: true,
        roundNumber: true,
        startedAt: true,
        pubgMatchId: true,
      },
    });
    const round = rounds.find((r) => r.roundNumber === roundNumber);
    if (!round) throw new NotFoundException("라운드를 찾을 수 없습니다.");
    if (!round.startedAt) {
      throw new BadRequestException(
        "라운드를 먼저 시작해야 결과를 찾을 수 있습니다.",
      );
    }

    // 조회 기준이 될 참가자 — 샤드와 계정 ID 를 아는 사람이어야 한다.
    const anchor = room.participants
      .map((p) => p.user.pubgAccounts[0])
      .find((account) => account?.playerId && account.lastMatchShard);
    if (!anchor?.lastMatchShard) {
      throw new BadRequestException(
        "플레이 플랫폼이 확인된 참가자가 없어 경기를 찾을 수 없습니다.",
      );
    }

    // 매치 목록 1콜 + 상세 최대 3콜.
    const matchIds = await this.pubgApi.getPlayerMatchIds(
      anchor.lastMatchShard,
      anchor.playerId,
    );
    const candidates: MatchCandidate[] = [];
    const details = new Map<
      string,
      Awaited<ReturnType<PubgApiService["getMatch"]>>
    >();

    for (const matchId of matchIds.slice(0, MAX_MATCH_LOOKUPS)) {
      const detail = await this.pubgApi.getMatch(
        anchor.lastMatchShard,
        matchId,
      );
      if (!detail) continue;
      details.set(matchId, detail);
      candidates.push({
        matchId: detail.matchId,
        createdAt: detail.createdAt,
        isCustomMatch: detail.isCustomMatch,
        playerNames: detail.teams.flatMap((team) => team.playerNames),
      });
    }

    // 등록된 닉네임만 명단 기준으로 쓴다. 계정을 안 넣은 참가자는 셀 수 없다.
    const rosterNames = room.participants
      .map((p) => p.user.pubgAccounts[0]?.playerName)
      .filter((name): name is string => !!name);

    // 스크림은 같은 사람들이 15~20분 간격으로 여러 판을 친다(2026-09-05 실측).
    // 라운드마다 명단이 완전히 같아서, 어느 라운드인지는 시간으로만 가를 수 있다.
    const identified = identifyRoundMatch(candidates, {
      roundStartedAt: round.startedAt,
      rosterNames,
      // 다른 라운드가 이미 가져간 판은 후보에서 뺀다.
      excludeMatchIds: rounds
        .filter((r) => r.roundNumber !== roundNumber && r.pubgMatchId)
        .map((r) => r.pubgMatchId as string),
      // 직전 라운드가 시작되기 전의 판은 이 라운드 것일 수 없다.
      notBefore:
        rounds.find((r) => r.roundNumber === roundNumber - 1)?.startedAt ??
        undefined,
    });

    if (!identified.match) {
      return {
        matched: false as const,
        reason: identified.reason,
        bestOverlap: identified.bestOverlap,
        message: this.describeFailure(identified.reason),
      };
    }

    const detail = details.get(identified.match.matchId);
    if (!detail) {
      return {
        matched: false as const,
        reason: "NO_CANDIDATES" as const,
        bestOverlap: 0,
        message: this.describeFailure("NO_CANDIDATES"),
      };
    }

    // 인게임 로스터를 Nexus 팀에 붙인다.
    // 로스터는 인게임 파티 단위라 우리 팀 구성과 어긋날 수 있어, 닉네임이
    // 가장 많이 겹치는 팀에 붙이고 한 팀이 두 번 붙는 것은 막는다.
    const nameToTeam = new Map<string, string>();
    for (const participant of room.participants) {
      const name = participant.user.pubgAccounts[0]?.playerName;
      if (name && participant.teamId) {
        nameToTeam.set(name.trim().toLowerCase(), participant.teamId);
      }
    }

    const used = new Set<string>();
    const rows: {
      teamId: string;
      teamName: string;
      placement: number;
      kills: number;
    }[] = [];

    for (const roster of detail.teams) {
      const votes = new Map<string, number>();
      for (const name of roster.playerNames) {
        const teamId = nameToTeam.get(name.trim().toLowerCase());
        if (!teamId || used.has(teamId)) continue;
        votes.set(teamId, (votes.get(teamId) ?? 0) + 1);
      }
      const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!winner) continue;
      used.add(winner[0]);
      rows.push({
        teamId: winner[0],
        teamName:
          room.teams.find((team) => team.id === winner[0])?.name ?? "삭제된 팀",
        placement: roster.placement,
        kills: roster.kills,
      });
    }

    if (rows.length < 2) {
      // 우리 팀을 두 개도 못 붙였으면 남의 판일 가능성이 높다.
      return {
        matched: false as const,
        reason: "ROSTER_MISMATCH" as const,
        bestOverlap: identified.bestOverlap,
        message: this.describeFailure("ROSTER_MISMATCH"),
      };
    }

    const rule = this.readPointRule(room.scrim.pointRule);

    await this.prisma.$transaction(async (tx) => {
      await tx.scrimTeamResult.deleteMany({ where: { roundId: round.id } });
      await tx.scrimTeamResult.createMany({
        data: rows.map((row) => ({
          roundId: round.id,
          teamId: row.teamId,
          teamName: row.teamName,
          placement: row.placement,
          kills: row.kills,
          points: calculateScrimPoints(row.placement, row.kills, rule),
        })),
      });
      await tx.scrimRound.update({
        where: { id: round.id },
        data: {
          status: ScrimRoundStatus.COMPLETED,
          endedAt: new Date(),
          pubgMatchId: detail.matchId,
          resultSource: RESULT_SOURCE_AUTO,
        },
      });
    });

    return {
      matched: true as const,
      matchId: detail.matchId,
      teamsFilled: rows.length,
      bestOverlap: identified.bestOverlap,
    };
  }

  /** 실패 이유를 사람이 읽을 문장으로. 무엇을 해야 하는지까지 적는다. */
  private describeFailure(reason: string): string {
    switch (reason) {
      case "NO_CUSTOM_MATCH":
        return "최근 경기 중 커스텀 매치가 없습니다. 경기가 끝난 뒤 다시 시도하거나 결과를 직접 입력해주세요.";
      case "OUT_OF_TIME_WINDOW":
        return "라운드 시작 시각과 맞는 경기를 찾지 못했습니다. 결과를 직접 입력해주세요.";
      case "ROSTER_MISMATCH":
        return "참가자 명단이 충분히 겹치는 경기를 찾지 못했습니다. PUBG 계정을 등록하지 않은 참가자가 많으면 자동 수집이 어렵습니다.";
      default:
        return "최근 경기 기록을 받지 못했습니다. 잠시 후 다시 시도하거나 결과를 직접 입력해주세요.";
    }
  }

  private readPointRule(value: unknown): PubgPointRule {
    return isValidPointRule(value) ? value : DEFAULT_PUBG_POINT_RULE;
  }
}
