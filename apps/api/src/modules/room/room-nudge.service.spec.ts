import { RoomNudgeService } from "./room-nudge.service";

/**
 * 로비 호출. 시작을 막는 참가자에게 사이트 알림 + 디스코드 DM 을 같이 보낸다.
 */
describe("RoomNudgeService", () => {
  const player = (
    userId: string,
    username: string,
    isReady: boolean,
    discordId: string | null = `d-${userId}`,
  ) => ({
    userId,
    isReady,
    user: {
      username,
      authProviders: discordId ? [{ providerId: discordId }] : [],
    },
  });

  function setup(
    overrides: {
      hostId?: string;
      status?: string;
      participants?: ReturnType<typeof player>[];
      missingVoice?: string[];
      counter?: number;
      remainingMs?: number;
    } = {},
  ) {
    const room = {
      id: "room-1",
      name: "금요일 내전",
      gameTitle: "LOL",
      pubgPlatform: null,
      hostId: overrides.hostId ?? "host",
      status: overrides.status ?? "WAITING",
      discordGuildId: "guild-1",
      participants: overrides.participants ?? [
        player("host", "방장", false),
        player("u1", "철수", false),
        player("u2", "영희", true),
        player("b1", "testbot_01", false),
      ],
      discordChannels: [{ channelId: "voice-1" }],
    };
    const prisma = { room: { findUnique: jest.fn().mockResolvedValue(room) } };
    const redis = {
      incr: jest.fn().mockResolvedValue(overrides.counter ?? 1),
      expire: jest.fn().mockResolvedValue(undefined),
      pttl: jest.fn().mockResolvedValue(overrides.remainingMs ?? 0),
    };
    const notificationService = {
      create: jest.fn().mockResolvedValue({}),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === "APP_URL" ? "https://labs-nexus.com" : undefined,
      ),
    };
    const discordBot = {
      sendDirectMessages: jest.fn(
        async (ids: string[], _content: string) => ids.length,
      ),
    };
    const discordVoice = {
      validateVoicePresence: jest.fn().mockResolvedValue({
        valid: false,
        missingUsernames: overrides.missingVoice ?? [],
      }),
    };
    const service = new RoomNudgeService(
      prisma as any,
      redis as any,
      notificationService as any,
      config as any,
      discordBot,
      discordVoice,
    );
    return { service, redis, notificationService, discordBot, discordVoice };
  }

  it("준비 요청은 준비 안 한 선수에게 사이트 알림과 DM 을 같이 보낸다", async () => {
    const { service, notificationService, discordBot } = setup();

    const result = await service.nudge("host", "room-1", "READY");

    // 방장 자신과 테스트 봇은 부르지 않는다. 준비한 영희도 빠진다.
    expect(result).toEqual({
      targets: 1,
      siteNotified: 1,
      dmDelivered: 1,
      cooldownSeconds: 60,
    });
    const notice = notificationService.create.mock.calls[0][0];
    expect(notice).toMatchObject({
      userId: "u1",
      type: "SYSTEM",
      title: "준비 요청",
      link: "/lol/tournaments/room-1/lobby",
      data: { kind: "ROOM_NUDGE", roomId: "room-1", reason: "READY" },
    });
    expect(discordBot.sendDirectMessages).toHaveBeenCalledWith(
      ["d-u1"],
      expect.stringContaining(
        "로비: https://labs-nexus.com/lol/tournaments/room-1/lobby",
      ),
    );
  });

  it("대기실 호출은 준비 여부와 상관없이 대기실에 없는 선수를 부르고 채널 링크를 붙인다", async () => {
    const { service, discordVoice, notificationService, discordBot } = setup({
      missingVoice: ["철수", "영희"],
    });

    const result = await service.nudge("host", "room-1", "VOICE");

    expect(discordVoice.validateVoicePresence).toHaveBeenCalledWith("room-1", {
      includeNotReady: true,
    });
    expect(result.targets).toBe(2);
    expect(
      notificationService.create.mock.calls.map((call) => call[0].userId),
    ).toEqual(["u1", "u2"]);
    expect(discordBot.sendDirectMessages.mock.calls[0][1]).toContain(
      "대기실: https://discord.com/channels/guild-1/voice-1",
    );
  });

  it("디스코드 연동이 없는 사람도 사이트 알림은 받는다", async () => {
    const { service, notificationService, discordBot } = setup({
      participants: [
        player("host", "방장", true),
        player("u1", "철수", false, null),
      ],
    });

    const result = await service.nudge("host", "room-1", "READY");

    expect(notificationService.create).toHaveBeenCalledTimes(1);
    expect(discordBot.sendDirectMessages).not.toHaveBeenCalled();
    expect(result).toMatchObject({ siteNotified: 1, dmDelivered: 0 });
  });

  it("부를 사람이 없으면 아무것도 보내지 않고 쿨다운도 걸지 않는다", async () => {
    const { service, redis, notificationService } = setup({
      participants: [player("host", "방장", true), player("u1", "철수", true)],
    });

    const result = await service.nudge("host", "room-1", "READY");

    expect(result.targets).toBe(0);
    expect(redis.incr).not.toHaveBeenCalled();
    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it("쿨다운 중이면 남은 시간을 알려주고 보내지 않는다", async () => {
    const { service, notificationService } = setup({
      counter: 2,
      remainingMs: 41_200,
    });

    await expect(service.nudge("host", "room-1", "READY")).rejects.toThrow(
      "42초 뒤에 다시 부를 수 있습니다",
    );
    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it("방장이 아니면 거절한다", async () => {
    const { service } = setup();
    await expect(service.nudge("u1", "room-1", "READY")).rejects.toThrow(
      "방장만 참가자를 호출할 수 있습니다.",
    );
  });

  it("이미 시작된 방에서는 거절한다", async () => {
    const { service } = setup({ status: "DRAFT" });
    await expect(service.nudge("host", "room-1", "READY")).rejects.toThrow(
      "대기 중인 방에서만 호출할 수 있습니다.",
    );
  });
});
