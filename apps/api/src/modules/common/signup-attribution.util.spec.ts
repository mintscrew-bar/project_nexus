import { parseAttributionCookie } from "./signup-attribution.util";

const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));

describe("parseAttributionCookie", () => {
  it("출처·매체·리퍼러를 읽는다", () => {
    expect(
      parseAttributionCookie(
        enc({ s: "youtube", m: "video", r: "youtube.com" }),
      ),
    ).toEqual({ source: "youtube", medium: "video", referrer: "youtube.com" });
  });

  it("매체와 리퍼러는 없어도 된다", () => {
    expect(parseAttributionCookie(enc({ s: "direct" }))).toEqual({
      source: "direct",
      medium: null,
      referrer: null,
    });
  });

  it("출처가 없으면 버린다", () => {
    expect(parseAttributionCookie(enc({ m: "x" }))).toBeNull();
    expect(parseAttributionCookie(enc({ s: "" }))).toBeNull();
  });

  it("대문자는 소문자로, 허용 밖 문자는 지운다 — 화면에 찍혀도 안전하게", () => {
    const r = parseAttributionCookie(enc({ s: "<Script>alert(1)</Script>" }));
    expect(r?.source).toBe("scriptalert1script");
    expect(parseAttributionCookie(enc({ s: "A B;C" }))?.source).toBe("abc");
  });

  it("너무 긴 값은 64자로 자르고, 쿠키 전체가 너무 크면 버린다", () => {
    expect(
      parseAttributionCookie(enc({ s: "a".repeat(200) }))?.source,
    ).toHaveLength(64);
    expect(parseAttributionCookie("x".repeat(600))).toBeNull();
  });

  it("깨졌거나 문자열이 아닌 값은 null", () => {
    expect(parseAttributionCookie("not-json")).toBeNull();
    expect(parseAttributionCookie("%E0%A4%A")).toBeNull();
    expect(parseAttributionCookie(undefined)).toBeNull();
    expect(parseAttributionCookie(123)).toBeNull();
    expect(parseAttributionCookie(enc(["a"]))).toBeNull();
    expect(parseAttributionCookie(enc({ s: 5 }))).toBeNull();
  });
});
