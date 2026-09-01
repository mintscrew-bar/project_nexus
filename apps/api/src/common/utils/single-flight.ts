/**
 * 같은 키로 동시에 들어온 작업을 한 번만 실행하고 결과를 나눠 준다.
 *
 * Riot 퍼스널 키는 앱 전체가 100req/2분을 공유한다. 인기 소환사를 여러 명이
 * 동시에 검색하면 캐시가 비어 있는 첫 순간에 같은 요청이 N배로 나가 예산을
 * 통째로 태운다. 캐시는 "이미 끝난 요청"만 막을 뿐, "지금 진행 중인 요청"은
 * 막지 못한다. 그 빈틈을 메운다.
 *
 * 프로세스 안에서만 동작한다. 현재 API는 단일 인스턴스(`instances:1`)라
 * 이것으로 충분하고, 클러스터로 가면 Redis 기반으로 올려야 한다.
 */
export class SingleFlight {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * @param key 같은 작업으로 볼 기준. 이 키가 같으면 뒤따라온 호출은
   *   새로 실행하지 않고 진행 중인 작업의 결과를 그대로 받는다.
   */
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    // 실패도 함께 나눠 갖는다. 한 명이 429를 받았는데 나머지가 각자 재시도하면
    // 예산을 아끼려던 목적이 그대로 뒤집힌다.
    const flight = (async () => fn())().finally(() => {
      // 이미 다음 작업이 같은 키를 차지했다면 그건 남겨둔다.
      if (this.inFlight.get(key) === flight) this.inFlight.delete(key);
    });

    this.inFlight.set(key, flight);
    return flight;
  }

  /** 진행 중인 작업 수 (관측용) */
  get size(): number {
    return this.inFlight.size;
  }
}
