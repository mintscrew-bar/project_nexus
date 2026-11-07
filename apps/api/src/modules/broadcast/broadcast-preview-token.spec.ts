import {
  broadcastStreamerWhere,
  createPreviewToken,
  hashBroadcastToken,
  verifyPreviewToken,
} from "./broadcast-resolve.util";

describe("조작 패널 미리보기 토큰", () => {
  const original = process.env.JWT_ACCESS_SECRET;
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.JWT_ACCESS_SECRET = original;
  });

  it("발급한 토큰은 만료 전까지 본인 userId 로 풀린다", () => {
    const now = 1_000_000;
    const issued = createPreviewToken("user-1", now, 60_000)!;
    expect(issued.token.startsWith("pv_")).toBe(true);
    expect(verifyPreviewToken(issued.token, now + 59_000)).toBe("user-1");
    expect(verifyPreviewToken(issued.token, now + 60_000)).toBeNull();
  });

  it("다른 유저로 바꿔 끼운 본문이나 틀린 서명은 거부한다", () => {
    const issued = createPreviewToken("user-1")!;
    const [, sig] = issued.token.slice(3).split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ u: "user-2", e: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(verifyPreviewToken(`pv_${forgedBody}.${sig}`)).toBeNull();
    expect(verifyPreviewToken(`${issued.token}x`)).toBeNull();
    expect(verifyPreviewToken("pv_garbage")).toBeNull();
  });

  it("다른 비밀키로 서명된 토큰은 거부한다", () => {
    const issued = createPreviewToken("user-1")!;
    process.env.JWT_ACCESS_SECRET = "other-secret";
    expect(verifyPreviewToken(issued.token)).toBeNull();
  });

  it("방송인 조회 조건 — 미리보기는 id, OBS 토큰은 해시, 위조 미리보기는 아무와도 안 맞음", () => {
    const issued = createPreviewToken("user-1")!;
    expect(broadcastStreamerWhere(issued.token)).toEqual({ id: "user-1" });
    expect(broadcastStreamerWhere("obs-token")).toEqual({
      broadcastTokenHash: hashBroadcastToken("obs-token"),
    });
    expect(broadcastStreamerWhere("pv_forged.sig")).toEqual({ id: "" });
  });
});
