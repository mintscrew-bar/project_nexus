import {
  ALERT_OFF_ID,
  ALERT_ON_ID,
  buildAlertOptInPanel,
  buildSetupDonePanel,
  buildSetupStartPanel,
  buildSetupStatusPanel,
  buildSetupStepPanel,
  needsFirstSetup,
  normalizeChannelName,
  parseSetupId,
  progressLine,
  setupId,
  setupProblems,
  type GuildSetupSnapshot,
  type SetupPanelPayload,
} from "./guild-setup-panel";
import { afterStep } from "./guild-setup";

/** 모두 정상인 서버 */
function snap(over: Partial<GuildSetupSnapshot> = {}): GuildSetupSnapshot {
  return {
    guildName: "테스트 서버",
    botAvatarUrl: "https://cdn.discordapp.com/avatars/1/a.png",
    linkActive: true,
    perms: { manageChannels: true, moveMembers: true, manageRoles: true },
    reinviteUrl: "https://discord.com/oauth2/authorize?client_id=1",
    announce: { channelId: "c1", exists: true, canPost: true },
    alertRole: { roleId: "r1", exists: true, assignable: true },
    crossGuild: true,
    clanLinked: false,
    hereChannelId: "c9",
    appUrl: "https://labs-nexus.com",
    ...over,
  };
}

/** 카드 안의 모든 글자와 customId 를 모은다 */
function collect(payload: SetupPanelPayload) {
  const texts: string[] = [];
  const ids: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.content === "string") texts.push(node.content);
    if (typeof node.custom_id === "string") ids.push(node.custom_id);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(payload.components[0].toJSON());
  return { text: texts.join("\n"), ids };
}

describe("guild-setup-panel", () => {
  it("customId 를 만들고 되읽는다", () => {
    expect(setupId("go", "w", "channel")).toBe("nx_setup:go:w:channel");
    expect(parseSetupId("nx_setup:go:w:channel")).toEqual({
      action: "go",
      mode: "w",
      arg: "channel",
    });
    expect(parseSetupId("nx_setup:here:f")).toEqual({
      action: "here",
      mode: "f",
      arg: null,
    });
    expect(parseSetupId("nx_setup:go:x")).toBeNull();
    expect(parseSetupId("other:go:w")).toBeNull();
  });

  it("채널 이름은 비우면 기본값, 앞뒤 공백은 지운다", () => {
    expect(normalizeChannelName("")).toBe("내전-모집");
    expect(normalizeChannelName("   ")).toBe("내전-모집");
    expect(normalizeChannelName(" 🎮┃내전 ")).toBe("🎮┃내전");
    expect(normalizeChannelName("가".repeat(150))).toHaveLength(100);
  });

  it("진행 표시 — 끝난 단계 ✅, 지금 단계 굵게", () => {
    expect(progressLine("channel")).toBe(
      "✅ 권한  ─  **❷ 공지 채널**  ─  ③ 알림  ─  ④ 마무리",
    );
    expect(progressLine("done")).toBe(
      "✅ 권한  ─  ✅ 공지 채널  ─  ✅ 알림  ─  ✅ 마무리",
    );
  });

  it("마법사는 다음 단계로, 마지막은 완료, 고치기는 상태 화면으로", () => {
    expect(afterStep("perm", "w")).toBe("channel");
    expect(afterStep("alert", "w")).toBe("finish");
    expect(afterStep("finish", "w")).toBe("done");
    expect(afterStep("channel", "f")).toBe("status");
  });

  describe("문제 찾기", () => {
    it("모두 정상이면 없음", () => {
      expect(setupProblems(snap())).toEqual([]);
    });

    it("권한·채널·역할 문제를 사람 말로", () => {
      const problems = setupProblems(
        snap({
          perms: {
            manageChannels: true,
            moveMembers: false,
            manageRoles: false,
          },
          announce: { channelId: "c1", exists: false, canPost: false },
          alertRole: { roleId: "r1", exists: true, assignable: false },
        }),
      );
      expect(problems.map((p) => p.item)).toEqual(["perm", "channel", "alert"]);
      expect(problems[0].reason).toBe("멤버 옮기기, 역할 관리 권한이 없어요");
      expect(problems[1].reason).toBe("공지 채널이 지워졌어요");
    });

    it("알림 역할을 안 정한 건 문제가 아니다(선택 항목)", () => {
      expect(
        setupProblems(
          snap({
            alertRole: { roleId: null, exists: false, assignable: false },
          }),
        ),
      ).toEqual([]);
    });

    it("공지 채널이 없으면 처음 설정", () => {
      expect(
        needsFirstSetup(
          snap({
            announce: { channelId: null, exists: false, canPost: false },
          }),
        ),
      ).toBe(true);
      expect(needsFirstSetup(snap())).toBe(false);
    });
  });

  describe("카드", () => {
    it("시작 카드 — 「설정 시작」 하나", () => {
      const { ids } = collect(buildSetupStartPanel(snap()));
      expect(ids).toEqual(["nx_setup:go:w:perm"]);
    });

    it("권한이 모자라면 다시 확인 + 이대로 다음", () => {
      const { text, ids } = collect(
        buildSetupStepPanel(
          snap({
            perms: {
              manageChannels: true,
              moveMembers: true,
              manageRoles: false,
            },
          }),
          "perm",
          "w",
        ),
      );
      expect(text).toContain("❌ 역할 관리");
      expect(ids).toEqual(["nx_setup:go:w:perm", "nx_setup:go:w:channel"]);
    });

    it("공지 채널 단계 — 새로 만들기·이 채널·목록, 채널 이름은 예시로", () => {
      const { text, ids } = collect(
        buildSetupStepPanel(snap(), "channel", "w"),
      );
      expect(text).toContain("예: 내전-모집");
      expect(text).toContain("❷ 공지 채널");
      expect(ids).toEqual(
        expect.arrayContaining([
          "nx_setup:new:w",
          "nx_setup:here:w",
          "nx_setup:pick:w",
          "nx_setup:go:w:perm", // ◀ 이전
        ]),
      );
    });

    it("이 채널에 글을 못 쓰면 「지금 이 채널」 을 뺀다", () => {
      const { ids } = collect(
        buildSetupStepPanel(snap({ hereChannelId: null }), "channel", "w"),
      );
      expect(ids).not.toContain("nx_setup:here:w");
    });

    it("고치기 모드는 진행 표시 대신 「설정 상태로」", () => {
      const { text, ids } = collect(buildSetupStepPanel(snap(), "alert", "f"));
      expect(text).not.toContain("❸");
      expect(ids).toContain("nx_setup:status:f");
      expect(ids).toContain("nx_setup:rpick:f");
    });

    it("상태 화면 — 문제 개수와 고치기 버튼", () => {
      const { text, ids } = collect(
        buildSetupStatusPanel(
          snap({ announce: { channelId: "c1", exists: true, canPost: false } }),
        ),
      );
      expect(text).toContain("고칠 곳이 1개 있어요");
      expect(text).toContain("공지 채널에 글을 쓸 권한이 없어요");
      expect(ids).toEqual(
        expect.arrayContaining([
          "nx_setup:go:f:channel",
          "nx_setup:cross:f:off",
          "nx_setup:status:f",
        ]),
      );
    });

    it("상태 화면 — 정상이면 모두 정상", () => {
      expect(collect(buildSetupStatusPanel(snap())).text).toContain(
        "모두 정상이에요",
      );
    });

    it("완료 카드 — 요약과 첫 내전 예시", () => {
      const { text } = collect(buildSetupDonePanel(snap()));
      expect(text).toContain("<#c1>");
      expect(text).toContain("/nexus schedule");
    });

    it("멤버 알림 카드 — 받기·끄기", () => {
      const { ids } = collect(buildAlertOptInPanel("r1"));
      expect(ids).toEqual([ALERT_ON_ID, ALERT_OFF_ID]);
    });

    it("customId 가 카드 안에서 겹치지 않는다(디스코드가 거절한다)", () => {
      const s = snap();
      const panels = [
        buildSetupStartPanel(s),
        ...(["perm", "channel", "alert", "finish"] as const).flatMap((st) => [
          buildSetupStepPanel(s, st, "w"),
          buildSetupStepPanel(s, st, "f"),
        ]),
        buildSetupDonePanel(s),
        buildSetupStatusPanel(s),
      ];
      for (const p of panels) {
        const { ids } = collect(p);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });
  });
});
