import { RoomNudgeService } from "./room-nudge.service";

/**
 * 시작을 막는 참가자 부르기.
 * - alertBlockers: 방장이 시작을 누르면 막고 있는 사람 화면에 확인 모달(소켓)
 * - nudge: 방장 모달의 요청 버튼 → 디스코드 DM
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
      status?: string;
      participants?: ReturnType<typeof player>[];
      missingVoice?: string[];
      counter?: number;
      remainingMs?: number;
      /** 사이트에 접속해 있지 않은 사람(소켓 0개) */
      offline?: string[];
    } = {},
  ) {
    const room = {
      id: "room-1",
      name: "금요일 내전",
      gameTitle: "LOL",
      pubgPlatform: null,
      hostId: "host",
      status: overrides.status ?? "WAITING",
      discordGuildId: "guild-1",
      host: { username: "방장" },
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
      del: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === "APP_URL" ? "https://labs-nexus.com" : undefined,
      ),
    };
    const offline = new Set(overrides.offline ?? []);
    const roomGateway = {
      sendStartAlert: jest.fn((userId: string, _payload: unknown) =>
        offline.has(userId) ? 0 : 1,
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
      config as any,
      roomGateway as any,
      discordBot,
      discordVoice,
    );
    return { service, redis, roomGateway, discordBot, discordVoice };
  }

  describe("alertBlockers — 시작 누르면 확인 모달", () => {
    it("막고 있는 사람마다 풀어야 할 조건을 모아 한 번에 띄운다", async () => {
      const { service, roomGateway, discordVoice } = setup({
        missingVoice: ["철수", "영희"],
      });

      const result = await service.alertBlockers("host", "room-1");

      expect(discordVoice.validateVoicePresence).toHaveBeenCalledWith(
        "room-1",
        { includeNotReady: true },
      );
      // 방장 자신과 테스트 봇은 빠진다
      expect(result.alerted).toEqual(["철수", "영희"]);
      const byUser = Object.fromEntries(
        roomGateway.sendStartAlert.mock.calls.map(([userId, payload]) => [
          userId,
          payload,
        ]),
      );
      // 철수는 준비도 안 하고 대기실에도 없다 → 둘 다
      expect(byUser.u1).toMatchObject({
        roomName: "금요일 내전",
        hostName: "방장",
        lobbyPath: "/lol/tournaments/room-1/lobby",
        voiceUrl: "https://discord.com/channels/guild-1/voice-1",
        items: ["READY", "VOICE"],
      });
      // 영희는 준비했지만 대기실에 없다
      expect((byUser.u2 as any).items).toEqual(["VOICE"]);
    });

    it("막는 게 없는 사람에게는 띄우지 않는다", async () => {
      const { service, roomGateway } = setup({ missingVoice: [] });

      const result = await service.alertBlockers("host", "room-1");

      expect(result.alerted).toEqual(["철수"]);
      expect(roomGateway.sendStartAlert).toHaveBeenCalledTimes(1);
    });

    it("1분 안에 받은 사람은 건너뛴다 — 방장이 연타해도 모달이 쌓이지 않는다", async () => {
      const { service, roomGateway } = setup({
        counter: 2,
        remainingMs: 30_000,
      });

      const result = await service.alertBlockers("host", "room-1");

      expect(result.recentlyAlerted).toEqual(["철수"]);
      expect(roomGateway.sendStartAlert).not.toHaveBeenCalled();
    });

    it("사이트에 없는 사람은 알려주고, 돌아오면 다시 받게 쿨다운을 푼다", async () => {
      const { service, redis } = setup({ offline: ["u1"] });

      const result = await service.alertBlockers("host", "room-1");

      expect(result.offline).toEqual(["철수"]);
      expect(result.alerted).toEqual([]);
      expect(redis.del).toHaveBeenCalledWith("room-start-alert:room-1:u1");
    });

    it("방장이 아니거나 이미 시작된 방이면 거절한다", async () => {
      await expect(
        setup().service.alertBlockers("u1", "room-1"),
      ).rejects.toThrow("방장만 참가자를 호출할 수 있습니다.");
      await expect(
        setup({ status: "DRAFT" }).service.alertBlockers("host", "room-1"),
      ).rejects.toThrow("대기 중인 방에서만 호출할 수 있습니다.");
    });
  });

  describe("nudge — 디스코드 DM", () => {
    it("준비 요청은 준비 안 한 선수에게 DM 을 보낸다", async () => {
      const { service, discordBot } = setup();

      const result = await service.nudge("host", "room-1", "READY");

      expect(result).toEqual({
        targets: 1,
        dmDelivered: 1,
        cooldownSeconds: 60,
      });
      expect(discordBot.sendDirectMessages).toHaveBeenCalledWith(
        ["d-u1"],
        expect.stringContaining(
          "로비: https://labs-nexus.com/lol/tournaments/room-1/lobby",
        ),
      );
    });

    it("대기실 요청에는 채널 링크를 붙인다", async () => {
      const { service, discordBot } = setup({ missingVoice: ["철수", "영희"] });

      const result = await service.nudge("host", "room-1", "VOICE");

      expect(result.targets).toBe(2);
      expect(discordBot.sendDirectMessages.mock.calls[0][1]).toContain(
        "대기실: https://discord.com/channels/guild-1/voice-1",
      );
    });

    it("부를 사람이 없으면 보내지 않고 쿨다운도 걸지 않는다", async () => {
      const { service, redis, discordBot } = setup({
        participants: [
          player("host", "방장", true),
          player("u1", "철수", true),
        ],
      });

      const result = await service.nudge("host", "room-1", "READY");

      expect(result.targets).toBe(0);
      expect(redis.incr).not.toHaveBeenCalled();
      expect(discordBot.sendDirectMessages).not.toHaveBeenCalled();
    });

    it("쿨다운 중이면 남은 시간을 알려준다", async () => {
      const { service, discordBot } = setup({
        counter: 2,
        remainingMs: 41_200,
      });

      await expect(service.nudge("host", "room-1", "READY")).rejects.toThrow(
        "42초 뒤에 다시 부를 수 있습니다",
      );
      expect(discordBot.sendDirectMessages).not.toHaveBeenCalled();
    });
  });
});
