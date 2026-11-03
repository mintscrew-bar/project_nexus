import {
  DiscordAvatarRefreshService,
  discordAvatarUrl,
} from "./discord-avatar-refresh.service";

const OLD = "https://cdn.discordapp.com/avatars/111/oldhash.png";

describe("DiscordAvatarRefreshService", () => {
  const build = (status: number, newHash: string | null) => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "u1",
            avatar: OLD,
            authProviders: [{ providerId: "111" }],
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const usersFetch = jest.fn().mockResolvedValue({ avatar: newHash });
    const client = { isReady: () => true, users: { fetch: usersFetch } };
    const bot = { getClient: () => client };
    global.fetch = jest.fn().mockResolvedValue({ status }) as any;
    const service = new DiscordAvatarRefreshService(prisma as any, bot as any);
    return { service, prisma, usersFetch };
  };

  it("404 인 주소만 봇으로 새 해시를 받아 고친다", async () => {
    const { service, prisma, usersFetch } = build(404, "a_newhash");

    await expect(service.refreshStaleAvatars()).resolves.toBe(1);

    expect(usersFetch).toHaveBeenCalledWith("111", { force: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { avatar: "https://cdn.discordapp.com/avatars/111/a_newhash.gif" },
    });
  });

  it("살아 있는 주소나 일시 장애(5xx)는 건드리지 않는다", async () => {
    for (const status of [200, 503]) {
      const { service, prisma, usersFetch } = build(status, "x");
      await expect(service.refreshStaleAvatars()).resolves.toBe(0);
      expect(usersFetch).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    }
  });

  it("사진을 지운 사람은 null 로 비워 기본 이미지가 나오게 한다", async () => {
    const { service, prisma } = build(404, null);

    await service.refreshStaleAvatars();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { avatar: null },
    });
  });

  it("discordAvatarUrl 은 움짤 해시면 gif 를 쓴다", () => {
    expect(discordAvatarUrl("1", "abc")).toBe(
      "https://cdn.discordapp.com/avatars/1/abc.png",
    );
    expect(discordAvatarUrl("1", null)).toBeNull();
  });
});
