import { Injectable, Logger } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AuctionStateService, AuctionPhase } from "./auction-state.service";
import { AuctionGateway } from "./auction.gateway";

@Injectable()
export class AuctionTimerService {
  private readonly logger = new Logger(AuctionTimerService.name);
  private activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly stateService: AuctionStateService,
    private readonly gateway: AuctionGateway,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * 옥션 타이머 시작
   */
  startTimer(auctionId: string, durationSeconds: number): void {
    // 기존 타이머가 있으면 제거
    this.stopTimer(auctionId);

    const timeout = setTimeout(async () => {
      try {
        await this.handleTimerExpired(auctionId);
      } catch (error) {
        this.logger.error(
          `Timer expired handler failed for auction ${auctionId}`,
          error,
        );
      }
    }, durationSeconds * 1000);

    this.activeTimers.set(auctionId, timeout);
    this.schedulerRegistry.addTimeout(`auction-${auctionId}`, timeout);

    this.logger.log(
      `Timer started for auction ${auctionId}: ${durationSeconds}s`,
    );
  }

  /**
   * 옥션 타이머 중지
   */
  stopTimer(auctionId: string): void {
    const timeout = this.activeTimers.get(auctionId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeTimers.delete(auctionId);
      try {
        this.schedulerRegistry.deleteTimeout(`auction-${auctionId}`);
      } catch {
        // Timeout이 없을 수 있음
      }
    }
  }

  /**
   * 타이머 만료 처리
   */
  private async handleTimerExpired(auctionId: string): Promise<void> {
    this.logger.log(`Timer expired for auction ${auctionId}`);
    this.stopTimer(auctionId);

    const state = await this.stateService.handleTimerExpired(auctionId);

    // 클라이언트에 상태 업데이트 전송
    this.gateway.emitAuctionUpdate(auctionId, "auction-state-update", {
      status: state.status,
      currentPhase: state.currentPhase,
    });

    // 다음 단계로 진행
    if (state.status === AuctionPhase.BIDDING) {
      // 입찰 완료 처리
      await this.processBiddingComplete(auctionId);
    }
  }

  /**
   * 입찰 완료 처리
   */
  private async processBiddingComplete(auctionId: string): Promise<void> {
    await this.stateService.completeBidding(auctionId);

    // 모든 플레이어가 배치되었는지 확인
    const allAssigned =
      await this.stateService.checkAllPlayersAssigned(auctionId);

    if (allAssigned) {
      // 라인 선택 단계로 전환
      await this.stateService.transitionTo(auctionId, AuctionPhase.LANE_SELECT);
      this.gateway.emitAuctionUpdate(auctionId, "phase-change", {
        phase: AuctionPhase.LANE_SELECT,
      });
    } else {
      // 다음 플레이어 입찰 시작
      // 이 부분은 옥션 서비스에서 처리
    }
  }

  /**
   * 주기적으로 타이머 상태 확인 (백업)
   */
  @Cron(CronExpression.EVERY_SECOND)
  async checkTimers(): Promise<void> {
    // Redis에서 활성 옥션들의 타이머 확인
    // 실제 구현은 필요에 따라 추가
  }
}
