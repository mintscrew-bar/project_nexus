import { Logger } from "@nestjs/common";
import { DiscordAdminAlertService } from "./discord-admin-alert.service";

describe("DiscordAdminAlertService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not fail the main workflow when an admin alert is rejected", async () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === "ADMIN_ALERT_DISCORD_GUILD_ID") return "admin-guild";
        if (key === "ADMIN_ALERT_DISCORD_APPROVAL_CHANNEL_ID") {
          return "approval-channel";
        }
        return undefined;
      }),
    };
    const discordBotService = {
      sendNotification: jest
        .fn()
        .mockRejectedValue(new Error("Discord unavailable")),
    };
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new DiscordAdminAlertService(
      configService as any,
      discordBotService as any,
    );

    await expect(
      service.notifyDiscordGuildApprovalPending({
        linkId: "link-1",
        guildId: "guild-1",
        guildName: "내전 서버",
        ownerId: "user-1",
        status: "ACTIVE",
      }),
    ).resolves.toBeUndefined();
  });
});
