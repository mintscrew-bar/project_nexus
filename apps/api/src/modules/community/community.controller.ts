import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CommunityService,
  CreatePostDto,
  UpdatePostDto,
  CreateCommentDto,
} from "./community.service";
import { PostCategory } from "./community.types";

@Controller("community")
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ========================================
  // Post Management
  // ========================================

  @Post("posts")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPost(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.communityService.createPost(userId, dto);
  }

  @Get("posts")
  async listPosts(
    @Query("category") category?: PostCategory,
    @Query("search") search?: string,
    @Query("authorId") authorId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.communityService.listPosts({
      category,
      search,
      authorId,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get("posts/:id")
  async getPost(@Param("id") id: string) {
    return this.communityService.getPostById(id);
  }

  @Put("posts/:id")
  @UseGuards(JwtAuthGuard)
  async updatePost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.communityService.updatePost(userId, postId, dto);
  }

  @Delete("posts/:id")
  @UseGuards(JwtAuthGuard)
  async deletePost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
  ) {
    return this.communityService.deletePost(userId, postId);
  }

  // ========================================
  // Comment Management
  // ========================================

  @Post("posts/:id/comments")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.communityService.createComment(userId, postId, dto);
  }

  @Put("comments/:id")
  @UseGuards(JwtAuthGuard)
  async updateComment(
    @CurrentUser("sub") userId: string,
    @Param("id") commentId: string,
    @Body() body: { content: string },
  ) {
    return this.communityService.updateComment(userId, commentId, body.content);
  }

  @Delete("comments/:id")
  @UseGuards(JwtAuthGuard)
  async deleteComment(
    @CurrentUser("sub") userId: string,
    @Param("id") commentId: string,
  ) {
    return this.communityService.deleteComment(userId, commentId);
  }

  // ========================================
  // Like/Unlike System
  // ========================================

  @Post("posts/:id/like")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async likePost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
  ) {
    return this.communityService.likePost(userId, postId);
  }

  @Delete("posts/:id/like")
  @UseGuards(JwtAuthGuard)
  async unlikePost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
  ) {
    return this.communityService.unlikePost(userId, postId);
  }

  @Get("posts/:id/liked")
  @UseGuards(JwtAuthGuard)
  async hasLikedPost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
  ) {
    const hasLiked = await this.communityService.hasUserLikedPost(
      userId,
      postId,
    );
    return { hasLiked };
  }

  // ========================================
  // Pin/Unpin (TODO: Add admin/moderator guard)
  // ========================================

  @Post("posts/:id/pin")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async pinPost(@Param("id") postId: string) {
    return this.communityService.pinPost(postId);
  }

  @Delete("posts/:id/pin")
  @UseGuards(JwtAuthGuard)
  async unpinPost(@Param("id") postId: string) {
    return this.communityService.unpinPost(postId);
  }

  // ========================================
  // User Statistics
  // ========================================

  @Get("users/:userId/stats")
  async getUserStats(@Param("userId") userId: string) {
    return this.communityService.getUserPostStats(userId);
  }
}
