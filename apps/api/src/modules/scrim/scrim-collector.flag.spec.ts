import { ScrimCollectorService } from "./scrim-collector.service";
import type { PubgApiService } from "../pubg/pubg-api.service";

/**
 * 자동 수집 스위치.
 *
 * 극성을 opt-in 에서 opt-out 으로 뒤집었다(2026-09-05). 이런 플래그는 조용히
 * 꺼져 있어도 아무도 눈치채지 못해서, 기본값 자체를 테스트로 못박아 둔다.
 */
describe("ScrimCollectorService 스위치", () => {
  const makeConfig = (value?: string) =>
    ({ get: () => value }) as unknown as any;
  const apiWithKey = { isEnabled: true } as unknown as PubgApiService;
  const apiWithoutKey = { isEnabled: false } as unknown as PubgApiService;

  const make = (value: string | undefined, api = apiWithKey) =>
    new ScrimCollectorService({} as any, api, makeConfig(value), {} as any);

  it("설정이 없으면 켜진다 — 시크릿을 안 넣어도 동작해야 한다", () => {
    expect(make(undefined).isEnabled).toBe(true);
  });

  it("빈 문자열도 켜진 것으로 본다", () => {
    // GitHub Secrets 에 값이 없으면 배포 스크립트가 빈 문자열을 넣는다.
    expect(make("").isEnabled).toBe(true);
  });

  it('"false" 일 때만 꺼진다', () => {
    expect(make("false").isEnabled).toBe(false);
    expect(make("true").isEnabled).toBe(true);
  });

  it("PUBG 키가 없으면 설정과 무관하게 꺼진다", () => {
    // 키 없이 켜두면 호스트가 버튼을 눌렀을 때 그제서야 실패한다.
    expect(make("true", apiWithoutKey).isEnabled).toBe(false);
  });
});
