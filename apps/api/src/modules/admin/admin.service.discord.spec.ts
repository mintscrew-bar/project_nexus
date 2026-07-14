import { AdminService } from "./admin.service";

describe("AdminService Discord guild links", () => {
  it("repairs a missing guild name before returning the admin list", async () => {
    const prisma = {
      discordGuildLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "link-1",
            guildId: "guild-1",
            guildName: null,
            status: "ACTIVE",
            owner: { id: "user-1", username: "nexus-user", avatar: null },
            clan: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const discordBotService = {
      verifyGuildPermissions: jest.fn().mockResolvedValue({
        inGuild: true,
        hasManageChannels: true,
        hasMoveMembers: true,
        guildName: "복구된 Discord 서버",
      }),
    };
    const service = new AdminService(
      prisma as any,
      {} as any,
      discordBotService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.getDiscordGuildLinks();

    expect(prisma.discordGuildLink.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { guildName: "복구된 Discord 서버" },
    });
    expect(result[0].guildName).toBe("복구된 Discord 서버");
  });
});
