import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamCaptainSelection, TeamMode } from "@nexus/database";
import { calculateTierScore } from "../common/tier-score.util";

const BONUS_GOLD = 500;
const DEFAULT_BID_TIME_SECONDS = 10;
const BID_EXTENSION_SECONDS = 5;
const MAX_BID_TIME_SECONDS = 10;

export interface AuctionState {
  roomId: string;
  currentPlayerIndex: number;
  currentHighestBid: number;
  currentHighestBidder: string | null;
  currentHighestBidderName?: string | null;
  timerEnd: number;
  yuchalCount: number;
  maxYuchalCycles: number;
  botCaptainIds: string[]; // testbot_* ?좎? ???紐⑸줉 (?먮룞 ?낆같??
}

export interface CaptainSelectionPhase {
  mode: TeamCaptainSelection;
  requiredCount: number;
  volunteers: string[]; // userId[]
  timerEnd: number | null;
  timerHandle: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class AuctionService {
  private auctionStates = new Map<string, AuctionState>();
  /**
   * captainPhases는 현재 인메모리만 관리됨 (30초 단기 세션).
   * 서버 재시작 시 DRAFT 상태이지만 captainPhase 정보가 유실될 수 있음.
   * TODO: RedisService를 AuctionService에 주입하여 captainPhases를 Redis에도 저장하면
   *       서버 재시작 내구성 확보 가능 (key: `captain-phase:${roomId}`, TTL: 60s).
   */
  private captainPhases = new Map<string, CaptainSelectionPhase>();
  private discordVoiceService: any; // DiscordVoiceService (optional dependency)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordVoiceService = discordVoice;
  }

  private getBaseBidTimerMs(): number {
    return DEFAULT_BID_TIME_SECONDS * 1000;
  }

  private getExtendedBidTimerEnd(currentTimerEnd: number): number {
    const now = Date.now();
    const remainingMs = Math.max(0, currentTimerEnd - now);
    const extendedMs = Math.min(
      MAX_BID_TIME_SECONDS * 1000,
      remainingMs + BID_EXTENSION_SECONDS * 1000,
    );
    return now + extendedMs;
  }

  // ========================================
  // Auction Initialization
  // ========================================

  async startAuction(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: {
            user: {
              include: {
                riotAccounts: {
                  where: { isPrimary: true },
                },
              },
            },
          },
        },
        teams: true,
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can start auction");
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room already started");
    }

    if (room.teamMode !== TeamMode.AUCTION) {
      throw new BadRequestException("Room is not in auction mode");
    }

    // Calculate number of teams (?뚯뒪?? 4紐??댁긽?대㈃ 理쒖냼 2? 蹂댁옣, ?ㅼ쟾 10紐낆씠硫?Math.floor)
    if (room.participants.length < 4) {
      throw new BadRequestException("Auction mode requires at least 4 players");
    }
    const numTeams = Math.max(2, Math.floor(room.participants.length / 5));

    const captainMode = room.captainSelection ?? TeamCaptainSelection.TIER;

    // MANUAL / VOLUNTEER: ????좎젙 ?④퀎 吏꾩엯 (寃쎈ℓ ?쒖옉 蹂대쪟)
    if (captainMode === TeamCaptainSelection.MANUAL) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT },
      });

      return {
        captainSelectionPhase: {
          mode: TeamCaptainSelection.MANUAL,
          requiredCount: numTeams,
          volunteers: [],
          timerEnd: null,
        },
        participants: room.participants.map((p) => {
          const acc = p.user.riotAccounts[0];
          return {
            id: p.userId,
            username: p.user.username,
            avatar: p.user.avatar,
            tier: acc?.tier,
            rank: acc?.rank,
            mmr: calculateTierScore(
              acc?.tier || "UNRANKED",
              acc?.rank || "",
              acc?.lp || 0,
            ),
          };
        }),
      };
    }

    if (captainMode === TeamCaptainSelection.VOLUNTEER) {
      const timerEnd = Date.now() + 30_000;

      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT },
      });

      const phase: CaptainSelectionPhase = {
        mode: TeamCaptainSelection.VOLUNTEER,
        requiredCount: numTeams,
        volunteers: [],
        timerEnd,
        timerHandle: null,
      };
      this.captainPhases.set(roomId, phase);

      return {
        captainSelectionPhase: {
          mode: TeamCaptainSelection.VOLUNTEER,
          requiredCount: numTeams,
          volunteers: [],
          timerEnd,
        },
        participants: room.participants.map((p) => {
          const acc = p.user.riotAccounts[0];
          return {
            id: p.userId,
            username: p.user.username,
            avatar: p.user.avatar,
            tier: acc?.tier,
            rank: acc?.rank,
            mmr: calculateTierScore(
              acc?.tier || "UNRANKED",
              acc?.rank || "",
              acc?.lp || 0,
            ),
          };
        }),
      };
    }

    // TIER (default): MMR ?먮룞 ?좎젙
    return this._startAuctionWithCaptains(hostId, roomId, room);
  }

  // ========================================
  // Captain Selection Helpers
  // ========================================

  private async _startAuctionWithCaptains(
    hostId: string,
    roomId: string,
    room: any,
  ) {
    const numTeams = Math.max(2, Math.floor(room.participants.length / 5));

    const sortedPlayers = [...room.participants].sort((a: any, b: any) => {
      const aAcc = a.user.riotAccounts[0];
      const bAcc = b.user.riotAccounts[0];
      const aScore = calculateTierScore(
        aAcc?.tier || "UNRANKED",
        aAcc?.rank || "",
        aAcc?.lp || 0,
      );
      const bScore = calculateTierScore(
        bAcc?.tier || "UNRANKED",
        bAcc?.rank || "",
        bAcc?.lp || 0,
      );
      return bScore - aScore;
    });

    const captains = sortedPlayers.slice(0, numTeams);
    const players = sortedPlayers.slice(numTeams);

    const captainUserIds = captains.map((c: any) => c.userId);
    const { teams } = await this._applySelectedCaptains(
      roomId,
      room,
      captainUserIds,
    );

    const botCaptainIds = this._filterBotCaptains(
      captainUserIds,
      room.participants,
    );

    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      currentHighestBidderName: null,
      timerEnd: Date.now() + this.getBaseBidTimerMs(),
      yuchalCount: 0,
      maxYuchalCycles: numTeams,
      botCaptainIds,
    };

    this.auctionStates.set(roomId, auctionState);

    return {
      teams,
      players: players.map((p: any) => {
        const acc = p.user.riotAccounts[0];
        return {
          id: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          tier: acc?.tier,
          rank: acc?.rank,
          lp: acc?.lp,
          mmr: calculateTierScore(
            acc?.tier || "UNRANKED",
            acc?.rank || "",
            acc?.lp || 0,
          ),
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
        };
      }),
      auctionState,
    };
  }

  async _applySelectedCaptains(
    roomId: string,
    room: any,
    captainUserIds: string[],
  ) {
    const captainParticipants = room.participants.filter((p: any) =>
      captainUserIds.includes(p.userId),
    );

    const teams = await Promise.all(
      captainParticipants.map(async (captain: any, index: number) => {
        const initialBudget = room.startingPoints || 1000;
        return this.prisma.team.create({
          data: {
            roomId,
            name: `Team ${index + 1}`,
            captainId: captain.userId,
            color: this.getTeamColor(index),
            initialBudget,
            remainingBudget: initialBudget,
            members: {
              create: {
                userId: captain.userId,
                assignedRole: captain.user.riotAccounts[0]?.mainRole,
              },
            },
          },
        });
      }),
    );

    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.DRAFT },
    });

    await Promise.all(
      captainParticipants.map((captain: any) =>
        this.prisma.roomParticipant.update({
          where: { id: captain.id },
          data: {
            isCaptain: true,
            teamId: teams.find((t) => t.captainId === captain.userId)?.id,
          },
        }),
      ),
    );

    try {
      if (this.discordVoiceService) {
        await Promise.all(
          captainParticipants.map(async (captain: any) => {
            const discordProvider = await this.prisma.authProvider.findFirst({
              where: { userId: captain.userId, provider: "DISCORD" },
            });
            if (discordProvider) {
              await this.discordVoiceService.assignCaptainRole(
                discordProvider.providerId,
              );
            }
          }),
        );
      }
    } catch (error) {
      console.warn("Failed to assign Discord captain roles:", error);
    }

    return { teams };
  }

  async handleVolunteer(
    userId: string,
    roomId: string,
  ): Promise<{ volunteers: string[] }> {
    const phase = this.captainPhases.get(roomId);
    if (!phase || phase.mode !== TeamCaptainSelection.VOLUNTEER) {
      throw new BadRequestException("Not in volunteer phase");
    }

    const idx = phase.volunteers.indexOf(userId);
    if (idx === -1) {
      phase.volunteers.push(userId);
    } else {
      phase.volunteers.splice(idx, 1);
    }

    return { volunteers: phase.volunteers };
  }

  async finalizeVolunteers(
    hostId: string,
    roomId: string,
    selectedUserIds?: string[],
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: {
            user: { include: { riotAccounts: { where: { isPrimary: true } } } },
          },
        },
      },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.hostId !== hostId)
      throw new ForbiddenException("Only host can finalize");

    const phase = this.captainPhases.get(roomId);
    if (!phase || phase.mode !== TeamCaptainSelection.VOLUNTEER) {
      throw new BadRequestException("Not in volunteer phase");
    }

    if (phase.timerHandle) {
      clearTimeout(phase.timerHandle);
    }

    const numTeams = phase.requiredCount;
    let captainUserIds: string[];

    if (phase.volunteers.length === 0) {
      // Fallback: MMR ?먮룞
      const sorted = [...room.participants].sort((a, b) => {
        const aAcc = a.user.riotAccounts[0];
        const bAcc = b.user.riotAccounts[0];
        return (
          calculateTierScore(
            bAcc?.tier || "UNRANKED",
            bAcc?.rank || "",
            bAcc?.lp || 0,
          ) -
          calculateTierScore(
            aAcc?.tier || "UNRANKED",
            aAcc?.rank || "",
            aAcc?.lp || 0,
          )
        );
      });
      captainUserIds = sorted.slice(0, numTeams).map((p) => p.userId);
    } else if (phase.volunteers.length <= numTeams) {
      // ?먯썝??遺議?or ??留욎쓬: ?먯썝??紐⑤몢 ???+ ?섎㉧吏 MMR濡?梨꾩?
      const remaining = numTeams - phase.volunteers.length;
      captainUserIds = [...phase.volunteers];
      if (remaining > 0) {
        const nonVolunteers = room.participants
          .filter((p) => !phase.volunteers.includes(p.userId))
          .sort((a, b) => {
            const aAcc = a.user.riotAccounts[0];
            const bAcc = b.user.riotAccounts[0];
            return (
              calculateTierScore(
                bAcc?.tier || "UNRANKED",
                bAcc?.rank || "",
                bAcc?.lp || 0,
              ) -
              calculateTierScore(
                aAcc?.tier || "UNRANKED",
                aAcc?.rank || "",
                aAcc?.lp || 0,
              )
            );
          });
        captainUserIds.push(
          ...nonVolunteers.slice(0, remaining).map((p) => p.userId),
        );
      }
    } else {
      // ?먯썝??珥덇낵: 諛⑹옣??selectedUserIds 吏???꾩닔
      if (!selectedUserIds || selectedUserIds.length !== numTeams) {
        throw new BadRequestException(
          `Select exactly ${numTeams} captains from volunteers`,
        );
      }
      const invalidIds = selectedUserIds.filter(
        (id) => !phase.volunteers.includes(id),
      );
      if (invalidIds.length > 0) {
        throw new BadRequestException("Selected users must be volunteers");
      }
      captainUserIds = selectedUserIds;
    }

    this.captainPhases.delete(roomId);

    const { teams } = await this._applySelectedCaptains(
      roomId,
      room,
      captainUserIds,
    );

    const nonCaptains = room.participants.filter(
      (p) => !captainUserIds.includes(p.userId),
    );
    const numTeamsFinal = teams.length;
    const botCaptainIds = this._filterBotCaptains(
      captainUserIds,
      room.participants,
    );

    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      currentHighestBidderName: null,
      timerEnd: Date.now() + this.getBaseBidTimerMs(),
      yuchalCount: 0,
      maxYuchalCycles: numTeamsFinal,
      botCaptainIds,
    };

    this.auctionStates.set(roomId, auctionState);

    return {
      teams,
      players: nonCaptains.map((p) => {
        const acc = p.user.riotAccounts[0];
        return {
          id: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          tier: acc?.tier,
          rank: acc?.rank,
          lp: acc?.lp,
          mmr: calculateTierScore(
            acc?.tier || "UNRANKED",
            acc?.rank || "",
            acc?.lp || 0,
          ),
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
        };
      }),
      auctionState,
      captainUserIds,
    };
  }

  async selectManualCaptains(
    hostId: string,
    roomId: string,
    userIds: string[],
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: {
            user: { include: { riotAccounts: { where: { isPrimary: true } } } },
          },
        },
      },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.hostId !== hostId)
      throw new ForbiddenException("Only host can select captains");

    const numTeams = Math.max(2, Math.floor(room.participants.length / 5));
    if (userIds.length !== numTeams) {
      throw new BadRequestException(`Need exactly ${numTeams} captains`);
    }

    const participantIds = room.participants.map((p) => p.userId);
    const invalid = userIds.filter((id) => !participantIds.includes(id));
    if (invalid.length > 0) {
      throw new BadRequestException("Selected users must be participants");
    }

    const { teams } = await this._applySelectedCaptains(roomId, room, userIds);
    const nonCaptains = room.participants.filter(
      (p) => !userIds.includes(p.userId),
    );
    const botCaptainIds = this._filterBotCaptains(userIds, room.participants);

    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      currentHighestBidderName: null,
      timerEnd: Date.now() + this.getBaseBidTimerMs(),
      yuchalCount: 0,
      maxYuchalCycles: numTeams,
      botCaptainIds,
    };

    this.auctionStates.set(roomId, auctionState);

    return {
      teams,
      players: nonCaptains.map((p) => {
        const acc = p.user.riotAccounts[0];
        return {
          id: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          tier: acc?.tier,
          rank: acc?.rank,
          lp: acc?.lp,
          mmr: calculateTierScore(
            acc?.tier || "UNRANKED",
            acc?.rank || "",
            acc?.lp || 0,
          ),
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
        };
      }),
      auctionState,
      captainUserIds: userIds,
    };
  }

  getCaptainPhase(roomId: string): CaptainSelectionPhase | undefined {
    return this.captainPhases.get(roomId);
  }

  setCaptainPhaseTimerHandle(
    roomId: string,
    handle: ReturnType<typeof setTimeout>,
  ) {
    const phase = this.captainPhases.get(roomId);
    if (phase) phase.timerHandle = handle;
  }

  // ========================================
  // Bidding Logic
  // ========================================

  async placeBid(
    userId: string,
    roomId: string,
    amount: number,
  ): Promise<AuctionState> {
    const state = this.auctionStates.get(roomId);
    if (!state) {
      throw new BadRequestException("Auction not started");
    }

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException("Room not found");

    const bidIncrement = room.minBidIncrement || 50;

    // Get team
    const team = await this.prisma.team.findFirst({
      where: { roomId, captainId: userId },
      include: {
        captain: {
          select: {
            username: true,
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!team) {
      throw new ForbiddenException("Only captains can bid");
    }

    // Timer expiration check ???쒕쾭 湲곗??쇰줈 ??대㉧ 留뚮즺 ?щ? ?뺤씤
    if (Date.now() > state.timerEnd) {
      throw new BadRequestException("Bidding time has expired");
    }

    // Self-outbid prevention ???대? 理쒓퀬媛???? ?ㅼ떆 ?낆같 遺덇?
    if (state.currentHighestBidder === team.id) {
      throw new BadRequestException("You are already the highest bidder");
    }

    // Validate bid
    if (amount < state.currentHighestBid + bidIncrement) {
      throw new BadRequestException(
        `Bid must be at least ${state.currentHighestBid + bidIncrement}`,
      );
    }

    // Keep reserve budget for remaining roster slots (simulation parity).
    const slotsNeeded = Math.max(0, 5 - team._count.members);
    const reserveAmount = Math.max(0, (slotsNeeded - 1) * 100);
    const availableToBid = Math.max(0, team.remainingBudget - reserveAmount);
    if (amount > availableToBid) {
      throw new BadRequestException(
        `Insufficient available budget (reserve ${reserveAmount} required)`,
      );
    }

    const maxTeamSize = 5;
    if (team._count.members >= maxTeamSize) {
      throw new BadRequestException("Team is already full");
    }

    if (amount % bidIncrement !== 0) {
      throw new BadRequestException(`Bid must be multiple of ${bidIncrement}`);
    }

    // Get current player being auctioned
    const roomWithParticipants = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER", isCaptain: false, teamId: null },
          include: {
            user: {
              include: {
                riotAccounts: { where: { isPrimary: true } },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    const currentPlayer =
      roomWithParticipants?.participants[state.currentPlayerIndex];
    if (!currentPlayer) {
      throw new BadRequestException("No player to bid on");
    }

    // Record bid in DB first — update in-memory state only after successful write
    await this.prisma.auctionBid.create({
      data: {
        roomId,
        teamId: team.id,
        targetUserId: currentPlayer.userId,
        amount,
      },
    });

    state.currentHighestBid = amount;
    state.currentHighestBidder = team.id;
    state.currentHighestBidderName = team.captain.username;
    state.timerEnd = this.getExtendedBidTimerEnd(state.timerEnd);
    state.yuchalCount = 0;

    return state;
  }

  // ========================================
  // Auction Resolution
  // ========================================

  async resolveCurrentBid(roomId: string): Promise<{
    sold: boolean;
    player?: any;
    team?: any;
    price?: number;
  }> {
    const state = this.auctionStates.get(roomId);
    if (!state) {
      throw new BadRequestException("Auction not started");
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER", isCaptain: false, teamId: null },
          include: {
            user: {
              include: {
                riotAccounts: { where: { isPrimary: true } },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        teams: {
          include: {
            captain: true,
            _count: {
              select: {
                members: true,
              },
            },
          },
          orderBy: { remainingBudget: "desc" },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    const currentPlayer = room.participants[state.currentPlayerIndex];
    if (!currentPlayer) {
      throw new BadRequestException("No player to resolve");
    }

    // Check if there was a bid
    if (state.currentHighestBidder) {
      // Sold!
      const team = await this.prisma.team.findUnique({
        where: { id: state.currentHighestBidder },
      });

      if (!team) {
        throw new NotFoundException("Team not found");
      }

      const soldPrice = state.currentHighestBid;

      // Atomic update: deduct budget, assign player, update participant
      await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: team.id },
          data: {
            remainingBudget: team.remainingBudget - soldPrice,
          },
        });

        await tx.teamMember.create({
          data: {
            teamId: team.id,
            userId: currentPlayer.userId,
            soldPrice,
          },
        });

        await tx.roomParticipant.update({
          where: { id: currentPlayer.id },
          data: { teamId: team.id },
        });
      });

      // ?ㅼ쓬 ?좎닔濡??대룞 (DB 荑쇰━媛 ?붾┛ ?좎닔瑜??쒖쇅?섎?濡???긽 0踰덉씠 ?ㅼ쓬 ?좎닔)
      state.currentPlayerIndex = 0;
      state.currentHighestBid = 0;
      state.currentHighestBidder = null;
      state.currentHighestBidderName = null;
      state.timerEnd = Date.now() + this.getBaseBidTimerMs();
      state.yuchalCount = 0;

      return {
        sold: true,
        player: currentPlayer,
        team,
        price: soldPrice,
      };
    } else {
      // Yuchal (no sale)
      const prevYuchalCount = state.yuchalCount;
      const nextYuchalCount = prevYuchalCount + 1;
      const bidIncrement = room.minBidIncrement || 50;
      const maxTeamSize = 5;
      const incompleteTeams = room.teams.filter(
        (t) => t._count.members < maxTeamSize,
      );
      const anyCanBid = incompleteTeams.some(
        (t) => t.remainingBudget >= bidIncrement,
      );

      // Simulation rule: if someone can still bid and cycle not exhausted, keep same player.
      if (nextYuchalCount < state.maxYuchalCycles && anyCanBid) {
        state.yuchalCount = nextYuchalCount;
        state.currentHighestBid = 0;
        state.currentHighestBidder = null;
        state.currentHighestBidderName = null;
        state.timerEnd = Date.now() + this.getBaseBidTimerMs();
        return { sold: false, player: currentPlayer };
      }

      // Simulation rule: otherwise force-assign to incomplete team with highest budget.
      const targetTeamPool =
        incompleteTeams.length > 0 ? incompleteTeams : room.teams;
      const targetTeam = [...targetTeamPool].sort(
        (a, b) => b.remainingBudget - a.remainingBudget,
      )[0];

      await this.prisma.$transaction(async (tx) => {
        if (targetTeam.remainingBudget === 0 && !targetTeam.hasReceivedBonus) {
          await tx.team.update({
            where: { id: targetTeam.id },
            data: {
              remainingBudget: BONUS_GOLD,
              hasReceivedBonus: true,
            },
          });
        }

        await tx.teamMember.create({
          data: {
            teamId: targetTeam.id,
            userId: currentPlayer.userId,
            soldPrice: 0,
          },
        });

        await tx.roomParticipant.update({
          where: { id: currentPlayer.id },
          data: { teamId: targetTeam.id },
        });

        await tx.auctionBid.create({
          data: {
            roomId,
            teamId: targetTeam.id,
            targetUserId: currentPlayer.userId,
            amount: 0,
            isYuchal: true,
          },
        });
      });

      state.currentPlayerIndex = 0;
      state.currentHighestBid = 0;
      state.currentHighestBidder = null;
      state.currentHighestBidderName = null;
      state.timerEnd = Date.now() + this.getBaseBidTimerMs();
      state.yuchalCount = 0;

      return {
        sold: true,
        player: currentPlayer,
        team: targetTeam,
        price: 0,
      };
    }
  }

  // ========================================
  // Auction Completion
  // ========================================

  async checkAuctionComplete(roomId: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER", teamId: null },
        },
      },
    });

    // All players assigned (except captains who are already assigned)
    const state = this.auctionStates.get(roomId);
    if (!state) return false;

    return room!.participants.length === 0;
  }

  async completeAuction(roomId: string) {
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.DRAFT_COMPLETED },
    });

    // Discord 遊? ? 援ъ꽦 ?꾨즺 ???蹂??뚯꽦梨꾨꼸 諛곗튂
    try {
      if (this.discordVoiceService) {
        await this.discordVoiceService.handleTeamAssignment(roomId);
      }
    } catch (error) {
      console.warn("Failed to assign teams to Discord channels:", error);
    }

    this.auctionStates.delete(roomId);

    return { message: "Auction completed" };
  }

  // ========================================
  // Utility
  // ========================================

  getAuctionState(roomId: string): AuctionState | undefined {
    return this.auctionStates.get(roomId);
  }

  clearAuctionState(roomId: string): void {
    const phase = this.captainPhases.get(roomId);
    if (phase?.timerHandle) {
      clearTimeout(phase.timerHandle);
    }
    this.captainPhases.delete(roomId);
    this.auctionStates.delete(roomId);
  }

  async cleanupBotOnlyRoomOnHostDisconnect(
    userId: string,
    roomId: string,
  ): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        discordChannels: {
          select: {
            channelId: true,
            teamName: true,
          },
        },
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

    if (!room || room.hostId !== userId) {
      return false;
    }

    // Don't delete rooms that have progressed beyond WAITING
    // (e.g., DRAFT_COMPLETED, ROLE_SELECTION, IN_PROGRESS)
    const deletableStatuses: RoomStatus[] = [
      RoomStatus.WAITING,
      RoomStatus.DRAFT,
      RoomStatus.TEAM_SELECTION,
    ];
    if (!deletableStatuses.includes(room.status as RoomStatus)) {
      return false;
    }

    const remainingParticipants = room.participants.filter(
      (p) => p.userId !== userId,
    );
    const shouldDelete =
      remainingParticipants.length === 0 ||
      remainingParticipants.every((p) =>
        this.isBotUsername(p.user?.username ?? ""),
      );

    if (!shouldDelete) {
      return false;
    }

    try {
      if (this.discordVoiceService) {
        await this.discordVoiceService
          .deleteRoomChannels(roomId, false, {
            discordCategoryId: room.discordCategoryId,
            discordChannels: room.discordChannels,
          })
          .catch(() => {});
      }
    } catch {
      // Ignore Discord cleanup failures for zombie-room cleanup.
    }

    await this.prisma.room.delete({ where: { id: roomId } });
    this.clearAuctionState(roomId);
    return true;
  }

  /** 寃쎈ℓ ?섏씠吏 珥덇린 濡쒕뱶?? ?꾩옱 teams + ?⑥? players 諛섑솚 */
  async getFullAuctionData(
    roomId: string,
  ): Promise<{ teams: any[]; players: any[] }> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            captain: {
              select: {
                username: true,
              },
            },
            members: {
              include: {
                user: {
                  include: { riotAccounts: { where: { isPrimary: true } } },
                },
              },
            },
          },
        },
        participants: {
          where: { isCaptain: false, teamId: null },
          include: {
            user: { include: { riotAccounts: { where: { isPrimary: true } } } },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!room) return { teams: [], players: [] };

    const players = room.participants.map((p: any) => {
      const acc = p.user.riotAccounts[0];
      return {
        id: p.userId,
        username: p.user.username,
        avatar: p.user.avatar,
        tier: acc?.tier,
        rank: acc?.rank,
        mainRole: acc?.mainRole,
        subRole: acc?.subRole,
        mmr: calculateTierScore(
          acc?.tier || "UNRANKED",
          acc?.rank || "",
          acc?.lp || 0,
        ),
      };
    });

    const teams = room.teams.map((t: any) => ({
      id: t.id,
      name: t.name,
      captainId: t.captainId,
      captainName: t.captain?.username ?? null,
      color: t.color,
      remainingBudget: t.remainingBudget,
      remainingGold: t.remainingBudget,
      members: t.members.map((m: any) => {
        const acc = m.user?.riotAccounts?.[0];
        return {
          id: m.userId,
          username: m.user?.username ?? "Unknown",
          avatar: m.user?.avatar,
          tier: acc?.tier ?? "UNRANKED",
          rank: acc?.rank,
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
          mmr: calculateTierScore(
            acc?.tier || "UNRANKED",
            acc?.rank || "",
            acc?.lp || 0,
          ),
          position: m.assignedRole ?? acc?.mainRole ?? "FLEX",
        };
      }),
    }));

    return { teams, players };
  }

  /** testbot_NN ?⑦꽩 ?좎? ?앸퀎 */
  isBotUsername(username: string): boolean {
    return /^testbot_\d+$/.test(username);
  }

  /** captainUserIds 以?遊뉗씤 userId留??꾪꽣 (participants 諛곗뿴?먯꽌 username 議고쉶) */
  private _filterBotCaptains(
    captainUserIds: string[],
    participants: any[],
  ): string[] {
    return captainUserIds.filter((id) => {
      const p = participants.find((p: any) => p.userId === id);
      return p && this.isBotUsername(p.user?.username ?? "");
    });
  }

  /**
   * 遊???λ뱾???낆같 ?꾨낫 ?뺣낫 諛섑솚
   * gateway?먯꽌 bot ?먮룞 ?낆같 ?ㅼ?以꾨쭅???ъ슜
   */
  async getBotBidCandidates(roomId: string): Promise<
    {
      captainId: string;
      username: string;
      teamId: string;
      remainingBudget: number;
      memberCount: number;
      availableToBid: number;
    }[]
  > {
    const state = this.auctionStates.get(roomId);
    if (!state || state.botCaptainIds.length === 0) return [];

    const teams = await this.prisma.team.findMany({
      where: { roomId, captainId: { in: state.botCaptainIds } },
      include: {
        captain: { select: { username: true } },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return teams.map((t) => {
      const memberCount = t._count.members;
      const slotsNeeded = Math.max(0, 5 - memberCount);
      const reserveAmount = Math.max(0, (slotsNeeded - 1) * 100);
      const availableToBid = Math.max(0, t.remainingBudget - reserveAmount);
      return {
        captainId: t.captainId,
        username: t.captain.username,
        teamId: t.id,
        remainingBudget: t.remainingBudget,
        memberCount,
        availableToBid,
      };
    });
  }

  private getTeamColor(index: number): string {
    const colors = [
      "#3B82F6", // Blue
      "#EF4444", // Red
      "#10B981", // Green
      "#F59E0B", // Yellow
      "#8B5CF6", // Purple
      "#EC4899", // Pink
    ];
    return colors[index % colors.length];
  }
}
