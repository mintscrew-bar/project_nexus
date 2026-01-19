import { Injectable, BadRequestException } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { PrismaService } from "../prisma/prisma.service";

export enum AuctionPhase {
  RECRUITING = "RECRUITING",
  CAPTAIN_SELECT = "CAPTAIN_SELECT",
  BIDDING = "BIDDING",
  YUCHAL = "YUCHAL", // 유찰 처리 (Snake Draft)
  LANE_SELECT = "LANE_SELECT",
  IN_GAME = "IN_GAME",
  FINISHED = "FINISHED",
  CANCELLED = "CANCELLED",
}

export interface AuctionState {
  status: AuctionPhase;
  version: number; // Optimistic locking
  currentPhase: {
    nomineeId: string | null; // 현재 입찰 대상 플레이어 ID
    currentBid: number;
    bidderId: string | null; // 현재 최고 입찰자 팀 ID
    timerEnd: number; // Unix timestamp (밀리초)
  };
  captains: {
    blue: { userId: string; gold: number } | null;
    red: { userId: string; gold: number } | null;
  };
  unsoldPlayers: string[]; // User IDs (유찰된 플레이어)
  participants: string[]; // User IDs (참가자 목록)
}

@Injectable()
export class AuctionStateService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 옥션 상태 초기화
   */
  async initializeState(
    auctionId: string,
    participants: string[],
  ): Promise<AuctionState> {
    const state: AuctionState = {
      status: AuctionPhase.RECRUITING,
      version: 1,
      currentPhase: {
        nomineeId: null,
        currentBid: 0,
        bidderId: null,
        timerEnd: 0,
      },
      captains: {
        blue: null,
        red: null,
      },
      unsoldPlayers: [],
      participants,
    };

    await this.saveState(auctionId, state);
    return state;
  }

  /**
   * 옥션 상태 가져오기
   */
  async getState(auctionId: string): Promise<AuctionState | null> {
    const stateStr = await this.redis.get(`auction:${auctionId}:state`);
    if (!stateStr) {
      return null;
    }
    return JSON.parse(stateStr);
  }

  /**
   * 옥션 상태 저장
   */
  async saveState(auctionId: string, state: AuctionState): Promise<void> {
    await this.redis.set(
      `auction:${auctionId}:state`,
      JSON.stringify(state),
      3600, // 1시간 TTL
    );
  }

  /**
   * 상태 업데이트 (Optimistic Locking)
   */
  async updateState(
    auctionId: string,
    updater: (state: AuctionState) => AuctionState,
  ): Promise<AuctionState> {
    const currentState = await this.getState(auctionId);
    if (!currentState) {
      throw new BadRequestException("Auction state not found");
    }

    const updatedState = updater({
      ...currentState,
      version: currentState.version + 1,
    });

    await this.saveState(auctionId, updatedState);
    return updatedState;
  }

  /**
   * 상태 전환
   */
  async transitionTo(
    auctionId: string,
    newPhase: AuctionPhase,
    data?: Partial<AuctionState>,
  ): Promise<AuctionState> {
    return this.updateState(auctionId, (state) => ({
      ...state,
      status: newPhase,
      ...data,
    }));
  }

  /**
   * 입찰 시작 (플레이어 지명)
   */
  async startBidding(
    auctionId: string,
    nomineeId: string,
    bidTimeLimit: number = 15,
  ): Promise<AuctionState> {
    const timerEnd = Date.now() + bidTimeLimit * 1000;

    return this.updateState(auctionId, (state) => ({
      ...state,
      status: AuctionPhase.BIDDING,
      currentPhase: {
        nomineeId,
        currentBid: 0,
        bidderId: null,
        timerEnd,
      },
    }));
  }

  /**
   * 입찰 처리
   */
  async placeBid(
    auctionId: string,
    teamId: string,
    amount: number,
  ): Promise<AuctionState> {
    return this.updateState(auctionId, (state) => {
      if (state.status !== AuctionPhase.BIDDING) {
        throw new BadRequestException("Auction is not in bidding phase");
      }

      if (amount <= state.currentPhase.currentBid) {
        throw new BadRequestException("Bid must be higher than current bid");
      }

      // 타이머 연장 (10초 추가)
      const timerEnd = Math.max(
        state.currentPhase.timerEnd,
        Date.now() + 10000,
      );

      return {
        ...state,
        currentPhase: {
          ...state.currentPhase,
          currentBid: amount,
          bidderId: teamId,
          timerEnd,
        },
      };
    });
  }

  /**
   * 입찰 완료 (낙찰)
   */
  async completeBidding(auctionId: string): Promise<AuctionState> {
    return this.updateState(auctionId, (state) => {
      if (state.status !== AuctionPhase.BIDDING) {
        throw new BadRequestException("Auction is not in bidding phase");
      }

      const { bidderId, _currentBid } = state.currentPhase;

      if (!bidderId) {
        // 유찰 처리
        return {
          ...state,
          status: AuctionPhase.YUCHAL,
          unsoldPlayers: [
            ...state.unsoldPlayers,
            state.currentPhase.nomineeId!,
          ],
          currentPhase: {
            nomineeId: null,
            currentBid: 0,
            bidderId: null,
            timerEnd: 0,
          },
        };
      }

      // 골드 차감 (나중에 팀 서비스에서 처리)
      return {
        ...state,
        currentPhase: {
          nomineeId: null,
          currentBid: 0,
          bidderId: null,
          timerEnd: 0,
        },
      };
    });
  }

  /**
   * 타이머 만료 처리
   */
  async handleTimerExpired(auctionId: string): Promise<AuctionState> {
    const state = await this.getState(auctionId);
    if (!state) {
      throw new BadRequestException("Auction state not found");
    }

    if (state.status === AuctionPhase.BIDDING) {
      return this.completeBidding(auctionId);
    }

    return state;
  }

  /**
   * 모든 플레이어 배치 완료 확인
   */
  async checkAllPlayersAssigned(auctionId: string): Promise<boolean> {
    const state = await this.getState(auctionId);
    if (!state) {
      return false;
    }

    // DB에서 실제 배치된 플레이어 수 확인
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        participants: {
          where: {
            teamId: { not: null },
          },
        },
      },
    });

    if (!auction) {
      return false;
    }

    const assignedCount = auction.participants.length;
    const totalCount = state.participants.length;
    const unsoldCount = state.unsoldPlayers.length;

    // 배치 완료 = (배치된 수 + 유찰 수) === 전체 참가자 수
    return assignedCount + unsoldCount === totalCount;
  }

  /**
   * 유찰 플레이어 Snake Draft 처리
   */
  async processUnsoldPlayers(auctionId: string): Promise<AuctionState> {
    const state = await this.getState(auctionId);
    if (!state) {
      throw new BadRequestException("Auction state not found");
    }

    // Snake Draft: 팀 A -> 팀 B -> 팀 B -> 팀 A -> ...
    // 여기서는 단순히 상태만 변경하고, 실제 배치는 별도 로직에서 처리
    return this.transitionTo(auctionId, AuctionPhase.YUCHAL);
  }
}
