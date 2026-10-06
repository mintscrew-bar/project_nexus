import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
import {
  AddBotsDto,
  BanUserDto,
  BotCleanupDto,
  PinPostDto,
  RestrictUserDto,
  UpdateUserRoleDto,
  ReviewAppealDto,
  ReviewReportDto,
  SendAnnouncementDto,
} from "./admin-actions.dto";

/**
 * 인라인 `@Body()` 타입을 DTO 로 바꾼 뒤의 회귀 테스트.
 *
 * 운영과 같은 ValidationPipe 설정(`whitelist` + `forbidNonWhitelisted`)으로 돌린다 — DTO 로
 * 바꾸면 클라이언트가 보내던 **여분 키가 400** 이 되므로, 아래 "클라이언트가 실제로 보내는
 * payload" 가 통과하는지가 핵심이다. 값은 `apps/web/src/lib/api-client.ts` 의 adminApi 와
 * 호출 화면(ReportsTab·UsersTab·AnnouncementsTab·BotCleanupTab)에서 가져왔다.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });

describe("BanUserDto", () => {
  it("클라이언트 payload: banUntil 이 undefined 면 JSON 에서 빠진다", () => {
    const wire = JSON.parse(
      JSON.stringify({ reason: "욕설", banUntil: undefined }),
    );
    return expect(run(BanUserDto, wire)).resolves.toMatchObject({
      reason: "욕설",
    });
  });

  it("banUntil 을 보내는 경우도 받는다 (날짜 해석은 서비스 몫)", () =>
    expect(
      run(BanUserDto, { reason: "x", banUntil: "2099-01-01T00:00:00Z" }),
    ).resolves.toMatchObject({ banUntil: "2099-01-01T00:00:00Z" }));

  it("빈 사유는 기존처럼 받는다 — 화면의 '기타' 직접 입력이 비어 올 수 있다", () =>
    expect(run(BanUserDto, { reason: "" })).resolves.toBeDefined());

  it.each([
    ["사유 없음", {}],
    ["사유가 문자열이 아님", { reason: { $ne: "" } }],
    ["사유가 너무 김", { reason: "가".repeat(501) }],
    ["모르는 키", { reason: "x", isAdmin: true }],
    ["banUntil 이 너무 김", { reason: "x", banUntil: "a".repeat(41) }],
  ])("거부한다: %s", (_n, body) =>
    expect(run(BanUserDto, body)).rejects.toBeInstanceOf(BadRequestException),
  );
});

describe("ReviewReportDto", () => {
  it("클라이언트 payload: category 가 undefined 면 빠진다, 메모가 빈 문자열이어도 받는다", async () => {
    const wire = JSON.parse(
      JSON.stringify({
        status: "APPROVED",
        reviewerNote: "",
        category: undefined,
      }),
    );
    await expect(run(ReviewReportDto, wire)).resolves.toMatchObject({
      status: "APPROVED",
      reviewerNote: "",
    });
  });

  it.each(["user", "post"])("category=%s 를 받는다", (category) =>
    expect(
      run(ReviewReportDto, { status: "REJECTED", reviewerNote: "n", category }),
    ).resolves.toMatchObject({ category }),
  );

  it.each([
    ["status 가 열거값이 아님", { status: "PENDING", reviewerNote: "" }],
    ["status 없음", { reviewerNote: "" }],
    ["메모 없음", { status: "APPROVED" }],
    ["메모가 너무 김", { status: "APPROVED", reviewerNote: "가".repeat(1001) }],
    [
      "category 가 열거값이 아님",
      { status: "APPROVED", reviewerNote: "", category: "clan" },
    ],
    ["모르는 키", { status: "APPROVED", reviewerNote: "", extra: 1 }],
  ])("거부한다: %s", (_n, body) =>
    expect(run(ReviewReportDto, body)).rejects.toBeInstanceOf(
      BadRequestException,
    ),
  );
});

describe("SendAnnouncementDto", () => {
  it("클라이언트 payload: link 가 없으면 빠진다", async () => {
    const wire = JSON.parse(
      JSON.stringify({ title: "점검", message: "내일 점검", link: undefined }),
    );
    await expect(run(SendAnnouncementDto, wire)).resolves.toMatchObject({
      title: "점검",
    });
  });

  it("링크를 보내는 경우도 받는다", () =>
    expect(
      run(SendAnnouncementDto, { title: "t", message: "m", link: "/guide" }),
    ).resolves.toMatchObject({ link: "/guide" }));

  it.each([
    ["제목 비어 있음", { title: "", message: "m" }],
    ["내용 비어 있음", { title: "t", message: "" }],
    ["제목이 너무 김", { title: "가".repeat(101), message: "m" }],
    ["내용이 너무 김", { title: "t", message: "가".repeat(2001) }],
    ["링크가 너무 김", { title: "t", message: "m", link: "a".repeat(501) }],
    ["제목이 문자열이 아님", { title: 1, message: "m" }],
    ["모르는 키", { title: "t", message: "m", sendAt: "now" }],
  ])("거부한다: %s", (_n, body) =>
    expect(run(SendAnnouncementDto, body)).rejects.toBeInstanceOf(
      BadRequestException,
    ),
  );
});

describe("BotCleanupDto", () => {
  it("클라이언트 payload: 둘 다 불리언", () =>
    expect(
      run(BotCleanupDto, { rooms: true, matches: false }),
    ).resolves.toEqual({
      rooms: true,
      matches: false,
    }));

  it("하나만 보내도 받는다 (둘 다 없는 경우는 컨트롤러가 막는다)", () =>
    expect(run(BotCleanupDto, { rooms: true })).resolves.toBeDefined());

  it.each([
    [
      "문자열 'false' — 암묵 변환으로 true 가 되는 것을 막는다",
      { rooms: "false" },
    ],
    ["숫자", { matches: 1 }],
    ["모르는 키", { rooms: true, users: true }],
  ])("거부한다: %s", (_n, body) =>
    expect(run(BotCleanupDto, body)).rejects.toBeInstanceOf(
      BadRequestException,
    ),
  );
});

const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);

describe("ReviewAppealDto", () => {
  it("클라이언트 payload: adminNote 가 undefined 면 빠진다", async () => {
    const wire = JSON.parse(
      JSON.stringify({ status: "APPROVED", adminNote: undefined }),
    );
    await expect(run(ReviewAppealDto, wire)).resolves.toMatchObject({
      status: "APPROVED",
    });
  });
  it("메모를 보내는 경우도 받는다", () =>
    expect(
      run(ReviewAppealDto, { status: "REJECTED", adminNote: "근거 부족" }),
    ).resolves.toMatchObject({ adminNote: "근거 부족" }));
  it.each([
    ["status 가 열거값이 아님", { status: "PENDING" }],
    ["status 없음", {}],
    ["메모가 너무 김", { status: "APPROVED", adminNote: "가".repeat(1001) }],
    ["모르는 키", { status: "APPROVED", reviewer: "x" }],
  ])("거부한다: %s", (_n, body) => rejects(ReviewAppealDto, body));
});

describe("UpdateUserRoleDto", () => {
  it.each(["USER", "MODERATOR", "ADMIN"])("클라이언트 payload: %s", (role) =>
    expect(run(UpdateUserRoleDto, { role })).resolves.toEqual({ role }),
  );
  it.each([
    ["열거값이 아님", { role: "SUPERADMIN" }],
    ["없음", {}],
    ["소문자", { role: "admin" }],
    ["모르는 키", { role: "USER", force: true }],
  ])("거부한다: %s", (_n, body) => rejects(UpdateUserRoleDto, body));
});

describe("RestrictUserDto", () => {
  it("클라이언트 payload: ISO 날짜 문자열", () =>
    expect(
      run(RestrictUserDto, { restrictedUntil: "2099-01-01T00:00:00.000Z" }),
    ).resolves.toBeDefined());
  it.each([
    ["없음", {}],
    ["문자열이 아님", { restrictedUntil: 20990101 }],
    ["너무 김", { restrictedUntil: "a".repeat(41) }],
    ["모르는 키", { restrictedUntil: "2099-01-01", reason: "x" }],
  ])("거부한다: %s", (_n, body) => rejects(RestrictUserDto, body));
});

describe("PinPostDto", () => {
  it.each([true, false])("클라이언트 payload: %s", (isPinned) =>
    expect(run(PinPostDto, { isPinned })).resolves.toEqual({ isPinned }),
  );
  it.each([
    ["문자열 'false' (고정으로 처리되는 것을 막는다)", { isPinned: "false" }],
    ["없음", {}],
    ["숫자 0", { isPinned: 0 }],
  ])("거부한다: %s", (_n, body) => rejects(PinPostDto, body));
});

describe("AddBotsDto", () => {
  it("클라이언트 payload: { count: 1 }", () =>
    expect(run(AddBotsDto, { count: 1 })).resolves.toEqual({ count: 1 }));
  it("생략하면 컨트롤러가 1 로 처리한다", () =>
    expect(run(AddBotsDto, {})).resolves.toBeDefined());
  it.each([
    ["0", { count: 0 }],
    ["소수", { count: 1.5 }],
    ["문자열 '3' (암묵 변환 방지)", { count: "3" }],
    ["51", { count: 51 }],
    ["모르는 키", { count: 1, fill: true }],
  ])("거부한다: %s", (_n, body) => rejects(AddBotsDto, body));
});
