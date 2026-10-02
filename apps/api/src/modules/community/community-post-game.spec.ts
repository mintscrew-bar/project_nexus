import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CommunityService } from "./community.service";
import { CreatePostDto } from "./dto/create-post.dto";

/**
 * 글 작성 시 게시판의 게임 검증 (2026-10-02 프로필·게임 문맥 개편 점검).
 * 게시판이 곧 게임을 결정하므로 필수 검증은 아니다 — 게임을 바꾼 뒤에도 열려 있던 오래된
 * 화면이 이전 게임의 게시판 ID 로 글을 올리는 것을 막는 안전망이다.
 */

function build(boardGame: "LOL" | "PUBG" | null) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        role: "USER",
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      }),
    },
  };
  const boardService = {
    assertCanWrite: jest
      .fn()
      .mockResolvedValue({ id: "board-1", slug: "free", gameTitle: boardGame }),
  };
  // 게임 검사를 통과하면 곧바로 작성 횟수 제한(incr)에 닿는다. 거기서 멈추게 해
  // "통과했는가"만 본다.
  const redis = {
    incr: jest.fn().mockRejectedValue(new Error("STOP-AFTER-GAME-CHECK")),
    expire: jest.fn(),
  };
  const service = new CommunityService(
    prisma as never,
    {} as never,
    redis as never,
    boardService as never,
    {} as never,
  );
  return { service, redis };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({
    title: "제목입니다",
    content: "내용입니다 내용",
    boardId: "board-1",
    ...over,
  }) as never;

describe("CommunityService.createPost 게임 검증", () => {
  it("다른 게임의 게시판이면 거부하고 작성 횟수 제한을 소모하지 않는다", async () => {
    const { service, redis } = build("LOL");

    await expect(
      service.createPost("user-1", dto({ gameTitle: "PUBG" })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("같은 게임의 게시판이면 통과한다", async () => {
    const { service, redis } = build("PUBG");

    await expect(
      service.createPost("user-1", dto({ gameTitle: "PUBG" })),
    ).rejects.toThrow("STOP-AFTER-GAME-CHECK");

    expect(redis.incr).toHaveBeenCalled();
  });

  it("공통 게시판(공지)은 어느 게임에서나 쓸 수 있다", async () => {
    const { service, redis } = build(null);

    await expect(
      service.createPost("user-1", dto({ gameTitle: "PUBG" })),
    ).rejects.toThrow("STOP-AFTER-GAME-CHECK");

    expect(redis.incr).toHaveBeenCalled();
  });

  it("게임을 보내지 않는 기존 클라이언트는 그대로 통과한다", async () => {
    const { service, redis } = build("PUBG");

    await expect(service.createPost("user-1", dto())).rejects.toThrow(
      "STOP-AFTER-GAME-CHECK",
    );

    expect(redis.incr).toHaveBeenCalled();
  });
});

describe("CreatePostDto gameTitle", () => {
  const valid = {
    title: "제목입니다",
    content: "내용입니다 내용",
    boardId: "board-1",
  };

  it("LOL·PUBG 와 생략을 허용한다", async () => {
    for (const gameTitle of ["LOL", "PUBG", undefined]) {
      const errors = await validate(
        plainToInstance(CreatePostDto, { ...valid, gameTitle }),
      );
      expect(errors).toHaveLength(0);
    }
  });

  it("알 수 없는 게임 값은 거부한다", async () => {
    const errors = await validate(
      plainToInstance(CreatePostDto, { ...valid, gameTitle: "STARCRAFT" }),
    );
    expect(errors.map((e) => e.property)).toContain("gameTitle");
  });
});
