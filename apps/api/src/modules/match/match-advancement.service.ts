import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MatchStatus } from "@nexus/database";
import { MatchSeriesService } from "./match-series.service";

/** 대진 슬롯 (시리즈 도입 이후 = MatchSeries, 이전 방 = Match) */
interface BracketSlot {
  id: string;
  matchNumber: number | null;
}

/**
 * 진출 로직이 읽고 쓰는 대상.
 *
 * 다전제 도입으로 대진 슬롯은 MatchSeries가 됐지만, 배포 시점에 이미
 * 진행 중이던 방은 시리즈 row가 없어 Match가 그대로 슬롯이다.
 * 라우팅 규칙 자체는 같으므로 저장소만 갈아끼운다.
 */
interface SlotRepository {
  findBySection(section: string): Promise<BracketSlot[]>;
  findByRound(round: number): Promise<BracketSlot[]>;
  assign(slotId: string, isTeamA: boolean, teamId: string): Promise<void>;
}

@Injectable()
export class MatchAdvancementService {
  private readonly logger = new Logger(MatchAdvancementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchSeriesService: MatchSeriesService,
  ) {}

  /** 방이 시리즈 기반인지에 따라 슬롯 저장소를 고른다. */
  private async slotRepository(roomId: string): Promise<SlotRepository> {
    const useSeries = await this.matchSeriesService.hasSeries(roomId);

    if (useSeries) {
      return {
        findBySection: (section) =>
          this.prisma.matchSeries.findMany({
            where: { roomId, bracketRound: section },
            select: { id: true, matchNumber: true },
            orderBy: { matchNumber: "asc" },
          }),
        findByRound: (round) =>
          this.prisma.matchSeries.findMany({
            where: { roomId, round },
            select: { id: true, matchNumber: true },
            orderBy: { matchNumber: "asc" },
          }),
        // 시리즈에 팀을 배정하면 아직 시작 전인 세트에도 같이 반영된다.
        assign: (slotId, isTeamA, teamId) =>
          this.matchSeriesService.assignTeam(slotId, isTeamA, teamId),
      };
    }

    return {
      findBySection: (section) =>
        this.prisma.match.findMany({
          where: { roomId, bracketRound: section },
          select: { id: true, matchNumber: true },
          orderBy: { matchNumber: "asc" },
        }),
      findByRound: (round) =>
        this.prisma.match.findMany({
          where: { roomId, round },
          select: { id: true, matchNumber: true },
          orderBy: { matchNumber: "asc" },
        }),
      assign: async (slotId, isTeamA, teamId) => {
        await this.prisma.match.update({
          where: { id: slotId },
          data: isTeamA ? { teamAId: teamId } : { teamBId: teamId },
        });
      },
    };
  }

  /**
   * Advance winner to next round for Single Elimination brackets
   */
  async advanceWinnerToNextRound(
    roomId: string,
    currentRound: number,
    currentMatchNumber: number,
    winnerId: string,
  ): Promise<boolean> {
    const repo = await this.slotRepository(roomId);
    const nextRound = currentRound + 1;

    const nextRoundSlots = await repo.findByRound(nextRound);
    if (nextRoundSlots.length === 0) return false; // Already the final round

    // Determine position among current round slots to know which slot to fill
    const currentRoundSlots = await repo.findByRound(currentRound);
    const currentIndex = currentRoundSlots.findIndex(
      (s) => s.matchNumber === currentMatchNumber,
    );

    if (currentIndex === -1) return false;

    // Every 2 current-round slots map to 1 next-round slot
    const nextSlot = nextRoundSlots[Math.floor(currentIndex / 2)];
    if (!nextSlot) return false;

    // Even index → teamA slot, odd index → teamB slot
    const isTeamA = currentIndex % 2 === 0;

    try {
      await repo.assign(nextSlot.id, isTeamA, winnerId);

      this.logger.log(
        `Advanced winner ${winnerId} to round ${nextRound} slot ${nextSlot.id} (matchNumber: ${nextSlot.matchNumber}) as team${isTeamA ? "A" : "B"}`,
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
   * Routes winner and loser to correct next slots in a Double Elimination bracket.
   * Uses bracketRound (bracketSection) field to determine routing.
   *
   * @param slotId 방금 끝난 대진 슬롯 id (시리즈 방이면 seriesId, 레거시 방이면 matchId)
   */
  async advanceDoubleElimination(
    roomId: string,
    slotId: string,
    bracketSection: string | null,
    winnerId: string,
    loserId: string,
  ): Promise<void> {
    if (!bracketSection) {
      this.logger.warn(
        `Cannot advance double elimination: slot ${slotId} has no bracketSection`,
      );
      return;
    }

    const repo = await this.slotRepository(roomId);

    const findSlot = async (section: string) => {
      const slots = await repo.findBySection(section);
      if (slots.length === 0) {
        this.logger.warn(
          `Slot not found for bracket section ${section} in room ${roomId}`,
        );
        return null;
      }
      return slots[0];
    };

    const setTeam = async (
      targetSlotId: string,
      isTeamA: boolean,
      teamId: string,
    ) => {
      try {
        await repo.assign(targetSlotId, isTeamA, teamId);
        this.logger.log(
          `Set team ${teamId} as team${isTeamA ? "A" : "B"} in slot ${targetSlotId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to set team ${teamId} in slot ${targetSlotId}:`,
          error,
        );
        throw error;
      }
    };

    // Helper to get index among sibling slots (same bracketSection, ordered by matchNumber)
    const getIndexAmongSiblings = async (section: string): Promise<number> => {
      const siblings = await repo.findBySection(section);
      return siblings.findIndex((s) => s.id === slotId);
    };

    switch (bracketSection) {
      case "WB_R1": {
        // 4-team: Winner → WB_F, Loser → LB_R1
        // 8-team: Winner → WB_R2, Loser → LB_R1
        const idx = await getIndexAmongSiblings("WB_R1");
        // Single query: try WB_R2 first, fallback to WB_F
        let wbNextSlots = await repo.findBySection("WB_R2");
        if (wbNextSlots.length === 0) {
          wbNextSlots = await repo.findBySection("WB_F");
        }
        if (wbNextSlots.length > 0) {
          const targetWb = wbNextSlots[Math.floor(idx / 2)];
          if (targetWb) {
            await setTeam(targetWb.id, idx % 2 === 0, winnerId);
          } else {
            this.logger.warn(
              `Target WB slot not found for WB_R1 slot ${slotId} at index ${idx}`,
            );
          }
        }
        // Loser → LB_R1 (same index or cross-bracket slot)
        const lbR1Slots = await repo.findBySection("LB_R1");
        // 4-team: 2 WB_R1 losers go into 1 LB_R1 match (idx 0→teamA, idx 1→teamB)
        // 8-team: 4 WB_R1 losers go into 2 LB_R1 matches (cross-bracket)
        if (lbR1Slots.length === 1) {
          await setTeam(lbR1Slots[0].id, idx === 0, loserId);
        } else if (lbR1Slots.length > 1) {
          // Cross-bracket: 0↔3, 1↔2 → idx 0 & 3 → match 0, idx 1 & 2 → match 1
          const lbSlotIdx = idx < 2 ? idx : 3 - idx;
          const isTeamA = idx < 2;
          await setTeam(lbR1Slots[lbSlotIdx].id, isTeamA, loserId);
        }
        break;
      }

      case "WB_R2": {
        // 8-team: Winner → WB_F, Loser → LB_R2
        const idx = await getIndexAmongSiblings("WB_R2");
        const wbFinal = await findSlot("WB_F");
        if (wbFinal) await setTeam(wbFinal.id, idx === 0, winnerId);
        // Loser → LB_R2 (drop down)
        const lbR2Slots = await repo.findBySection("LB_R2");
        if (lbR2Slots[idx]) await setTeam(lbR2Slots[idx].id, false, loserId); // teamB slot
        break;
      }

      case "WB_F": {
        // Winner → GF (teamA), Loser → LB_F
        const gf = await findSlot("GF");
        if (gf) await setTeam(gf.id, true, winnerId);
        const lbFinal = await findSlot("LB_F");
        if (lbFinal) await setTeam(lbFinal.id, false, loserId); // teamB slot
        break;
      }

      case "LB_R1": {
        // 4-team: Winner → LB_F (teamA), Loser → eliminated
        // 8-team: Winner → LB_R2 (teamA), Loser → eliminated
        const lbIdx = await getIndexAmongSiblings("LB_R1");
        // Single query: try LB_R2 first, fallback to LB_F
        let lbNextSlots = await repo.findBySection("LB_R2");
        if (lbNextSlots.length === 0) {
          lbNextSlots = await repo.findBySection("LB_F");
        }
        if (lbNextSlots.length > 0) {
          // LB_R1 → 다음 LB 라운드는 1:1 대응이다.
          //  - 4팀: LB_R1(1) → LB_F(1)
          //  - 8팀: LB_R1(2) → LB_R2(2), 각 LB_R1 승자는 같은 인덱스의
          //    LB_R2 매치에서 WB 준결승 패자와 만난다.
          // 기존 floor(lbIdx/2)는 8팀에서 LB_R1[1] 승자를 LB_R2[0]에 덮어써
          // 유실시키는 버그였다.
          const target = lbNextSlots[lbIdx] ?? lbNextSlots[0];
          if (target) {
            await setTeam(target.id, true, winnerId);
          } else {
            this.logger.warn(
              `Target LB slot not found for LB_R1 slot ${slotId} at index ${lbIdx}`,
            );
          }
        }
        break;
      }

      case "LB_R2": {
        // 8-team: Winner → LB_SEMI (teamA), Loser → eliminated
        const lbSemi = await findSlot("LB_SEMI");
        if (lbSemi) {
          const idx = await getIndexAmongSiblings("LB_R2");
          await setTeam(lbSemi.id, idx === 0, winnerId);
        }
        break;
      }

      case "LB_SEMI": {
        // 8-team: Winner → LB_F (teamA), Loser → eliminated
        const lbFinal = await findSlot("LB_F");
        if (lbFinal) await setTeam(lbFinal.id, true, winnerId);
        break;
      }

      case "LB_F": {
        // Winner → GF (teamB), Loser → eliminated
        const gf = await findSlot("GF");
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
          `Unknown bracketSection: ${bracketSection} for slot ${slotId}. Cannot route teams.`,
        );
        throw new BadRequestException(
          `Unknown bracket section: ${bracketSection}. Cannot advance teams.`,
        );
    }

    this.logger.log(
      `[DE] Successfully routed winner=${winnerId} loser=${loserId} from section=${bracketSection} in slot ${slotId}`,
    );
  }

  /**
   * Check if all slots in a bracket are completed.
   *
   * 시리즈 방에서는 시리즈 단위로 본다. 2-0으로 끝난 3판 2선은 3세트를
   * 아예 만들지 않으므로 게임 개수로는 완주를 판정할 수 없다.
   */
  async checkBracketCompletion(roomId: string): Promise<boolean> {
    if (await this.matchSeriesService.hasSeries(roomId)) {
      const pending = await this.prisma.matchSeries.count({
        where: { roomId, status: { not: MatchStatus.COMPLETED } },
      });
      return pending === 0;
    }

    const pending = await this.prisma.match.count({
      where: { roomId, status: { not: MatchStatus.COMPLETED } },
    });
    return pending === 0;
  }
}
