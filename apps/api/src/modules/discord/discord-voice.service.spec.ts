import { DiscordVoiceService } from "./discord-voice.service";

describe("DiscordVoiceService", () => {
  describe("handleTeamAssignment", () => {
    it("팀 이름이 채널 이름과 달라도 생성 순서대로 팀을 분리한다", async () => {
      const createdAt = new Date("2026-08-16T00:00:00.000Z");
      const prisma = {
        room: {
          findUnique: jest.fn().mockResolvedValue({
            id: "room-1",
            teams: [
              {
                id: "team-1",
                name: "Alpha 팀",
                createdAt,
                members: [{ id: "member-1" }],
              },
              {
                id: "team-2",
                name: "Bravo 팀",
                createdAt: new Date(createdAt.getTime() + 1),
                members: [{ id: "member-2" }],
              },
            ],
            discordChannels: [
              {
                channelId: "lobby",
                teamName: "Lobby",
                createdAt,
              },
              {
                channelId: "voice-1",
                teamName: "Team 1",
                createdAt: new Date(createdAt.getTime() + 1),
              },
              {
                channelId: "voice-2",
                teamName: "Team 2",
                createdAt: new Date(createdAt.getTime() + 2),
              },
            ],
          }),
        },
      };
      const config = { get: jest.fn() };
      const service = new DiscordVoiceService(config as any, prisma as any);
      const moveTeamToChannel = jest
        .spyOn(service as any, "moveTeamToChannel")
        .mockResolvedValue({ success: 1, failed: 0 });
      jest.spyOn(service as any, "delay").mockResolvedValue(undefined);

      await service.handleTeamAssignment("room-1");

      // 팀당 채널 하나면 배열 원소도 하나다.
      expect(moveTeamToChannel).toHaveBeenNthCalledWith(1, "team-1", [
        "voice-1",
      ]);
      expect(moveTeamToChannel).toHaveBeenNthCalledWith(2, "team-2", [
        "voice-2",
      ]);
    });

    it("깐부킬내기는 한 팀의 채널 두 개를 함께 넘긴다", async () => {
      // 8대8은 인게임에서 4인 스쿼드 둘로 갈라져 들어간다.
      // 팀당 채널 하나(8인)로 몰면 인게임 파티와 어긋난다.
      const createdAt = new Date("2026-09-07T00:00:00.000Z");
      const at = (offset: number) => new Date(createdAt.getTime() + offset);
      const prisma = {
        room: {
          findUnique: jest.fn().mockResolvedValue({
            id: "room-1",
            teams: [
              { id: "team-1", name: "A 팀", createdAt, members: [] },
              { id: "team-2", name: "B 팀", createdAt: at(1), members: [] },
            ],
            discordChannels: [
              { channelId: "lobby", teamName: "Lobby", createdAt },
              { channelId: "t1-a", teamName: "Team 1 A", createdAt: at(1) },
              { channelId: "t1-b", teamName: "Team 1 B", createdAt: at(2) },
              { channelId: "t2-a", teamName: "Team 2 A", createdAt: at(3) },
              { channelId: "t2-b", teamName: "Team 2 B", createdAt: at(4) },
            ],
          }),
        },
      };
      const service = new DiscordVoiceService(
        { get: jest.fn() } as any,
        prisma as any,
      );
      const moveTeamToChannel = jest
        .spyOn(service as any, "moveTeamToChannel")
        .mockResolvedValue({ success: 0, failed: 0 });
      jest.spyOn(service as any, "delay").mockResolvedValue(undefined);

      await service.handleTeamAssignment("room-1");

      expect(moveTeamToChannel).toHaveBeenNthCalledWith(1, "team-1", [
        "t1-a",
        "t1-b",
      ]);
      expect(moveTeamToChannel).toHaveBeenNthCalledWith(2, "team-2", [
        "t2-a",
        "t2-b",
      ]);
    });
  });

  describe("getRoomNotificationTarget", () => {
    const HOME = "home-guild";
    const EXTERNAL = "external-guild";

    function build(opts: {
      roomGuildId?: string | null;
      announceChannelId?: string | null;
      centralChannelId?: string | null;
      fallbackChannelId?: string | null;
    }) {
      const prisma = {
        room: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ discordGuildId: opts.roomGuildId ?? null }),
        },
        discordGuildLink: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              opts.announceChannelId === undefined
                ? null
                : { announceChannelId: opts.announceChannelId },
            ),
        },
      };
      const config = {
        get: jest.fn((key: string) => {
          if (key === "DISCORD_GUILD_ID") return HOME;
          if (key === "DISCORD_NOTIFICATION_CHANNEL_ID")
            return opts.centralChannelId ?? undefined;
          return undefined;
        }),
      };
      const service = new DiscordVoiceService(config as any, prisma as any);
      jest
        .spyOn(service as any, "resolveDefaultAnnounceChannel")
        .mockResolvedValue(opts.fallbackChannelId ?? null);
      return service;
    }

    it("길드가 지정한 공지 채널을 최우선으로 쓴다", async () => {
      const service = build({
        roomGuildId: EXTERNAL,
        announceChannelId: "announce-1",
        fallbackChannelId: "fallback-1",
      });

      await expect(
        service.getRoomNotificationTarget("room-1"),
      ).resolves.toEqual({ guildId: EXTERNAL, channelId: "announce-1" });
    });

    it("외부 길드는 홈 서버의 중앙 공지 채널을 쓰지 않는다", async () => {
      // 이전 구현은 홈 길드에만 중앙 채널을 허용하고 외부 길드는
      // 방 대기실(음성) 채널로 폴백해서 공지가 사라졌다.
      const service = build({
        roomGuildId: EXTERNAL,
        announceChannelId: null,
        centralChannelId: "central-home",
        fallbackChannelId: "fallback-1",
      });

      await expect(
        service.getRoomNotificationTarget("room-1"),
      ).resolves.toEqual({ guildId: EXTERNAL, channelId: "fallback-1" });
    });

    it("홈 길드는 기존 중앙 공지 채널 설정을 그대로 쓴다 (하위 호환)", async () => {
      const service = build({
        roomGuildId: null,
        announceChannelId: null,
        centralChannelId: "central-home",
        fallbackChannelId: "fallback-1",
      });

      await expect(
        service.getRoomNotificationTarget("room-1"),
      ).resolves.toEqual({ guildId: HOME, channelId: "central-home" });
    });

    it("지정 채널이 있으면 홈 길드에서도 그쪽을 우선한다", async () => {
      const service = build({
        roomGuildId: HOME,
        announceChannelId: "announce-home",
        centralChannelId: "central-home",
      });

      await expect(
        service.getRoomNotificationTarget("room-1"),
      ).resolves.toEqual({ guildId: HOME, channelId: "announce-home" });
    });

    it("보낼 채널을 못 찾으면 대기실로 폴백하지 않고 건너뛴다", async () => {
      // 대기실은 방 생성 직후 만들어지는 음성 채널이라 아무도 보지 않는다.
      // 그런 곳으로 보내느니 스킵하고 경고를 남기는 편이 낫다.
      const service = build({
        roomGuildId: EXTERNAL,
        announceChannelId: null,
        fallbackChannelId: null,
      });

      await expect(
        service.getRoomNotificationTarget("room-1"),
      ).resolves.toBeNull();
    });

    it("길드를 특정할 수 없으면 null", async () => {
      const prisma = {
        room: {
          findUnique: jest.fn().mockResolvedValue({ discordGuildId: null }),
        },
        discordGuildLink: { findUnique: jest.fn() },
      };
      const config = { get: jest.fn().mockReturnValue(undefined) };
      const service = new DiscordVoiceService(config as any, prisma as any);

      await expect(
        service.getRoomNotificationTarget("room-1"),
      ).resolves.toBeNull();
    });

    it("존재하지 않는 방이면 null", async () => {
      const prisma = {
        room: { findUnique: jest.fn().mockResolvedValue(null) },
        discordGuildLink: { findUnique: jest.fn() },
      };
      const config = { get: jest.fn().mockReturnValue("home-guild") };
      const service = new DiscordVoiceService(config as any, prisma as any);

      await expect(
        service.getRoomNotificationTarget("nope"),
      ).resolves.toBeNull();
    });
  });
});

describe("DiscordVoiceService.getRoomAnnounceTargets", () => {
  function build(opts: {
    room: { crossGuildAnnounce: boolean; isPrivate: boolean } | null;
    others?: Array<{
      guildId: string;
      guildName: string | null;
      announceChannelId: string;
    }>;
  }) {
    const prisma = {
      room: {
        findUnique: jest
          .fn()
          // getRoomNotificationTarget이 먼저 호출된다
          .mockResolvedValueOnce({ discordGuildId: "origin-guild" })
          .mockResolvedValue(opts.room),
      },
      discordGuildLink: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ announceChannelId: "origin-channel" }),
        findMany: jest.fn().mockResolvedValue(opts.others ?? []),
      },
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new DiscordVoiceService(config as any, prisma as any);
    return { service, prisma };
  }

  it("공개 방은 원 서버와 교차 수신 서버 모두에 공지한다", async () => {
    const { service } = build({
      room: { crossGuildAnnounce: true, isPrivate: false },
      others: [
        { guildId: "g2", guildName: "롤파크", announceChannelId: "c2" },
        { guildId: "g3", guildName: "내전내전", announceChannelId: "c3" },
      ],
    });

    const targets = await service.getRoomAnnounceTargets("room-1");

    expect(targets).toHaveLength(3);
    expect(targets[0]).toMatchObject({
      guildId: "origin-guild",
      isOrigin: true,
    });
    expect(targets.slice(1).map((t) => t.guildId)).toEqual(["g2", "g3"]);
    expect(targets[1].guildName).toBe("롤파크");
  });

  it("비공개 방은 호스트 설정과 무관하게 밖으로 내보내지 않는다", async () => {
    const { service } = build({
      room: { crossGuildAnnounce: true, isPrivate: true },
      others: [{ guildId: "g2", guildName: "롤파크", announceChannelId: "c2" }],
    });

    const targets = await service.getRoomAnnounceTargets("room-1");

    expect(targets).toHaveLength(1);
    expect(targets[0].isOrigin).toBe(true);
  });

  it("호스트가 교차 공지를 끄면 원 서버에만 올린다", async () => {
    const { service } = build({
      room: { crossGuildAnnounce: false, isPrivate: false },
      others: [{ guildId: "g2", guildName: "롤파크", announceChannelId: "c2" }],
    });

    const targets = await service.getRoomAnnounceTargets("room-1");

    expect(targets).toHaveLength(1);
  });

  it("타 서버는 공지 채널을 명시 지정한 곳에만 보낸다", async () => {
    // 자기 서버 내전도 아닌 글을 임의 채널에 떨구지 않기 위한 안전장치.
    const { service, prisma } = build({
      room: { crossGuildAnnounce: true, isPrivate: false },
      others: [],
    });

    await service.getRoomAnnounceTargets("room-1");

    expect(prisma.discordGuildLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          acceptsCrossGuildRooms: true,
          announceChannelId: { not: null },
          guildId: { not: "origin-guild" },
        }),
      }),
    );
  });
  describe("updateRoomChannels — 스쿼드 분할", () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");

    /** 팀당 스쿼드 2개인 깐부킬내기 방(2팀 = 채널 4개) */
    const splitSquadChannels = [
      { id: "row-1", channelId: "v1", teamName: "Team 1 A", createdAt },
      {
        id: "row-2",
        channelId: "v2",
        teamName: "Team 1 B",
        createdAt: new Date(createdAt.getTime() + 1),
      },
      {
        id: "row-3",
        channelId: "v3",
        teamName: "Team 2 A",
        createdAt: new Date(createdAt.getTime() + 2),
      },
      {
        id: "row-4",
        channelId: "v4",
        teamName: "Team 2 B",
        createdAt: new Date(createdAt.getTime() + 3),
      },
      {
        id: "row-0",
        channelId: "lobby",
        teamName: "Lobby",
        createdAt: new Date(createdAt.getTime() - 1),
      },
    ];

    const makeService = (channels: typeof splitSquadChannels) => {
      const deleted: string[] = [];
      const prisma: any = {
        room: {
          findUnique: jest.fn().mockResolvedValue({
            id: "room-1",
            discordCategoryId: "category-1",
            discordChannels: channels,
          }),
        },
        roomDiscordChannel: {
          create: jest.fn().mockResolvedValue({}),
          delete: jest.fn(async ({ where }: any) => {
            deleted.push(where.id);
            return {};
          }),
        },
      };
      const created: any[] = [];
      const guild = {
        channels: {
          fetch: jest.fn(async (id: string) => ({
            id,
            delete: jest.fn().mockResolvedValue(undefined),
          })),
          create: jest.fn(async (options: any) => {
            created.push(options);
            return { id: `new-${created.length}` };
          }),
        },
      };
      const service = new DiscordVoiceService(
        { get: jest.fn() } as any,
        prisma as any,
      );
      service.setClient({
        guilds: { fetch: jest.fn().mockResolvedValue(guild) },
      } as any);
      jest
        .spyOn(service as any, "resolveRoomGuildId")
        .mockResolvedValue("guild-1");
      jest.spyOn(service as any, "delay").mockResolvedValue(undefined);
      return { service, created, deleted };
    };

    it("팀이 줄면 스쿼드 단위로 지운다", async () => {
      // 채널 4개를 팀 4개로 착각하면 2팀으로 줄일 때 "1팀 A·B"만 남기고
      // 2팀을 통째로 날린다. 팀당 2채널이므로 지울 것은 2팀의 A·B 뿐이다.
      const { service, deleted } = makeService(splitSquadChannels);

      await service.updateRoomChannels("room-1", 2, {
        teamSize: 8,
        squadsPerTeam: 2,
      });

      expect(deleted).toEqual([]);
    });

    it("팀이 하나 줄면 그 팀의 스쿼드 채널만 지운다", async () => {
      const { service, deleted } = makeService(splitSquadChannels);

      await service.updateRoomChannels("room-1", 1, {
        teamSize: 8,
        squadsPerTeam: 2,
      });

      expect(deleted).toEqual(["row-3", "row-4"]);
    });

    it("팀이 늘면 스쿼드 수만큼 만들고 정원은 스쿼드 크기로 둔다", async () => {
      const { service, created } = makeService(splitSquadChannels);

      await service.updateRoomChannels("room-1", 3, {
        teamSize: 8,
        squadsPerTeam: 2,
      });

      expect(created.map((options) => options.name)).toEqual([
        "┊ 3팀 A",
        "┊ 3팀 B",
      ]);
      // 8대8은 4인 스쿼드 둘이라 채널 정원은 8이 아니라 4다.
      expect(created.every((options) => options.userLimit === 4)).toBe(true);
    });

    it("스쿼드가 하나면 예전 그대로 팀당 채널 하나", async () => {
      const single = [
        { id: "row-1", channelId: "v1", teamName: "Team 1", createdAt },
        {
          id: "row-2",
          channelId: "v2",
          teamName: "Team 2",
          createdAt: new Date(createdAt.getTime() + 1),
        },
      ];
      const { service, created, deleted } = makeService(single as any);

      await service.updateRoomChannels("room-1", 3, { teamSize: 5 });

      expect(created.map((options) => options.name)).toEqual(["┊ 3팀"]);
      expect(created[0].userLimit).toBe(5);
      expect(deleted).toEqual([]);
    });
  });
});
