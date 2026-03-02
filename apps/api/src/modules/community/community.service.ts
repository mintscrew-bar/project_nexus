import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PostCategory } from "./community.types";
import { NotificationService } from "../notification/notification.service";

export interface CreatePostDto {
  title: string;
  content: string;
  category: PostCategory;
}

export interface UpdatePostDto {
  title?: string;
  content?: string;
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

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ========================================
  // Post Management
  // ========================================

  async createPost(userId: string, dto: CreatePostDto) {
    // Validate title and content
    if (!dto.title || dto.title.trim().length === 0) {
      throw new BadRequestException("Title cannot be empty");
    }

    if (dto.title.length > 200) {
      throw new BadRequestException("Title too long (max 200 characters)");
    }

    if (!dto.content || dto.content.trim().length === 0) {
      throw new BadRequestException("Content cannot be empty");
    }

    if (dto.content.length > 10000) {
      throw new BadRequestException("Content too long (max 10000 characters)");
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
              select: {
                tier: true,
                rank: true,
              },
            },
          },
        },
      },
    });

    return post;
  }

  async getPostById(postId: string) {
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
              select: {
                tier: true,
                rank: true,
              },
            },
          },
        },
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

    // Increment view count
    await this.prisma.post.update({
      where: { id: postId },
      data: { views: { increment: 1 } },
    });

    return post;
  }

  async listPosts(filters?: {
    category?: PostCategory;
    search?: string;
    authorId?: string;
    limit?: number;
    offset?: number;
    sortBy?: "latest" | "popular" | "views" | "comments";
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
            select: {
              comments: true,
              likes: true,
            },
          },
        },
        orderBy: getOrderBy(),
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
      }),
      this.prisma.post.count({ where }),
    ]);

    return { posts, total };
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

    // Validate if provided
    if (dto.title !== undefined) {
      if (!dto.title || dto.title.trim().length === 0) {
        throw new BadRequestException("Title cannot be empty");
      }
      if (dto.title.length > 200) {
        throw new BadRequestException("Title too long (max 200 characters)");
      }
    }

    if (dto.content !== undefined) {
      if (!dto.content || dto.content.trim().length === 0) {
        throw new BadRequestException("Content cannot be empty");
      }
      if (dto.content.length > 10000) {
        throw new BadRequestException(
          "Content too long (max 10000 characters)",
        );
      }
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        title: dto.title?.trim(),
        content: dto.content?.trim(),
        isEdited: true,
      },
    });
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
    // Validate content
    if (!dto.content || dto.content.trim().length === 0) {
      throw new BadRequestException("Comment cannot be empty");
    }

    if (dto.content.length > 1000) {
      throw new BadRequestException("Comment too long (max 1000 characters)");
    }

    // Verify post exists and is not deleted
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // If parentId provided, verify parent comment exists and is not deleted
    let parentComment: { id: string; authorId: string; postId: string; isDeleted: boolean } | null = null;
    if (dto.parentId) {
      parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });

      if (!parentComment || parentComment.postId !== postId || parentComment.isDeleted) {
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
    if (parentComment && parentComment.authorId !== userId && parentComment.authorId !== post.authorId) {
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

    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Comment cannot be empty");
    }

    if (content.length > 1000) {
      throw new BadRequestException("Comment too long (max 1000 characters)");
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

    const likeCount = await this.prisma.commentLike.count({ where: { commentId } });
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

    const likeCount = await this.prisma.commentLike.count({ where: { commentId } });
    return { message: "Comment unliked", likeCount };
  }

  async hasUserLikedComment(userId: string, commentId: string): Promise<boolean> {
    const like = await this.prisma.commentLike.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });
    return !!like;
  }

  async getCommentLikedStatus(userId: string, commentIds: string[]): Promise<Record<string, boolean>> {
    if (commentIds.length === 0) return {};

    const likes = await this.prisma.commentLike.findMany({
      where: {
        userId,
        commentId: { in: commentIds },
      },
      select: { commentId: true },
    });

    const likedSet = new Set(likes.map((l) => l.commentId));
    return Object.fromEntries(commentIds.map((id) => [id, likedSet.has(id)]));
  }

  // ========================================
  // Bookmark
  // ========================================

  async bookmarkPost(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({ where: { id: postId, isDeleted: false } });
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

  async hasUserBookmarkedPost(userId: string, postId: string): Promise<boolean> {
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
      this.prisma.postBookmark.count({ where: { userId, post: { isDeleted: false } } }),
    ]);

    return { posts: bookmarks.map((b) => b.post), total };
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
  // Statistics
  // ========================================

  async getUserPostStats(userId: string) {
    const [postCount, commentCount, totalLikes] = await Promise.all([
      this.prisma.post.count({ where: { authorId: userId, isDeleted: false } }),
      this.prisma.comment.count({ where: { authorId: userId, isDeleted: false } }),
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

    return this.prisma.postReport.create({
      data: {
        reporterId: userId,
        postId: dto.postId,
        commentId: dto.commentId,
        reason: dto.reason,
        description: dto.description,
      },
    });
  }

  async getPostReports(params: { status?: string; limit?: number; offset?: number }) {
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

  async reviewPostReport(reportId: string, status: "APPROVED" | "REJECTED", reviewerNote?: string) {
    const report = await this.prisma.postReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("Report not found");

    return this.prisma.postReport.update({
      where: { id: reportId },
      data: { status, reviewerNote, reviewedAt: new Date() },
    });
  }
}
