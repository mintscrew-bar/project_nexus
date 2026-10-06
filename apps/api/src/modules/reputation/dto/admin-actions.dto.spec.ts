import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
import { BanUserDto, UpdateReportStatusDto } from "./admin-actions.dto";

/**
 * 평판 모듈의 관리자 엔드포인트. 웹 UI 는 이 경로를 쓰지 않는다(`adminApi` 가 `/admin/*` 를
 * 쓴다) — 호출부가 없어 payload 는 서비스 시그니처에서 가져왔다.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);

describe("UpdateReportStatusDto", () => {
  it.each(["PENDING", "APPROVED", "REJECTED"])("status=%s", (status) =>
    expect(run(UpdateReportStatusDto, { status })).resolves.toMatchObject({
      status,
    }),
  );

  it("처리 메모는 선택", () =>
    expect(
      run(UpdateReportStatusDto, {
        status: "APPROVED",
        reviewerNote: "확인함",
      }),
    ).resolves.toMatchObject({ reviewerNote: "확인함" }));

  it.each([
    ["열거값이 아님", { status: "DONE" }],
    ["없음", {}],
    ["메모가 너무 김", { status: "APPROVED", reviewerNote: "가".repeat(1001) }],
    ["메모가 객체", { status: "APPROVED", reviewerNote: { a: 1 } }],
    ["모르는 키", { status: "APPROVED", reviewedBy: "x" }],
  ])("거부한다: %s", (_n, body) => rejects(UpdateReportStatusDto, body));
});

describe("BanUserDto (평판)", () => {
  it("사유만 있으면 영구 정지로 처리된다 (duration 생략)", () =>
    expect(run(BanUserDto, { reason: "핵" })).resolves.toEqual({
      reason: "핵",
    }));

  it("정지 일수를 받는다", () =>
    expect(
      run(BanUserDto, { reason: "욕설", duration: 7 }),
    ).resolves.toMatchObject({
      duration: 7,
    }));

  it.each([
    ["사유 없음", {}],
    ["일수가 문자열 '7' (암묵 변환 방지)", { reason: "x", duration: "7" }],
    ["일수 0", { reason: "x", duration: 0 }],
    ["일수 소수", { reason: "x", duration: 1.5 }],
    ["일수 3651", { reason: "x", duration: 3651 }],
    ["사유가 너무 김", { reason: "가".repeat(501) }],
    ["모르는 키", { reason: "x", isPermanent: true }],
  ])("거부한다: %s", (_n, body) => rejects(BanUserDto, body));
});
