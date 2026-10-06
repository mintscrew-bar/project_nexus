import { buildSignupAttribution } from "@nexus/types";

const own = "nexus.example";

describe("buildSignupAttribution", () => {
  it("utm_source 가 있으면 그게 출처다", () => {
    expect(
      buildSignupAttribution({
        search: "?utm_source=Streamer&utm_medium=live",
        referrer: "https://www.youtube.com/watch?v=abc&q=secret",
        ownHost: own,
      }),
    ).toEqual({ s: "Streamer", m: "live", r: "youtube.com" });
  });

  it("UTM 이 없으면 외부 리퍼러 호스트가 출처다", () => {
    expect(
      buildSignupAttribution({
        search: "",
        referrer: "https://www.google.com/search?q=내전",
        ownHost: own,
      }),
    ).toEqual({ s: "google.com", r: "google.com" });
  });

  it("리퍼러는 호스트만 남긴다 — 경로·쿼리의 검색어를 저장하지 않는다", () => {
    const r = buildSignupAttribution({
      search: "",
      referrer: "https://cafe.naver.com/some/private/path?token=abc",
      ownHost: own,
    });
    expect(JSON.stringify(r)).not.toMatch(/private|token/);
  });

  it("자기 사이트에서 온 이동이나 리퍼러가 없으면 direct", () => {
    expect(
      buildSignupAttribution({
        search: "",
        referrer: "https://nexus.example/rooms",
        ownHost: own,
      }),
    ).toEqual({ s: "direct" });
    expect(
      buildSignupAttribution({ search: "", referrer: "", ownHost: own }),
    ).toEqual({ s: "direct" });
  });

  it("www 유무는 같은 사이트로 본다", () => {
    expect(
      buildSignupAttribution({
        search: "",
        referrer: "https://www.nexus.example/",
        ownHost: own,
      }),
    ).toEqual({ s: "direct" });
  });

  it("깨진 리퍼러는 direct 로 처리한다", () => {
    expect(
      buildSignupAttribution({
        search: "",
        referrer: "not a url",
        ownHost: own,
      }),
    ).toEqual({ s: "direct" });
  });

  it("빈 utm_source 는 무시한다", () => {
    expect(
      buildSignupAttribution({
        search: "?utm_source=%20&utm_medium=",
        referrer: "",
        ownHost: own,
      }),
    ).toEqual({ s: "direct" });
  });
});
