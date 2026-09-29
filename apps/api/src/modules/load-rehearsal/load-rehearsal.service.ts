import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { RoomService } from "../room/room.service";
import { AdminService } from "../admin/admin.service";
import { AuctionService } from "../auction/auction.service";
import { AuctionGateway } from "../auction/auction.gateway";
import { TEST_BOT_USER_WHERE, isTestBotUser } from "../common/test-bot.util";
import { RehearsalSocketCrew } from "./rehearsal-socket-crew";

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
    private readonly auctionGateway: AuctionGateway,
    private readonly jwtService: JwtService,
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
    const bidTime = Number(options.bidTimeSeconds ?? 20);
    /*
     * 하한이 15초인 이유 — 서버 봇 입찰기가 굶는다.
     *
     * _scheduleBotBids 는 봇마다 2~8초 뒤 시도를 걸어 두는데, 한 봇이 시도할
     * 때마다 _cancelBotTimers 로 나머지 전원을 취소하고 다시 2~8초 뒤로 민다.
     * 그리고 _autoBotBid 는 매물 마감 시각이 지나면 즉시 리턴한다.
     * 그래서 매물 시간이 10초보다 짧으면 매물당 시도가 0~1회에 그치고,
     * 그 시도마저 40% 는 스스로 패스해서 낙찰이 거의 나오지 않는다.
     *
     * 이건 기본값 30초에 맞춰 둔 기존 동작이다. 여기서 짧게 잡으면 경매가
     * 고장난 것처럼 보이지만 실제로는 리허설 설정이 현실과 다른 것뿐이다.
     */
    if (!Number.isInteger(bidTime) || bidTime < 15 || bidTime > 120) {
      throw new BadRequestException(
        "입찰 시간은 15~120초여야 합니다. " +
          "15초보다 짧으면 서버 봇 입찰기가 매물 시간 안에 움직이지 못해 전부 유찰됩니다.",
      );
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
      // 소켓은 경매 시작 전에 붙인다 — 실제 화면도 로비에서 이미 붙어 있다.
      if (run.options.mode === "full") await this._connectBotCrew(run);
      run.setPhase("STARTING");
      await this._startAuction(run);
      run.setPhase("RUNNING");
      await this._watchAuction(run);
      run.finish();
    } finally {
      // 성공이든 실패든 방은 반드시 치운다. 찌꺼기 방이 목록에 남으면
      // 실유저가 들어가고, 그 방은 봇으로 차 있어서 아무것도 못 한다.
      run.crew?.disconnectAll();
      await this._cleanup(run);
    }
  }

  /**
   * 봇 참가자 수만큼 진짜 소켓을 연다.
   *
   * 연결이 생겨야 브로드캐스트 팬아웃이 실제 부하로 걸리고, 무엇보다
   * 끊을 소켓이 생긴다 — 8/11 에 방을 죽인 게 그 경로다.
   *
   * **봇 계정에만 붙인다.** 관리자(호스트) 몫의 소켓은 열지 않는다.
   * 서버가 사람 계정의 토큰을 찍어낼 수 있게 되는 순간 이 코드는
   * 리허설 도구가 아니라 사칭 수단이 된다. 낙오 재현에 필요한 건
   * "팀장 소켓이 경매 도중 사라지는 것"이지 그게 호스트일 필요는 없다.
   */
  private async _connectBotCrew(run: RehearsalRun): Promise<void> {
    const port = this.config.get<string>("PORT") || "4000";
    const crew = new RehearsalSocketCrew(
      `http://127.0.0.1:${port}`,
      run.roomId!,
    );
    run.crew = crew;

    const participants = await this.prisma.roomParticipant.findMany({
      // 관전석(관리자)은 경매에 참여하지 않으므로 소켓도 열지 않는다.
      where: { roomId: run.roomId!, role: "PLAYER" },
      select: {
        userId: true,
        user: {
          select: {
            username: true,
            email: true,
            role: true,
            riotAccounts: { select: { puuid: true, tagLine: true } },
          },
        },
      },
    });

    const bots = participants.filter(
      (participant) => participant.user && isTestBotUser(participant.user),
    );

    let connected = 0;
    for (const bot of bots) {
      const token = await this._signForBot(bot.userId, bot.user!);
      if (await crew.connect(bot.userId, token)) connected += 1;
    }
    run.log(`봇 소켓 ${connected}/${bots.length}개 연결`);

    if (connected < bots.length) {
      run.addViolation(`소켓 ${bots.length - connected}개가 붙지 못했습니다.`);
    }
  }

  /**
   * 봇 한 명의 접속 토큰을 만든다.
   *
   * 반드시 봇인지 다시 확인한다. 호출부에서 이미 걸렀더라도 여기서 한 번 더
   * 막아야, 나중에 누가 이 함수를 다른 곳에서 부를 때 사람 계정 토큰이
   * 찍혀 나가지 않는다. 유효기간도 리허설 한 판보다 길 이유가 없다.
   */
  private async _signForBot(
    userId: string,
    user: {
      username?: string | null;
      email?: string | null;
      role?: string | null;
      riotAccounts?: Array<{ puuid?: string | null; tagLine?: string | null }>;
    },
  ): Promise<string> {
    if (!isTestBotUser(user)) {
      throw new ForbiddenException(
        "리허설은 봇 계정에만 접속할 수 있습니다. 사람 계정 토큰은 만들지 않습니다.",
      );
    }
    return this.jwtService.signAsync(
      {
        sub: userId,
        username: user.username ?? "",
        role: "USER",
      },
      {
        secret: this.config.get("JWT_ACCESS_SECRET"),
        expiresIn: "20m",
      },
    );
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
      // 관리자는 관전석으로 뺀다(아래). 그러려면 관전이 열려 있어야 한다.
      allowSpectators: true,
      bidTimeLimit: run.options.bidTime,
      // 목록에서 숨기기 위한 값이지 보안용이 아니다.
      password: `rehearsal-${Date.now()}`,
    } as any);
    run.roomId = room.id;
    run.log(`방 생성 (숨김): ${room.id}`);
  }

  private async _fillWithBots(run: RehearsalRun): Promise<void> {
    /*
     * 관리자를 관전석으로 뺀다.
     *
     * 방을 만들면 호스트가 PLAYER 로 들어가는데, 그대로 두면 경매 매물·팀장
     * 후보에 관리자가 섞인다. 팀장은 TIER 순으로 뽑히고 봇은 전부 0LP 라서
     * 실계정을 쓰는 관리자가 거의 항상 팀장 1순위로 올라간다.
     *
     * 그런데 관리자 몫으로는 소켓을 열지 않고(사람 계정 토큰을 만들지 않으려고)
     * 자동입찰도 봇에게만 걸린다. 결국 한 팀의 팀장이 끝까지 아무것도 하지 않는
     * 상태가 되어, 그 팀은 유찰 자동배정으로만 채워지고 리허설 결과가 일그러진다.
     *
     * 경매는 role='PLAYER' 만 보고 startAuction 은 Room.hostId 만 확인하므로,
     * 관전석으로 옮겨도 호스트로서 경매를 시작하는 데는 지장이 없다.
     */
    await this.prisma.roomParticipant.updateMany({
      where: { roomId: run.roomId!, userId: run.adminId },
      data: { role: "SPECTATOR" },
    });
    run.log("관리자를 관전석으로 이동 (매물·팀장 후보에서 제외)");

    // 관전자는 정원에 안 세므로 자리 전부를 봇으로 채운다.
    const needed = run.options.count;
    await this.adminService.addBotToRoom(run.roomId!, run.adminId, needed);
    run.log(`봇 ${needed}명 투입`);

    // 경매 시작 조건은 PLAYER 전원 준비다. 봇은 스스로 준비를 누르지 않는다.
    await this.prisma.roomParticipant.updateMany({
      where: { roomId: run.roomId!, role: "PLAYER" },
      data: { isReady: true },
    });
    run.log("전원 준비 완료 처리");
  }

  /**
   * 경매를 시작한다.
   *
   * startAuction 만 부르면 상태는 생기는데 **아무 일도 일어나지 않는다.**
   * 입찰 마감 타이머와 봇 자동입찰은 둘 다 게이트웨이의 emitAuctionStarted
   * 안에 걸려 있다(auction.gateway.ts). 실제 start-game 경로도 서비스 →
   * 게이트웨이 순서로 두 번 부른다(room.gateway.ts). 한쪽만 부르면
   * 타이머가 안 돌아 전 매물이 유찰로 흘러간다.
   */
  private async _startAuction(run: RehearsalRun): Promise<void> {
    const result = await this.auctionService.startAuction(
      run.adminId,
      run.roomId!,
    );
    this.auctionGateway.emitAuctionStarted(run.roomId!, result);
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
        if (run.dropAt > 0 && !run.dropped) {
          run.addViolation(
            `팀장 낙오를 재현하지 못했습니다 (매물이 ${run.itemCount}개뿐).`,
          );
        }
        if (run.dropped && run.itemsAfterDrop === 0) {
          run.addViolation(
            "팀장이 낙오한 뒤 경매가 한 건도 진행되지 않았습니다.",
          );
        }
        return;
      }

      const newItem = run.observe(state);
      if (run.options.mode === "full") {
        if (newItem) this._foldOverSockets(run, state);
        await this._maybeDropCaptain(run, state);
      }
      await delay(500);
    }

    run.addViolation("경매가 제한 시간 안에 끝나지 않았습니다.");
  }

  /**
   * 소켓이 붙어 있는 팀장 봇 일부가 이번 매물을 포기(fold)한다.
   *
   * **입찰은 일부러 보내지 않는다.** 서버 자동입찰(`_autoBotBid`)이 이미
   * `_withRoomBidLock` + `auctionService.placeBid` 로, 소켓 핸들러와 같은 락·같은
   * 서비스 호출을 탄다. 소켓으로 한 번 더 넣어 봐야 같은 경로를 중복해서
   * 두드릴 뿐이고, 어느 입찰이 어디서 왔는지만 흐려진다.
   *
   * 포기만 소켓으로 보내는 이유: 자동입찰은 포기를 하지 않는다. 그래서
   * `vote-item-skip` 핸들러는 봇만 있는 방에서 한 번도 실행되지 않고,
   * 유찰도 "아무도 입찰할 여력이 없을 때"만 우연히 생긴다. 검증하려는
   * 불변식이 "유찰된 매물의 재등장 순서"라 유찰 자체가 만들어져야 한다.
   */
  private _foldOverSockets(run: RehearsalRun, state: any): void {
    const crew = run.crew;
    if (!crew) return;

    const currentPlayerId = state?.currentPlayer?.id ?? null;
    const teams = state?.teams ?? [];

    for (const team of teams) {
      const captainId = team?.captainId;
      if (!captainId || !crew.has(captainId)) continue;
      // 자기 자신이 매물이면 판단 주체가 아니다.
      if (captainId === currentPlayerId) continue;
      if (Math.random() >= 0.25) continue;

      const thinkMs = 400 + Math.floor(Math.random() * 1500);
      setTimeout(() => {
        if (run.finished) return;
        // 이미 다음 매물로 넘어갔으면 늦은 행동을 보내지 않는다.
        if (run.currentItemId !== currentPlayerId) return;
        void crew.act(captainId, "fold").then((result) => {
          if (result.ok) run.countSocketAction("fold");
        });
      }, thinkMs);
    }
  }

  /**
   * 정해진 매물 순번에서 팀장 봇 하나의 소켓을 끊고, 잠시 뒤 다시 붙인다.
   *
   * 보려는 것 두 가지:
   *   1. 팀장이 사라져도 경매가 계속 굴러가는가 (8/11 에는 여기서 멈췄다)
   *   2. 돌아왔을 때 진행 중이던 상태를 그대로 돌려받는가
   */
  private async _maybeDropCaptain(
    run: RehearsalRun,
    state: any,
  ): Promise<void> {
    if (run.dropAt <= 0 || run.dropped) return;
    if (run.itemCount < run.dropAt) return;

    const crew = run.crew;
    if (!crew) return;

    // 팀장이면서 봇인 사람을 고른다. 지금 매물로 올라와 있는 사람은 피한다.
    const captainId = (state?.teams ?? [])
      .map((team: any) => team.captainId)
      .find(
        (id: string | null) =>
          !!id && id !== state?.currentPlayer?.id && crew.has(id),
      );
    if (!captainId) return;

    run.dropped = true;
    run.droppedAtItem = run.itemCount;
    crew.drop(captainId);
    run.log(`팀장 소켓 강제 종료 (매물 #${run.itemCount})`);

    // 재접속은 다음 매물로 넘어갈 시간을 준 뒤에 시도한다.
    void (async () => {
      await delay(Math.max(6000, run.options.bidTime * 1000));
      try {
        const bot = await this.prisma.user.findUnique({
          where: { id: captainId },
          select: {
            username: true,
            email: true,
            role: true,
            riotAccounts: { select: { puuid: true, tagLine: true } },
          },
        });
        if (!bot) return;
        const token = await this._signForBot(captainId, bot);
        const restored = await crew.reconnect(captainId, token);
        run.reconnectRestored = !!(
          restored?.state?.currentPlayer || restored?.state
        );
        run.log(
          run.reconnectRestored
            ? "팀장 재접속 — 상태 복원 확인"
            : "팀장 재접속 — 상태를 돌려받지 못함",
        );
        if (!run.reconnectRestored) {
          run.addViolation("재접속이 진행 중 상태를 돌려받지 못했습니다.");
        }
      } catch (error) {
        run.addViolation(
          `재접속 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })();
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
  /** full 모드에서 붙어 있는 봇 소켓 수. light 모드는 0. */
  socketCount: number;
  /** 소켓으로 전송된 포기 수. full 모드인데 0이면 핸들러를 안 탔다는 뜻. */
  socketFolds: number;
  /** 팀장을 낙오시킨 매물 순번. 재현 안 했으면 null. */
  droppedAtItem: number | null;
  /** 낙오 이후 진행된 매물 수. 0이면 낙오가 곧 경매 정지였다는 뜻. */
  itemsAfterDrop: number;
  reconnectRestored: boolean;
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

  /** full 모드에서만 채워진다. light 모드는 소켓이 없다. */
  crew: RehearsalSocketCrew | null = null;
  /** 몇 번째 매물에서 팀장을 낙오시킬지. 0이면 재현하지 않는다. */
  dropAt = 0;
  dropped = false;
  droppedAtItem: number | null = null;
  /** 낙오 이후 경매가 몇 건 더 진행됐는지. 0이면 낙오가 곧 정지라는 뜻이다. */
  itemsAfterDrop = 0;
  reconnectRestored = false;
  /** 소켓으로 전송된 포기 수. 입찰은 서버 자동입찰이 맡으므로 세지 않는다. */
  socketFolds = 0;

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
  ) {
    // full 모드는 경매가 좀 굴러간 뒤에 낙오시킨다. 너무 이르면 팀장 선정이
    // 끝나기도 전이라 끊을 대상이 없고, 너무 늦으면 남은 매물이 없어
    // "계속 진행되는가"를 볼 수가 없다.
    this.dropAt = options.mode === "full" ? 4 : 0;
  }

  get itemCount(): number {
    return this.appearances.length;
  }

  /** 끝났거나 중단 요청을 받았는가. 늦게 도착한 타이머가 행동하지 않게 막는다. */
  get finished(): boolean {
    return (
      this.phase === "DONE" || this.phase === "FAILED" || this.abortRequested
    );
  }

  /** 지금 올라와 있는 매물. 늦게 도착한 소켓 행동을 버리는 데 쓴다. */
  get currentItemId(): string | null {
    return this.lastPlayerId;
  }

  countSocketAction(kind: "fold"): void {
    if (kind === "fold") this.socketFolds += 1;
  }

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
  /** 새 매물이 시작됐으면 true. 소켓 봇의 행동을 그 시점에만 걸기 위함. */
  observe(state: any): boolean {
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

    if (!playerId || playerId === this.lastPlayerId) return false;

    // 매물이 바뀌었는데 직전 매물의 유찰 수가 그대로면 팔린 것이다.
    const previous = this.lastPlayerId;
    if (previous && !newlyUnsold.has(previous)) {
      this._onSold(previous);
    }

    this.lastPlayerId = playerId;
    this.appearances.push(playerId);
    if (this.dropped) this.itemsAfterDrop += 1;
    this._checkCycle(playerId);
    return true;
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
      socketCount: this.crew?.size ?? 0,
      socketFolds: this.socketFolds,
      droppedAtItem: this.droppedAtItem,
      itemsAfterDrop: this.itemsAfterDrop,
      reconnectRestored: this.reconnectRestored,
    };
  }
}
