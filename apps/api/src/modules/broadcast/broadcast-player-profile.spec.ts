import { NotFoundException } from "@nestjs/common";
import { BroadcastService } from "./broadcast.service";

/**
 * 방송용 선수 프로필 — 토큰만으로 아무 유저나 조회하는 통로가 되면 안 된다.
 * 송출 중인 방의 참가자일 때만 돌려준다.
 */
describe("BroadcastService.getPlayerProfile", () => {
  const build = (participant: unknown) => {
    const prisma: any = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "streamer", broadcastLiveRoomId: null }),
      },
      room: { findFirst: jest.fn().mockResolvedValue({ id: "room-1" }) },
      roomParticipant: { findFirst: jest.fn().mockResolvedValue(participant) },
    };
    const userService: any = {
      getHoverProfile: jest.fn().mockResolvedValue({
        username: "선수",
        stats: { wins: 3, losses: 1, winRate: 75 },
        streamerLinks: [{ url: "https://x" }],
        streamerProfiles: [{ id: "p" }],
      }),
    };
    const service = new BroadcastService(
      prisma,
      {} as any,
      {} as any,
      userService,
    );
    return { service, prisma, userService };
  };

  it("송출 중인 방의 참가자면 프로필을 주고, 개인 링크는 뺀다", async () => {
    const { service, prisma, userService } = build({
      room: { gameTitle: "LOL" },
    });
    const profile = await service.getPlayerProfile("token", "player-1");

    expect(prisma.roomParticipant.findFirst).toHaveBeenCalledWith({
      where: { roomId: "room-1", userId: "player-1" },
      select: { room: { select: { gameTitle: true } } },
    });
    expect(userService.getHoverProfile).toHaveBeenCalledWith("player-1", "LOL");
    expect(profile).toEqual({
      username: "선수",
      stats: { wins: 3, losses: 1, winRate: 75 },
    });
  });

  it("방 참가자가 아니면 404", async () => {
    const { service, userService } = build(null);
    await expect(service.getPlayerProfile("token", "outsider")).rejects.toThrow(
      NotFoundException,
    );
    expect(userService.getHoverProfile).not.toHaveBeenCalled();
  });

  it("토큰이 틀리면 404", async () => {
    const { service, prisma } = build({ room: { gameTitle: "LOL" } });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getPlayerProfile("bad", "player-1")).rejects.toThrow(
      NotFoundException,
    );
  });
});
