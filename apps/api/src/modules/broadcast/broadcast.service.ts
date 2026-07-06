import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomService } from "../room/room.service";

export type BroadcastScene = "room" | "match" | "bracket" | "result" | "break";

/**
 * 방송 오버레이 스냅샷 서비스.
 * OBS 브라우저 소스가 최초 접속 시 현재 상태를 hydrate 하는 용도(read-only).
 * 이후 실시간 변경은 소켓 델타로 반영한다.
 */
@Injectable()
export class BroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomService: RoomService,
  ) {}

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

  async getSnapshot(
    token: string,
    scene: BroadcastScene = "room",
    matchId?: string,
  ) {
    const roomId = await this.roomService.findRoomIdByBroadcastToken(token);
    if (!roomId) throw new NotFoundException("유효하지 않은 방송 링크입니다.");

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        status: true,
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
        participantCount: room._count.participants,
        maxParticipants: room.maxParticipants,
        hostName: room.host?.username ?? null,
      },
      theme: clan
        ? {
            accentColor: clan.accentColor ?? null,
            logo: clan.logo ?? null,
            banner: clan.banner ?? null,
            clanName: clan.name,
            clanTag: clan.tag,
          }
        : null,
      teams: (room.teams ?? []).map((t: any) => this.teamSummary(t)),
      focusMatchId: room.broadcastFocusMatchId ?? null,
      scene,
    };

    if (scene === "match") {
      // 우선순위: URL matchId → 방 focus → 진행 중 경기 → null
      const resolvedId =
        matchId || room.broadcastFocusMatchId || (await this.firstLiveMatchId(roomId));
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
