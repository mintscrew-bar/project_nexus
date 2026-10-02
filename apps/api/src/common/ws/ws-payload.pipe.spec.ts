import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { INestApplication, UseFilters } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IoAdapter } from "@nestjs/platform-socket.io";
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { io, Socket } from "socket.io-client";
import { WsAckExceptionFilter } from "./ws-ack-exception.filter";
import { WsPayloadPipe, f, isWsId, wsPayload } from "./ws-payload.pipe";

/**
 * 소켓 이벤트 페이로드 검증 (소켓 점검 M1, docs/status/SOCKET_AUDIT_2026-10.md).
 * 전역 ValidationPipe 는 게이트웨이에 적용되지 않아 런타임 검증이 없었다.
 */

const body = { type: "body" } as any;

describe("isWsId", () => {
  it.each(["cmuon9bzl0001rp1oy3hixflt", "testbot_01", "a", "x".repeat(64)])(
    "식별자로 받는다: %s",
    (id) => expect(isWsId(id)).toBe(true),
  );

  it.each([
    "",
    "x".repeat(65),
    "room id",
    "a:b",
    "../etc",
    "a'b",
    undefined,
    null,
    123,
    {},
    { not: "" },
    ["a"],
  ])("식별자가 아니다: %p", (value) => expect(isWsId(value)).toBe(false));
});

describe("WsPayloadPipe", () => {
  const pipe = new WsPayloadPipe({ roomId: f.id() });

  it("올바른 페이로드는 그대로 통과시킨다", () => {
    const value = { roomId: "room-1", extra: "무시" };
    expect(pipe.transform(value, body)).toBe(value);
  });

  it("필수 식별자가 없으면 거부한다 — Prisma 가 undefined 를 where 에서 지우는 것 방지", () => {
    expect(() => pipe.transform({}, body)).toThrow(
      "잘못된 요청입니다. (roomId)",
    );
    expect(() => pipe.transform({ roomId: null }, body)).toThrow();
    expect(() => pipe.transform(undefined, body)).toThrow();
    expect(() => pipe.transform(null, body)).toThrow();
  });

  it("Prisma 필터로 해석될 수 있는 객체를 식별자 자리에 넣으면 거부한다", () => {
    expect(() => pipe.transform({ roomId: { not: "" } }, body)).toThrow();
    expect(() => pipe.transform({ roomId: { contains: "" } }, body)).toThrow();
    expect(() => pipe.transform({ roomId: ["a"] }, body)).toThrow();
  });

  it("페이로드가 객체가 아니면 거부한다", () => {
    expect(() => pipe.transform("room-1", body)).toThrow();
    expect(() => pipe.transform(42, body)).toThrow();
    expect(() => pipe.transform([{ roomId: "a" }], body)).toThrow();
  });

  it("body 가 아닌 인자(@ConnectedSocket 등)는 건드리지 않는다", () => {
    const socket = { id: "sock" };
    expect(pipe.transform(socket, { type: "custom" } as any)).toBe(socket);
  });

  it("선택 필드는 없어도(undefined·null) 되지만 있으면 형식을 지켜야 한다", () => {
    const p = new WsPayloadPipe({
      roomId: f.id(),
      teamId: f.idOpt(),
      password: f.str({ max: 5, optional: true }),
    });
    expect(p.transform({ roomId: "r" }, body)).toEqual({ roomId: "r" });
    expect(p.transform({ roomId: "r", teamId: null }, body)).toBeTruthy();
    expect(() => p.transform({ roomId: "r", teamId: "a b" }, body)).toThrow();
    expect(() =>
      p.transform({ roomId: "r", password: "123456" }, body),
    ).toThrow();
  });

  it("모든 필드가 선택이면 페이로드가 없어도 빈 객체로 받는다", () => {
    const p = new WsPayloadPipe({ x: f.bool({ optional: true }) });
    expect(p.transform(undefined, body)).toEqual({});
  });

  it("숫자·불리언·열거·목록 규칙", () => {
    const p = new WsPayloadPipe({
      amount: f.int({ min: 1 }),
      flag: f.bool(),
      side: f.oneOf(["blue", "red"]),
      ids: f.idList({ max: 2 }),
    });
    const ok = { amount: 50, flag: true, side: "blue", ids: ["a", "b"] };
    expect(p.transform(ok, body)).toBe(ok);
    for (const bad of [
      { ...ok, amount: 0 },
      { ...ok, amount: 1.5 },
      { ...ok, amount: "50" },
      { ...ok, amount: Infinity },
      { ...ok, flag: "true" },
      { ...ok, side: "green" },
      { ...ok, ids: ["a", "b", "c"] },
      { ...ok, ids: ["a", { x: 1 }] },
      { ...ok, ids: "a" },
    ]) {
      expect(() => p.transform(bad, body)).toThrow();
    }
  });
});

describe("검증 실패를 ack 로 돌려준다 (실제 socket.io 연결)", () => {
  @UseFilters(new WsAckExceptionFilter())
  @WebSocketGateway({ namespace: "/t", transports: ["websocket"] })
  class TestGateway {
    @SubscribeMessage("join")
    join(@MessageBody(wsPayload({ roomId: f.id() })) data: { roomId: string }) {
      return { success: true, roomId: data.roomId };
    }
  }

  let app: INestApplication;
  let socket: Socket;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TestGateway],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const { port } = app.getHttpServer().address();
    socket = io(`http://127.0.0.1:${port}/t`, { transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
  });

  afterAll(async () => {
    socket?.close();
    await app?.close();
  });

  const emitWithAck = (payload: unknown) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error("ack 가 오지 않았다 (영원히 대기하는 호출부 재현)")),
        2000,
      );
      socket.emit("join", payload, (res: unknown) => {
        clearTimeout(timer);
        resolve(res);
      });
    });

  it("올바른 페이로드는 핸들러까지 간다", async () => {
    await expect(emitWithAck({ roomId: "room-1" })).resolves.toEqual({
      success: true,
      roomId: "room-1",
    });
  });

  it("식별자가 없으면 ack 로 에러가 돌아온다", async () => {
    await expect(emitWithAck({})).resolves.toEqual({
      success: false,
      error: "잘못된 요청입니다. (roomId)",
    });
  });

  it("Prisma 필터 모양의 객체도 ack 로 에러가 돌아온다", async () => {
    const res = await emitWithAck({ roomId: { not: "" } });
    expect(res).toMatchObject({ success: false });
  });

  it("페이로드 없이 보내도 ack 가 온다", async () => {
    const res = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ack 없음")), 2000);
      socket.emit("join", (r: unknown) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    expect(res).toMatchObject({ success: false });
  });

  it("ack 가 없는 emit 은 exception 이벤트로 알리고 서버는 계속 동작한다", async () => {
    const exception = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("exception 없음")), 2000);
      socket.once("exception", (e: unknown) => {
        clearTimeout(timer);
        resolve(e);
      });
    });
    socket.emit("join", { roomId: "bad id" });

    await expect(exception).resolves.toMatchObject({ status: "error" });
    // 소켓이 죽지 않았다
    await expect(emitWithAck({ roomId: "room-2" })).resolves.toMatchObject({
      success: true,
    });
  });
});

describe("게이트웨이 핸들러는 모두 페이로드를 검증한다 (회귀 방지)", () => {
  const modulesDir = join(__dirname, "..", "..", "modules");
  const gateways = readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(modulesDir, d.name))
        .filter((file) => file.endsWith(".gateway.ts"))
        .map((file) => join(modulesDir, d.name, file)),
    );

  it("게이트웨이를 찾았다", () => {
    expect(gateways.length).toBeGreaterThanOrEqual(10);
  });

  it.each(gateways.map((file) => [file.split("/").slice(-2).join("/"), file]))(
    "%s — 맨몸 @MessageBody() 가 없다",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      // 새 핸들러를 추가하면서 검증을 빼먹는 것을 막는다.
      // 본문이 정말 필요 없는 이벤트는 @MessageBody 자체를 쓰지 않는다.
      expect(source).not.toMatch(/@MessageBody\(\s*\)/);
    },
  );

  it.each(gateways.map((file) => [file.split("/").slice(-2).join("/"), file]))(
    "%s — 입력 오류를 ack 로 돌려주는 필터가 붙어 있다",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      if (!/@MessageBody\(/.test(source)) return;
      expect(source).toMatch(/@UseFilters\(new WsAckExceptionFilter\(\)\)/);
    },
  );
});
