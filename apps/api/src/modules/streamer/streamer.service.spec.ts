import { StreamerPlatform } from "@nexus/database";
import { StreamerService } from "./streamer.service";

describe("StreamerService", () => {
  describe("listStreamers", () => {
    it("groups simulcast channels by user and selects the busiest live channel", async () => {
      const prisma = {
        streamerProfile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "chzzk-profile",
              userId: "user-1",
              platform: StreamerPlatform.CHZZK,
              channelId: "chzzk-id",
              channelUrl: "https://chzzk.example/user-1",
              channelName: "CHZZK channel",
              channelImageUrl: null,
              followerCount: 10,
              verifiedAt: new Date(),
              lastLiveAt: new Date("2026-08-15T00:00:00Z"),
              createdAt: new Date("2026-08-01T00:00:00Z"),
              user: { id: "user-1", username: "streamer", avatar: null },
            },
            {
              id: "soop-profile",
              userId: "user-1",
              platform: StreamerPlatform.SOOP,
              channelId: "soop-id",
              channelUrl: "https://soop.example/user-1",
              channelName: "SOOP channel",
              channelImageUrl: null,
              followerCount: 20,
              verifiedAt: new Date(),
              lastLiveAt: new Date("2026-08-16T00:00:00Z"),
              createdAt: new Date("2026-08-02T00:00:00Z"),
              user: { id: "user-1", username: "streamer", avatar: null },
            },
          ]),
        },
        room: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new StreamerService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      jest.spyOn(service, "getLiveStates").mockResolvedValue(
        new Map([
          [
            `${StreamerPlatform.CHZZK}:chzzk-id`,
            {
              isLive: true,
              viewerCount: 30,
              checkedAt: "2026-08-16T00:00:00Z",
            },
          ],
          [
            `${StreamerPlatform.SOOP}:soop-id`,
            {
              isLive: true,
              viewerCount: 80,
              checkedAt: "2026-08-16T00:00:00Z",
            },
          ],
        ]),
      );

      const result = await service.listStreamers();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        userId: "user-1",
        platform: StreamerPlatform.SOOP,
        channelName: "SOOP channel",
        live: { isLive: true, viewerCount: 80 },
      });
      expect(result[0].channels).toHaveLength(2);
      expect(result[0].channels.map((channel) => channel.platform)).toEqual([
        StreamerPlatform.SOOP,
        StreamerPlatform.CHZZK,
      ]);
    });
  });
});
