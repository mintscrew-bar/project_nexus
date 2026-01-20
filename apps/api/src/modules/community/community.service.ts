import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PostCategory } from "@nexus/database";

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

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

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
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          where: { parentId: null }, // Only top-level comments
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
  }) {
    const where: any = {};

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
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
      }),
      this.prisma.post.count({ where }),
    ]);

    return { posts, total };
  }

  async updatePost(userId: string, postId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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
        throw new BadRequestException("Content too long (max 10000 characters)");
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
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException("You can only delete your own posts");
    }

    await this.prisma.post.delete({
      where: { id: postId },
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

    // Verify post exists
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // If parentId provided, verify parent comment exists
    if (dto.parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });

      if (!parentComment || parentComment.postId !== postId) {
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

    return comment;
  }

  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
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
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("You can only delete your own comments");
    }

    await this.prisma.comment.delete({
      where: { id: commentId },
    });

    return { message: "Comment deleted successfully" };
  }

  // ========================================
  // Like/Unlike System
  // ========================================

  async likePost(userId: string, postId: string) {
    // Verify post exists
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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
  // Pin/Unpin (Admin/Moderator only)
  // ========================================

  async pinPost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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
      this.prisma.post.count({ where: { authorId: userId } }),
      this.prisma.comment.count({ where: { authorId: userId } }),
      this.prisma.postLike.count({
        where: { post: { authorId: userId } },
      }),
    ]);

    return {
      postCount,
      commentCount,
      totalLikes,
    };
  }
}
