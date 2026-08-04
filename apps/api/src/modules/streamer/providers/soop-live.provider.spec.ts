import { SoopLiveProvider } from "./soop-live.provider";

describe("SoopLiveProvider", () => {
  let provider: SoopLiveProvider;

  beforeEach(() => {
    provider = new SoopLiveProvider();
  });

  describe("parseChannelId", () => {
    it("방송국 주소에서 채널 ID를 뽑는다", () => {
      expect(provider.parseChannelId("https://ch.sooplive.co.kr/ecvhao")).toBe(
        "ecvhao",
      );
    });

    it("play 서브도메인에서도 뽑는다", () => {
      expect(
        provider.parseChannelId("https://play.sooplive.co.kr/ecvhao/123456"),
      ).toBe("ecvhao");
    });

    it("구 afreecatv 도메인도 지원한다", () => {
      expect(provider.parseChannelId("https://bj.afreecatv.com/ecvhao")).toBe(
        "ecvhao",
      );
    });

    it("대문자 채널 ID를 소문자로 정규화한다", () => {
      expect(provider.parseChannelId("https://ch.sooplive.co.kr/ECVHAO")).toBe(
        "ecvhao",
      );
    });

    it("채널 ID만 붙여넣어도 인식한다", () => {
      expect(provider.parseChannelId("ecvhao")).toBe("ecvhao");
    });

    it("다른 플랫폼 주소는 거부한다", () => {
      expect(provider.parseChannelId("https://example.com/ecvhao")).toBeNull();
    });

    it("라벨 경계를 넘나드는 위장 도메인은 거부한다", () => {
      // "sooplive.co.kr"은 SLD.eTLD라서 "evilsooplive.co.kr"은 공격자가
      // .co.kr 아래 독립적으로 등록 가능한 완전히 별개의 도메인이다.
      // endsWith만 쓰면 이런 케이스를 통과시킨다.
      expect(
        provider.parseChannelId("https://evilsooplive.co.kr/ecvhao"),
      ).toBeNull();
      expect(
        provider.parseChannelId("https://evilafreecatv.com/ecvhao"),
      ).toBeNull();
    });

    it("채널 ID 형식이 아니면 거부한다", () => {
      expect(provider.parseChannelId("https://ch.sooplive.co.kr/a")).toBeNull();
      expect(
        provider.parseChannelId("https://ch.sooplive.co.kr/has-dash"),
      ).toBeNull();
    });

    it("URL이 아닌 문자열은 거부한다", () => {
      expect(provider.parseChannelId("그냥 텍스트")).toBeNull();
      expect(provider.parseChannelId("")).toBeNull();
    });
  });
});
