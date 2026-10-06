import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
import { UpdateRoomDto } from "./update-room.dto";

/**
 * 방 설정 수정(PUT :id). 컨트롤러가 `Partial<CreateRoomDto>` 를 받을 때는 검증이 전혀 없었다.
 * 클라이언트 payload 는 `RoomSettingsModal` 이 만드는 `RoomSettingsDto` 와 같다.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (body: unknown) =>
  pipe.transform(body, { type: "body", metatype: UpdateRoomDto });
const rejects = (body: unknown) =>
  expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
const wire = (o: unknown) => JSON.parse(JSON.stringify(o));

describe("UpdateRoomDto", () => {
  it("클라이언트 payload: 경매 방 (undefined 키는 전송에서 빠진다)", () =>
    expect(
      run(
        wire({
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
        }),
      ),
    ).resolves.toMatchObject({
      name: "금요 내전",
      teamMode: "AUCTION",
      password: null,
    }));

  it("클라이언트 payload: 비밀번호를 거는 경우", () =>
    expect(run({ password: "1234" })).resolves.toEqual({ password: "1234" }));

  it("빈 본문도 받는다 — 바꿀 게 없는 수정", () =>
    expect(run({})).resolves.toBeDefined());

  it("UI 가 고를 수 있는 값 범위가 모두 통과한다", async () => {
    for (const startingPoints of [500, 1000, 1500, 2000])
      await run({ startingPoints });
    for (const minBidIncrement of [10, 25, 50, 100])
      await run({ minBidIncrement });
    for (const bidTimeLimit of [15, 30, 45, 60]) await run({ bidTimeLimit });
  });

  it("방 이름의 HTML 은 제거된다 (생성 DTO 와 같은 정화)", async () => {
    const res: any = await run({ name: "<b>내전</b>" });
    expect(res.name).toBe("내전");
  });

  it.each([
    ["이름이 너무 김", { name: "가".repeat(51) }],
    ["이름이 비어 있음", { name: "" }],
    ["팀 모드가 열거값이 아님", { teamMode: "RANDOM" }],
    ["정원이 문자열 '10' (암묵 변환 방지)", { maxParticipants: "10" }],
    ["정원 5", { maxParticipants: 5 }],
    ["정원 101", { maxParticipants: 101 }],
    ["allowSpectators 가 문자열 'false'", { allowSpectators: "false" }],
    ["경매 포인트 범위 밖", { startingPoints: 50 }],
    ["입찰 시간 121", { bidTimeLimit: 121 }],
    ["픽 시간 4", { pickTimeLimit: 4 }],
    ["진행시간 9", { killMatchDurationMinutes: 9 }],
    ["경기 수 21", { battleRoyaleRounds: 21 }],
    ["주장 선정 방식이 열거값이 아님", { captainSelection: "BEST" }],
    ["대진 방식이 열거값이 아님", { bracketFormat: "ROUND" }],
    ["비밀번호가 너무 김", { password: "a".repeat(21) }],
    ["비밀번호가 숫자", { password: 1234 }],
    ["프리셋이 객체", { seriesPreset: { not: "" } }],
    ["수정할 수 없는 항목: 게임", { gameTitle: "PUBG" }],
    ["수정할 수 없는 항목: 예약 시각", { scheduledAt: "2099-01-01T00:00:00Z" }],
    ["수정할 수 없는 항목: 디스코드 서버", { discordGuildId: "1" }],
    ["모르는 키", { hostId: "other" }],
  ])("거부한다: %s", (_n, body) => rejects(body));
});
