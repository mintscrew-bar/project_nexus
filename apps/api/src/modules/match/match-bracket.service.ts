import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import {
  RoomStatus,
  MatchStatus,
  BracketType,
  TeamMode,
} from "@nexus/database";
import { normalizeSeriesPreset, resolveSeriesBestOf } from "@nexus/types";
import { randomInt } from "crypto";

export interface BracketMatch {
  id: string;
  round: number;
  matchNumber: number;
  teamAId?: string | undefined; // Optional for TBD bracket slots (undefined = TBD)
  teamBId?: string | undefined; // Optional for TBD bracket slots (undefined = TBD)
  bracketSection?: string; // "WB_R1" | "WB_F" | "LB_R1" | "LB_F" | "GF"
  status: MatchStatus;
  tournamentCode?: string;
  winnerId?: string;
  /** 이 슬롯의 시리즈 길이. 1=단판, 3=3판 2선, 5=5판 3선 */
  bestOf: number;
}

export interface Bracket {
  type: BracketType;
  matches: BracketMatch[];
}

/**
 * 생성기가 만드는 중간 형태 — 대진 모양만 정하고 시리즈 길이는 아직 모른다.
 * bestOf는 방의 프리셋을 라운드별로 해석해 applySeriesFormat에서 채운다.
 */
type BracketSlotDraft = Omit<BracketMatch, "bestOf">;

interface BracketDraft {
  type: BracketType;
  matches: BracketSlotDraft[];
}

@Injectable()
export class MatchBracketService {
  private readonly logger = new Logger(MatchBracketService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate bracket for a room based on team count and bracket format
   */
  async generateBracket(hostId: string, roomId: string): Promise<Bracket> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        hostId: true,
        status: true,
        teamMode: true,
        bracketFormat: true,
        seriesPreset: true,
        teams: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can generate bracket");
    }

    const canGenerateFromCurrentStatus =
      room.status === RoomStatus.ROLE_SELECTION ||
      (room.teamMode === TeamMode.AUTO_BALANCE &&
        room.status === RoomStatus.DRAFT_COMPLETED);

    if (!canGenerateFromCurrentStatus) {
      // Check if bracket already exists (room might be in IN_PROGRESS)
      const existingMatches = await this.prisma.match.findMany({
        where: { roomId },
        select: { id: true },
      });

      if (existingMatches.length > 0) {
        // Bracket already exists, return existing bracket structure
        this.logger.log(
          `Bracket already exists for room ${roomId}, returning existing matches`,
        );
        const existingBracket = await this.getExistingBracket(roomId);
        return existingBracket;
      }

      throw new BadRequestException(
        `Room status must be ROLE_SELECTION to generate bracket. Current status: ${room.status}`,
      );
    }

    // Check if bracket already exists (prevent duplicate generation)
    const existingMatches = await this.prisma.match.findMany({
      where: { roomId },
      select: { id: true },
    });

    if (existingMatches.length > 0) {
      this.logger.warn(
        `Bracket already exists for room ${roomId} (${existingMatches.length} matches)`,
      );
      const existingBracket = await this.getExistingBracket(roomId);
      return existingBracket;
    }

    const teamCount = room.teams.length;

    // Validate all teams have 5 players
    for (const team of room.teams) {
      if (team.members.length !== 5) {
        throw new BadRequestException(
          `Team ${team.name} does not have 5 players`,
        );
      }
    }

    let draft: BracketDraft;
    const isDoubleElim = room.bracketFormat === BracketType.DOUBLE_ELIMINATION;
    const shuffledTeams = this.shuffleTeams(room.teams);

    switch (teamCount) {
      case 2:
        draft = this.generateSingleMatch(shuffledTeams);
        break;
      case 3:
      case 5:
      case 6:
      case 7:
        draft = this.generateRoundRobin(shuffledTeams);
        break;
      case 4:
        draft = isDoubleElim
          ? this.generateDoubleElimination4(shuffledTeams)
          : this.generateSingleElimination(shuffledTeams);
        break;
      case 8:
        draft = isDoubleElim
          ? this.generateDoubleElimination8(shuffledTeams)
          : this.generatePowerOf2Elimination(shuffledTeams);
        break;
      default:
        throw new BadRequestException(
          `Unsupported team count: ${teamCount}. Supported: 2, 3, 4, 5, 6, 7, 8`,
        );
    }

    const bracket = this.applySeriesFormat(draft, room.seriesPreset, teamCount);

    // 시리즈(대진 슬롯)와 각 시리즈의 1세트를 함께 만든다.
    // 2세트 이후는 미리 만들지 않는다 — 2-0으로 끝나면 3세트는 치르지 않으므로
    // 미리 만들어두면 완주 판정에서 빼는 예외 처리가 계속 따라붙는다.
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const slot of bracket.matches) {
        const series = await tx.matchSeries.create({
          data: {
            roomId,
            round: slot.round,
            matchNumber: slot.matchNumber,
            bracketRound: slot.bracketSection ?? undefined,
            bracketType: bracket.type,
            teamAId: slot.teamAId ?? undefined,
            teamBId: slot.teamBId ?? undefined,
            bestOf: slot.bestOf,
            status: MatchStatus.PENDING,
          },
        });

        await tx.match.create({
          data: {
            isInternal: true,
            roomId,
            seriesId: series.id,
            gameNumber: 1,
            // round/matchNumber/bracketRound는 시리즈에서 미러링한다.
            // 방송 오버레이·관리자·전적 수집이 Match만 보고 동작하기 때문이다.
            round: slot.round,
            matchNumber: slot.matchNumber,
            teamAId: slot.teamAId ?? undefined,
            teamBId: slot.teamBId ?? undefined,
            status: MatchStatus.PENDING,
            bracketType: bracket.type,
            bracketRound: slot.bracketSection ?? undefined,
          },
        });
      }

      // Update room status atomically
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.IN_PROGRESS },
      });
    });

    this.logger.log(
      `Generated ${bracket.type} bracket for room ${roomId} with ${bracket.matches.length} series ` +
        `(bestOf: ${bracket.matches.map((m) => m.bestOf).join(",")})`,
    );

    return bracket;
  }

  /**
   * 대진 모양(draft)에 방의 다전제 프리셋을 얹어 슬롯별 bestOf를 확정한다.
   *
   * 다전제는 1차 범위상 싱글 엘리미네이션과 2팀 단판방에만 적용한다.
   * 더블 엘리미네이션·리그전은 프리셋과 무관하게 단판을 유지한다.
   */
  private applySeriesFormat(
    draft: BracketDraft,
    rawPreset: string | null,
    teamCount: number,
  ): Bracket {
    const supportsSeries =
      draft.type === BracketType.SINGLE ||
      draft.type === BracketType.SINGLE_ELIMINATION;

    if (!supportsSeries) {
      return {
        type: draft.type,
        matches: draft.matches.map((slot) => ({ ...slot, bestOf: 1 })),
      };
    }

    const preset = normalizeSeriesPreset(rawPreset, teamCount);
    const totalRounds = Math.max(...draft.matches.map((slot) => slot.round));

    return {
      type: draft.type,
      matches: draft.matches.map((slot) => ({
        ...slot,
        bestOf: resolveSeriesBestOf(preset, slot.round, totalRounds),
      })),
    };
  }

  /**
   * Get existing bracket structure from database
   */
  private async getExistingBracket(roomId: string): Promise<Bracket> {
    const series = await this.prisma.matchSeries.findMany({
      where: { roomId },
      select: {
        id: true,
        round: true,
        matchNumber: true,
        teamAId: true,
        teamBId: true,
        bracketRound: true,
        status: true,
        bracketType: true,
        bestOf: true,
        winnerId: true,
      },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
    });

    if (series.length > 0) {
      return {
        type: series[0].bracketType || BracketType.SINGLE,
        matches: series.map((s: (typeof series)[number]) => ({
          id: s.id,
          round: s.round,
          matchNumber: s.matchNumber,
          teamAId: s.teamAId || undefined,
          teamBId: s.teamBId || undefined,
          bracketSection: s.bracketRound || undefined,
          status: s.status,
          bestOf: s.bestOf,
          winnerId: s.winnerId || undefined,
        })),
      };
    }

    // 시리즈 도입 이전에 만들어진 방 — Match를 슬롯으로 그대로 읽는다.
    const matches = await this.prisma.match.findMany({
      where: { roomId },
      select: {
        id: true,
        round: true,
        matchNumber: true,
        teamAId: true,
        teamBId: true,
        bracketRound: true,
        status: true,
        bracketType: true,
      },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
    });

    if (matches.length === 0) {
      throw new NotFoundException("No matches found for room");
    }

    const bracketType = matches[0].bracketType || BracketType.SINGLE;

    return {
      type: bracketType,
      matches: matches.map((m: (typeof matches)[number]) => ({
        id: m.id,
        round: m.round || 1,
        matchNumber: m.matchNumber || 1,
        teamAId: m.teamAId || undefined,
        teamBId: m.teamBId || undefined,
        bracketSection: m.bracketRound || undefined,
        status: m.status,
        bestOf: 1,
      })),
    };
  }

  // ========================================
  // Bracket Type Generators
  // ========================================

  /**
   * 10-player (2 teams): Single match
   */
  private generateSingleMatch(teams: any[]): BracketDraft {
    return {
      type: BracketType.SINGLE,
      matches: [
        {
          id: this.generateMatchId(),
          round: 1,
          matchNumber: 1,
          ...this.randomizeSides(teams[0], teams[1]),
          status: MatchStatus.PENDING,
        },
      ],
    };
  }

  /**
   * 15-player (3 teams): Round Robin (리그전)
   * Each team plays every other team once
   */
  private generateRoundRobin(teams: any[]): BracketDraft {
    const matches: BracketSlotDraft[] = [];
    let matchNumber = 1;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          id: this.generateMatchId(),
          round: 1,
          matchNumber: matchNumber++,
          ...this.randomizeSides(teams[i], teams[j]),
          status: MatchStatus.PENDING,
        });
      }
    }

    return {
      type: BracketType.ROUND_ROBIN,
      matches,
    };
  }

  /**
   * 20-player (4 teams): Single Elimination Tournament
   */
  private generateSingleElimination(teams: any[]): BracketDraft {
    const matches: BracketSlotDraft[] = [];

    // Semi-finals
    matches.push({
      id: this.generateMatchId(),
      round: 1,
      matchNumber: 1,
      ...this.randomizeSides(teams[0], teams[1]),
      status: MatchStatus.PENDING,
    });

    matches.push({
      id: this.generateMatchId(),
      round: 1,
      matchNumber: 2,
      ...this.randomizeSides(teams[2], teams[3]),
      status: MatchStatus.PENDING,
    });

    // Finals - will be populated after semi-finals complete
    matches.push({
      id: this.generateMatchId(),
      round: 2,
      matchNumber: 3,
      teamAId: undefined, // TBD - will be populated after semi-finals
      teamBId: undefined, // TBD - will be populated after semi-finals
      status: MatchStatus.PENDING,
    });

    return {
      type: BracketType.SINGLE_ELIMINATION,
      matches,
    };
  }

  /**
   * N-team (N = power of 2, e.g. 8) Single Elimination
   */
  private generatePowerOf2Elimination(teams: any[]): BracketDraft {
    const n = teams.length;
    const totalRounds = Math.log2(n);
    const matches: BracketSlotDraft[] = [];
    let matchNumber = 1;

    // Round 1: n/2 actual matches (랜덤 사이드 배정)
    for (let i = 0; i < n / 2; i++) {
      matches.push({
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        ...this.randomizeSides(teams[i * 2], teams[i * 2 + 1]),
        status: MatchStatus.PENDING,
      });
    }

    // Rounds 2..totalRounds: TBD slots
    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = n / Math.pow(2, round);
      for (let i = 0; i < matchesInRound; i++) {
        matches.push({
          id: this.generateMatchId(),
          round,
          matchNumber: matchNumber++,
          teamAId: undefined, // TBD - will be populated from previous round
          teamBId: undefined, // TBD - will be populated from previous round
          status: MatchStatus.PENDING,
        });
      }
    }

    return {
      type: BracketType.SINGLE_ELIMINATION,
      matches,
    };
  }

  /**
   * 4-team Double Elimination
   */
  private generateDoubleElimination4(teams: any[]): BracketDraft {
    let matchNumber = 1;
    const matches: BracketSlotDraft[] = [
      // WB Round 1 (랜덤 사이드 배정)
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        ...this.randomizeSides(teams[0], teams[1]),
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        ...this.randomizeSides(teams[2], teams[3]),
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      // WB Final (TBD)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_F",
      },
      // LB Round 1 (TBD - losers from WB R1)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R1",
      },
      // LB Final (TBD)
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_F",
      },
      // Grand Final (TBD)
      {
        id: this.generateMatchId(),
        round: 4,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "GF",
      },
    ];
    return { type: BracketType.DOUBLE_ELIMINATION, matches };
  }

  /**
   * 8-team Double Elimination
   */
  private generateDoubleElimination8(teams: any[]): BracketDraft {
    let matchNumber = 1;
    const matches: BracketSlotDraft[] = [
      // WB Round 1 (4 matches, 랜덤 사이드 배정)
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        ...this.randomizeSides(teams[0], teams[1]),
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        ...this.randomizeSides(teams[2], teams[3]),
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        ...this.randomizeSides(teams[4], teams[5]),
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        ...this.randomizeSides(teams[6], teams[7]),
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      // WB Semi (2 TBD)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R2",
      },
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R2",
      },
      // WB Final (1 TBD)
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_F",
      },
      // LB Round 1 (2 TBD - WB R1 losers)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R1",
      },
      // LB Round 2 (2 TBD - LB R1 winners vs WB Semi losers)
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R2",
      },
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R2",
      },
      // LB Semi (1 TBD)
      {
        id: this.generateMatchId(),
        round: 4,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_SEMI",
      },
      // LB Final (1 TBD)
      {
        id: this.generateMatchId(),
        round: 5,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_F",
      },
      // Grand Final
      {
        id: this.generateMatchId(),
        round: 6,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "GF",
      },
    ];
    return { type: BracketType.DOUBLE_ELIMINATION, matches };
  }

  /**
   * 블루/레드 사이드를 랜덤으로 배정 (형평성)
   * teamA = 블루 사이드, teamB = 레드 사이드
   */
  private randomizeSides(
    teamA: any,
    teamB: any,
  ): { teamAId: string; teamBId: string } {
    const swap = Math.random() < 0.5;
    return {
      teamAId: swap ? teamB.id : teamA.id,
      teamBId: swap ? teamA.id : teamB.id,
    };
  }

  private shuffleTeams<T>(teams: T[]): T[] {
    const shuffled = [...teams];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = randomInt(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  /**
   * Generate a temporary match ID for bracket structure
   * Note: Actual match ID is generated by Prisma (cuid) when saved to database
   */
  private generateMatchId(): string {
    // Use timestamp + random for uniqueness in bracket structure
    // This is only used temporarily before DB save
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
