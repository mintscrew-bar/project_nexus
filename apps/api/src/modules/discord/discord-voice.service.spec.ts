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
});
