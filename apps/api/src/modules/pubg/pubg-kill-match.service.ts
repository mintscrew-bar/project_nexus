import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { MatchStatus } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { ReportKillMatchDto } from "./dto";

/**
 * 배그 킬내기 결과.
 *
 * 승패·다전제·대진표는 기존 2팀 흐름(Match/MatchSeries)을 그대로 쓰고,
 * 킬 수만 별도 테이블에 얹는다. `MatchTeamStats` 는 타워·바론·용,
 * `MatchParticipant` 는 챔피언·라인·소환사 주문이 전부 필수라 재사용할 수 없다.
 */
@Injectable()
export class PubgKillMatchService {
  private readonly logger = new Logger(PubgKillMatchService.name);
  /** 디스코드 봇 (선택 의존). 봇이 꺼져 있어도 결과 보고는 되어야 한다. */
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

  async reportKills(hostId: string, matchId: string, dto: ReportKillMatchDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        room: { select: { id: true, hostId: true, gameTitle: true } },
        teamA: { select: { id: true, name: true, captainId: true } },
        teamB: { select: { id: true, name: true, captainId: true } },
      },
    });
    if (!match) throw new NotFoundException("매치를 찾을 수 없습니다.");
    if (!match.room) {
      throw new BadRequestException("내부 매치에만 결과를 넣을 수 있습니다.");
    }
    if (match.room.gameTitle !== "PUBG") {
      throw new BadRequestException("배그 매치가 아닙니다.");
    }

    const isAuthorized =
      match.room.hostId === hostId ||
      match.teamA?.captainId === hostId ||
      match.teamB?.captainId === hostId;
    if (!isAuthorized) {
      throw new ForbiddenException(
        "호스트 또는 팀장만 결과를 보고할 수 있습니다.",
      );
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException("아직 팀이 정해지지 않은 매치입니다.");
    }

    const teamsById = new Map(
      [match.teamA, match.teamB]
        .filter((team): team is NonNullable<typeof team> => !!team)
        .map((team) => [team.id, team]),
    );

    if (dto.teams.length !== 2) {
      throw new BadRequestException("두 팀의 킬 수를 모두 넣어주세요.");
    }
    if (dto.teams.some((row) => !teamsById.has(row.teamId))) {
      throw new BadRequestException("이 매치에 없는 팀이 포함되어 있습니다.");
    }
    if (dto.teams[0].teamId === dto.teams[1].teamId) {
      throw new BadRequestException("같은 팀이 두 번 들어 있습니다.");
    }

    // 승자를 명시하지 않으면 킬이 많은 쪽이 이긴 것으로 본다.
    // 동점이면 기계가 정할 수 없어 되묻는다.
    let winnerId = dto.winnerId;
    if (!winnerId) {
      const [first, second] = [...dto.teams].sort((a, b) => b.kills - a.kills);
      if (first.kills === second.kills) {
        throw new BadRequestException(
          "킬 수가 같습니다. 이긴 팀을 직접 골라주세요.",
        );
      }
      winnerId = first.teamId;
    }
    if (!teamsById.has(winnerId)) {
      throw new BadRequestException("승자 팀이 이 매치의 팀이 아닙니다.");
    }

    // 개인 킬은 선택 입력이다. 넣었다면 이 방 참가자인지는 확인한다.
    const playerRows = dto.players ?? [];
    const usernameByUserId = new Map<string, string>();
    const teamByUserId = new Map<string, string | null>();
    if (playerRows.length > 0) {
      const participants = await this.prisma.roomParticipant.findMany({
        where: {
          roomId: match.room.id,
          userId: { in: playerRows.map((row) => row.userId) },
        },
        select: {
          userId: true,
          teamId: true,
          user: { select: { username: true } },
        },
      });
      for (const participant of participants) {
        usernameByUserId.set(participant.userId, participant.user.username);
        teamByUserId.set(participant.userId, participant.teamId ?? null);
      }
      if (usernameByUserId.size !== playerRows.length) {
        throw new BadRequestException(
          "이 방에 없는 참가자가 포함되어 있습니다.",
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 다시 보고하면 통째로 갈아끼운다. 부분 수정은 합계가 어긋나기 쉽다.
      await tx.pubgMatchTeamKills.deleteMany({ where: { matchId } });
      await tx.pubgMatchPlayerKills.deleteMany({ where: { matchId } });

      await tx.pubgMatchTeamKills.createMany({
        data: dto.teams.map((row) => ({
          matchId,
          teamId: row.teamId,
          teamName: teamsById.get(row.teamId)?.name ?? "삭제된 팀",
          kills: row.kills,
        })),
      });

      if (playerRows.length > 0) {
        await tx.pubgMatchPlayerKills.createMany({
          data: playerRows.map((row) => ({
            matchId,
            userId: row.userId,
            username: usernameByUserId.get(row.userId) ?? "알 수 없음",
            teamId: teamByUserId.get(row.userId) ?? null,
            kills: row.kills,
          })),
        });
      }

      await tx.match.update({
        where: { id: matchId },
        data: {
          winnerId,
          status: MatchStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    });

    const roomId = match.room.id;
    const winnerName = teamsById.get(winnerId)?.name ?? "승리 팀";
    // 결과 공지가 실패해도 보고 자체는 성공이다. 붙잡지 않는다.
    void this.announceResult(roomId, winnerName, dto).catch((error: Error) =>
      this.logger.warn(`킬내기 결과 공지 실패: ${error.message}`),
    );

    return this.getKillMatchResult(matchId);
  }

  private async announceResult(
    roomId: string,
    winnerName: string,
    dto: ReportKillMatchDto,
  ) {
    if (!this.discordBot) return;
    const lines = [...dto.teams]
      .sort((a, b) => b.kills - a.kills)
      .map((row) => `킬 ${row.kills}`);
    await this.discordBot.sendRoomResultNotification(roomId, {
      title: `킬내기 — ${winnerName} 승`,
      lines,
    });
  }

  /** 킬내기 결과 조회 — 전적·프로필 요약이 함께 쓴다. */
  async getKillMatchResult(matchId: string) {
    const [match, teamKills, playerKills] = await Promise.all([
      this.prisma.match.findUnique({
        where: { id: matchId },
        select: { id: true, winnerId: true, status: true, completedAt: true },
      }),
      this.prisma.pubgMatchTeamKills.findMany({
        where: { matchId },
        orderBy: { kills: "desc" },
      }),
      this.prisma.pubgMatchPlayerKills.findMany({
        where: { matchId },
        orderBy: { kills: "desc" },
      }),
    ]);
    if (!match) return null;
    return { ...match, teamKills, playerKills };
  }
}
