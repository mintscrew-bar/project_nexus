import { computeRoomFunnel, RoomOutcomeRow } from "./room-funnel";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute));

const row = (over: Partial<RoomOutcomeRow> = {}): RoomOutcomeRow => ({
  createdAt: at(0),
  startedAt: null,
  maxParticipants: 10,
  participantCount: 1,
  humanCount: 1,
  hadResult: false,
  hostIsBot: false,
  ...over,
});

describe("computeRoomFunnel", () => {
  it("기록이 없으면 전부 0 이고 평균·중앙값은 null 이다 (0 나눗셈 없음)", () => {
    expect(computeRoomFunnel([])).toEqual({
      created: 0,
      started: 0,
      withResult: 0,
      fullAtEnd: 0,
      emptied: 0,
      medianWaitMinutes: null,
      avgHumansInStarted: null,
      excludedBotRooms: 0,
    });
  });

  it("봇이 연 방은 모든 지표에서 뺀다", () => {
    const f = computeRoomFunnel([
      row({ hostIsBot: true, startedAt: at(5), hadResult: true }),
      row(),
    ]);
    expect(f.created).toBe(1);
    expect(f.started).toBe(0);
    expect(f.excludedBotRooms).toBe(1);
  });

  it("단계별로 센다: 생성 → 시작 → 결과", () => {
    const f = computeRoomFunnel([
      row(),
      row({ startedAt: at(10), humanCount: 10, participantCount: 10 }),
      row({
        startedAt: at(20),
        humanCount: 10,
        participantCount: 10,
        hadResult: true,
      }),
    ]);
    expect(f).toMatchObject({
      created: 3,
      started: 2,
      withResult: 1,
      fullAtEnd: 2,
    });
  });

  it("대기 시간 중앙값은 짝수 개일 때 가운데 둘의 평균이다", () => {
    const f = computeRoomFunnel([
      row({ startedAt: at(10) }),
      row({ startedAt: at(30) }),
    ]);
    expect(f.medianWaitMinutes).toBe(20);
  });

  it("시작 시각이 만든 시각보다 앞선 비정상 행은 대기 시간에서 뺀다", () => {
    const f = computeRoomFunnel([
      row({ createdAt: at(30), startedAt: at(10) }),
      row({ startedAt: at(8) }),
    ]);
    expect(f.medianWaitMinutes).toBe(8);
    expect(f.started).toBe(2);
  });

  it("사람이 한 명 이하로 지워진 방을 센다", () => {
    const f = computeRoomFunnel([
      row({ humanCount: 0, participantCount: 0 }),
      row({ humanCount: 1 }),
      row({ humanCount: 4, participantCount: 4 }),
    ]);
    expect(f.emptied).toBe(2);
  });

  it("시작한 방의 평균 사람 수는 시작하지 않은 방을 섞지 않는다", () => {
    const f = computeRoomFunnel([
      row({ startedAt: at(5), humanCount: 8 }),
      row({ startedAt: at(5), humanCount: 10 }),
      row({ humanCount: 1 }),
    ]);
    expect(f.avgHumansInStarted).toBe(9);
  });
});
