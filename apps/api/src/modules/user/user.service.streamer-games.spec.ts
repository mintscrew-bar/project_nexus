import { NotFoundException } from "@nestjs/common";
import { UserService } from "./user.service";

/**
 * 스트리머 채널의 다루는 게임 변경 (2026-10-02 프로필·게임 문맥 개편 점검).
 * 연동하지 않은 플랫폼을 바꾸려 하면 Prisma P2025 가 그대로 올라와 500 이 됐다.
 */
describe("UserService.updateStreamerGames", () => {
  const build = (existing: { id: string } | null) => {
    const prisma = {
      streamerProfile: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: "p1", ...data })),
      },
    };
    const service = new UserService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  };

  it("연동한 채널의 게임을 바꾼다", async () => {
    const { service, prisma } = build({ id: "p1" });

    const result = await service.updateStreamerGames(
      "user-1",
      "CHZZK" as any,
      ["LOL", "PUBG"] as any,
    );

    expect(result).toMatchObject({ games: ["LOL", "PUBG"] });
    expect(prisma.streamerProfile.update).toHaveBeenCalledWith({
      where: { userId_platform: { userId: "user-1", platform: "CHZZK" } },
      data: { games: ["LOL", "PUBG"] },
    });
  });

  it("중복된 게임은 한 번만 저장한다", async () => {
    const { service, prisma } = build({ id: "p1" });

    await service.updateStreamerGames(
      "user-1",
      "CHZZK" as any,
      ["LOL", "LOL"] as any,
    );

    expect(prisma.streamerProfile.update.mock.calls[0][0].data.games).toEqual([
      "LOL",
    ]);
  });

  it("연동하지 않은 플랫폼이면 404 로 알리고 update 를 부르지 않는다", async () => {
    const { service, prisma } = build(null);

    await expect(
      service.updateStreamerGames("user-1", "SOOP" as any, ["PUBG"] as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.streamerProfile.update).not.toHaveBeenCalled();
  });
});
