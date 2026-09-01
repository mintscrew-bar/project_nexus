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

      expect(moveTeamToChannel).toHaveBeenNthCalledWith(1, "team-1", "voice-1");
      expect(moveTeamToChannel).toHaveBeenNthCalledWith(2, "team-2", "voice-2");
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
