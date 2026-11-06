import {
  DEFAULT_BROADCAST_SETTINGS,
  normalizeBroadcastSettings,
} from "@nexus/types";

describe("normalizeBroadcastSettings (방송 커스터마이징 정규화)", () => {
  it("빈 값·옛 모양이면 기본값 전체를 돌려준다", () => {
    expect(normalizeBroadcastSettings(null)).toEqual(
      DEFAULT_BROADCAST_SETTINGS,
    );
    expect(normalizeBroadcastSettings("엉뚱한 값")).toEqual(
      DEFAULT_BROADCAST_SETTINGS,
    );
  });

  it("올바른 값은 지키고, 일부만 와도 나머지는 기본값으로 채운다", () => {
    const result = normalizeBroadcastSettings({
      colors: { accent: "#ff00aa" },
      font: "display",
      background: { type: "aurora", intensity: 70 },
      sfx: { enabled: true },
    });
    expect(result.colors).toEqual({ accent: "#FF00AA", blue: null, red: null });
    expect(result.font).toBe("display");
    expect(result.background).toEqual({ type: "aurora", intensity: 70 });
    expect(result.sfx).toEqual({ enabled: true, volume: 60 });
    expect(result.show).toEqual(DEFAULT_BROADCAST_SETTINGS.show);
  });

  it("허용하지 않는 값은 기본값으로 돌린다", () => {
    const result = normalizeBroadcastSettings({
      colors: { accent: "red; background:url(x)" },
      preset: "neon",
      scale: 9,
      background: { type: "video", intensity: -5 },
      transition: { style: "spin" },
      nameDisplay: "email",
    });
    expect(result.colors.accent).toBeNull();
    expect(result.preset).toBe("default");
    expect(result.scale).toBe(1.2);
    expect(result.background).toEqual({ type: "transparent", intensity: 0 });
    expect(result.transition.style).toBe("wipe");
    expect(result.nameDisplay).toBe("nickname");
  });

  it("로고는 https 주소나 같은 사이트 경로만 받는다", () => {
    expect(
      normalizeBroadcastSettings({ logoUrl: "https://cdn.example.com/a.webp" })
        .logoUrl,
    ).toBe("https://cdn.example.com/a.webp");
    expect(
      normalizeBroadcastSettings({ logoUrl: "/uploads/a.webp" }).logoUrl,
    ).toBe("/uploads/a.webp");
    for (const bad of ["javascript:alert(1)", "//evil.com/a.png", "http://x"]) {
      expect(normalizeBroadcastSettings({ logoUrl: bad }).logoUrl).toBeNull();
    }
  });

  it("문구는 앞뒤 공백을 자르고 길이를 제한하며, 빈 문자열은 기본값(null)", () => {
    const result = normalizeBroadcastSettings({
      title: "  금요 내전  ",
      subtitle: "",
      idle: { title: "가".repeat(100) },
    });
    expect(result.title).toBe("금요 내전");
    expect(result.subtitle).toBeNull();
    expect(result.idle.title).toHaveLength(40);
  });
});
