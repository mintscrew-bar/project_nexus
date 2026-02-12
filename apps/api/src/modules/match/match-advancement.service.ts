import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MatchStatus } from "@nexus/database";

@Injectable()
export class MatchAdvancementService {
  private readonly logger = new Logger(MatchAdvancementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Advance winner to next round for Single Elimination brackets
   */
  async advanceWinnerToNextRound(
    roomId: string,
    currentRound: number,
    currentMatchNumber: number,
    winnerId: string,
  ): Promise<boolean> {
    const nextRound = currentRound + 1;

    const nextRoundMatches = await this.prisma.match.findMany({
      where: { roomId, round: nextRound },
      select: {
        id: true,
        matchNumber: true,
        teamAId: true,
        teamBId: true,
      },
      orderBy: { matchNumber: "asc" },
    });

    if (nextRoundMatches.length === 0) return false; // Already the final round

    // Determine position among current round matches to know which slot to fill
    const currentRoundMatches = await this.prisma.match.findMany({
      where: { roomId, round: currentRound },
      select: {
        id: true,
        matchNumber: true,
      },
      orderBy: { matchNumber: "asc" },
    });

    const currentMatchIndex = currentRoundMatches.findIndex(
      (m) => m.matchNumber === currentMatchNumber,
    );

    if (currentMatchIndex === -1) return false;

    // Every 2 current-round matches map to 1 next-round match
    const nextMatchIndex = Math.floor(currentMatchIndex / 2);
    const nextMatch = nextRoundMatches[nextMatchIndex];

    if (!nextMatch) return false;

    // Even index → teamA slot, odd index → teamB slot
    const isTeamA = currentMatchIndex % 2 === 0;

    try {
      await this.prisma.match.update({
        where: { id: nextMatch.id },
        data: isTeamA ? { teamAId: winnerId } : { teamBId: winnerId },
      });

      this.logger.log(
        `Advanced winner ${winnerId} to round ${nextRound} match ${nextMatch.id} (matchNumber: ${nextMatch.matchNumber}) as team${isTeamA ? "A" : "B"}`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to advance winner ${winnerId} to next round:`,
        error,
      );
      return false;
    }
  }

  /**
   * Routes winner and loser to correct next matches in a Double Elimination bracket.
   * Uses bracketRound (bracketSection) field to determine routing.
   */
  async advanceDoubleElimination(
    roomId: string,
    matchId: string,
    bracketSection: string | null,
    winnerId: string,
    loserId: string,
  ): Promise<void> {
    if (!bracketSection) {
      this.logger.warn(
        `Cannot advance double elimination: match ${matchId} has no bracketSection`,
      );
      return;
    }

    const findMatch = async (section: string) => {
      const match = await this.prisma.match.findFirst({
        where: { roomId, bracketRound: section },
        select: {
          id: true,
          bracketRound: true,
          matchNumber: true,
        },
      });
      if (!match) {
        this.logger.warn(
          `Match not found for bracket section ${section} in room ${roomId}`,
        );
      }
      return match;
    };

    const setTeam = async (
      targetMatchId: string,
      isTeamA: boolean,
      teamId: string,
    ) => {
      try {
        await this.prisma.match.update({
          where: { id: targetMatchId },
          data: isTeamA ? { teamAId: teamId } : { teamBId: teamId },
        });
        this.logger.log(
          `Set team ${teamId} as team${isTeamA ? "A" : "B"} in match ${targetMatchId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to set team ${teamId} in match ${targetMatchId}:`,
          error,
        );
        throw error;
      }
    };

    // Helper to get index among sibling matches (same bracketSection, ordered by matchNumber)
    const getIndexAmongSiblings = async (section: string): Promise<number> => {
      const siblings = await this.prisma.match.findMany({
        where: { roomId, bracketRound: section },
        select: {
          id: true,
          matchNumber: true,
        },
        orderBy: { matchNumber: "asc" },
      });
      return siblings.findIndex((m) => m.id === matchId);
    };

    switch (bracketSection) {
      case "WB_R1": {
        // 4-team: Winner → WB_F, Loser → LB_R1
        // 8-team: Winner → WB_R2, Loser → LB_R1
        const idx = await getIndexAmongSiblings("WB_R1");
        const wbNext = (await findMatch("WB_R2")) ?? (await findMatch("WB_F"));
        if (wbNext && wbNext.bracketRound) {
          // Find the correct WB_R2/WB_F match for this winner
          const wbNextMatches = await this.prisma.match.findMany({
            where: { roomId, bracketRound: wbNext.bracketRound },
            select: {
              id: true,
              matchNumber: true,
            },
            orderBy: { matchNumber: "asc" },
          });
          const targetWb = wbNextMatches[Math.floor(idx / 2)];
          if (targetWb) {
            await setTeam(targetWb.id, idx % 2 === 0, winnerId);
          } else {
            this.logger.warn(
              `Target WB match not found for WB_R1 match ${matchId} at index ${idx}`,
            );
          }
        }
        // Loser → LB_R1 (same index or cross-bracket slot)
        const lbR1Matches = await this.prisma.match.findMany({
          where: { roomId, bracketRound: "LB_R1" },
          select: {
            id: true,
            matchNumber: true,
            teamAId: true,
            teamBId: true,
          },
          orderBy: { matchNumber: "asc" },
        });
        // 4-team: 2 WB_R1 losers go into 1 LB_R1 match (idx 0→teamA, idx 1→teamB)
        // 8-team: 4 WB_R1 losers go into 2 LB_R1 matches (cross-bracket)
        if (lbR1Matches.length === 1) {
          await setTeam(lbR1Matches[0].id, idx === 0, loserId);
        } else if (lbR1Matches.length > 1) {
          // Cross-bracket: 0↔3, 1↔2 → idx 0 & 3 → match 0, idx 1 & 2 → match 1
          const lbMatchIdx = idx < 2 ? idx : 3 - idx;
          const isTeamA = idx < 2;
          await setTeam(lbR1Matches[lbMatchIdx].id, isTeamA, loserId);
        }
        break;
      }

      case "WB_R2": {
        // 8-team: Winner → WB_F, Loser → LB_R2
        const idx = await getIndexAmongSiblings("WB_R2");
        const wbFinal = await findMatch("WB_F");
        if (wbFinal) await setTeam(wbFinal.id, idx === 0, winnerId);
        // Loser → LB_R2 (drop down)
        const lbR2Matches = await this.prisma.match.findMany({
          where: { roomId, bracketRound: "LB_R2" },
          select: {
            id: true,
            matchNumber: true,
            teamAId: true,
            teamBId: true,
          },
          orderBy: { matchNumber: "asc" },
        });
        if (lbR2Matches[idx])
          await setTeam(lbR2Matches[idx].id, false, loserId); // teamB slot
        break;
      }

      case "WB_F": {
        // Winner → GF (teamA), Loser → LB_F
        const gf = await findMatch("GF");
        if (gf) await setTeam(gf.id, true, winnerId);
        const lbFinal = await findMatch("LB_F");
        if (lbFinal) await setTeam(lbFinal.id, false, loserId); // teamB slot
        break;
      }

      case "LB_R1": {
        // 4-team: Winner → LB_F (teamA), Loser → eliminated
        // 8-team: Winner → LB_R2 (teamA), Loser → eliminated
        const lbNext = (await findMatch("LB_R2")) ?? (await findMatch("LB_F"));
        if (lbNext && lbNext.bracketRound) {
          const idx = await getIndexAmongSiblings("LB_R1");
          const lbNextMatches = await this.prisma.match.findMany({
            where: { roomId, bracketRound: lbNext.bracketRound },
            select: {
              id: true,
              matchNumber: true,
            },
            orderBy: { matchNumber: "asc" },
          });
          const target = lbNextMatches[Math.floor(idx / 2)] ?? lbNextMatches[0];
          if (target) {
            await setTeam(target.id, true, winnerId);
          } else {
            this.logger.warn(
              `Target LB match not found for LB_R1 match ${matchId} at index ${idx}`,
            );
          }
        }
        break;
      }

      case "LB_R2": {
        // 8-team: Winner → LB_SEMI (teamA), Loser → eliminated
        const lbSemi = await findMatch("LB_SEMI");
        if (lbSemi) {
          const idx = await getIndexAmongSiblings("LB_R2");
          await setTeam(lbSemi.id, idx === 0, winnerId);
        }
        break;
      }

      case "LB_SEMI": {
        // 8-team: Winner → LB_F (teamA), Loser → eliminated
        const lbFinal = await findMatch("LB_F");
        if (lbFinal) await setTeam(lbFinal.id, true, winnerId);
        break;
      }

      case "LB_F": {
        // Winner → GF (teamB), Loser → eliminated
        const gf = await findMatch("GF");
        if (gf) await setTeam(gf.id, false, winnerId);
        break;
      }

      case "GF":
        // Tournament over — handled by checkBracketCompletion
        this.logger.log(
          `Grand Final completed. Tournament winner: ${winnerId}`,
        );
        break;

      default:
        this.logger.warn(
          `Unknown bracketSection: ${bracketSection} for match ${matchId}. Cannot route teams.`,
        );
        throw new BadRequestException(
          `Unknown bracket section: ${bracketSection}. Cannot advance teams.`,
        );
    }

    this.logger.log(
      `[DE] Successfully routed winner=${winnerId} loser=${loserId} from section=${bracketSection} in match ${matchId}`,
    );
  }

  /**
   * Check if all matches in a bracket are completed
   */
  async checkBracketCompletion(roomId: string): Promise<boolean> {
    // Only fetch status field for performance
    const matches = await this.prisma.match.findMany({
      where: { roomId },
      select: {
        id: true,
        status: true,
      },
    });

    const allComplete = matches.every(
      (m) => m.status === MatchStatus.COMPLETED,
    );

    return allComplete;
  }
}
