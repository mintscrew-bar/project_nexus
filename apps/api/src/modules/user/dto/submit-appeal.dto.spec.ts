import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);
import { SubmitAppealDto } from "./submit-appeal.dto";

/** 클라이언트: appealApi.submit(reason) → { reason } */
describe("SubmitAppealDto", () => {
  it("클라이언트 payload", () =>
    expect(run(SubmitAppealDto, { reason: "오해입니다" })).resolves.toEqual({
      reason: "오해입니다",
    }));
  it("정확히 1000자는 받고 1001자는 거부한다", async () => {
    await expect(
      run(SubmitAppealDto, { reason: "가".repeat(1000) }),
    ).resolves.toBeDefined();
    await rejects(SubmitAppealDto, { reason: "가".repeat(1001) });
  });
  it("빈 문자열은 서비스가 한국어 사유로 거부한다 — 기존 동작 유지", () =>
    expect(run(SubmitAppealDto, { reason: "" })).resolves.toBeDefined());
  it.each([
    [
      "배열 (타입 혼동으로 length·trim 검증을 우회하던 경로)",
      { reason: ["a"] },
    ],
    ["객체", { reason: { length: 5 } }],
    ["숫자", { reason: 5 }],
    ["없음", {}],
    ["모르는 키", { reason: "x", userId: "other" }],
  ])("거부한다: %s", (_n, body) => rejects(SubmitAppealDto, body));
});
