import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);
import { ExchangeCodeDto } from "./exchange-code.dto";

/** 웹의 /api/auth/callback 라우트가 { code } 를 JSON 으로 보낸다. 코드는 서버가 만든 UUID. */
describe("ExchangeCodeDto", () => {
  it("UUID 코드", () =>
    expect(
      run(ExchangeCodeDto, { code: "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b" }),
    ).resolves.toBeDefined());
  it.each([
    ["없음", {}],
    ["빈 문자열", { code: "" }],
    ["객체 ([object Object] Redis 키 방지)", { code: { a: 1 } }],
    ["공백·콜론 포함 (Redis 키 조작)", { code: "a b:c" }],
    ["너무 김", { code: "a".repeat(65) }],
    ["모르는 키", { code: "abc-123", redirect: "x" }],
  ])("거부한다: %s", (_n, body) => rejects(ExchangeCodeDto, body));
});
