import { io, type Socket } from "socket.io-client";
import { Logger } from "@nestjs/common";

/**
 * 서버가 자기 자신에게 붙는 소켓 무리.
 *
 * 왜 이게 필요한가:
 *   2026-08-11 20인 경매방을 실제로 죽인 건 경매 로직이 아니라 소켓이었다.
 *   "렉은 ㅜ머노" → "나갔노" → "왜 멈춤?" → "그냥 오류가 생겼는데요?" 순으로
 *   호스트가 떨어지면서 방이 멈췄다. 서버 내부 자동입찰만으로는 이 경로에
 *   손도 못 댄다 — 끊길 소켓이 없기 때문이다.
 *
 * 그래서 리허설 full 모드는 API 가 localhost 로 자기 자신에게 진짜 소켓을
 * 연다. 참가자 수만큼 연결이 생기므로 브로드캐스트 팬아웃도 실제 부하로 걸리고,
 * 호스트 연결을 끊었다 붙이는 것도 사람이 하는 것과 같은 일이 된다.
 *
 * 주의: 이 모드에서도 서버 자동입찰(`_scheduleBotBids`)은 그대로 돈다.
 * 참가자가 전부 testbot_* 이라 팀장이 봇으로 판정되기 때문이다. 이를 끄려면
 * 운영 경매 코드를 건드려야 해서 그냥 둔다 — 자동입찰은 자기 팀이 최고가면
 * 스스로 물러나므로 소켓 입찰과 겹쳐도 서로를 망치지 않는다.
 */
export class RehearsalSocketCrew {
  private readonly logger = new Logger(RehearsalSocketCrew.name);
  private readonly sockets = new Map<string, Socket>();

  constructor(
    private readonly baseUrl: string,
    private readonly roomId: string,
  ) {}

  get size(): number {
    return this.sockets.size;
  }

  /** 이 참가자의 연결을 들고 있는가. 낙오시킬 대상을 고를 때 쓴다. */
  has(userId: string): boolean {
    return this.sockets.has(userId);
  }

  /** 한 명을 /auction 에 붙인다. 실패는 치명적이지 않으므로 false 로 알린다. */
  async connect(userId: string, token: string): Promise<boolean> {
    try {
      const socket = await this._open(token);
      await this._ack(socket, "join-room", { roomId: this.roomId });
      this.sockets.set(userId, socket);
      return true;
    } catch (error) {
      this.logger.warn(
        `[Rehearsal] 소켓 연결 실패 user=${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /** 특정 참가자의 연결을 끊는다. 호스트 낙오를 재현할 때 쓴다. */
  drop(userId: string): boolean {
    const socket = this.sockets.get(userId);
    if (!socket) return false;
    socket.disconnect();
    this.sockets.delete(userId);
    return true;
  }

  /**
   * 끊겼던 참가자를 다시 붙이고 서버가 돌려준 상태를 그대로 반환한다.
   * 진행 중이던 경매 상태가 복원되는지 확인하는 것이 목적이다.
   */
  async reconnect(userId: string, token: string): Promise<any> {
    const socket = await this._open(token);
    const response = await this._ack(socket, "join-room", {
      roomId: this.roomId,
    });
    this.sockets.set(userId, socket);
    return response;
  }

  /** 팀장 한 명이 이번 매물에 입찰하거나 포기한다. */
  act(
    userId: string,
    action: "bid" | "fold",
    amount?: number,
  ): Promise<{ ok: boolean; error?: string }> {
    const socket = this.sockets.get(userId);
    if (!socket?.connected) return Promise.resolve({ ok: false });

    const event = action === "fold" ? "vote-item-skip" : "place-bid";
    const payload =
      action === "fold"
        ? { roomId: this.roomId }
        : { roomId: this.roomId, amount };

    return new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, error: "timeout" }),
        8000,
      );
      socket.emit(event, payload, (response: any) => {
        clearTimeout(timer);
        if (response?.error) resolve({ ok: false, error: response.error });
        else resolve({ ok: true });
      });
    });
  }

  disconnectAll(): void {
    for (const socket of this.sockets.values()) {
      try {
        socket.disconnect();
      } catch {
        // 정리 중 실패는 무시한다 — 어차피 프로세스가 붙들 이유가 없다.
      }
    }
    this.sockets.clear();
  }

  private _open(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${this.baseUrl}/auction`, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
        timeout: 10000,
      });
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error("connect timeout"));
      }, 10000);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once("connect_error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private _ack(socket: Socket, event: string, payload: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${event} ACK timeout`)),
        10000,
      );
      socket.emit(event, payload, (response: any) => {
        clearTimeout(timer);
        if (response?.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }
}
