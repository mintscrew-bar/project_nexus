import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PostCategory } from "./community.types";
import { NotificationService } from "../notification/notification.service";
import { RedisService } from "../redis/redis.service";
import { UserRole } from "@nexus/database";

export interface CreatePostDto {
  title: string;
  content: string;
  category: PostCategory;
  tags?: string[]; // 태그명 배열 (소문자 정규화)
}

export interface UpdatePostDto {
  title?: string;
  content?: string;
  tags?: string[];
}

export interface CreateCommentDto {
  content: string;
  parentId?: string; // For nested comments
}

export interface CreatePostReportDto {
  reason: "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "MISINFORMATION" | "OTHER";
  description: string;
  postId?: string;
  commentId?: string;
}

// ============================================
// 금칙어 목록 (서버 자체 운영 정책)
// ============================================
const BANNED_WORDS = [
  "씨발",
  "개새끼",
  "병신",
  "지랄",
  "꺼져",
  "죽어",
  "닥쳐",
  "시발",
  "ㅅㅂ",
  "ㅂㅅ",
  "ㅈㄹ",
  "ㄲㅈ",
];

/** 금칙어 포함 여부 검사 */
function containsBannedWord(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some((word) => lower.includes(word));
}

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly redis: RedisService,
  ) {}

  // ========================================
  // Post Management
  // ========================================

  async createPost(userId: string, dto: CreatePostDto) {
    // 밴/임시제한 유저 글쓰기 차단
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isBanned: true,
        isRestricted: true,
        restrictedUntil: true,
      },
    });
    if (user?.isBanned) {
      throw new ForbiddenException(
        "이용 정지 상태에서는 게시글을 작성할 수 없습니다.",
      );
    }
    if (
      user?.isRestricted &&
      user.restrictedUntil &&
      user.restrictedUntil > new Date()
    ) {
      throw new ForbiddenException(
        "임시 제한 상태에서는 게시글을 작성할 수 없습니다.",
      );
    }
    if (
      dto.category === PostCategory.NOTICE &&
      user?.role !== UserRole.ADMIN &&
      user?.role !== UserRole.MODERATOR
    ) {
      throw new ForbiddenException(
        "공지 카테고리는 관리자 또는 매니저만 작성할 수 있습니다.",
      );
    }

    // Rate limit 체크 (10분에 3회 제한)
    const rateLimitKey = `post_ratelimit:${userId}`;
    const count = await this.redis.incr(rateLimitKey);
    if (count === 1) await this.redis.expire(rateLimitKey, 600);
    if (count > 3) {
      throw new HttpException(
        "잠시 후 다시 시도해주세요. (10분에 3회 제한)",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 금칙어 검사: 제목 + 내용 모두 검사
    if (containsBannedWord(dto.title) || containsBannedWord(dto.content)) {
      throw new BadRequestException(
        "금칙어가 포함된 게시글은 작성할 수 없습니다.",
      );
    }

    const post = await this.prisma.post.create({
      data: {
        title: dto.title.trim(),
        content: dto.content.trim(),
        category: dto.category,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            riotAccounts: {
              where: { isPrimary: true },
              select: { tier: true, rank: true },
            },
          },
        },
        tags: { include: { tag: true } },
      },
    });

    // 태그 처리: 태그명으로 upsert 후 연결
    if (dto.tags && dto.tags.length > 0) {
      await this.syncPostTags(post.id, dto.tags);
    }

    return post;
  }

  /**
   * 태그명 배열을 받아 Tag upsert + PostTag 연결 (동기화)
   * 기존 태그는 제거하고 새 태그로 교체
   */
  private async syncPostTags(postId: string, tagNames: string[]) {
    // 태그명 정규화: 소문자, 공백 제거, 특수문자 제거, 최대 20자
    const normalized = Array.from(
      new Set(
        tagNames
          .map((t) =>
            t
              .toLowerCase()
              .replace(/[^a-z0-9가-힣]/g, "")
              .slice(0, 20),
          )
          .filter((t) => t.length > 0),
      ),
    ).slice(0, 5); // 게시글당 태그 최대 5개

    // 기존 PostTag 삭제
    await this.prisma.postTag.deleteMany({ where: { postId } });

    if (normalized.length === 0) return;

    // Tag upsert (없으면 생성, 있으면 그대로)
    const tags = await Promise.all(
      normalized.map((name) =>
        this.prisma.tag.upsert({
          where: { name },
          create: { name },
          update: {},
        }),
      ),
    );

    // PostTag 연결
    await this.prisma.postTag.createMany({
      data: tags.map((tag) => ({ postId, tagId: tag.id })),
      skipDuplicates: true,
    });
  }

  async getPostById(
    postId: string,
    viewerId?: string,
    viewerIp?: string,
    isAdmin = false,
  ) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            riotAccounts: {
              where: { isPrimary: true },
              select: { tier: true, rank: true },
            },
          },
        },
        // 태그 포함
        tags: { include: { tag: true } },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
            _count: {
              select: { likes: true },
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
                _count: {
                  select: { likes: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          where: { parentId: null, isDeleted: false }, // Only top-level, non-deleted comments
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // 블라인드 처리된 게시글: 관리자가 아니면 내용/댓글 마스킹
    if (post.isBlinded && !isAdmin) {
      return {
        ...post,
        content:
          "[블라인드 처리된 게시글입니다. 신고에 의해 임시조치되었습니다.]",
        comments: post.comments.map((c: (typeof post.comments)[number]) => ({
          ...c,
          content: c.isBlinded ? "[블라인드 처리된 댓글입니다]" : c.content,
          replies: (c.replies || []).map((r: (typeof c.replies)[number]) => ({
            ...r,
            content: r.isBlinded ? "[블라인드 처리된 댓글입니다]" : r.content,
          })),
        })),
      };
    }

    // 블라인드되지 않은 게시글의 댓글 중 블라인드된 댓글만 마스킹
    const maskedPost = {
      ...post,
      comments: post.comments.map((c: (typeof post.comments)[number]) => ({
        ...c,
        content:
          c.isBlinded && !isAdmin ? "[블라인드 처리된 댓글입니다]" : c.content,
        replies: (c.replies || []).map((r: (typeof c.replies)[number]) => ({
          ...r,
          content:
            r.isBlinded && !isAdmin
              ? "[블라인드 처리된 댓글입니다]"
              : r.content,
        })),
      })),
    };

    // 조회수 중복 방지: 로그인 유저는 userId 기반, 비로그인은 IP 기반으로 24시간 내 중복 방지
    const viewKey = viewerId
      ? `view:user:${viewerId}:${postId}`
      : viewerIp
        ? `view:ip:${viewerIp}:${postId}`
        : null;

    if (viewKey) {
      const alreadyViewed = await this.redis.get(viewKey);
      if (!alreadyViewed) {
        // 24시간(86400초) TTL로 조회 기록 저장
        await this.redis.set(viewKey, "1", 86400);
        await this.prisma.post.update({
          where: { id: postId },
          data: { views: { increment: 1 } },
        });
      }
    } else {
      // viewKey가 없는 경우(IP도 없음)에는 무조건 카운트 증가
      await this.prisma.post.update({
        where: { id: postId },
        data: { views: { increment: 1 } },
      });
    }

    return maskedPost;
  }

  async listPosts(filters?: {
    category?: PostCategory;
    search?: string;
    authorId?: string;
    tag?: string; // 태그 필터
    limit?: number;
    offset?: number;
    sortBy?: "latest" | "popular" | "views" | "comments";
    isAdmin?: boolean; // 관리자 여부 (블라인드 마스킹 스킵)
  }) {
    const where: any = { isDeleted: false };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { content: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters?.authorId) {
      where.authorId = filters.authorId;
    }

    // 태그 필터: 해당 태그를 가진 게시글만 조회
    if (filters?.tag) {
      where.tags = {
        some: { tag: { name: filters.tag.toLowerCase() } },
      };
    }

    const getOrderBy = (): any[] => {
      switch (filters?.sortBy) {
        case "popular":
          return [{ isPinned: "desc" }, { likes: { _count: "desc" } }];
        case "views":
          return [{ isPinned: "desc" }, { views: "desc" }];
        case "comments":
          return [{ isPinned: "desc" }, { comments: { _count: "desc" } }];
        default:
          return [{ isPinned: "desc" }, { createdAt: "desc" }];
      }
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          _count: {
            select: { comments: true, likes: true },
          },
          tags: { include: { tag: true } },
        },
        orderBy: getOrderBy(),
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
      }),
      this.prisma.post.count({ where }),
    ]);

    // 블라인드 게시물: 관리자가 아니면 제목만 "[블라인드 처리된 게시글]"로 표시, 내용 숨김
    const isAdmin = filters?.isAdmin ?? false;
    const maskedPosts = posts.map((post: (typeof posts)[number]) => {
      if (post.isBlinded && !isAdmin) {
        return {
          ...post,
          title: "[블라인드 처리된 게시글]",
          content: "",
        };
      }
      return post;
    });

    return { posts: maskedPosts, total };
  }

  async updatePost(userId: string, postId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException("You can only edit your own posts");
    }

    // 금칙어 검사 (수정 시에도 적용)
    if (
      (dto.title && containsBannedWord(dto.title)) ||
      (dto.content && containsBannedWord(dto.content))
    ) {
      throw new BadRequestException(
        "금칙어가 포함된 게시글은 작성할 수 없습니다.",
      );
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        title: dto.title?.trim(),
        content: dto.content?.trim(),
        isEdited: true,
      },
    });

    // 태그 동기화: 배열이 전달된 경우에만 교체
    if (dto.tags !== undefined) {
      await this.syncPostTags(postId, dto.tags);
    }

    return updated;
  }

  /**
   * 인기 태그 조회 (게시글 수 기준 상위 N개)
   */
  async getPopularTags(limit = 20) {
    const tags = await this.prisma.tag.findMany({
      include: {
        _count: { select: { posts: true } },
      },
      orderBy: {
        posts: { _count: "desc" },
      },
      take: limit,
    });
    // 게시글이 1개 이상인 태그만 반환
    return tags
      .filter((t: (typeof tags)[number]) => t._count.posts > 0)
      .map((t: (typeof tags)[number]) => ({
        name: t.name,
        count: t._count.posts,
      }));
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException("You can only delete your own posts");
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { message: "Post deleted successfully" };
  }

  // ========================================
  // Comment Management
  // ========================================

  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    // 밴/임시제한 유저 댓글 작성 차단
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, isRestricted: true, restrictedUntil: true },
    });
    if (user?.isBanned) {
      throw new ForbiddenException(
        "이용 정지 상태에서는 댓글을 작성할 수 없습니다.",
      );
    }
    if (
      user?.isRestricted &&
      user.restrictedUntil &&
      user.restrictedUntil > new Date()
    ) {
      throw new ForbiddenException(
        "임시 제한 상태에서는 댓글을 작성할 수 없습니다.",
      );
    }

    // 금칙어 검사: 댓글 내용 검사
    if (containsBannedWord(dto.content)) {
      throw new BadRequestException(
        "금칙어가 포함된 댓글은 작성할 수 없습니다.",
      );
    }

    // Verify post exists and is not deleted
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // If parentId provided, verify parent comment exists and is not deleted
    let parentComment: {
      id: string;
      authorId: string;
      postId: string;
      isDeleted: boolean;
    } | null = null;
    if (dto.parentId) {
      parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });

      if (
        !parentComment ||
        parentComment.postId !== postId ||
        parentComment.isDeleted
      ) {
        throw new BadRequestException("Invalid parent comment");
      }
    }

    const comment = await this.prisma.comment.create({
      data: {
        content: dto.content.trim(),
        postId,
        authorId: userId,
        parentId: dto.parentId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    // Send notification to post author (if not commenting on own post)
    if (post.authorId !== userId) {
      await this.notificationService.notifyComment(
        post.authorId,
        comment.author.username,
        postId,
      );
    }

    // Send notification to parent comment author (if replying, and they're not the post author or replier)
    if (
      parentComment &&
      parentComment.authorId !== userId &&
      parentComment.authorId !== post.authorId
    ) {
      await this.notificationService.notifyReply(
        parentComment.authorId,
        comment.author.username,
        postId,
      );
    }

    return comment;
  }

  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("You can only edit your own comments");
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: {
        content: content.trim(),
        isEdited: true,
      },
    });
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("You can only delete your own comments");
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { message: "Comment deleted successfully" };
  }

  // ========================================
  // Like/Unlike System
  // ========================================

  async likePost(userId: string, postId: string) {
    // Verify post exists and is not deleted
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // Check if already liked
    const existingLike = await this.prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existingLike) {
      throw new ConflictException("Already liked this post");
    }

    await this.prisma.postLike.create({
      data: {
        userId,
        postId,
      },
    });

    // Get updated like count
    const likeCount = await this.prisma.postLike.count({
      where: { postId },
    });

    return { message: "Post liked", likeCount };
  }

  async unlikePost(userId: string, postId: string) {
    const existingLike = await this.prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (!existingLike) {
      throw new NotFoundException("You haven't liked this post");
    }

    await this.prisma.postLike.delete({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    // Get updated like count
    const likeCount = await this.prisma.postLike.count({
      where: { postId },
    });

    return { message: "Post unliked", likeCount };
  }

  async hasUserLikedPost(userId: string, postId: string): Promise<boolean> {
    const like = await this.prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    return !!like;
  }

  // ========================================
  // Comment Like/Unlike
  // ========================================

  async likeComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    const existingLike = await this.prisma.commentLike.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existingLike) {
      throw new ConflictException("Already liked this comment");
    }

    await this.prisma.commentLike.create({
      data: { userId, commentId },
    });

    const likeCount = await this.prisma.commentLike.count({
      where: { commentId },
    });
    return { message: "Comment liked", likeCount };
  }

  async unlikeComment(userId: string, commentId: string) {
    const existingLike = await this.prisma.commentLike.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (!existingLike) {
      throw new NotFoundException("You haven't liked this comment");
    }

    await this.prisma.commentLike.delete({
      where: { userId_commentId: { userId, commentId } },
    });

    const likeCount = await this.prisma.commentLike.count({
      where: { commentId },
    });
    return { message: "Comment unliked", likeCount };
  }

  async hasUserLikedComment(
    userId: string,
    commentId: string,
  ): Promise<boolean> {
    const like = await this.prisma.commentLike.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });
    return !!like;
  }

  async getCommentLikedStatus(
    userId: string,
    commentIds: string[],
  ): Promise<Record<string, boolean>> {
    if (commentIds.length === 0) return {};

    const likes = await this.prisma.commentLike.findMany({
      where: {
        userId,
        commentId: { in: commentIds },
      },
      select: { commentId: true },
    });

    const likedSet = new Set(
      likes.map((l: (typeof likes)[number]) => l.commentId),
    );
    return Object.fromEntries(commentIds.map((id) => [id, likedSet.has(id)]));
  }

  // ========================================
  // Bookmark
  // ========================================

  async bookmarkPost(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) throw new NotFoundException("Post not found");

    const existing = await this.prisma.postBookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) throw new ConflictException("Already bookmarked");

    await this.prisma.postBookmark.create({ data: { userId, postId } });
    return { bookmarked: true };
  }

  async unbookmarkPost(userId: string, postId: string) {
    const existing = await this.prisma.postBookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) throw new NotFoundException("Bookmark not found");

    await this.prisma.postBookmark.delete({
      where: { userId_postId: { userId, postId } },
    });
    return { bookmarked: false };
  }

  async hasUserBookmarkedPost(
    userId: string,
    postId: string,
  ): Promise<boolean> {
    const bm = await this.prisma.postBookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    return !!bm;
  }

  async getUserBookmarks(userId: string, limit = 20, offset = 0) {
    const [bookmarks, total] = await Promise.all([
      this.prisma.postBookmark.findMany({
        where: { userId, post: { isDeleted: false } },
        include: {
          post: {
            include: {
              author: { select: { id: true, username: true, avatar: true } },
              _count: { select: { comments: true, likes: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.postBookmark.count({
        where: { userId, post: { isDeleted: false } },
      }),
    ]);

    return {
      posts: bookmarks.map((b: (typeof bookmarks)[number]) => b.post),
      total,
    };
  }

  // ========================================
  // Pin/Unpin (Admin/Moderator only)
  // ========================================

  async pinPost(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { isPinned: true },
    });
  }

  async unpinPost(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { isPinned: false },
    });
  }

  // ========================================
  // Blind/Unblind (Admin/Moderator only)
  // ========================================

  /** 게시글 블라인드(임시조치) 처리 — 관리자 수동 */
  async blindPost(postId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) throw new NotFoundException("게시글을 찾을 수 없습니다.");
    await this.prisma.post.update({
      where: { id: postId },
      data: { isBlinded: true },
    });
  }

  /** 게시글 블라인드 해제 — 관리자 수동 */
  async unblindPost(postId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) throw new NotFoundException("게시글을 찾을 수 없습니다.");
    await this.prisma.post.update({
      where: { id: postId },
      data: { isBlinded: false },
    });
  }

  /** 댓글 블라인드(임시조치) 처리 — 관리자 수동 */
  async blindComment(commentId: string): Promise<void> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
    });
    if (!comment) throw new NotFoundException("댓글을 찾을 수 없습니다.");
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isBlinded: true },
    });
  }

  /** 댓글 블라인드 해제 — 관리자 수동 */
  async unblindComment(commentId: string): Promise<void> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
    });
    if (!comment) throw new NotFoundException("댓글을 찾을 수 없습니다.");
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isBlinded: false },
    });
  }

  // ========================================
  // Statistics
  // ========================================

  async getUserPostStats(userId: string) {
    const [postCount, commentCount, totalLikes] = await Promise.all([
      this.prisma.post.count({ where: { authorId: userId, isDeleted: false } }),
      this.prisma.comment.count({
        where: { authorId: userId, isDeleted: false },
      }),
      this.prisma.postLike.count({
        where: { post: { authorId: userId, isDeleted: false } },
      }),
    ]);

    return {
      postCount,
      commentCount,
      totalLikes,
    };
  }

  // ========================================
  // Report (Post / Comment)
  // ========================================

  async reportContent(userId: string, dto: CreatePostReportDto) {
    if (!dto.postId && !dto.commentId) {
      throw new BadRequestException("postId or commentId is required");
    }

    // Check if already reported
    const existing = await this.prisma.postReport.findFirst({
      where: {
        reporterId: userId,
        postId: dto.postId ?? null,
        commentId: dto.commentId ?? null,
      },
    });
    if (existing) {
      throw new ConflictException("Already reported");
    }

    const report = await this.prisma.postReport.create({
      data: {
        reporterId: userId,
        postId: dto.postId,
        commentId: dto.commentId,
        reason: dto.reason,
        description: dto.description,
      },
    });

    // 신고 누적 자동 블라인드: 해당 게시글/댓글의 신고 횟수가 3건 이상이면 자동 블라인드 처리
    // 자동 블라인드 임계값: 5명의 서로 다른 사용자 신고 필요 (조직적 악용 방지)
    const AUTO_BLIND_THRESHOLD = 5;

    if (dto.postId) {
      const reportCount = await this.prisma.postReport.count({
        where: { postId: dto.postId },
      });
      if (reportCount >= AUTO_BLIND_THRESHOLD) {
        // 아직 블라인드되지 않은 경우에만 업데이트
        await this.prisma.post.updateMany({
          where: { id: dto.postId, isBlinded: false, isDeleted: false },
          data: { isBlinded: true },
        });
      }
    }

    if (dto.commentId) {
      const reportCount = await this.prisma.postReport.count({
        where: { commentId: dto.commentId },
      });
      if (reportCount >= AUTO_BLIND_THRESHOLD) {
        // 아직 블라인드되지 않은 경우에만 업데이트
        await this.prisma.comment.updateMany({
          where: { id: dto.commentId, isBlinded: false, isDeleted: false },
          data: { isBlinded: true },
        });
      }
    }

    return report;
  }

  async getPostReports(params: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, limit = 20, offset = 0 } = params;
    const where = status ? { status: status as any } : {};

    const [reports, total] = await Promise.all([
      this.prisma.postReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true, avatar: true } },
          post: { select: { id: true, title: true } },
          comment: { select: { id: true, content: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.postReport.count({ where }),
    ]);

    return { reports, total };
  }

  async reviewPostReport(
    reportId: string,
    status: "APPROVED" | "REJECTED",
    reviewerNote?: string,
  ) {
    const report = await this.prisma.postReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException("Report not found");

    return this.prisma.postReport.update({
      where: { id: reportId },
      data: { status, reviewerNote, reviewedAt: new Date() },
    });
  }
}
