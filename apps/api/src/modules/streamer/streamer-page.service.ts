import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";
import { NO_TEST_BOT_MATCH_WHERE } from "../common/test-bot.util";
import { resolveWinnerSlot } from "../match/match-roster.util";
import { StreamerService, type StreamerListItem } from "./streamer.service";
import {
  buildCommendationTags,
  buildSessions,
  buildSummary,
  buildViewerLeague,
  type HostedMatchRow,
} from "./streamer-page.util";
import type {
  CreateStreamerNoticeDto,
  UpdateStreamerNoticeDto,
  UpdateStreamerPageDto,
} from "./dto";

/** 기록에 싣는 방송 내전 수 — 오래된 것은 웹 경기 기록에서 본다 */
const MAX_HOSTED_MATCHES = 200;
/** 페이지에 보이는 공지 수 */
const NOTICE_LIMIT = 10;
/** 한 스트리머가 가질 수 있는 공지 수 */
const MAX_NOTICES = 30;

/**
 * 스트리머 페이지(/streamers/:id).
 *
 * 머리(채널·라이브·팔로우)는 스트리머 목록과 같은 값을 쓰고, 그 아래는 이 스트리머가
 * 방장으로 연 내전(방송 내전)을 모아 보여 준다. 집계는 streamer-page.util 의 순수 함수.
 */
@Injectable()
export class StreamerPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streamerService: StreamerService,
    private readonly rankingService: RankingService,
  ) {}

  async getPage(streamerId: string, viewerId?: string) {
    // 목록에 오르는 스트리머(검증·활성)만 페이지가 있다
    const listed = await this.streamerService.listStreamers(viewerId);
    const streamer: StreamerListItem | undefined = listed.find(
      (s) => s.userId === streamerId,
    );
    if (!streamer) {
      throw new NotFoundException("스트리머를 찾을 수 없어요.");
    }

    const [settings, notices, ranking] = await Promise.all([
      this.prisma.streamerPage.findUnique({ where: { userId: streamerId } }),
      this.prisma.streamerNotice.findMany({
        where: { userId: streamerId },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: NOTICE_LIMIT,
        select: { id: true, content: true, pinned: true, createdAt: true },
      }),
      this.rankingService.getUserRanking(streamerId),
    ]);
    const showPrivate = settings?.showPrivateRooms ?? false;

    const [rows, upcoming] = await Promise.all([
      this.loadHostedMatches(streamerId, showPrivate),
      this.loadUpcomingRooms(streamerId),
    ]);

    return {
      streamer,
      isOwner: viewerId === streamerId,
      settings: {
        tagline: settings?.tagline ?? null,
        scheduleDays: settings?.scheduleDays ?? [],
        scheduleTime: settings?.scheduleTime ?? null,
        showPrivateRooms: showPrivate,
      },
      notices,
      ranking: {
        score: "score" in ranking ? ranking.score : null,
        globalRank: ranking.globalRank,
        totalGames: ranking.totalGames,
        wins: ranking.wins,
        losses: ranking.losses,
      },
      summary: buildSummary(rows, streamerId),
      sessions: buildSessions(rows, streamerId),
      commendationTags: buildCommendationTags(rows),
      league: buildViewerLeague(rows, streamerId),
      upcoming,
    };
  }

  /** 스트리머가 방장으로 연, 끝난 내전 */
  private async loadHostedMatches(
    streamerId: string,
    showPrivate: boolean,
  ): Promise<HostedMatchRow[]> {
    const rows = await this.prisma.match.findMany({
      where: {
        roomHostId: streamerId,
        isInternal: true,
        status: "COMPLETED",
        ...NO_TEST_BOT_MATCH_WHERE,
        // 비공개 방 기록은 스트리머가 켰을 때만.
        // "공개" 판정은 공개 경기 상세(match.service getPublicMatchDetails)와 같게 둔다 —
        // 공개 여부가 비어 있는 예전 기록은 방이 남아 있고 공개일 때만 공개로 본다.
        // 다르면 목록에는 보이는데 펼치면 비로그인 방문자에게 안 열린다.
        ...(showPrivate
          ? {}
          : {
              OR: [
                { roomIsPrivate: false },
                { roomIsPrivate: null, room: { is: { isPrivate: false } } },
              ],
            }),
      },
      orderBy: { completedAt: "desc" },
      take: MAX_HOSTED_MATCHES,
      select: {
        id: true,
        completedAt: true,
        createdAt: true,
        roomName: true,
        roomTeamMode: true,
        gameDuration: true,
        winnerId: true,
        winnerIdSnapshot: true,
        teamAId: true,
        teamBId: true,
        teamAIdSnapshot: true,
        teamBIdSnapshot: true,
        teamAName: true,
        teamBName: true,
        mvpUserId: true,
        aceUserId: true,
        rosterSnapshots: {
          select: {
            userId: true,
            username: true,
            teamSlot: true,
            assignedRole: true,
          },
        },
        participants: {
          select: {
            userId: true,
            championName: true,
            riotTeamId: true,
            kills: true,
            deaths: true,
            assists: true,
            pentaKills: true,
          },
        },
        commendations: {
          select: { giverId: true, targetUserId: true, tags: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      completedAt: row.completedAt ?? row.createdAt,
      roomName: row.roomName,
      roomTeamMode: row.roomTeamMode,
      gameDuration: row.gameDuration,
      winnerSlot: resolveWinnerSlot(row),
      teamAName: row.teamAName,
      teamBName: row.teamBName,
      roster: row.rosterSnapshots.map((r) => ({
        userId: r.userId,
        username: r.username,
        teamSlot: r.teamSlot === "B" ? ("B" as const) : ("A" as const),
        assignedRole: r.assignedRole,
      })),
      participants: row.participants,
      mvpUserId: row.mvpUserId,
      aceUserId: row.aceUserId,
      commendations: row.commendations,
    }));
  }

  /** 예약해 둔 공개 내전 — 방송 일정 칸의 참가 버튼 */
  private async loadUpcomingRooms(streamerId: string) {
    const rooms = await this.prisma.room.findMany({
      where: {
        hostId: streamerId,
        status: "WAITING",
        isPrivate: false,
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      take: 3,
      select: {
        id: true,
        name: true,
        gameTitle: true,
        teamMode: true,
        scheduledAt: true,
        maxParticipants: true,
        // 정원 표시는 선수만 센다(관전자·운영자 방장 제외)
        _count: { select: { participants: { where: { role: "PLAYER" } } } },
      },
    });
    return rooms.map((room) => ({
      id: room.id,
      name: room.name,
      gameTitle: room.gameTitle,
      teamMode: room.teamMode,
      scheduledAt: room.scheduledAt,
      maxParticipants: room.maxParticipants,
      players: room._count.participants,
    }));
  }

  // ── 스트리머 본인 편집 ─────────────────────────────────────────────

  /** 채널을 등록한 사람만 페이지를 꾸밀 수 있다 */
  private async assertStreamer(userId: string) {
    const profile = await this.prisma.streamerProfile.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new ForbiddenException(
        "방송 채널을 등록한 스트리머만 쓸 수 있어요.",
      );
    }
  }

  async updateSettings(userId: string, dto: UpdateStreamerPageDto) {
    await this.assertStreamer(userId);
    const data = {
      ...(dto.tagline !== undefined
        ? { tagline: dto.tagline.trim() || null }
        : {}),
      ...(dto.scheduleDays !== undefined
        ? { scheduleDays: [...new Set(dto.scheduleDays)].sort() }
        : {}),
      ...(dto.scheduleTime !== undefined
        ? { scheduleTime: dto.scheduleTime }
        : {}),
      ...(dto.showPrivateRooms !== undefined
        ? { showPrivateRooms: dto.showPrivateRooms }
        : {}),
    };
    return this.prisma.streamerPage.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: {
        tagline: true,
        scheduleDays: true,
        scheduleTime: true,
        showPrivateRooms: true,
      },
    });
  }

  async createNotice(userId: string, dto: CreateStreamerNoticeDto) {
    await this.assertStreamer(userId);
    const count = await this.prisma.streamerNotice.count({ where: { userId } });
    if (count >= MAX_NOTICES) {
      throw new ForbiddenException(
        `공지는 ${MAX_NOTICES}개까지예요. 오래된 공지를 지운 뒤 써 주세요.`,
      );
    }
    return this.prisma.streamerNotice.create({
      data: { userId, content: dto.content.trim(), pinned: !!dto.pinned },
      select: { id: true, content: true, pinned: true, createdAt: true },
    });
  }

  async updateNotice(
    userId: string,
    noticeId: string,
    dto: UpdateStreamerNoticeDto,
  ) {
    await this.assertOwnNotice(userId, noticeId);
    return this.prisma.streamerNotice.update({
      where: { id: noticeId },
      data: {
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
      },
      select: { id: true, content: true, pinned: true, createdAt: true },
    });
  }

  async deleteNotice(userId: string, noticeId: string) {
    await this.assertOwnNotice(userId, noticeId);
    await this.prisma.streamerNotice.delete({ where: { id: noticeId } });
    return { ok: true };
  }

  private async assertOwnNotice(userId: string, noticeId: string) {
    const notice = await this.prisma.streamerNotice.findUnique({
      where: { id: noticeId },
      select: { userId: true },
    });
    // 남의 공지는 있는지조차 알리지 않는다
    if (!notice || notice.userId !== userId) {
      throw new NotFoundException("공지를 찾을 수 없어요.");
    }
  }
}
