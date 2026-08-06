import {
  DiscordInviteStatsService,
  extractDiscordInviteCode,
} from "./discord-invite-stats.service";

describe("extractDiscordInviteCode", () => {
  it.each([
    ["https://discord.gg/nexus", "nexus"],
    ["https://www.discord.gg/nexus-123", "nexus-123"],
    ["https://discord.com/invite/nexus_123", "nexus_123"],
    ["https://discordapp.com/invite/nexus?utm_source=test", "nexus"],
  ])("extracts a code from %s", (url, expected) => {
    expect(extractDiscordInviteCode(url)).toBe(expected);
  });

  it.each([
    "http://discord.gg/nexus",
    "https://example.com/invite/nexus",
    "https://discord.com/channels/123/456",
    "not-a-url",
  ])("rejects unsupported URL %s", (url) => {
    expect(extractDiscordInviteCode(url)).toBeNull();
  });
});

describe("DiscordInviteStatsService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns and caches public approximate counts", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        guild: { id: "guild-1", name: "Nexus" },
        approximate_member_count: 1284,
        approximate_presence_count: 173,
      }),
    });
    global.fetch = fetchMock as typeof fetch;
    const service = new DiscordInviteStatsService();

    const first = await service.getStats("https://discord.gg/nexus");
    const second = await service.getStats("https://discord.com/invite/nexus");

    expect(first).toMatchObject({
      available: true,
      guildId: "guild-1",
      guildName: "Nexus",
      memberCount: 1284,
      onlineCount: 173,
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not request unsupported URLs", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const service = new DiscordInviteStatsService();

    await expect(
      service.getStats("https://example.com/invite/nexus"),
    ).resolves.toMatchObject({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
