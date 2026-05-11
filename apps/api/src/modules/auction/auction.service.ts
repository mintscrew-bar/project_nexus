import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Inject,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { Prisma } from "@prisma/client";
import { RoomStatus, TeamCaptainSelection, TeamMode } from "@nexus/database";
import { calculateTierScore } from "../common/tier-score.util";

const BONUS_GOLD = 500;
const DEFAULT_BID_TIME_SECONDS = 10;
const BID_EXTENSION_SECONDS = 5;
const MAX_BID_TIME_SECONDS = 10;
const DEFAULT_BID_INCREMENT = 50;

export interface AuctionState {
  roomId: string;
  currentPlayerIndex: number;
  currentHighestBid: number;
  currentHighestBidder: string | null; // teamId of the current leading bidder
  currentHighestBidderName?: string | null;
  timerEnd: number;
  yuchalCount: number;
  maxYuchalCycles: number;
  bidIncrement: number;
  botCaptainIds: string[]; // captain userIds whose usernames match testbot_*
}

export interface CaptainSelectionPhase {
  mode: TeamCaptainSelection;
  requiredCount: number;
  volunteers: string[]; // userId[]
  timerEnd: number | null;
  timerHandle: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class AuctionService implements OnModuleInit {
  /** 인메모리 경매 상태 (빠른 동기 접근용) — Redis와 동기화됨 */
  private auctionStates = new Map<string, AuctionState>();
  /** 인메모리 주장 선정 단계 (빠른 동기 접근용) — Redis와 동기화됨 */
  private captainPhases = new Map<string, CaptainSelectionPhase>();
  /** setTimeout 핸들 — 직렬화 불가로 인메모리 전용 유지 */
  private captainTimerHandles = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private discordVoiceService: any; // DiscordVoiceService (optional dependency)

  // Redis 키 상수
  private static readonly AUCTION_STATE_KEY = (roomId: string) =>
    `auction:state:${roomId}`;
  private static readonly CAPTAIN_PHASE_KEY = (roomId: string) =>
    `auction:captain-phase:${roomId}`;
  private static readonly AUCTION_TTL = 4 * 60 * 60; // 4시간 (진행 중인 경매 최대 지속 시간)
  private static readonly CAPTAIN_TTL = 120; // 2분 (팀장 선정은 단기 세션)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordVoiceService = discordVoice;
  }

  /**
   * 서버 시작 시 Redis에 남아있는 경매/팀장 선정 상태 복원
   * (서버 재시작 내구성 확보)
   */
  async onModuleInit() {
    try {
      await this._restoreStatesFromRedis();
    } catch (error) {
      console.warn(
        "[AuctionService] Redis 상태 복원 실패 (정상 시작으로 계속):",
        error,
      );
    }
  }

  /**
   * 서버 시작 시 DB의 진행 중 경매 방 목록을 조회 후
   * 각 방의 상태를 Redis에서 복원 (KEYS 명령 없이 안전하게 복원)
   */
  private async _restoreStatesFromRedis() {
    // DRAFT / TEAM_SELECTION 상태인 방만 조회 (경매가 진행 중일 수 있는 상태)
    const activeRooms = await this.prisma.room.findMany({
      where: { status: { in: [RoomStatus.DRAFT, RoomStatus.TEAM_SELECTION] } },
      select: { id: true },
    });

    if (activeRooms.length === 0) return;

    let restoredCount = 0;
    await Promise.all(
      activeRooms.map(async ({ id: roomId }) => {
        const [stateStr, phaseStr] = await Promise.all([
          this.redis.get(AuctionService.AUCTION_STATE_KEY(roomId)),
          this.redis.get(AuctionService.CAPTAIN_PHASE_KEY(roomId)),
        ]);

        if (stateStr) {
          try {
            this.auctionStates.set(
              roomId,
              JSON.parse(stateStr) as AuctionState,
            );
            restoredCount++;
          } catch {
            // 손상된 값 무시
          }
        }

        if (phaseStr) {
          try {
            const phase = JSON.parse(phaseStr) as CaptainSelectionPhase;
            // timerHandle은 직렬화 불가 — null로 복원
            phase.timerHandle = null;
            this.captainPhases.set(roomId, phase);
          } catch {
            // 손상된 값 무시
          }
        }
      }),
    );

    if (restoredCount > 0) {
      console.log(
        `[AuctionService] 경매 상태 ${restoredCount}건 Redis에서 복원됨`,
      );
    }
  }

  /** 경매 상태를 인메모리 + Redis에 저장 */
  private _setAuctionState(roomId: string, state: AuctionState): void {
    this.auctionStates.set(roomId, state);
    this.redis
      .set(
        AuctionService.AUCTION_STATE_KEY(roomId),
        JSON.stringify(state),
        AuctionService.AUCTION_TTL,
      )
      .catch((e) =>
        console.warn(
          `[AuctionService] Redis 경매 상태 저장 실패 (${roomId}):`,
          e,
        ),
      );
  }

  /** 경매 상태를 인메모리 + Redis에서 삭제 */
  private _deleteAuctionState(roomId: string): void {
    this.auctionStates.delete(roomId);
    this.redis
      .del(AuctionService.AUCTION_STATE_KEY(roomId))
      .catch((e) =>
        console.warn(
          `[AuctionService] Redis 경매 상태 삭제 실패 (${roomId}):`,
          e,
        ),
      );
  }

  /** 팀장 선정 단계를 인메모리 + Redis에 저장 (timerHandle 제외) */
  private _setCaptainPhase(roomId: string, phase: CaptainSelectionPhase): void {
    this.captainPhases.set(roomId, phase);
    const { timerHandle: _, ...serializable } = phase; // timerHandle 제외
    this.redis
      .set(
        AuctionService.CAPTAIN_PHASE_KEY(roomId),
        JSON.stringify(serializable),
        AuctionService.CAPTAIN_TTL,
      )
      .catch((e) =>
        console.warn(
          `[AuctionService] Redis 팀장 단계 저장 실패 (${roomId}):`,
          e,
        ),
      );
  }

  /** 팀장 선정 단계를 인메모리 + Redis에서 삭제 */
  private _deleteCaptainPhase(roomId: string): void {
    const handle = this.captainTimerHandles.get(roomId);
    if (handle) {
      clearTimeout(handle);
      this.captainTimerHandles.delete(roomId);
    }
    this.captainPhases.delete(roomId);
    this.redis
      .del(AuctionService.CAPTAIN_PHASE_KEY(roomId))
      .catch((e) =>
        console.warn(
          `[AuctionService] Redis 팀장 단계 삭제 실패 (${roomId}):`,
          e,
        ),
      );
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

    // Calculate number of teams. Keep at least 2 teams for small test lobbies.
    if (room.participants.length < 4) {
      throw new BadRequestException("Auction mode requires at least 4 players");
    }
    const numTeams = Math.max(2, Math.floor(room.participants.length / 5));

    const captainMode = room.captainSelection ?? TeamCaptainSelection.TIER;

    // MANUAL / VOLUNTEER enter captain selection first and defer auction start.
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
      this._setCaptainPhase(roomId, phase);

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

    // TIER (default): choose captains automatically by MMR.
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

    const botCaptainIds = await this._filterBotCaptains(
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
      bidIncrement: room.minBidIncrement || DEFAULT_BID_INCREMENT,
      botCaptainIds,
    };

    this._setAuctionState(roomId, auctionState);

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

    // 팀 생성 + 상태 전환 + 캡틴 배정을 원자적으로 처리
    const teams = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const createdTeams = await Promise.all(
          captainParticipants.map(async (captain: any, index: number) => {
            const initialBudget = room.startingPoints || 1000;
            return tx.team.create({
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

        await tx.room.update({
          where: { id: roomId },
          data: { status: RoomStatus.DRAFT },
        });

        await Promise.all(
          captainParticipants.map((captain: any) =>
            tx.roomParticipant.update({
              where: { id: captain.id },
              data: {
                isCaptain: true,
                teamId: createdTeams.find((t) => t.captainId === captain.userId)
                  ?.id,
              },
            }),
          ),
        );

        return createdTeams;
      },
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

    // 방 참여자 검증
    const isParticipant = await this.isRoomParticipant(userId, roomId);
    if (!isParticipant) {
      throw new ForbiddenException("방 참여자만 자원할 수 있습니다.");
    }

    const idx = phase.volunteers.indexOf(userId);
    if (idx === -1) {
      phase.volunteers.push(userId);
    } else {
      phase.volunteers.splice(idx, 1);
    }

    // volunteers 변경사항을 Redis에 동기화
    this._setCaptainPhase(roomId, phase);

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
      // Not enough volunteers or exactly enough: keep volunteers and fill the rest by MMR.
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
      // Too many volunteers: host must pick the final captain set.
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

    this._deleteCaptainPhase(roomId);

    const { teams } = await this._applySelectedCaptains(
      roomId,
      room,
      captainUserIds,
    );

    const nonCaptains = room.participants.filter(
      (p) => !captainUserIds.includes(p.userId),
    );
    const numTeamsFinal = teams.length;
    const botCaptainIds = await this._filterBotCaptains(
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
      bidIncrement: room.minBidIncrement || DEFAULT_BID_INCREMENT,
      botCaptainIds,
    };

    this._setAuctionState(roomId, auctionState);

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
      (p: any) => !userIds.includes(p.userId),
    );
    const botCaptainIds = await this._filterBotCaptains(userIds, room.participants);

    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      currentHighestBidderName: null,
      timerEnd: Date.now() + this.getBaseBidTimerMs(),
      yuchalCount: 0,
      maxYuchalCycles: numTeams,
      bidIncrement: room.minBidIncrement || DEFAULT_BID_INCREMENT,
      botCaptainIds,
    };

    this._setAuctionState(roomId, auctionState);

    return {
      teams,
      players: nonCaptains.map((p: any) => {
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

  /**
   * 재연결 시 팀장 선정 단계 복원에 필요한 전체 페이로드를 반환한다.
   * (mode, requiredCount, volunteers, timerEnd, participants, hostId)
   */
  async getCaptainSelectionPayload(roomId: string) {
    const phase = this.captainPhases.get(roomId);
    if (!phase) return null;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: {
            user: {
              include: { riotAccounts: { where: { isPrimary: true } } },
            },
          },
        },
      },
    });
    if (!room) return null;

    const participants = room.participants.map((p) => {
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
    });

    return {
      mode: phase.mode,
      requiredCount: phase.requiredCount,
      volunteers: phase.volunteers,
      timerEnd: phase.timerEnd,
      participants,
      hostId: room.hostId,
    };
  }

  setCaptainPhaseTimerHandle(
    roomId: string,
    handle: ReturnType<typeof setTimeout>,
  ) {
    const phase = this.captainPhases.get(roomId);
    if (phase) {
      // timerHandle은 인메모리 전용 — Redis 동기화 불필요
      phase.timerHandle = handle;
      this.captainTimerHandles.set(roomId, handle);
    }
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

    const bidIncrement = room.minBidIncrement || DEFAULT_BID_INCREMENT;
    if (!state.bidIncrement) {
      state.bidIncrement = bidIncrement;
    }

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

    // Timer expiration check based on server-side timerEnd.
    if (Date.now() > state.timerEnd) {
      throw new BadRequestException("Bidding time has expired");
    }

    // currentHighestBidder stores a teamId, so compare with this captain's team id.
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
    const reserveAmount = Math.max(0, (slotsNeeded - 1) * bidIncrement);
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

    // 예산 검증과 입찰 기록을 트랜잭션으로 묶어 원자성 보장.
    // RepeatableRead: 트랜잭션 내에서 동일 행을 다시 읽을 때 다른 트랜잭션의
    // 커밋이 보이지 않으므로, 동시 입찰 시 예산 이중 검증 방지.
    await this.prisma.$transaction(
      async (tx) => {
        // 트랜잭션 내에서 최신 예산 재확인
        const freshTeam = await tx.team.findUnique({
          where: { id: team.id },
          select: { remainingBudget: true },
        });
        if (!freshTeam)
          throw new BadRequestException("팀 정보를 찾을 수 없습니다.");

        const freshMemberCount = await tx.teamMember.count({
          where: { teamId: team.id },
        });
        const freshSlots = Math.max(0, 5 - freshMemberCount);
        const freshReserve = Math.max(0, (freshSlots - 1) * bidIncrement);
        const freshAvailable = Math.max(
          0,
          freshTeam.remainingBudget - freshReserve,
        );
        if (amount > freshAvailable) {
          throw new BadRequestException(
            `예산 부족 (가용 예산: ${freshAvailable}, 필요 적립금: ${freshReserve})`,
          );
        }

        // 트랜잭션 내에서 경매 대상 플레이어가 아직 미배정 상태인지 재검증.
        // 외부 쿼리와 트랜잭션 사이에 낙찰이 완료되면 다른 플레이어를 가리킬 수 있다.
        const stillUnassigned = await tx.roomParticipant.findFirst({
          where: {
            id: currentPlayer.id,
            teamId: null,
            isCaptain: false,
          },
        });
        if (!stillUnassigned) {
          throw new BadRequestException(
            "경매 대상이 변경되었습니다. 다시 시도해주세요.",
          );
        }

        await tx.auctionBid.create({
          data: {
            roomId,
            teamId: team.id,
            targetUserId: currentPlayer.userId,
            amount,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    state.currentHighestBid = amount;
    state.currentHighestBidder = team.id;
    state.currentHighestBidderName = team.captain.username;
    state.timerEnd = this.getExtendedBidTimerEnd(state.timerEnd);
    state.yuchalCount = 0;

    // 입찰 상태 변경을 Redis에 동기화
    this._setAuctionState(roomId, state);

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
      // 트랜잭션 내부에서 remainingBudget을 재조회해 stale read 방지
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const freshTeam = await tx.team.findUniqueOrThrow({
          where: { id: team.id },
          select: { remainingBudget: true },
        });
        await tx.team.update({
          where: { id: team.id },
          data: {
            remainingBudget: freshTeam.remainingBudget - soldPrice,
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

      // Move to the next available player.
      state.currentPlayerIndex = 0;
      state.currentHighestBid = 0;
      state.currentHighestBidder = null;
      state.currentHighestBidderName = null;
      state.timerEnd = Date.now() + this.getBaseBidTimerMs();
      state.yuchalCount = 0;

      // 낙찰 후 초기화된 상태를 Redis에 동기화
      this._setAuctionState(roomId, state);

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
      const bidIncrement = room.minBidIncrement || DEFAULT_BID_INCREMENT;
      const maxTeamSize = 5;
      const incompleteTeams = room.teams.filter(
        (t: any) => t._count.members < maxTeamSize,
      );
      const anyCanBid = incompleteTeams.some(
        (t: any) => t.remainingBudget >= bidIncrement,
      );

      // Simulation rule: if someone can still bid and cycle not exhausted, keep same player.
      if (nextYuchalCount < state.maxYuchalCycles && anyCanBid) {
        state.yuchalCount = nextYuchalCount;
        state.currentHighestBid = 0;
        state.currentHighestBidder = null;
        state.currentHighestBidderName = null;
        state.timerEnd = Date.now() + this.getBaseBidTimerMs();
        // 유찰 상태 변경을 Redis에 동기화
        this._setAuctionState(roomId, state);
        return { sold: false, player: currentPlayer };
      }

      // Simulation rule: otherwise force-assign to incomplete team with highest budget.
      const targetTeamPool =
        incompleteTeams.length > 0 ? incompleteTeams : room.teams;
      const targetTeam = [...targetTeamPool].sort(
        (a, b) => b.remainingBudget - a.remainingBudget,
      )[0];

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      // 강제배정 후 초기화된 상태를 Redis에 동기화
      this._setAuctionState(roomId, state);

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

    // Discord bot: move each team to its voice channel after team composition is complete.
    try {
      if (this.discordVoiceService) {
        await this.discordVoiceService.handleTeamAssignment(roomId);
      }
    } catch (error) {
      console.warn("Failed to assign teams to Discord channels:", error);
    }

    this._deleteAuctionState(roomId);

    return { message: "Auction completed" };
  }

  // ========================================
  // Utility
  // ========================================

  getAuctionState(roomId: string): AuctionState | undefined {
    return this.auctionStates.get(roomId);
  }

  /** 해당 유저가 방의 호스트인지 확인 */
  async isRoomHost(userId: string, roomId: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    return room?.hostId === userId;
  }

  /** 방 참여자 여부 확인 */
  async isRoomParticipant(userId: string, roomId: string): Promise<boolean> {
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { userId, roomId },
      select: { id: true },
    });
    return !!participant;
  }

  /** 관전자 여부 확인 — SPECTATOR 역할이면 입찰 불가 */
  async isSpectator(userId: string, roomId: string): Promise<boolean> {
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { userId, roomId },
      select: { role: true },
    });
    return participant?.role === "SPECTATOR";
  }

  clearAuctionState(roomId: string): void {
    this._deleteCaptainPhase(roomId); // timerHandle clearTimeout + Redis 삭제 포함
    this._deleteAuctionState(roomId);
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
      (p: any) => p.userId !== userId,
    );
    const shouldDelete =
      remainingParticipants.length === 0 ||
      remainingParticipants.every((p: any) =>
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

  /** Return current teams and remaining players for initial auction page load. */
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

  /** Detect bot users by the testbot_NN username pattern. */
  isBotUsername(username: string): boolean {
    return /^testbot_\d+$/.test(username);
  }

  /** Filter bot captain userIds, fetching usernames if participants were not hydrated. */
  private async _filterBotCaptains(
    captainUserIds: string[],
    participants: any[],
  ): Promise<string[]> {
    const knownBotIds = captainUserIds.filter((id) => {
      const p = participants.find((p: any) => p.userId === id);
      return p && this.isBotUsername(p.user?.username ?? p.username ?? "");
    });

    const unresolvedIds = captainUserIds.filter((id) => {
      const p = participants.find((p: any) => p.userId === id);
      return !p?.user?.username && !p?.username;
    });

    if (unresolvedIds.length === 0) {
      return knownBotIds;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: unresolvedIds } },
      select: { id: true, username: true },
    });
    const fetchedBotIds = users
      .filter((user) => this.isBotUsername(user.username))
      .map((user) => user.id);

    return [...new Set([...knownBotIds, ...fetchedBotIds])];
  }

  /**
   * Return bot bidding candidates for the gateway auto-bid loop.
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

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { minBidIncrement: true },
    });
    const bidIncrement = room?.minBidIncrement || DEFAULT_BID_INCREMENT;

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

    return teams.map((t: any) => {
      const memberCount = t._count.members;
      const slotsNeeded = Math.max(0, 5 - memberCount);
      const reserveAmount = Math.max(0, (slotsNeeded - 1) * bidIncrement);
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
