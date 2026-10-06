import "reflect-metadata";
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuthGuard } from "@nestjs/passport";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "./validation-pipe.options";
import { JwtAuthGuard } from "../modules/auth/guards/jwt-auth.guard";
import { RolesGuard } from "../modules/auth/guards/roles.guard";
import { OptionalJwtGuard } from "../modules/auth/guards/optional-jwt.guard";
import { JwtRefreshGuard } from "../modules/auth/guards/jwt-refresh.guard";
import { AdminController } from "../modules/admin/admin.controller";
import { AdminService } from "../modules/admin/admin.service";
import { RoomController } from "../modules/room/room.controller";
import { RoomService } from "../modules/room/room.service";
import { SnakeDraftService } from "../modules/room/snake-draft.service";
import { RiotController } from "../modules/riot/riot.controller";
import { RiotService } from "../modules/riot/riot.service";
import { RiotTournamentService } from "../modules/riot/riot-tournament.service";
import { ReputationController } from "../modules/reputation/reputation.controller";
import { ReputationService } from "../modules/reputation/reputation.service";
import { MatchController } from "../modules/match/match.controller";
import { MatchService } from "../modules/match/match.service";
import { RoleSelectionController } from "../modules/role-selection/role-selection.controller";
import { RoleSelectionService } from "../modules/role-selection/role-selection.service";
import { PresenceController } from "../modules/presence/presence.controller";
import { PresenceService } from "../modules/presence/presence.service";
import { CommunityController } from "../modules/community/community.controller";
import { CommunityService } from "../modules/community/community.service";
import { BoardController } from "../modules/board/board.controller";
import { BoardService } from "../modules/board/board.service";
import { AuthController } from "../modules/auth/auth.controller";
import { AuthService } from "../modules/auth/auth.service";
import { UserController } from "../modules/user/user.controller";
import { UserService } from "../modules/user/user.service";

/**
 * 인라인 `@Body()` → DTO 전환(리팩터링 Phase A)의 **HTTP 수준** 검증.
 *
 * DTO 단위 테스트는 DTO 클래스만 본다. 여기서는 실제 컨트롤러·라우트·전역 ValidationPipe
 * (운영과 같은 설정)를 띄우고 **웹 클라이언트가 보내는 것과 똑같은 요청**을 HTTP 로 보낸다.
 * 확인하는 것:
 *  1. 정상 요청이 400 이 되지 않는다 (여분 필드·타입 변환 때문에 막히지 않는다)
 *  2. 컨트롤러가 DTO 에서 꺼낸 값을 서비스에 **같은 인자 순서**로 넘긴다
 *  3. 잘못된 요청은 400 이고 서비스까지 가지 않는다
 * 서비스·게이트웨이는 가짜다(DB 없음). 인증은 고정 유저로 통과시킨다.
 */

const USER = { sub: "u1", username: "tester", role: "ADMIN" };

/** 어떤 메서드든 호출되면 기록하고 빈 객체를 돌려주는 가짜 */
function autoMock(): any {
  const fns: Record<string | symbol, jest.Mock> = {};
  return new Proxy(
    {},
    {
      get(_t, prop) {
        // Promise·클래스·Nest 수명주기로 오인되지 않게 막는다
        if (
          prop === "then" ||
          prop === "constructor" ||
          typeof prop === "symbol" ||
          /^on(Module|Application)/.test(String(prop)) ||
          prop === "beforeApplicationShutdown"
        ) {
          return undefined;
        }
        fns[prop] ??= jest.fn().mockResolvedValue({});
        return fns[prop];
      },
    },
  );
}

const allowAs: CanActivate = {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = USER;
    return true;
  },
};

let app: INestApplication;
let base: string;

beforeAll(async () => {
  let builder = Test.createTestingModule({
    controllers: [
      AdminController,
      RoomController,
      RiotController,
      ReputationController,
      MatchController,
      RoleSelectionController,
      PresenceController,
      CommunityController,
      BoardController,
      AuthController,
      UserController,
    ],
  }).useMocker(() => autoMock());

  for (const guard of [
    JwtAuthGuard,
    RolesGuard,
    OptionalJwtGuard,
    JwtRefreshGuard,
    AuthGuard("discord"),
  ]) {
    builder = builder.overrideGuard(guard).useValue(allowAs);
  }

  const moduleRef = await builder.compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS));
  await app.listen(0);
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
});

afterAll(async () => {
  await app?.close();
});

/** 서비스 가짜의 호출 기록을 비운다 (테스트마다 새로 센다) */
const mockOf = (token: any) => app.get(token, { strict: false });

async function send(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    // 클라이언트(axios)처럼 JSON 직렬화한다 — undefined 키는 여기서 빠진다
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

type Case = {
  name: string;
  method: string;
  path: string;
  /** 웹 클라이언트가 보내는 본문 그대로 */
  body: unknown;
  service: any;
  fn: string;
  args: unknown[];
  /** 같은 엔드포인트에 보내면 400 이어야 하는 본문 */
  bad: unknown;
};

const iso = "2099-01-01T00:00:00.000Z";
const roomSettings = {
  name: "금요 내전",
  maxParticipants: 10,
  teamMode: "AUCTION",
  allowSpectators: true,
  startingPoints: 1000,
  killMatchDurationMinutes: 60,
  battleRoyaleRounds: 3,
  minBidIncrement: 50,
  bidTimeLimit: 30,
  pickTimeLimit: 60,
  captainSelection: "RANDOM",
  bracketFormat: undefined,
  seriesPreset: "ALL_BO1",
  password: null,
};
const { bracketFormat: _omit, ...roomSettingsOnWire } = roomSettings;

const cases = (): Case[] => [
  // ── admin ──
  {
    name: "관리자 정지",
    method: "POST",
    path: "/admin/users/u2/ban",
    body: { reason: "욕설", banUntil: undefined },
    service: AdminService,
    fn: "banUser",
    args: ["u2", "u1", "욕설", undefined],
    bad: { reason: { a: 1 } },
  },
  {
    name: "신고 처리 (category 생략)",
    method: "PATCH",
    path: "/admin/reports/r1/review",
    body: { status: "APPROVED", reviewerNote: "", category: undefined },
    service: AdminService,
    fn: "reviewReport",
    args: ["r1", "APPROVED", "", "u1", "user"],
    bad: { status: "DONE", reviewerNote: "" },
  },
  {
    name: "신고 처리 (게시글)",
    method: "PATCH",
    path: "/admin/reports/r1/review",
    body: { status: "REJECTED", reviewerNote: "n", category: "post" },
    service: AdminService,
    fn: "reviewReport",
    args: ["r1", "REJECTED", "n", "u1", "post"],
    bad: { status: "REJECTED", reviewerNote: "n", category: "clan" },
  },
  {
    name: "공지 발송",
    method: "POST",
    path: "/admin/announcements",
    body: { title: "점검", message: "내일 점검", link: undefined },
    service: AdminService,
    fn: "sendAnnouncement",
    args: ["점검", "내일 점검", "u1", undefined],
    bad: { title: "", message: "m" },
  },
  {
    name: "봇 정리",
    method: "POST",
    path: "/admin/bot-cleanup",
    body: { rooms: true, matches: false },
    service: AdminService,
    fn: "cleanupBotData",
    args: [{ rooms: true, matches: false }, "u1"],
    bad: { rooms: "false" },
  },
  {
    name: "이의신청 처리",
    method: "PATCH",
    path: "/admin/appeals/a1/review",
    body: { status: "APPROVED", adminNote: undefined },
    service: AdminService,
    fn: "reviewAppeal",
    args: ["a1", "APPROVED", "u1", undefined],
    bad: { status: "PENDING" },
  },
  {
    name: "권한 변경",
    method: "PATCH",
    path: "/admin/users/u2/role",
    body: { role: "MODERATOR" },
    service: AdminService,
    fn: "updateUserRole",
    args: ["u2", "MODERATOR", "u1"],
    bad: { role: "ROOT" },
  },
  {
    name: "이용 제한",
    method: "POST",
    path: "/admin/users/u2/restrict",
    body: { restrictedUntil: iso },
    service: AdminService,
    fn: "restrictUser",
    args: ["u2", "u1", iso],
    bad: { restrictedUntil: 1 },
  },
  {
    name: "글 고정 해제",
    method: "PATCH",
    path: "/admin/posts/p1/pin",
    body: { isPinned: false },
    service: AdminService,
    fn: "pinPost",
    args: ["p1", false, "u1"],
    bad: { isPinned: "false" },
  },
  {
    name: "봇 채우기 (배틀로얄 99)",
    method: "POST",
    path: "/admin/rooms/r1/add-bot",
    body: { count: 99 },
    service: AdminService,
    fn: "addBotToRoom",
    args: ["r1", "u1", 99],
    bad: { count: "3" },
  },
  // ── room ──
  {
    name: "방송 고정",
    method: "PATCH",
    path: "/rooms/r1/broadcast-live",
    body: { live: true },
    service: RoomService,
    fn: "setBroadcastLiveRoom",
    args: ["u1", "r1", true],
    bad: { live: "false" },
  },
  {
    name: "중계 경기 해제",
    method: "PATCH",
    path: "/rooms/r1/broadcast-focus",
    body: { matchId: null },
    service: RoomService,
    fn: "setBroadcastFocus",
    args: ["u1", "r1", null],
    bad: { matchId: { not: "" } },
  },
  {
    name: "방 입장 (비밀번호 없음)",
    method: "POST",
    path: "/rooms/r1/join",
    body: { password: undefined, asSpectator: undefined },
    service: RoomService,
    fn: "joinRoom",
    args: ["u1", { roomId: "r1", password: undefined, asSpectator: undefined }],
    bad: { password: 1234 },
  },
  {
    name: "방 채팅",
    method: "POST",
    path: "/rooms/r1/messages",
    body: { content: "안녕" },
    service: RoomService,
    fn: "sendChatMessage",
    args: ["u1", "r1", "안녕"],
    bad: { content: "가".repeat(501) },
  },
  {
    name: "드래프트 픽",
    method: "POST",
    path: "/rooms/r1/snake-draft/pick",
    body: { targetPlayerId: "p2" },
    service: SnakeDraftService,
    fn: "makePick",
    args: ["u1", "r1", "p2"],
    bad: { targetPlayerId: "" },
  },
  {
    name: "방 설정 저장 (설정 창 전체 payload)",
    method: "PUT",
    path: "/rooms/r1",
    body: roomSettings,
    service: RoomService,
    fn: "updateRoomSettings",
    args: ["u1", "r1", roomSettingsOnWire],
    bad: { ...roomSettingsOnWire, gameTitle: "PUBG" },
  },
  // ── riot ──
  {
    name: "라이엇 인증 시작",
    method: "POST",
    path: "/riot/verify/start",
    body: { gameName: "Hide on bush", tagLine: "KR1" },
    service: RiotService,
    fn: "startVerification",
    args: ["u1", "Hide on bush", "KR1"],
    bad: {},
  },
  {
    name: "챔피언 선호",
    method: "PUT",
    path: "/riot/accounts/a1/champions/TOP",
    body: { championIds: ["Ahri", "Lux", "Zed"] },
    service: RiotService,
    fn: "updateChampionPreferences",
    args: ["u1", "a1", "TOP", ["Ahri", "Lux", "Zed"]],
    bad: {},
  },
  {
    name: "토너먼트 생성",
    method: "POST",
    path: "/riot/tournament/create",
    body: { providerId: "12345" },
    service: RiotTournamentService,
    fn: "createTournamentManually",
    args: ["12345"],
    bad: { providerId: "12a" },
  },
  // ── reputation (웹 미사용 경로) ──
  {
    name: "평판 신고 상태",
    method: "PUT",
    path: "/reputation/reports/r1/status",
    body: { status: "APPROVED" },
    service: ReputationService,
    fn: "updateReportStatus",
    args: ["r1", "APPROVED", undefined],
    bad: { status: "DONE" },
  },
  {
    name: "평판 정지",
    method: "POST",
    path: "/reputation/users/u2/ban",
    body: { reason: "핵", duration: 7 },
    service: ReputationService,
    fn: "banUser",
    args: ["u2", "핵", 7],
    bad: { reason: "x", duration: "7" },
  },
  // ── match ──
  {
    name: "경기 결과 보고",
    method: "POST",
    path: "/matches/m1/result",
    body: { winnerId: "t1" },
    service: MatchService,
    fn: "reportMatchResult",
    args: ["u1", "m1", "t1"],
    bad: { winnerId: { not: "" } },
  },
  {
    name: "MVP 투표",
    method: "POST",
    path: "/matches/m1/vote",
    body: { votedForId: "u3", voteType: "MVP" },
    service: MatchService,
    fn: "submitVote",
    args: ["u1", "m1", "u3", "MVP"],
    bad: { votedForId: "u3", voteType: "BEST" },
  },
  // ── role-selection · presence · community · board ──
  {
    name: "라인 선택",
    method: "POST",
    path: "/role-selection/r1/select-role",
    body: { role: "TOP" },
    service: RoleSelectionService,
    fn: "selectRole",
    args: ["u1", "r1", "TOP"],
    bad: { role: "top" },
  },
  {
    name: "접속 상태 자리비움",
    method: "PUT",
    path: "/presence/me",
    body: { status: "AWAY" },
    service: PresenceService,
    fn: "updateStatus",
    args: ["u1", "AWAY"],
    bad: { status: "OFFLINE" },
  },
  {
    name: "댓글 좋아요 조회",
    method: "POST",
    path: "/community/comments/liked-status",
    body: { commentIds: ["c1", "c2"] },
    service: CommunityService,
    fn: "getCommentLikedStatus",
    args: ["u1", ["c1", "c2"]],
    bad: { commentIds: "c1" },
  },
  {
    name: "게시판 정렬",
    method: "PATCH",
    path: "/boards/admin/reorder",
    body: {
      items: [
        { id: "b1", order: 1 },
        { id: "b2", order: 0 },
      ],
    },
    service: BoardService,
    fn: "reorder",
    args: [
      [
        { id: "b1", order: 1 },
        { id: "b2", order: 0 },
      ],
    ],
    bad: { items: [{ id: "b1", order: "1" }] },
  },
  // ── user · auth ──
  {
    name: "이의신청 제출",
    method: "POST",
    path: "/users/me/appeals",
    body: { reason: "오해입니다" },
    service: UserService,
    fn: "submitAppeal",
    args: ["u1", "오해입니다"],
    bad: { reason: ["a"] },
  },
  {
    name: "OAuth 코드 교환",
    method: "POST",
    path: "/auth/exchange",
    body: { code: "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b" },
    service: AuthService,
    fn: "exchangeOAuthCode",
    args: ["3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b"],
    bad: { code: { a: 1 } },
  },
];

describe("DTO 전환 엔드포인트 — 실제 HTTP 요청", () => {
  it.each(cases().map((c) => [c.name, c]))(
    "%s: 클라이언트 요청은 통과하고 서비스에 같은 값이 간다",
    async (_name, c) => {
      const svc = mockOf(c.service);
      svc[c.fn].mockClear();

      const status = await send(c.method, c.path, c.body);

      expect(status).toBeLessThan(400);
      expect(svc[c.fn]).toHaveBeenCalledTimes(1);
      expect(svc[c.fn]).toHaveBeenCalledWith(...c.args);
    },
  );

  it.each(cases().map((c) => [c.name, c]))(
    "%s: 잘못된 요청은 400 이고 서비스까지 가지 않는다",
    async (_name, c) => {
      const svc = mockOf(c.service);
      svc[c.fn].mockClear();

      const status = await send(c.method, c.path, c.bad);

      expect(status).toBe(400);
      expect(svc[c.fn]).not.toHaveBeenCalled();
    },
  );

  it("약관 동의: 클라이언트의 불리언 4개가 그대로 서비스에 간다", async () => {
    const auth = mockOf(AuthService);
    auth.agreeToTerms.mockClear();
    auth.verifyPendingTermsToken.mockResolvedValue("u9");
    const dto = {
      termsOfService: true,
      privacyPolicy: true,
      ageVerification: true,
      marketingConsent: false,
    };

    const status = await send("POST", "/auth/agree?token=t1", dto);

    expect(status).toBeLessThan(400);
    expect(auth.agreeToTerms).toHaveBeenCalledWith("u9", dto);
  });

  it("약관 동의: 문자열 'false' 는 400 — 동의로 처리되지 않는다", async () => {
    const auth = mockOf(AuthService);
    auth.agreeToTerms.mockClear();

    const status = await send("POST", "/auth/agree?token=t1", {
      termsOfService: "false",
      privacyPolicy: true,
      ageVerification: true,
    });

    expect(status).toBe(400);
    expect(auth.agreeToTerms).not.toHaveBeenCalled();
  });
});
