import { validate } from "class-validator";
import { BoardService } from "../board/board.service";
import { CommunityService } from "./community.service";
import { StreamerService } from "../streamer/streamer.service";
import { GameScopeQueryDto } from "@/common/dto/game-scope.dto";
import { UpdateStreamerGamesDto } from "../user/dto/upsert-streamer-profile.dto";

describe("공유 섹션 게임 범위", () => {
  it("검색과 다른 게임의 게시판 ID를 같이 보내도 게임 범위가 사라지지 않는다", async () => {
    const prisma = {
      post: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new CommunityService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.listPosts({
      gameTitle: "PUBG",
      boardId: "lol-free",
      search: "내전",
    });
    const args = prisma.post.findMany.mock.calls[0][0];
    expect(args.where.AND).toEqual([
      { board: { is: { OR: [{ gameTitle: "PUBG" }, { gameTitle: null }] } } },
    ]);
    expect(args.where.boardId).toBe("lol-free");
    expect(args.where.OR).toHaveLength(2);
    expect(prisma.post.count).toHaveBeenCalledWith({ where: args.where });
  });

  it("게임 게시판과 공통 게시판만 노출한다", async () => {
    const prisma = { board: { findMany: jest.fn().mockResolvedValue([]) } };
    await new BoardService(prisma as never).listPublic("PUBG");
    expect(prisma.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ gameTitle: "PUBG" }, { gameTitle: null }],
          isActive: true,
          isHidden: false,
        }),
      }),
    );
  });

  it("스트리머 목록과 참가 가능한 방이 같은 게임으로 제한된다", async () => {
    const prisma = {
      streamerProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "host",
            user: { id: "host", username: "호스트", avatar: null },
            platform: "SOOP",
            channelUrl: "https://example.com",
            verifiedAt: new Date(),
            lastLiveAt: null,
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
    jest.spyOn(service, "getLiveStates").mockResolvedValue(new Map());
    await service.listStreamers(undefined, "PUBG");
    expect(prisma.streamerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ games: { has: "PUBG" } }),
      }),
    );
    expect(prisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ gameTitle: "PUBG" }),
      }),
    );
  });

  it("없는 게임과 빈 게임 선택을 검증한다", async () => {
    expect(
      await validate(
        Object.assign(new GameScopeQueryDto(), { gameTitle: "INVALID" }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        Object.assign(new UpdateStreamerGamesDto(), { games: [] }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        Object.assign(new UpdateStreamerGamesDto(), { games: ["LOL", "PUBG"] }),
      ),
    ).toHaveLength(0);
  });
});
