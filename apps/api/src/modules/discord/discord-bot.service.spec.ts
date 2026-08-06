import { DiscordBotService } from "./discord-bot.service";

describe("DiscordBotService room notification", () => {
  const config = {
    get: jest.fn((key: string) =>
      key === "APP_URL" ? "https://labs-nexus.com" : "",
    ),
  };
  const prisma = {
    room: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const eventEmitter = { emit: jest.fn() };
  const redis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  let service: DiscordBotService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscordBotService(
      config as any,
      prisma as any,
      eventEmitter as any,
      redis as any,
    );
  });

  it("룸과 음성채널 참가 버튼 및 현재 참가자 명단을 표시한다", () => {
    const { embed, components } = service.buildRoomCreatedEmbed(
      "room-1",
      "금요일 내전",
      "host",
      10,
      "SNAKE_DRAFT",
      false,
      ["host", "player"],
      { guildId: "guild-1", channelId: "voice-1" },
    );

    const fields = embed.toJSON().fields ?? [];
    expect(fields.find((field) => field.name === "인원")?.value).toBe("2 / 10");
    expect(fields.find((field) => field.name === "참가자")?.value).toContain(
      "host",
    );
    expect(fields.find((field) => field.name === "참가자")?.value).toContain(
      "player",
    );

    const buttons = components[0].toJSON().components as Array<{
      label?: string;
      url?: string;
    }>;
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "음성채널 참가",
          url: "https://discord.com/channels/guild-1/voice-1",
        }),
        expect.objectContaining({
          label: "룸 참가",
          url: "https://labs-nexus.com/tournaments/room-1/lobby",
        }),
      ]),
    );
  });

  it("40명 방의 참가자 명단을 세 개의 균형 잡힌 열로 표시한다", () => {
    const participants = Array.from(
      { length: 40 },
      (_, index) => `긴닉네임_${index}_${"가".repeat(24)}`,
    );
    const { embed } = service.buildRoomCreatedEmbed(
      "room-40",
      "40명 내전",
      "host",
      40,
      "AUTO_BALANCE",
      false,
      participants,
    );

    const participantFields = (embed.toJSON().fields ?? []).filter((field) =>
      field.name.startsWith("참가자"),
    );
    expect(participantFields).toHaveLength(3);
    expect(participantFields.map((field) => field.name)).toEqual([
      "참가자 1–14",
      "참가자 15–27",
      "참가자 28–40",
    ]);
    expect(participantFields.every((field) => field.inline)).toBe(true);
    expect(participantFields.every((field) => field.value.length <= 1024)).toBe(
      true,
    );
    expect(participantFields.map((field) => field.value).join("\n")).toContain(
      participants[39],
    );
    expect(embed.toJSON().footer?.text).toBe(
      "참가자 변경 시 자동으로 업데이트됩니다.",
    );
  });

  it("재시작 뒤 Redis에서 메시지 참조를 복구해 참가자를 갱신한다", async () => {
    redis.get.mockResolvedValueOnce(
      JSON.stringify({
        guildId: "guild-1",
        channelId: "text-1",
        messageId: "message-1",
        roomName: "금요일 내전",
        hostName: "host",
        maxPlayers: 10,
        teamMode: "SNAKE_DRAFT",
        isPrivate: false,
        voiceChannelId: "voice-1",
      }),
    );
    prisma.room.findUnique.mockResolvedValueOnce({
      name: "금요일 내전",
      maxParticipants: 10,
      teamMode: "SNAKE_DRAFT",
      isPrivate: false,
      host: { username: "host" },
      participants: [
        { user: { username: "host" } },
        { user: { username: "player" } },
      ],
      discordChannels: [{ channelId: "voice-1" }],
    });

    const edit = jest.fn().mockResolvedValue(undefined);
    const fetchMessage = jest.fn().mockResolvedValue({ edit });
    const channel = {
      isTextBased: () => true,
      messages: { fetch: fetchMessage },
    };
    (service as any).client = {
      guilds: {
        fetch: jest.fn().mockResolvedValue({
          channels: { fetch: jest.fn().mockResolvedValue(channel) },
        }),
      },
    };

    await service.updateRoomNotification("room-1");

    expect(redis.get).toHaveBeenCalledWith("discord:room-notification:room-1");
    expect(fetchMessage).toHaveBeenCalledWith("message-1");
    expect(edit).toHaveBeenCalledTimes(1);
    const payload = edit.mock.calls[0][0];
    const fields = payload.embeds[0].toJSON().fields ?? [];
    expect(fields.find((field: any) => field.name === "인원")?.value).toBe(
      "2 / 10",
    );
    expect(
      fields.find((field: any) => field.name === "참가자")?.value,
    ).toContain("player");
  });
});
