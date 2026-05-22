import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { CommunityService } from "./community.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { RedisService } from "../redis/redis.service";
import { BoardService } from "../board/board.service";

describe("CommunityService", () => {
  let service: CommunityService;
  let prisma: any;
  let redis: any;
  let notification: any;
  let board: any;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      post: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      tag: { upsert: jest.fn() },
      postTag: { deleteMany: jest.fn(), createMany: jest.fn() },
      comment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      postReport: {
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
    };

    redis = {
      incr: jest.fn(),
      expire: jest.fn().mockResolvedValue(1),
    };

    notification = {
      notifyComment: jest.fn().mockResolvedValue(undefined),
      notifyReply: jest.fn().mockResolvedValue(undefined),
    };

    // 기본 게시판 mock — getBySlug/assertCanWrite 모두 활성 게시판 반환
    const defaultBoard = {
      id: "board-1",
      slug: "general",
      isActive: true,
      writeRole: null,
    };
    board = {
      getBySlug: jest.fn().mockResolvedValue(defaultBoard),
      assertCanWrite: jest.fn().mockResolvedValue(defaultBoard),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notification },
        { provide: RedisService, useValue: redis },
        { provide: BoardService, useValue: board },
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
  });

  // ============================================================
  // createPost
  // ============================================================
  describe("createPost", () => {
    const userId = "user-1";
    const baseDto = {
      title: "제목",
      content: "내용입니다",
      category: "GENERAL" as any,
    };

    it("밴된 유저는 ForbiddenException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: true,
        isRestricted: false,
        restrictedUntil: null,
      });

      await expect(service.createPost(userId, baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("임시 제한 중인 유저(restrictedUntil 미래)는 ForbiddenException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: true,
        restrictedUntil: new Date(Date.now() + 60_000), // 1분 후
      });

      await expect(service.createPost(userId, baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("임시 제한 기간이 이미 지난 유저는 통과한다 (rate limit 도달 전까지)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: true,
        restrictedUntil: new Date(Date.now() - 1000), // 이미 지남
      });
      redis.incr.mockResolvedValue(1); // 첫 번째 호출
      prisma.post.create.mockResolvedValue({
        id: "post-1",
        tags: [],
        author: {},
      });

      // 예외 없이 진행되어야 함
      await expect(service.createPost(userId, baseDto)).resolves.toBeDefined();
    });

    it("10분 3회 rate limit 초과 시 429 HttpException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      redis.incr.mockResolvedValue(4); // 4번째 요청 → 초과

      const error = await service.createPost(userId, baseDto).catch((e) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it("rate limit 첫 번째 호출이면 expire를 설정한다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      redis.incr.mockResolvedValue(1); // 첫 번째 요청
      prisma.post.create.mockResolvedValue({
        id: "post-1",
        tags: [],
        author: {},
      });

      await service.createPost(userId, baseDto);

      expect(redis.expire).toHaveBeenCalledWith(
        `post_ratelimit:${userId}`,
        600,
      );
    });

    it("제목에 금칙어가 포함되면 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      redis.incr.mockResolvedValue(1);

      const dto = { ...baseDto, title: "씨발 제목" };
      await expect(service.createPost(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("내용에 금칙어가 포함되면 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      redis.incr.mockResolvedValue(1);

      const dto = { ...baseDto, content: "이 게시글 병신같음" };
      await expect(service.createPost(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("정상 요청이면 게시글을 생성하고 반환한다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      redis.incr.mockResolvedValue(2);
      const createdPost = {
        id: "post-1",
        title: "제목",
        content: "내용",
        tags: [],
        author: { id: userId },
      };
      prisma.post.create.mockResolvedValue(createdPost);

      const result = await service.createPost(userId, baseDto);

      expect(prisma.post.create).toHaveBeenCalled();
      expect(result).toEqual(createdPost);
    });
  });

  // ============================================================
  // updatePost
  // ============================================================
  describe("updatePost", () => {
    const userId = "user-1";
    const postId = "post-1";

    it("게시글이 없으면 NotFoundException을 던진다", async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePost(userId, postId, { title: "새 제목" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("본인 게시글이 아니면 ForbiddenException을 던진다", async () => {
      prisma.post.findFirst.mockResolvedValue({
        id: postId,
        authorId: "other-user",
      });

      await expect(
        service.updatePost(userId, postId, { title: "새 제목" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("수정 제목에 금칙어가 포함되면 BadRequestException을 던진다", async () => {
      prisma.post.findFirst.mockResolvedValue({ id: postId, authorId: userId });

      await expect(
        service.updatePost(userId, postId, { title: "개새끼 제목" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("수정 내용에 금칙어가 포함되면 BadRequestException을 던진다", async () => {
      prisma.post.findFirst.mockResolvedValue({ id: postId, authorId: userId });

      await expect(
        service.updatePost(userId, postId, { content: "ㅅㅂ 내용" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("정상 수정이면 게시글을 업데이트하고 반환한다", async () => {
      prisma.post.findFirst.mockResolvedValue({ id: postId, authorId: userId });
      const updated = { id: postId, title: "새 제목", isEdited: true };
      prisma.post.update.mockResolvedValue(updated);

      const result = await service.updatePost(userId, postId, {
        title: "새 제목",
      });

      expect(prisma.post.update).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });
  });

  // ============================================================
  // createComment
  // ============================================================
  describe("createComment", () => {
    const userId = "user-1";
    const postId = "post-1";

    it("밴된 유저는 ForbiddenException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: true,
        isRestricted: false,
        restrictedUntil: null,
      });

      await expect(
        service.createComment(userId, postId, { content: "댓글" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("댓글 내용에 금칙어가 포함되면 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });

      await expect(
        service.createComment(userId, postId, { content: "지랄하네" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("게시글이 없으면 NotFoundException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      prisma.post.findFirst.mockResolvedValue(null);

      await expect(
        service.createComment(userId, postId, { content: "정상 댓글" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("유효하지 않은 parentId이면 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      prisma.post.findFirst.mockResolvedValue({
        id: postId,
        authorId: "author",
      });
      // parentId가 다른 게시글의 댓글
      prisma.comment.findUnique.mockResolvedValue({
        id: "parent-1",
        postId: "other-post",
        isDeleted: false,
        authorId: "other-user",
      });

      await expect(
        service.createComment(userId, postId, {
          content: "답글",
          parentId: "parent-1",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("정상 댓글이면 생성하고 게시글 작성자에게 알림을 보낸다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      prisma.post.findFirst.mockResolvedValue({
        id: postId,
        authorId: "post-author",
      });
      const createdComment = {
        id: "comment-1",
        content: "정상 댓글",
        author: { id: userId, username: "user1", avatar: null },
      };
      prisma.comment.create.mockResolvedValue(createdComment);

      const result = await service.createComment(userId, postId, {
        content: "정상 댓글",
      });

      expect(prisma.comment.create).toHaveBeenCalled();
      expect(notification.notifyComment).toHaveBeenCalledWith(
        "post-author",
        "user1",
        postId,
      );
      expect(result).toEqual(createdComment);
    });

    it("본인 게시글에 댓글 작성 시 알림을 보내지 않는다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBanned: false,
        isRestricted: false,
        restrictedUntil: null,
      });
      // 게시글 작성자 === 댓글 작성자
      prisma.post.findFirst.mockResolvedValue({ id: postId, authorId: userId });
      prisma.comment.create.mockResolvedValue({
        id: "comment-1",
        content: "본인 댓글",
        author: { id: userId, username: "user1", avatar: null },
      });

      await service.createComment(userId, postId, { content: "본인 댓글" });

      expect(notification.notifyComment).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // reportContent
  // ============================================================
  describe("reportContent", () => {
    const userId = "reporter-1";
    const baseReport = {
      reason: "SPAM" as const,
      description: "스팸입니다",
    };

    it("postId와 commentId가 모두 없으면 BadRequestException을 던진다", async () => {
      await expect(service.reportContent(userId, baseReport)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("이미 신고한 게시글은 ConflictException을 던진다", async () => {
      prisma.postReport.findFirst.mockResolvedValue({ id: "report-existing" });

      await expect(
        service.reportContent(userId, { ...baseReport, postId: "post-1" }),
      ).rejects.toThrow(ConflictException);
    });

    it("신고 수가 5개 미만이면 게시글을 블라인드하지 않는다", async () => {
      prisma.postReport.findFirst.mockResolvedValue(null);
      prisma.postReport.create.mockResolvedValue({ id: "report-1" });
      prisma.postReport.count.mockResolvedValue(4); // 4건 < 5건

      await service.reportContent(userId, { ...baseReport, postId: "post-1" });

      expect(prisma.post.updateMany).not.toHaveBeenCalled();
    });

    it("신고 수가 5개 이상이면 게시글을 자동 블라인드한다", async () => {
      prisma.postReport.findFirst.mockResolvedValue(null);
      prisma.postReport.create.mockResolvedValue({ id: "report-1" });
      prisma.postReport.count.mockResolvedValue(5); // 임계값 도달
      prisma.post.updateMany.mockResolvedValue({ count: 1 });

      await service.reportContent(userId, { ...baseReport, postId: "post-1" });

      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { id: "post-1", isBlinded: false, isDeleted: false },
        data: { isBlinded: true },
      });
    });

    it("신고 수가 5개 이상이면 댓글을 자동 블라인드한다", async () => {
      prisma.postReport.findFirst.mockResolvedValue(null);
      prisma.postReport.create.mockResolvedValue({ id: "report-1" });
      prisma.postReport.count.mockResolvedValue(6); // 임계값 초과
      prisma.comment.updateMany.mockResolvedValue({ count: 1 });

      await service.reportContent(userId, {
        ...baseReport,
        commentId: "comment-1",
      });

      expect(prisma.comment.updateMany).toHaveBeenCalledWith({
        where: { id: "comment-1", isBlinded: false, isDeleted: false },
        data: { isBlinded: true },
      });
    });
  });
});
