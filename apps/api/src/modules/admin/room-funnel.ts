/**
 * 방 깔때기 계산 (순수 함수).
 *
 * 입력은 `RoomOutcome` 행이다. 방은 지워지면 흔적이 없어서 이 기록이 쌓이기 시작한
 * 시점 이후만 계산할 수 있다. **정원 충족은 "지워질 때" 기준**이라 중간에 찼다가
 * 빠진 방은 못 잡는다 — 시작한 방은 정원이 찼던 방이므로 `started` 가 더 정확한
 * 신호다.
 */
export interface RoomOutcomeRow {
  createdAt: Date;
  startedAt: Date | null;
  maxParticipants: number;
  participantCount: number;
  humanCount: number;
  hadResult: boolean;
  hostIsBot: boolean;
}

export interface RoomFunnel {
  /** 봇이 연 방을 뺀 방 수 */
  created: number;
  /** 시작까지 간 방 */
  started: number;
  /** 결과(완료 경기·라운드)가 남은 방 */
  withResult: number;
  /** 지워질 때 정원이 차 있던 방 */
  fullAtEnd: number;
  /** 사람이 한 명 이하인 채 지워진 방 — 열었다가 아무도 안 온 방 */
  emptied: number;
  /** 시작까지 걸린 시간(분) 중앙값. 시작한 방이 없으면 null */
  medianWaitMinutes: number | null;
  /** 시작한 방의 평균 사람 수. 시작한 방이 없으면 null */
  avgHumansInStarted: number | null;
  /** 봇이 연 방이라 뺀 수 */
  excludedBotRooms: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeRoomFunnel(rows: RoomOutcomeRow[]): RoomFunnel {
  const real = rows.filter((r) => !r.hostIsBot);
  const started = real.filter((r) => r.startedAt !== null);

  const waits = started
    .map((r) => (r.startedAt!.getTime() - r.createdAt.getTime()) / 60_000)
    // 시계 오차나 예약 방은 음수·비정상 값이 나올 수 있다.
    .filter((minutes) => minutes >= 0);

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const medianWait = median(waits);

  return {
    created: real.length,
    started: started.length,
    withResult: real.filter((r) => r.hadResult).length,
    fullAtEnd: real.filter((r) => r.participantCount >= r.maxParticipants)
      .length,
    emptied: real.filter((r) => r.humanCount <= 1).length,
    medianWaitMinutes: medianWait === null ? null : round1(medianWait),
    avgHumansInStarted:
      started.length === 0
        ? null
        : round1(
            started.reduce((sum, r) => sum + r.humanCount, 0) / started.length,
          ),
    excludedBotRooms: rows.length - real.length,
  };
}
