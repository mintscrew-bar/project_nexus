import { Injectable, Logger } from "@nestjs/common";

/**
 * 서버 Graceful Shutdown 상태를 관리하는 전역 서비스.
 *
 * SIGTERM 수신 시 isShuttingDown 플래그를 true로 전환하여
 * 신규 방 생성 및 게임 시작을 차단한다.
 * 진행 중인 방은 자연 종료될 때까지 보호된다.
 */
@Injectable()
export class ShutdownService {
  private readonly logger = new Logger(ShutdownService.name);
  private shuttingDown = false;

  setShuttingDown(): void {
    this.shuttingDown = true;
    this.logger.warn("서버 종료 시작 — 신규 방 생성 및 게임 시작 차단됨");
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
