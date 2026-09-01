import { MessageFlags } from "discord.js";
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
  const emojiService = {
    ensureRecruitEmojis: jest.fn().mockResolvedValue({}),
  };

  let service: DiscordBotService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscordBotService(
      config as any,
      prisma as any,
      eventEmitter as any,
      redis as any,
      emojiService as any,
    );
  });

  /** V2 컨테이너에서 텍스트 조각만 순서대로 뽑는다 */
  const textOf = (container: any): string[] => {
    const out: string[] = [];
    const walk = (component: any) => {
      if (component.type === 10) out.push(component.content); // TextDisplay
      for (const child of component.components ?? []) walk(child);
      if (component.accessory) walk(component.accessory);
    };
    walk(container);
    return out;
  };

  /** V2 컨테이너 안의 모든 버튼 */
  const buttonsOf = (container: any): Array<{ label: string; url: string }> => {
    const out: Array<{ label: string; url: string }> = [];
    const walk = (component: any) => {
      if (component.type === 2) out.push(component); // Button
      for (const child of component.components ?? []) walk(child);
      if (component.accessory) walk(component.accessory);
    };
    walk(container);
    return out;
  };

  it("컨테이너 안에 참가 버튼과 참가자 명단을 담는다", () => {
    const payload = service.buildRoomRecruitMessage(
      "room-1",
      "금요일 내전",
      "host",
      10,
      "SNAKE_DRAFT",
      false,
      ["host", "player"],
      { guildId: "guild-1", channelId: "voice-1" },
    );

    // V2 메시지는 전용 플래그가 없으면 Discord 가 거부한다.
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);

    const container = payload.components[0].toJSON() as any;
    const text = textOf(container).join("\n");

    expect(text).toContain("## 금요일 내전");
    expect(text).toContain("스네이크 드래프트");
    expect(text).toContain("방장 **host**");
    expect(text).toContain("**2** / 10");
    expect(text).toContain("8자리 남음");
    expect(text).toContain("host");
    expect(text).toContain("player");

    // 버튼이 컨테이너 바깥이 아니라 안에 있어야 한다 (클래식 임베드와의 차이)
    const buttons = buttonsOf(container);
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
    // "룸 참가"는 헤더 액세서리 하나뿐이어야 한다 (하단 중복 금지)
    expect(buttons.filter((b) => b.label === "룸 참가")).toHaveLength(1);
  });

  it("커스텀 이모지가 있으면 게이지와 모드 아이콘에 사용한다", () => {
    const payload = service.buildRoomRecruitMessage(
      "room-1",
      "내전",
      "host",
      10,
      "AUCTION",
      false,
      ["host", "player"],
      undefined,
      {
        nx_pip_on: "<:nx_pip_on:111>",
        nx_pip_off: "<:nx_pip_off:222>",
        nx_mode_auction: "<:nx_mode_auction:333>",
      },
    );

    const text = textOf(payload.components[0].toJSON() as any).join("\n");
    expect(text).toContain("<:nx_mode_auction:333>");
    // 2/10 → 눈금 2칸이 켜지고 8칸이 꺼진다
    expect(text.match(/<:nx_pip_on:111>/g)).toHaveLength(2);
    expect(text.match(/<:nx_pip_off:222>/g)).toHaveLength(8);
  });

  it("이모지가 있으면 Link 버튼에 아이콘을 붙인다", () => {
    const payload = service.buildRoomRecruitMessage(
      "room-1",
      "내전",
      "host",
      10,
      "AUCTION",
      false,
      ["host"],
      { guildId: "guild-1", channelId: "voice-1" },
      {
        nx_btn_join: "<:nx_btn_join:777>",
        nx_btn_voice: "<:nx_btn_voice:888>",
      },
    );

    const buttons = buttonsOf(payload.components[0].toJSON() as any) as any[];
    const join = buttons.find((b) => b.label === "룸 참가");
    const voice = buttons.find((b) => b.label === "음성채널 참가");
    expect(join.emoji).toEqual({ id: "777", name: "nx_btn_join" });
    expect(voice.emoji).toEqual({ id: "888", name: "nx_btn_voice" });
  });

  it("이모지가 없으면 버튼은 라벨만 남는다", () => {
    const payload = service.buildRoomRecruitMessage(
      "room-1",
      "내전",
      "host",
      10,
      "AUCTION",
      false,
      ["host"],
      { guildId: "guild-1", channelId: "voice-1" },
    );

    const buttons = buttonsOf(payload.components[0].toJSON() as any) as any[];
    expect(buttons.every((b) => b.emoji === undefined)).toBe(true);
  });

  it("이모지가 없으면 유니코드 게이지로 폴백한다", () => {
    const payload = service.buildRoomRecruitMessage(
      "room-1",
      "내전",
      "host",
      10,
      "AUCTION",
      false,
      ["host"],
    );

    const text = textOf(payload.components[0].toJSON() as any).join("\n");
    expect(text).toMatch(/[▰▱]{10}/);
  });

  it("정원이 차면 액센트 색을 바꾸고 모집 완료로 표시한다", () => {
    const payload = service.buildRoomRecruitMessage(
      "room-1",
      "내전",
      "host",
      2,
      "AUCTION",
      false,
      ["a", "b"],
    );

    const container = payload.components[0].toJSON() as any;
    expect(container.accent_color).toBe(0x22c55e);
    expect(textOf(container).join("\n")).toContain("모집 완료");
  });

  it("비공개 방은 제목에 자물쇠를 붙인다", () => {
    const payload = service.buildRoomRecruitMessage(
      "room-1",
      "비밀 내전",
      "host",
      10,
      "AUCTION",
      true,
      [],
    );

    const text = textOf(payload.components[0].toJSON() as any).join("\n");
    expect(text).toContain("## 🔒 비밀 내전");
    expect(text).toContain("아직 참가자가 없습니다");
  });

  it("대규모 방은 세로 목록 대신 흐름 텍스트로 접는다", () => {
    const participants = Array.from({ length: 40 }, (_, i) => `참가자${i + 1}`);
    const payload = service.buildRoomRecruitMessage(
      "room-40",
      "40명 내전",
      "host",
      40,
      "AUTO_BALANCE",
      false,
      participants,
    );

    const text = textOf(payload.components[0].toJSON() as any).join("\n");
    expect(text).toContain("**참가자** 40명");
    expect(text).toContain("참가자1 · 참가자2");
    expect(text).toContain("참가자40");
    // 40줄짜리 세로 목록이 되면 안 된다
    expect(text.split("\n").length).toBeLessThan(15);
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
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    const text = textOf(payload.components[0].toJSON() as any).join("\n");
    expect(text).toContain("**2** / 10");
    expect(text).toContain("player");
  });
});

describe("DiscordBotService 공지 채널 지정", () => {
  const config = { get: jest.fn().mockReturnValue("") };
  const eventEmitter = { emit: jest.fn() };
  const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const emojiService = { ensureRecruitEmojis: jest.fn() };

  function build(opts: { canPost: boolean; link: { status: string } | null }) {
    const prisma = {
      discordGuildLink: {
        findUnique: jest.fn().mockResolvedValue(opts.link),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new DiscordBotService(
      config as any,
      prisma as any,
      eventEmitter as any,
      redis as any,
      emojiService as any,
    );
    const guild = {
      id: "guild-1",
      members: { me: {}, fetchMe: jest.fn() },
    };
    const channel = {
      id: "channel-1",
      permissionsFor: () => ({ has: () => opts.canPost }),
    };
    return { service, prisma, guild, channel };
  }

  it("봇이 글을 못 쓰는 채널은 저장하지 않는다", async () => {
    // 지정만 되고 실제로는 공지가 안 나가는 상태를 만들지 않는다.
    const { service, prisma, guild, channel } = build({
      canPost: false,
      link: { status: "ACTIVE" },
    });

    const message = await (service as any).applyAnnounceChannel(guild, channel);

    expect(message).toContain("권한이 없습니다");
    expect(prisma.discordGuildLink.update).not.toHaveBeenCalled();
  });

  it("연동되지 않은 서버는 저장하지 않는다", async () => {
    const { service, prisma, guild, channel } = build({
      canPost: true,
      link: null,
    });

    const message = await (service as any).applyAnnounceChannel(guild, channel);

    expect(message).toContain("연동되지 않았습니다");
    expect(prisma.discordGuildLink.update).not.toHaveBeenCalled();
  });

  it("권한과 연동이 모두 확인되면 저장한다", async () => {
    const { service, prisma, guild, channel } = build({
      canPost: true,
      link: { status: "ACTIVE" },
    });

    const message = await (service as any).applyAnnounceChannel(guild, channel);

    expect(prisma.discordGuildLink.update).toHaveBeenCalledWith({
      where: { guildId: "guild-1" },
      data: { announceChannelId: "channel-1" },
    });
    expect(message).toContain("지정했습니다");
  });

  it("아직 ACTIVE가 아니면 공지가 나가지 않는다고 알린다", async () => {
    const { service, guild, channel } = build({
      canPost: true,
      link: { status: "PENDING" },
    });

    const message = await (service as any).applyAnnounceChannel(guild, channel);

    expect(message).toContain("활성화");
  });

  it("안내 메시지에 이 채널로 지정 버튼이 포함된다", () => {
    const { service } = build({ canPost: true, link: { status: "ACTIVE" } });

    const notice = service.buildAnnounceSetupNotice();

    expect(notice.content).toContain("공지 채널을 지정해주세요");
    expect(notice.components).toHaveLength(1);
    expect(JSON.stringify(notice.components[0].toJSON())).toContain(
      "nexus_set_announce_here_button",
    );
  });
});
