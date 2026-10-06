import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
import {
  CreateTournamentDto,
  StartVerificationDto,
  UpdateChampionsDto,
} from "./riot-actions.dto";

/** 클라이언트 payload 는 `apps/web/src/lib/api-client.ts` 의 riotApi 호출에서 가져왔다. */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);

describe("StartVerificationDto", () => {
  it("클라이언트 payload", () =>
    expect(
      run(StartVerificationDto, { gameName: "Hide on bush", tagLine: "KR1" }),
    ).resolves.toMatchObject({ gameName: "Hide on bush", tagLine: "KR1" }));

  it.each([
    ["본문이 비어 있음 (예전엔 서비스에서 TypeError 500)", {}],
    ["닉네임이 빈 문자열", { gameName: "", tagLine: "KR1" }],
    ["태그라인이 너무 김", { gameName: "a", tagLine: "a".repeat(11) }],
    ["닉네임이 객체", { gameName: { a: 1 }, tagLine: "KR1" }],
    ["모르는 키", { gameName: "a", tagLine: "b", puuid: "x" }],
  ])("거부한다: %s", (_n, body) => rejects(StartVerificationDto, body));
});

describe("UpdateChampionsDto", () => {
  it("클라이언트 payload", () =>
    expect(
      run(UpdateChampionsDto, { championIds: ["Ahri", "Lux", "Zed"] }),
    ).resolves.toMatchObject({ championIds: ["Ahri", "Lux", "Zed"] }));

  it("3개 미만은 DTO 가 아니라 서비스가 사유와 함께 거부한다 — 기존 동작 유지", () =>
    expect(
      run(UpdateChampionsDto, { championIds: ["Ahri"] }),
    ).resolves.toBeDefined());

  it.each([
    ["없음 (예전엔 championIds.length TypeError 500)", {}],
    ["배열이 아님", { championIds: "Ahri" }],
    ["원소가 문자열이 아님", { championIds: ["Ahri", 5, "Zed"] }],
    ["원소가 객체", { championIds: [{ not: "" }] }],
    ["21개", { championIds: Array.from({ length: 21 }, (_, i) => `c${i}`) }],
    ["원소가 너무 김", { championIds: ["a".repeat(65)] }],
    ["모르는 키", { championIds: ["a", "b", "c"], role: "TOP" }],
  ])("거부한다: %s", (_n, body) => rejects(UpdateChampionsDto, body));
});

describe("CreateTournamentDto", () => {
  it("숫자 문자열 provider id", () =>
    expect(run(CreateTournamentDto, { providerId: "12345" })).resolves.toEqual({
      providerId: "12345",
    }));

  it.each([
    ["없음", {}],
    ["문자가 섞임", { providerId: "12a" }],
    ["숫자 타입 (타입 선언은 string)", { providerId: 12345 }],
    ["너무 김", { providerId: "1".repeat(19) }],
  ])("거부한다: %s", (_n, body) => rejects(CreateTournamentDto, body));
});
