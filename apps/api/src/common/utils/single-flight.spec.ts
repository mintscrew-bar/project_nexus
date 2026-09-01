import { SingleFlight } from "./single-flight";

describe("SingleFlight", () => {
  it("같은 키로 동시에 들어오면 한 번만 실행한다", async () => {
    const flight = new SingleFlight();
    let calls = 0;
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });

    const fn = () => {
      calls++;
      return pending;
    };

    const results = Promise.all([
      flight.run("match-1", fn),
      flight.run("match-1", fn),
      flight.run("match-1", fn),
    ]);
    expect(calls).toBe(1);
    expect(flight.size).toBe(1);

    release("데이터");
    await expect(results).resolves.toEqual(["데이터", "데이터", "데이터"]);
  });

  it("키가 다르면 각각 실행한다", async () => {
    const flight = new SingleFlight();
    const fn = jest.fn().mockResolvedValue("ok");

    await Promise.all([flight.run("match-1", fn), flight.run("match-2", fn)]);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("끝나면 키를 비워 다음 호출은 새로 실행한다", async () => {
    const flight = new SingleFlight();
    const fn = jest.fn().mockResolvedValue("ok");

    await flight.run("match-1", fn);
    expect(flight.size).toBe(0);
    await flight.run("match-1", fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("실패도 함께 나눠 갖고, 각자 재시도하지 않는다", async () => {
    const flight = new SingleFlight();
    let calls = 0;
    let reject!: (error: Error) => void;
    const pending = new Promise<string>((_, rejectFn) => {
      reject = rejectFn;
    });

    const fn = () => {
      calls++;
      return pending;
    };

    const first = flight.run("match-1", fn);
    const second = flight.run("match-1", fn);
    reject(new Error("429"));

    await expect(first).rejects.toThrow("429");
    await expect(second).rejects.toThrow("429");
    expect(calls).toBe(1);
    // 실패한 작업도 키를 비워, 다음 요청은 다시 시도할 수 있어야 한다.
    expect(flight.size).toBe(0);
  });

  it("동기적으로 던지는 함수도 거부로 감싼다", async () => {
    const flight = new SingleFlight();
    const fn = () => {
      throw new Error("즉시 실패");
    };

    await expect(
      flight.run("match-1", fn as () => Promise<never>),
    ).rejects.toThrow("즉시 실패");
    expect(flight.size).toBe(0);
  });
});
