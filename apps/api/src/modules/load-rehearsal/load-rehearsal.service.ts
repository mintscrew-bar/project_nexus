import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RoomService } from "../room/room.service";
import { AdminService } from "../admin/admin.service";
import { AuctionService } from "../auction/auction.service";
import { TEST_BOT_USER_WHERE } from "../common/test-bot.util";

/**
 * 경매 리허설 — 관리자가 운영 서버에서 20인 경매를 통째로 재현한다.
 *
 * 왜 서버 안에 있나:
 *   외부 하네스(`load-test/scripts/room-auction.js`)는 봇을 만들려고 DB 에
 *   직접 붙어야 하는데, 운영 postgres 는 호스트에 포트를 열지 않는다.
 *   dev compose 로 뚫는 옛 방법은 프로젝트·서비스명을 운영과 공유해서
 *   올리는 순간 사이트를 내린다. 서버 안에서는 DB 도 JWT 도 이미 손에 있다.
 *
 * 무엇을 보려고 하나:
 *   2026-08-11 20인 경매방이 무너진 경로. 연속 유찰로 같은 사람이 30초씩
 *   공개처형되던 것과, 호스트가 끊기면서 경매가 멈춘 것.
 *   전자는 984c99ba·e8ff4ae6 에서 고쳤지만 20인 규모로 재현된 적이 없다.
 */
@Injectable()
export class LoadRehearsalService {
  private readonly logger = new Logger(LoadRehearsalService.name);

  /**
   * 진행 중인 리허설. 동시에 하나만 돈다.
   *
   * 운영 서버에서 도는 부하라 두 개가 겹치면 그 자체가 사고다.
   * 프로세스 메모리에만 두는 이유: 리허설은 API 재시작을 넘겨 살아남을
   * 이유가 없고, 재시작됐다면 어차피 방만 남으므로 정리 대상이다.
   */
  private current: RehearsalRun | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly roomService: RoomService,
    private readonly adminService: AdminService,
    private readonly auctionService: AuctionService,
  ) {}

  /** 켜져 있지 않으면 엔드포인트 자체가 없는 것처럼 군다. */
  isEnabled(): boolean {
    return this.config.get<string>("ENABLE_LOAD_REHEARSAL") === "1";
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ForbiddenException(
        "리허설이 꺼져 있습니다. ENABLE_LOAD_REHEARSAL=1 로 켜세요.",
      );
    }
  }

  /**
   * 최근 활동한 실유저가 있으면 거부한다.
   *
   * 리허설은 방 하나를 만들고 봇 20명을 붙여 소켓을 두드린다.
   * 실유저가 내전을 돌리는 중에 겹치면 리허설이 그 사람들의 판을 방해한다.
   * "아무도 없을 때만"이 유일하게 안전한 조건이다.
   */
  private async assertNoLiveUsers(windowMinutes: number): Promise<void> {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const liveCount = await this.prisma.user.count({
      where: {
        lastSeenAt: { gt: since },
        NOT: TEST_BOT_USER_WHERE,
      },
    });
    if (liveCount > 0) {
      throw new ConflictException(
        `최근 ${windowMinutes}분 내 접속한 실유저가 ${liveCount}명 있습니다. ` +
          "리허설은 아무도 없을 때만 돌립니다.",
      );
    }
  }

  getStatus(): RehearsalStatus {
    if (!this.current) {
      return { running: false, enabled: this.isEnabled(), run: null };
    }
    return {
      running: this.current.phase !== "DONE" && this.current.phase !== "FAILED",
      enabled: this.isEnabled(),
      run: this.current.snapshot(),
    };
  }

  async start(adminId: string, options: StartOptions): Promise<RehearsalView> {
    this.assertEnabled();

    if (
      this.current &&
      this.current.phase !== "DONE" &&
      this.current.phase !== "FAILED"
    ) {
      throw new ConflictException(
        "이미 리허설이 진행 중입니다. 끝나거나 중단한 뒤 다시 시도하세요.",
      );
    }

    const count = Number(options.count ?? 20);
    if (![10, 15, 20, 30, 40].includes(count)) {
      throw new BadRequestException(
        "정원은 10, 15, 20, 30, 40 중 하나여야 합니다.",
      );
    }
    const mode: RehearsalMode = options.mode === "full" ? "full" : "light";
    const bidTime = Number(options.bidTimeSeconds ?? 8);
    if (!Number.isInteger(bidTime) || bidTime < 5 || bidTime > 120) {
      throw new BadRequestException("입찰 시간은 5~120초여야 합니다.");
    }

    await this.assertNoLiveUsers(Number(options.liveUserWindowMinutes ?? 15));

    const run = new RehearsalRun(adminId, { count, mode, bidTime });
    this.current = run;

    // 요청은 바로 돌려주고 진행은 뒤에서 굴린다. 20인 경매는 몇 분 걸린다.
    void this._execute(run).catch((error) => {
      run.fail(error instanceof Error ? error.message : String(error));
      this.logger.error(`[Rehearsal] 실패: ${run.error}`);
    });

    return run.snapshot();
  }

  async abort(): Promise<RehearsalView> {
    if (!this.current) {
      throw new BadRequestException("진행 중인 리허설이 없습니다.");
    }
    this.current.requestAbort();
    return this.current.snapshot();
  }

  // ── 실행 ────────────────────────────────────────────────────────────────

  private async _execute(run: RehearsalRun): Promise<void> {
    try {
      run.setPhase("SETUP");
      await this._createHiddenRoom(run);
      await this._fillWithBots(run);
      run.setPhase("STARTING");
      await this._startAuction(run);
      run.setPhase("RUNNING");
      await this._watchAuction(run);
      run.finish();
    } finally {
      // 성공이든 실패든 방은 반드시 치운다. 찌꺼기 방이 목록에 남으면
      // 실유저가 들어가고, 그 방은 봇으로 차 있어서 아무것도 못 한다.
      await this._cleanup(run);
    }
  }

  /**
   * 방을 만든다. 비밀번호를 걸어 `isPrivate` 로 올린다 —
   * 방 목록 조회가 `where.isPrivate = false` 로 거르므로 목록에서 사라진다.
   */
  private async _createHiddenRoom(run: RehearsalRun): Promise<void> {
    const room = await this.roomService.createRoom(run.adminId, {
      name: `[리허설] ${run.options.count}인 경매 ${new Date().toISOString().slice(11, 19)}`,
      maxParticipants: run.options.count,
      teamMode: "AUCTION",
      captainSelection: "TIER",
      allowSpectators: false,
      bidTimeLimit: run.options.bidTime,
      // 목록에서 숨기기 위한 값이지 보안용이 아니다.
      password: `rehearsal-${Date.now()}`,
    } as any);
    run.roomId = room.id;
    run.log(`방 생성 (숨김): ${room.id}`);
  }

  private async _fillWithBots(run: RehearsalRun): Promise<void> {
    // 호스트(관리자)가 한 자리를 차지하므로 나머지를 봇으로 채운다.
    const needed = run.options.count - 1;
    await this.adminService.addBotToRoom(run.roomId!, run.adminId, needed);
    run.log(`봇 ${needed}명 투입`);

    // 경매 시작 조건은 전원 준비다. 봇은 스스로 준비를 누르지 않는다.
    await this.prisma.roomParticipant.updateMany({
      where: { roomId: run.roomId! },
      data: { isReady: true },
    });
    run.log("전원 준비 완료 처리");
  }

  private async _startAuction(run: RehearsalRun): Promise<void> {
    await this.auctionService.startAuction(run.adminId, run.roomId!);
    run.log("경매 시작");
  }

  /**
   * 경매 상태를 따라가며 불변식을 검사한다.
   *
   * 클라이언트처럼 이벤트를 받는 대신 서버 상태를 폴링한다. light 모드에는
   * 소켓이 없고, 보려는 건 "어떤 매물이 어떤 순서로 올라왔는가" 하나라서
   * 상태만으로 충분하다.
   */
  private async _watchAuction(run: RehearsalRun): Promise<void> {
    const deadline = Date.now() + run.options.count * 20_000 + 120_000;

    while (Date.now() < deadline) {
      if (run.abortRequested) {
        run.log("중단 요청으로 종료");
        return;
      }

      const state = this.auctionService.getAuctionState(run.roomId!);
      if (!state) {
        // 경매가 끝나면 상태가 사라진다.
        run.log("경매 상태 종료 — 완료로 간주");
        return;
      }

      run.observe(state);
      await delay(500);
    }

    run.addViolation("경매가 제한 시간 안에 끝나지 않았습니다.");
  }

  private async _cleanup(run: RehearsalRun): Promise<void> {
    if (!run.roomId) return;
    try {
      // 관리자 경로와 같은 정리를 쓴다 — 디스코드 채널까지 함께 치운다.
      await this.adminService.closeRoom(run.roomId, run.adminId);
      run.log("방 정리 완료");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.log(`방 삭제 실패 — 수동 정리 필요: ${message}`);
      this.logger.warn(
        `[Rehearsal] 방 삭제 실패 room=${run.roomId}: ${message}`,
      );
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RehearsalMode = "light" | "full";

export interface StartOptions {
  count?: number;
  mode?: RehearsalMode;
  bidTimeSeconds?: number;
  liveUserWindowMinutes?: number;
}

export type RehearsalPhase =
  "SETUP" | "STARTING" | "RUNNING" | "DONE" | "FAILED";

export interface RehearsalView {
  id: string;
  phase: RehearsalPhase;
  mode: RehearsalMode;
  count: number;
  roomId: string | null;
  startedAt: string;
  finishedAt: string | null;
  items: number;
  sold: number;
  unsold: number;
  violations: string[];
  logs: string[];
  error: string | null;
}

export interface RehearsalStatus {
  running: boolean;
  enabled: boolean;
  run: RehearsalView | null;
}

/**
 * 한 번의 리허설이 관찰한 것.
 *
 * 핵심 불변식: 유찰된 매물은 남은 매물이 전부 한 번씩 나온 뒤에야 다시 올라온다.
 * 이게 깨지면 8/11 처럼 같은 사람이 연속으로 유찰되는 화면이 다시 생긴다.
 */
class RehearsalRun {
  readonly id = `rehearsal_${Date.now()}`;
  readonly startedAt = new Date();
  phase: RehearsalPhase = "SETUP";
  roomId: string | null = null;
  finishedAt: Date | null = null;
  error: string | null = null;
  abortRequested = false;

  private readonly logs: string[] = [];
  private readonly violations: string[] = [];
  private readonly appearances: string[] = [];
  private readonly soldPlayerIds = new Set<string>();
  /** 유찰 시점에 아직 안 팔려 있던 매물들. 한 바퀴 기준. */
  private readonly owedAfterUnsold = new Map<
    string,
    { pending: Set<string>; seenSince: Set<string> }
  >();
  private lastPlayerId: string | null = null;
  private lastYuchalByPlayer: Record<string, number> = {};

  constructor(
    readonly adminId: string,
    readonly options: { count: number; mode: RehearsalMode; bidTime: number },
  ) {}

  log(message: string): void {
    this.logs.push(`${new Date().toISOString().slice(11, 19)} ${message}`);
  }

  addViolation(message: string): void {
    this.violations.push(message);
  }

  setPhase(phase: RehearsalPhase): void {
    this.phase = phase;
  }

  requestAbort(): void {
    this.abortRequested = true;
    this.log("중단 요청됨");
  }

  fail(message: string): void {
    this.phase = "FAILED";
    this.error = message;
    this.finishedAt = new Date();
  }

  finish(): void {
    if (this.phase !== "FAILED") this.phase = "DONE";
    this.finishedAt = new Date();
  }

  /** 폴링으로 본 상태에서 매물 전환과 유찰을 읽어낸다. */
  observe(state: any): void {
    const playerId = state?.currentPlayer?.id ?? null;
    const counts: Record<string, number> = state?.yuchalCountsByPlayer ?? {};

    // 직전 스냅샷을 덮어쓰기 전에 붙잡아 둔다. 먼저 덮으면 아래 비교가
    // 전부 "변화 없음"이 되어 유찰도 낙찰도 한 건도 안 잡힌다.
    const previousCounts = this.lastYuchalByPlayer;
    this.lastYuchalByPlayer = { ...counts };

    // 유찰은 yuchalCountsByPlayer 가 늘어나는 것으로 알아챈다.
    const newlyUnsold = new Set<string>();
    for (const [id, count] of Object.entries(counts)) {
      if (count > (previousCounts[id] ?? 0)) {
        newlyUnsold.add(id);
        this._onUnsold(id);
      }
    }

    if (!playerId || playerId === this.lastPlayerId) return;

    // 매물이 바뀌었는데 직전 매물의 유찰 수가 그대로면 팔린 것이다.
    const previous = this.lastPlayerId;
    if (previous && !newlyUnsold.has(previous)) {
      this._onSold(previous);
    }

    this.lastPlayerId = playerId;
    this.appearances.push(playerId);
    this._checkCycle(playerId);
  }

  private _onSold(playerId: string): void {
    if (this.soldPlayerIds.has(playerId)) return;
    this.soldPlayerIds.add(playerId);
    this._recordSeen(playerId);
  }

  private _onUnsold(playerId: string): void {
    const pending = new Set(
      this.appearances.filter(
        (id) => id !== playerId && !this.soldPlayerIds.has(id),
      ),
    );
    this.owedAfterUnsold.set(playerId, { pending, seenSince: new Set() });
    this._recordSeen(playerId);
    this.log(`유찰: ${playerId}`);
  }

  private _recordSeen(playerId: string): void {
    for (const snapshot of this.owedAfterUnsold.values()) {
      snapshot.seenSince.add(playerId);
    }
  }

  private _checkCycle(playerId: string): void {
    const snapshot = this.owedAfterUnsold.get(playerId);
    if (!snapshot) return;
    this.owedAfterUnsold.delete(playerId);

    const owed = [...snapshot.pending].filter(
      (id) => !snapshot.seenSince.has(id) && !this.soldPlayerIds.has(id),
    );
    if (owed.length > 0) {
      this.addViolation(
        `유찰된 매물이 한 바퀴 전에 재등장했습니다. 아직 안 나온 매물 ${owed.length}명.`,
      );
    }
  }

  snapshot(): RehearsalView {
    return {
      id: this.id,
      phase: this.phase,
      mode: this.options.mode,
      count: this.options.count,
      roomId: this.roomId,
      startedAt: this.startedAt.toISOString(),
      finishedAt: this.finishedAt?.toISOString() ?? null,
      items: this.appearances.length,
      sold: this.soldPlayerIds.size,
      unsold: Object.values(this.lastYuchalByPlayer).reduce(
        (sum, value) => sum + value,
        0,
      ),
      violations: [...this.violations],
      logs: this.logs.slice(-50),
      error: this.error,
    };
  }
}
