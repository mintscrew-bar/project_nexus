import { BadRequestException, ConflictException } from "@nestjs/common";
import { DiscordService } from "./discord.service";

describe("DiscordService", () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === "DISCORD_CLIENT_ID") return "discord-client";
      if (key === "DISCORD_CLIENT_SECRET") return "discord-secret";
      return undefined;
    }),
  };

  const service = new DiscordService(
    {} as any,
    {} as any,
    configService as any,
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exchanges an install code and returns the selected guild", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ guild: { id: "guild-1", name: "내전 서버" } }),
    } as Response);

    const result = await service.exchangeGuildInstallCode(
      "oauth-code",
      "https://api.nexus.test/api/discord/guild-link/callback",
    );

    expect(result.guild).toEqual({ id: "guild-1", name: "내전 서버" });
    const [, request] = fetchMock.mock.calls[0];
    const body = request?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("oauth-code");
    expect(body.get("client_secret")).toBe("discord-secret");
  });

  it("rejects a failed Discord code exchange", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false } as Response);

    await expect(
      service.exchangeGuildInstallCode(
        "invalid-code",
        "https://api.nexus.test/api/discord/guild-link/callback",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not transfer an active guild link to another Nexus account", async () => {
    const prisma = {
      discordGuildLink: {
        findUnique: jest.fn().mockResolvedValue({
          ownerId: "existing-owner",
          status: "ACTIVE",
        }),
        upsert: jest.fn(),
      },
    };
    const guardedService = new DiscordService(
      prisma as any,
      {} as any,
      configService as any,
    );

    await expect(
      guardedService.linkGuild("new-owner", "guild-1", "내전 서버"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.discordGuildLink.upsert).not.toHaveBeenCalled();
  });
});
