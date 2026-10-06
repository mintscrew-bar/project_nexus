import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
import { ReportMatchResultDto, SubmitVoteDto } from "./match-actions.dto";

/**
 * 클라이언트 payload 는 `matchApi.reportResult` / `submitVote` 호출부에서 가져왔다.
 * 클라이언트 타입에는 `statsJson` 이 있지만 실제로는 보내지 않는다(match-store.ts 는
 * `{ winnerId }` 만 보낸다) — 서버 본문 타입에도 없었으므로 DTO 에도 넣지 않는다.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);

describe("ReportMatchResultDto", () => {
  it("클라이언트 payload", () =>
    expect(
      run(ReportMatchResultDto, { winnerId: "cmuon9bzl0001rp1oy3hixflt" }),
    ).resolves.toMatchObject({ winnerId: "cmuon9bzl0001rp1oy3hixflt" }));

  it.each([
    ["없음", {}],
    ["빈 문자열", { winnerId: "" }],
    ["객체 (Prisma 필터 모양)", { winnerId: { not: "" } }],
    ["너무 김", { winnerId: "a".repeat(65) }],
    ["statsJson 같은 여분 키", { winnerId: "t1", statsJson: {} }],
  ])("거부한다: %s", (_n, body) => rejects(ReportMatchResultDto, body));
});

describe("SubmitVoteDto", () => {
  it.each(["MVP", "ACE"])("클라이언트 payload: %s", (voteType) =>
    expect(
      run(SubmitVoteDto, { votedForId: "u1", voteType }),
    ).resolves.toMatchObject({ voteType }),
  );

  it.each([
    ["voteType 가 열거값이 아님", { votedForId: "u1", voteType: "BEST" }],
    ["voteType 없음", { votedForId: "u1" }],
    ["votedForId 없음", { voteType: "MVP" }],
    ["votedForId 가 객체", { votedForId: { not: "" }, voteType: "MVP" }],
    ["모르는 키", { votedForId: "u1", voteType: "MVP", weight: 2 }],
  ])("거부한다: %s", (_n, body) => rejects(SubmitVoteDto, body));
});
