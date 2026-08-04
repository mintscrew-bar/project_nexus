import { ChzzkLiveProvider } from "./chzzk-live.provider";

describe("ChzzkLiveProvider", () => {
  let provider: ChzzkLiveProvider;

  beforeEach(() => {
    provider = new ChzzkLiveProvider();
  });

  describe("parseChannelId", () => {
    const channelId = "2086f44c7b09a17cef6786f21389db3b";

    it("채널 홈 주소에서 채널 ID를 뽑는다", () => {
      expect(
        provider.parseChannelId(`https://chzzk.naver.com/${channelId}`),
      ).toBe(channelId);
    });

    it("라이브 주소에서도 채널 ID를 뽑는다", () => {
      expect(
        provider.parseChannelId(`https://chzzk.naver.com/live/${channelId}`),
      ).toBe(channelId);
    });

    it("앞뒤 공백을 허용한다", () => {
      expect(
        provider.parseChannelId(`  https://chzzk.naver.com/${channelId}  `),
      ).toBe(channelId);
    });

    it("채널 ID만 붙여넣어도 인식한다", () => {
      expect(provider.parseChannelId(channelId)).toBe(channelId);
    });

    it("다른 플랫폼 주소는 거부한다", () => {
      expect(
        provider.parseChannelId(`https://example.com/${channelId}`),
      ).toBeNull();
    });

    it("라벨 경계를 넘나드는 위장 도메인은 거부한다", () => {
      // "evilchzzk.naver.com"은 "chzzk.naver.com"으로 끝나지만
      // naver.com의 하위 도메인이 아니라 공격자가 별도로 등록 가능한 도메인이다.
      // endsWith만 쓰면 이런 케이스를 통과시킨다.
      expect(
        provider.parseChannelId(`https://evilchzzk.naver.com/${channelId}`),
      ).toBeNull();
    });

    it("접미사만 같고 경로가 다른 도메인은 거부한다", () => {
      expect(
        provider.parseChannelId(
          `https://chzzk.naver.com.attacker.com/${channelId}`,
        ),
      ).toBeNull();
    });

    it("채널 ID 형식이 아니면 거부한다", () => {
      expect(
        provider.parseChannelId("https://chzzk.naver.com/notahexid"),
      ).toBeNull();
    });

    it("URL이 아닌 문자열은 거부한다", () => {
      expect(provider.parseChannelId("그냥 텍스트")).toBeNull();
      expect(provider.parseChannelId("")).toBeNull();
    });
  });
});
