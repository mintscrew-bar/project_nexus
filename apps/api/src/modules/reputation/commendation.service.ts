import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MatchStatus } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { resolveMatchMembers } from "../match/match-roster.util";
import { NO_TEST_BOT_MATCH_WHERE } from "../common/test-bot.util";
import {
  COMMENDATION_WINDOW_HOURS,
  type CommendationTag,
} from "./commendation.constants";
import type { SubmitCommendationsDto } from "./dto/submit-commendations.dto";

/** 한 사람이 받은 칭찬 요약 — 랭킹·프로필·경매 카드가 같은 모양을 쓴다 */
export interface CommendationSummary {
  /** 받은 칭찬 수 */
  total: number;
  /** 많이 받은 태그 순 (최대 3개) */
  topTags: { tag: CommendationTag; count: number }[];
}

/**
 * 여러 사람의 칭찬 요약을 한 번에 센다.
 * 랭킹처럼 다른 모듈에서도 쓰므로 Nest 의존성 없이 prisma 만 받는다.
 */
export async function summarizeCommendations(
  prisma: Pick<PrismaService, "userCommendation">,
  userIds: string[],
): Promise<Map<string, CommendationSummary>> {
  const result = new Map<string, CommendationSummary>();
  if (userIds.length === 0) return result;

  const rows = await prisma.userCommendation.findMany({
    where: { targetUserId: { in: userIds } },
    select: { targetUserId: true, tags: true },
  });

  const tagCounts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const summary = result.get(row.targetUserId) ?? { total: 0, topTags: [] };
    summary.total += 1;
    result.set(row.targetUserId, summary);

    const counts = tagCounts.get(row.targetUserId) ?? new Map();
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    tagCounts.set(row.targetUserId, counts);
  }

  for (const [userId, counts] of tagCounts) {
    const summary = result.get(userId)!;
    summary.topTags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([tag, count]) => ({ tag: tag as CommendationTag, count }));
  }
  return result;
}

/**
 * 내전 칭찬.
 *
 * 경기가 끝나면 함께 뛴 사람 중 최대 3명에게 칭찬(+선택 태그)을 남긴다.
 * 한 경기에 한 번만 묻는다 — 남기든 건너뛰든 CommendationSession 이 생긴다.
 * 나쁜 평가는 받지 않는다. 아는 사이끼리 하는 내전이라 낮은 점수는 다툼이 되고,
 * 정말 문제가 있으면 신고가 따로 있다.
 */
@Injectable()
export class CommendationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 아직 칭찬 창을 안 끝낸 가장 최근 경기. 없으면 null.
   * 끝난 지 COMMENDATION_WINDOW_HOURS 가 지난 경기는 묻지 않는다.
   */
  async getPending(userId: string) {
    const since = new Date(
      Date.now() - COMMENDATION_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const match = await this.prisma.match.findFirst({
      where: {
        isInternal: true,
        status: MatchStatus.COMPLETED,
        completedAt: { gte: since },
        rosterSnapshots: { some: { userId } },
        commendationSessions: { none: { userId } },
        ...NO_TEST_BOT_MATCH_WHERE,
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        completedAt: true,
        roomName: true,
        gameNumber: true,
        rosterSnapshots: {
          select: {
            userId: true,
            username: true,
            teamSlot: true,
            teamName: true,
            assignedRole: true,
            user: { select: { avatar: true } },
          },
        },
        // Riot 기록이 수집된 판이면 챔피언을 같이 보여준다
        participants: { select: { userId: true, championName: true } },
      },
    });
    if (!match) return null;

    const championByUser = new Map(
      match.participants
        .filter((p) => p.userId)
        .map((p) => [p.userId as string, p.championName]),
    );
    const me = match.rosterSnapshots.find((r) => r.userId === userId);
    const players = match.rosterSnapshots
      .filter((r) => r.userId && r.userId !== userId)
      .map((r) => ({
        userId: r.userId as string,
        username: r.username,
        avatar: r.user?.avatar ?? null,
        teamSlot: r.teamSlot,
        teamName: r.teamName,
        role: r.assignedRole,
        championName: championByUser.get(r.userId as string) ?? null,
        // 같은 팀이 위에 오도록 화면에서 쓴다
        isTeammate: r.teamSlot === me?.teamSlot,
      }));
    if (players.length === 0) return null;

    return {
      matchId: match.id,
      completedAt: match.completedAt,
      roomName: match.roomName,
      gameNumber: match.gameNumber,
      players,
    };
  }

  /** 칭찬 제출. 빈 목록이면 건너뛰기로 기록한다. */
  async submit(userId: string, dto: SubmitCommendationsDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
        rosterSnapshots: true,
      },
    });
    if (!match) throw new NotFoundException("경기를 찾을 수 없습니다.");
    if (match.status !== MatchStatus.COMPLETED) {
      throw new BadRequestException("끝난 경기만 칭찬할 수 있습니다.");
    }

    const members = new Set(resolveMatchMembers(match).map((m) => m.userId));
    if (!members.has(userId)) {
      throw new ForbiddenException(
        "그 경기에 참가한 사람만 칭찬할 수 있습니다.",
      );
    }

    const targets = dto.commendations.map((c) => c.targetUserId);
    if (new Set(targets).size !== targets.length) {
      throw new BadRequestException("같은 사람을 두 번 칭찬할 수 없습니다.");
    }
    for (const target of targets) {
      if (target === userId) {
        throw new BadRequestException("자기 자신은 칭찬할 수 없습니다.");
      }
      if (!members.has(target)) {
        throw new BadRequestException(
          "그 경기에 함께 뛴 사람만 칭찬할 수 있습니다.",
        );
      }
    }

    const existing = await this.prisma.commendationSession.findUnique({
      where: { userId_matchId: { userId, matchId: dto.matchId } },
    });
    if (existing) {
      throw new ConflictException("이 경기의 칭찬은 이미 끝냈습니다.");
    }

    await this.prisma.$transaction([
      this.prisma.commendationSession.create({
        data: {
          userId,
          matchId: dto.matchId,
          skipped: dto.commendations.length === 0,
        },
      }),
      ...dto.commendations.map((c) =>
        this.prisma.userCommendation.create({
          data: {
            giverId: userId,
            targetUserId: c.targetUserId,
            matchId: dto.matchId,
            tags: [...new Set(c.tags)],
          },
        }),
      ),
    ]);

    return { submitted: dto.commendations.length };
  }

  async getSummary(userId: string): Promise<CommendationSummary> {
    const map = await summarizeCommendations(this.prisma, [userId]);
    return map.get(userId) ?? { total: 0, topTags: [] };
  }
}
