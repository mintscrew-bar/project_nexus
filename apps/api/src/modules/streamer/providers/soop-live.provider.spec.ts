import axios from "axios";
import { SoopLiveProvider } from "./soop-live.provider";

describe("SoopLiveProvider", () => {
  let provider: SoopLiveProvider;

  beforeEach(() => {
    jest.restoreAllMocks();
    provider = new SoopLiveProvider();
  });

  describe("fetchIdentity", () => {
    it("현재 방송국 API 응답에서 채널 정보와 프로필을 매핑한다", async () => {
      jest.spyOn(axios, "get").mockResolvedValue({
        data: {
          profile_image: "//profile.img.sooplive.com/LOGO/ec/ecvhao/ecvhao.jpg",
          station: {
            user_id: "ecvhao",
            user_nick: "테스트 스트리머",
            station_name: "테스트 방송국",
            station_title: "NEXUS-1234ABCD",
            upd: { fan_cnt: 321 },
          },
        },
      });

      await expect(provider.fetchIdentity("ecvhao")).resolves.toEqual({
        channelId: "ecvhao",
        channelName: "테스트 스트리머",
        channelImageUrl:
          "https://profile.img.sooplive.com/LOGO/ec/ecvhao/ecvhao.jpg",
        followerCount: 321,
        description: "NEXUS-1234ABCD 테스트 방송국",
      });
      expect(axios.get).toHaveBeenCalledWith(
        "https://chapi.sooplive.com/api/ecvhao/station",
        expect.any(Object),
      );
    });
  });

  describe("parseChannelId", () => {
    it("현재 SOOP 방송국 주소에서 채널 ID를 뽑는다", () => {
      expect(
        provider.parseChannelId("https://www.sooplive.com/station/ecvhao"),
      ).toBe("ecvhao");
    });

    it("방송국 주소에서 채널 ID를 뽑는다", () => {
      expect(provider.parseChannelId("https://ch.sooplive.co.kr/ecvhao")).toBe(
        "ecvhao",
      );
    });

    it("play 서브도메인에서도 뽑는다", () => {
      expect(
        provider.parseChannelId("https://play.sooplive.co.kr/ecvhao/123456"),
      ).toBe("ecvhao");
      expect(provider.parseChannelId("https://play.sooplive.com/ecvhao")).toBe(
        "ecvhao",
      );
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
        provider.parseChannelId("https://evilsooplive.com/station/ecvhao"),
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
