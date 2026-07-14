import { DiscordController } from "./discord.controller";

describe("DiscordController", () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === "APP_URL") return "https://nexus.test";
      if (key === "DISCORD_CALLBACK_URL") {
        return "https://api.nexus.test/api/auth/discord/callback";
      }
      if (key === "DISCORD_CLIENT_ID") return "discord-client";
      if (key === "DISCORD_CLIENT_SECRET") return "discord-secret";
      if (key === "DISCORD_GUILD_ID") return "home-guild";
      return undefined;
    }),
  };
  const authService = {
    generateLinkToken: jest.fn(),
    verifyLinkToken: jest.fn(),
  };
  const discordService = {
    getGuildLinksForUser: jest.fn(),
    updateGuildName: jest.fn(),
    exchangeGuildInstallCode: jest.fn(),
    linkGuild: jest.fn(),
  };
  const discordBotService = {
    verifyGuildPermissions: jest.fn(),
    hasGuild: jest.fn().mockReturnValue(false),
  };
  const adminAlerts = {
    notifyDiscordGuildApprovalPending: jest.fn(),
  };

  let controller: DiscordController;

  beforeEach(() => {
    jest.clearAllMocks();
    discordBotService.hasGuild.mockReturnValue(false);
    controller = new DiscordController(
      configService as any,
      authService as any,
      discordService as any,
      discordBotService as any,
      adminAlerts as any,
    );
  });

  it("creates a complete Discord guild install authorization URL", async () => {
    authService.generateLinkToken.mockResolvedValue("state-token");

    const result = await controller.getInstallUrl("user-1");
    const url = new URL(result.url);

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("integration_type")).toBe("0");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "bot",
        "applications.commands",
        "identify",
        "guilds",
      ]),
    );
    expect(url.searchParams.get("state")).toBe("state-token");
  });

  it("OAuth callback stores the verified Discord guild name", async () => {
    authService.verifyLinkToken.mockResolvedValue("user-1");
    discordService.exchangeGuildInstallCode.mockResolvedValue({
      guild: { id: "guild-1", name: "내전 서버" },
      manageableGuilds: [],
    });
    discordBotService.verifyGuildPermissions.mockResolvedValue({
      inGuild: true,
      hasManageChannels: true,
      hasMoveMembers: true,
      guildName: "내전 서버",
    });
    discordService.linkGuild.mockResolvedValue({
      id: "link-1",
      guildId: "guild-1",
      guildName: "내전 서버",
      ownerId: "user-1",
      owner: { username: "nexus-user" },
      status: "ACTIVE",
    });
    const response = { redirect: jest.fn() };

    await controller.guildLinkCallback(
      "oauth-code",
      "state-token",
      response as any,
    );

    expect(discordService.exchangeGuildInstallCode).toHaveBeenCalledWith(
      "oauth-code",
      "https://api.nexus.test/api/discord/guild-link/callback",
    );
    expect(discordService.linkGuild).toHaveBeenCalledWith(
      "user-1",
      "guild-1",
      "내전 서버",
    );
    expect(response.redirect).toHaveBeenCalledWith(
      "https://nexus.test/settings?discord_guild=active",
    );
  });

  it("OAuth callback rejects an install without required permissions", async () => {
    authService.verifyLinkToken.mockResolvedValue("user-1");
    discordService.exchangeGuildInstallCode.mockResolvedValue({
      guild: { id: "guild-1", name: "권한 없는 서버" },
      manageableGuilds: [],
    });
    discordBotService.verifyGuildPermissions.mockResolvedValue({
      inGuild: true,
      hasManageChannels: false,
      hasMoveMembers: true,
      guildName: "권한 없는 서버",
    });
    const response = { redirect: jest.fn() };

    await controller.guildLinkCallback(
      "oauth-code",
      "state-token",
      response as any,
    );

    expect(discordService.linkGuild).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(
      "https://nexus.test/settings?discord_guild=error",
    );
  });

  it("refreshes a missing guild name when linked guilds are loaded", async () => {
    const storedGuild = {
      guildId: "guild-1",
      guildName: null,
      status: "ACTIVE",
      activatedAt: new Date(),
      createdAt: new Date(),
    };
    discordService.getGuildLinksForUser.mockResolvedValue([storedGuild]);
    discordBotService.verifyGuildPermissions.mockResolvedValue({
      inGuild: true,
      hasManageChannels: true,
      hasMoveMembers: true,
      guildName: "복구된 서버 이름",
    });

    const result = await controller.getMyGuildLinks("user-1");

    expect(discordService.updateGuildName).toHaveBeenCalledWith(
      "guild-1",
      "복구된 서버 이름",
    );
    expect(result.guilds[0].guildName).toBe("복구된 서버 이름");
  });

  it("links manageable servers where the bot is already installed", async () => {
    authService.verifyLinkToken.mockResolvedValue("user-1");
    discordService.exchangeGuildInstallCode.mockResolvedValue({
      guild: { id: "guild-1", name: "새로 선택한 서버" },
      manageableGuilds: [
        { id: "guild-1", name: "새로 선택한 서버" },
        { id: "guild-2", name: "기존 봇 서버" },
      ],
    });
    discordBotService.hasGuild.mockImplementation(
      (guildId: string) => guildId === "guild-2",
    );
    discordBotService.verifyGuildPermissions.mockImplementation(
      async (guildId: string) => ({
        inGuild: true,
        hasManageChannels: true,
        hasMoveMembers: true,
        guildName: guildId === "guild-1" ? "새로 선택한 서버" : "기존 봇 서버",
      }),
    );
    discordService.linkGuild.mockImplementation(
      async (ownerId: string, guildId: string, guildName: string) => ({
        id: `link-${guildId}`,
        guildId,
        guildName,
        ownerId,
        owner: { username: "nexus-user" },
        status: "ACTIVE",
      }),
    );
    const response = { redirect: jest.fn() };

    await controller.guildLinkCallback(
      "oauth-code",
      "state-token",
      response as any,
    );

    expect(discordService.linkGuild).toHaveBeenCalledWith(
      "user-1",
      "guild-1",
      "새로 선택한 서버",
    );
    expect(discordService.linkGuild).toHaveBeenCalledWith(
      "user-1",
      "guild-2",
      "기존 봇 서버",
    );
  });
});
