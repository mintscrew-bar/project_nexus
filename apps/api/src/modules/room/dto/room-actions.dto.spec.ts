import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
import {
  JoinRoomBodyDto,
  SendRoomMessageDto,
  SetBroadcastFocusDto,
  SetBroadcastLiveDto,
  SnakeDraftPickDto,
} from "./room-actions.dto";

/**
 * 방 컨트롤러 본문 DTO 회귀 테스트. 운영과 같은 ValidationPipe 설정으로 돌린다.
 * "클라이언트 payload" 는 `apps/web/src/lib/api-client.ts` 의 roomApi·broadcast 호출에서
 * 가져왔고, `JSON.stringify` 를 거쳐 undefined 키가 빠진 실제 전송 형태로 만든다.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const wire = (o: unknown) => JSON.parse(JSON.stringify(o));
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);

describe("SetBroadcastLiveDto", () => {
  it.each([true, false])("클라이언트 payload: { live: %s }", (live) =>
    expect(run(SetBroadcastLiveDto, wire({ live }))).resolves.toEqual({ live }),
  );
  it.each([
    ["없음", {}],
    [
      "문자열 'false' (암묵 변환으로 true 가 되는 것을 막는다)",
      { live: "false" },
    ],
    ["숫자", { live: 1 }],
    ["모르는 키", { live: true, pin: 1 }],
  ])("거부한다: %s", (_n, body) => rejects(SetBroadcastLiveDto, body));
});

describe("SetBroadcastFocusDto", () => {
  it("클라이언트 payload: 경기 id", () =>
    expect(
      run(SetBroadcastFocusDto, wire({ matchId: "cmuon9bzl0001rp1oy3hixflt" })),
    ).resolves.toMatchObject({ matchId: "cmuon9bzl0001rp1oy3hixflt" }));

  it("클라이언트 payload: null 은 해제", () =>
    expect(run(SetBroadcastFocusDto, wire({ matchId: null }))).resolves.toEqual(
      {
        matchId: null,
      },
    ));

  it("키가 아예 없어도 받는다 — 컨트롤러가 null 로 처리한다 (기존 동작)", () =>
    expect(run(SetBroadcastFocusDto, {})).resolves.toBeDefined());

  it.each([
    ["숫자", { matchId: 5 }],
    ["객체 (Prisma 필터 모양)", { matchId: { not: "" } }],
    ["너무 김", { matchId: "a".repeat(65) }],
    ["모르는 키", { matchId: null, x: 1 }],
  ])("거부한다: %s", (_n, body) => rejects(SetBroadcastFocusDto, body));
});

describe("JoinRoomBodyDto", () => {
  it("클라이언트 payload: 둘 다 undefined 면 빈 객체", () =>
    expect(
      run(
        JoinRoomBodyDto,
        wire({ password: undefined, asSpectator: undefined }),
      ),
    ).resolves.toBeDefined());

  it("클라이언트 payload: 비밀번호와 관전 입장", () =>
    expect(
      run(JoinRoomBodyDto, wire({ password: "1234", asSpectator: true })),
    ).resolves.toMatchObject({ password: "1234", asSpectator: true }));

  it.each([
    ["비밀번호가 너무 김", { password: "a".repeat(21) }],
    ["비밀번호가 숫자", { password: 1234 }],
    ["asSpectator 가 문자열 'false'", { asSpectator: "false" }],
    ["roomId 를 본문에 넣음 (경로에서 온다)", { roomId: "x" }],
  ])("거부한다: %s", (_n, body) => rejects(JoinRoomBodyDto, body));
});

describe("SendRoomMessageDto", () => {
  it("일반 메시지", () =>
    expect(run(SendRoomMessageDto, { content: "안녕" })).resolves.toEqual({
      content: "안녕",
    }));

  it("정확히 500자는 받고 501자는 거부한다 (서비스 한도와 같다)", async () => {
    await expect(
      run(SendRoomMessageDto, { content: "가".repeat(500) }),
    ).resolves.toBeDefined();
    await rejects(SendRoomMessageDto, { content: "가".repeat(501) });
  });

  it("빈 문자열은 DTO 가 아니라 서비스가 한국어 사유로 거부한다 — 기존 동작 유지", () =>
    expect(run(SendRoomMessageDto, { content: "" })).resolves.toBeDefined());

  it.each([
    ["없음", {}],
    ["숫자", { content: 1 }],
    ["객체", { content: { a: 1 } }],
    ["모르는 키", { content: "x", roomId: "r" }],
  ])("거부한다: %s", (_n, body) => rejects(SendRoomMessageDto, body));
});

describe("SnakeDraftPickDto", () => {
  it("클라이언트 payload", () =>
    expect(
      run(
        SnakeDraftPickDto,
        wire({ targetPlayerId: "cmuon9bzl0001rp1oy3hixflt" }),
      ),
    ).resolves.toMatchObject({ targetPlayerId: "cmuon9bzl0001rp1oy3hixflt" }));

  it.each([
    ["없음", {}],
    ["빈 문자열", { targetPlayerId: "" }],
    ["객체", { targetPlayerId: { not: "" } }],
    ["너무 김", { targetPlayerId: "a".repeat(65) }],
    ["모르는 키", { targetPlayerId: "x", force: true }],
  ])("거부한다: %s", (_n, body) => rejects(SnakeDraftPickDto, body));
});
