import { makeAdminService } from "./__tests__/make-admin-service";

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
    const service = makeAdminService({ prisma, discordBot: discordBotService });

    const result = await service.getDiscordGuildLinks();

    expect(prisma.discordGuildLink.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { guildName: "복구된 Discord 서버" },
    });
    expect(result[0].guildName).toBe("복구된 Discord 서버");
  });

  describe("봇 연동 승인 시 신청자 알림", () => {
    function setup(notify: jest.Mock) {
      const prisma = {
        discordGuildLink: {
          findUnique: jest.fn().mockResolvedValue({
            id: "link-1",
            guildId: "guild-1",
            guildName: "옛 이름",
            owner: { id: "owner-1", username: "신청자" },
          }),
          update: jest
            .fn()
            .mockResolvedValue({ id: "link-1", status: "ACTIVE" }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ username: "관리자" }),
        },
        adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const discordBot = {
        verifyGuildPermissions: jest.fn().mockResolvedValue({
          inGuild: true,
          hasManageChannels: true,
          hasMoveMembers: true,
          guildName: "새 이름",
        }),
      };
      const service = makeAdminService({
        prisma,
        discordBot,
        adminAlerts: { notifyDiscordGuildPermissionFailure: jest.fn() },
        notificationService: { create: notify },
      });
      return { service, prisma };
    }

    it("승인되면 신청자에게 최신 서버 이름으로 알림을 보낸다", async () => {
      const notify = jest.fn().mockResolvedValue({});
      const { service } = setup(notify);

      await service.approveDiscordGuildLink("link-1", "admin-1");

      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "owner-1",
          type: "SYSTEM",
          title: "디스코드 봇 승인 완료",
          message: expect.stringContaining("'새 이름'"),
          link: "/settings",
        }),
      );
    });

    it("알림이 실패해도 승인은 그대로 끝난다", async () => {
      const notify = jest.fn().mockRejectedValue(new Error("db down"));
      const { service, prisma } = setup(notify);

      await expect(
        service.approveDiscordGuildLink("link-1", "admin-1"),
      ).resolves.toMatchObject({ status: "ACTIVE" });
      expect(prisma.discordGuildLink.update).toHaveBeenCalled();
    });
  });
});
