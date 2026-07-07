import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  hashBroadcastToken,
  activeRoomIdForUser,
} from "./broadcast-resolve.util";

export type BroadcastScene = "room" | "match" | "bracket" | "result" | "break";

/**
 * 방송 오버레이 서비스.
 * - 스트리머당 단일 read-only 토큰 발급/관리(hash 저장).
 * - OBS 브라우저 소스가 접속 시 현재 상태를 hydrate 하는 스냅샷 제공(read-only).
 *   토큰은 유저에 귀속되고, 오버레이는 그 유저의 활성 방을 자동 추종한다.
 */
@Injectable()
export class BroadcastService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 방송 토큰 발급/재생성. 로그인 유저 본인 것만.
   * - 이미 있고 rotate=false면 원문 복구 불가라 존재 여부만 반환.
   * - rotate=true면 기존 토큰을 무효화하고 새 토큰 반환.
   */
  async createToken(userId: string, rotate = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { broadcastTokenHash: true, broadcastTokenCreatedAt: true },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    if (user.broadcastTokenHash && !rotate) {
      return {
        exists: true,
        createdAt: user.broadcastTokenCreatedAt,
        token: null as string | null,
      };
    }

    const token = randomBytes(24).toString("base64url");
    const createdAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        broadcastTokenHash: hashBroadcastToken(token),
        broadcastTokenCreatedAt: createdAt,
      },
    });
    return { exists: true, createdAt, token };
  }

  /** 방송 토큰 현재 상태(존재 여부/발급 시각). 원문은 노출하지 않는다. */
  async getTokenStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { broadcastTokenHash: true, broadcastTokenCreatedAt: true },
    });
    return {
      exists: !!user?.broadcastTokenHash,
      createdAt: user?.broadcastTokenCreatedAt ?? null,
    };
  }

  /** 방송 토큰 비활성화. 송출 오버라이드도 함께 해제. */
  async revokeToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        broadcastTokenHash: null,
        broadcastTokenCreatedAt: null,
        broadcastLiveRoomId: null,
      },
    });
    return { ok: true };
  }

  /** 팀 요약 공통 형태 */
  private teamSummary(team: any) {
    if (!team) return null;
    return {
      id: team.id,
      name: team.name,
      color: team.color ?? null,
      captainId: team.captainId,
      initialBudget: team.initialBudget,
      remainingBudget: team.remainingBudget,
      members: (team.members ?? []).map((m: any) => ({
        userId: m.userId,
        username: m.user?.username ?? null,
        avatar: m.user?.avatar ?? null,
        assignedRole: m.assignedRole ?? null,
        soldPrice: m.soldPrice ?? null,
        tier: m.user?.riotAccounts?.[0]?.tier ?? null,
      })),
    };
  }

  /** 매치 상세(방송 Match Scene용) — 진영/상태/승패 중심. 라이브 스코어 없음. */
  private matchDetail(match: any, teamById: Map<string, any>) {
    if (!match) return null;
    const teamA = teamById.get(match.teamAId) ?? null;
    const teamB = teamById.get(match.teamBId) ?? null;
    // blueSideTeamId 가 지정되면 그 팀이 블루, 나머지가 레드. 미지정이면 A=블루 관례.
    const blueId = match.blueSideTeamId ?? match.teamAId ?? null;
    return {
      id: match.id,
      status: match.status,
      round: match.round ?? null,
      bracketRound: match.bracketRound ?? null,
      matchNumber: match.matchNumber ?? null,
      winnerId: match.winnerId ?? null,
      blueSideTeamId: blueId,
      blue: this.teamSummary(blueId === match.teamBId ? teamB : teamA),
      red: this.teamSummary(blueId === match.teamBId ? teamA : teamB),
    };
  }

  /** 클랜 → 방송 테마(엠블럼/배너/강조색). 클랜 없으면 null. */
  private clanTheme(clan: any) {
    if (!clan) return null;
    return {
      accentColor: clan.accentColor ?? null,
      logo: clan.logo ?? null,
      banner: clan.banner ?? null,
      clanName: clan.name,
      clanTag: clan.tag,
    };
  }

  async getSnapshot(
    token: string,
    scene: BroadcastScene = "room",
    matchId?: string,
  ) {
    // 토큰 → 스트리머(유저). 무효한 토큰만 에러; 활성 방이 없는 건 정상(대기 상태).
    const streamer = token
      ? await this.prisma.user.findUnique({
          where: { broadcastTokenHash: hashBroadcastToken(token) },
          select: {
            id: true,
            username: true,
            broadcastLiveRoomId: true,
            clanMemberships: {
              take: 1,
              select: {
                clan: {
                  select: {
                    name: true,
                    tag: true,
                    accentColor: true,
                    logo: true,
                    banner: true,
                  },
                },
              },
            },
          },
        })
      : null;
    if (!streamer)
      throw new NotFoundException("유효하지 않은 방송 링크입니다.");

    const streamerTheme = this.clanTheme(
      streamer.clanMemberships?.[0]?.clan ?? null,
    );

    const roomId = await activeRoomIdForUser(
      this.prisma,
      streamer.id,
      streamer.broadcastLiveRoomId,
    );
    // 송출할 활성 방이 없으면 브랜딩된 대기(idle) 스냅샷 반환
    if (!roomId) {
      return {
        idle: true,
        scene,
        room: null,
        theme: streamerTheme,
        streamer: { name: streamer.username },
        teams: [],
        focusMatchId: null,
      };
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        status: true,
        teamMode: true,
        maxParticipants: true,
        broadcastFocusMatchId: true,
        host: {
          select: {
            username: true,
            clanMemberships: {
              take: 1,
              select: {
                clan: {
                  select: {
                    name: true,
                    tag: true,
                    accentColor: true,
                    logo: true,
                    banner: true,
                  },
                },
              },
            },
          },
        },
        _count: { select: { participants: true } },
        teams: {
          select: {
            id: true,
            name: true,
            color: true,
            captainId: true,
            initialBudget: true,
            remainingBudget: true,
            members: {
              select: {
                userId: true,
                assignedRole: true,
                soldPrice: true,
                user: {
                  select: {
                    username: true,
                    avatar: true,
                    riotAccounts: {
                      where: { isPrimary: true },
                      select: { tier: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");

    const clan = room.host?.clanMemberships?.[0]?.clan ?? null;
    const teamById = new Map((room.teams ?? []).map((t: any) => [t.id, t]));

    const common = {
      room: {
        id: room.id,
        name: room.name,
        status: room.status,
        teamMode: room.teamMode,
        participantCount: room._count.participants,
        maxParticipants: room.maxParticipants,
        hostName: room.host?.username ?? null,
      },
      theme: this.clanTheme(clan),
      teams: (room.teams ?? []).map((t: any) => this.teamSummary(t)),
      focusMatchId: room.broadcastFocusMatchId ?? null,
      scene,
    };

    if (scene === "match") {
      // 우선순위: URL matchId → 방 focus → 진행 중 경기 → null
      const resolvedId =
        matchId ||
        room.broadcastFocusMatchId ||
        (await this.firstLiveMatchId(roomId));
      const match = resolvedId
        ? await this.prisma.match.findFirst({
            where: { id: resolvedId, roomId },
            select: {
              id: true,
              status: true,
              round: true,
              bracketRound: true,
              matchNumber: true,
              winnerId: true,
              blueSideTeamId: true,
              teamAId: true,
              teamBId: true,
            },
          })
        : null;
      return { ...common, match: this.matchDetail(match, teamById) };
    }

    if (scene === "bracket" || scene === "result") {
      const matches = await this.prisma.match.findMany({
        where: { roomId },
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
        select: {
          id: true,
          status: true,
          round: true,
          bracketRound: true,
          matchNumber: true,
          winnerId: true,
          blueSideTeamId: true,
          teamAId: true,
          teamBId: true,
        },
      });
      return {
        ...common,
        matches: matches.map((m) => this.matchDetail(m, teamById)),
      };
    }

    // scene === "room" | "break": 공통(팀/참가자/상태)만으로 대기·경매·전환 렌더 가능
    return common;
  }

  /** 진행 중(IN_PROGRESS) 경기 중 첫 번째 id. */
  private async firstLiveMatchId(roomId: string): Promise<string | null> {
    const m = await this.prisma.match.findFirst({
      where: { roomId, status: "IN_PROGRESS" },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      select: { id: true },
    });
    return m?.id ?? null;
  }
}
