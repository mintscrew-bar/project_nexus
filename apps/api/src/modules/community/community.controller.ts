import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { UploadService } from "../upload/upload.service";
import {
  CommunityService,
  CreatePostDto,
  UpdatePostDto,
  CreateCommentDto,
  CreatePostReportDto,
} from "./community.service";
import { PostCategory } from "./community.types";
import { UserRole } from "@nexus/database";

@Controller("community")
export class CommunityController {
  constructor(
    private readonly communityService: CommunityService,
    private readonly uploadService: UploadService,
  ) {}

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
    @Query("tag") tag?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("sortBy") sortBy?: string,
  ) {
    return this.communityService.listPosts({
      category,
      search,
      authorId,
      tag,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      sortBy: sortBy as any,
    });
  }

  // 인기 태그 조회
  @Get("tags/popular")
  async getPopularTags(@Query("limit") limit?: string) {
    return this.communityService.getPopularTags(limit ? parseInt(limit, 10) : 20);
  }

  @Get("posts/:id")
  @UseGuards(OptionalJwtGuard)
  async getPost(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    // 로그인 유저이면 userId 기반, 비로그인이면 IP 기반 조회수 중복 방지 (24시간)
    const user = req.user as any;
    const viewerId: string | undefined = user?.sub;
    const viewerIp: string | undefined =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      req.socket?.remoteAddress;
    return this.communityService.getPostById(id, viewerId, viewerIp);
  }

  @Patch("posts/:id")
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

  @Patch("comments/:id")
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
  // Comment Like/Unlike
  // ========================================

  @Post("comments/:id/like")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async likeComment(
    @CurrentUser("sub") userId: string,
    @Param("id") commentId: string,
  ) {
    return this.communityService.likeComment(userId, commentId);
  }

  @Delete("comments/:id/like")
  @UseGuards(JwtAuthGuard)
  async unlikeComment(
    @CurrentUser("sub") userId: string,
    @Param("id") commentId: string,
  ) {
    return this.communityService.unlikeComment(userId, commentId);
  }

  @Get("comments/:id/liked")
  @UseGuards(JwtAuthGuard)
  async hasLikedComment(
    @CurrentUser("sub") userId: string,
    @Param("id") commentId: string,
  ) {
    const hasLiked = await this.communityService.hasUserLikedComment(userId, commentId);
    return { hasLiked };
  }

  @Post("comments/liked-status")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getCommentLikedStatus(
    @CurrentUser("sub") userId: string,
    @Body() body: { commentIds: string[] },
  ) {
    return this.communityService.getCommentLikedStatus(userId, body.commentIds);
  }

  // ========================================
  // Bookmark
  // ========================================

  @Post("posts/:id/bookmark")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async bookmarkPost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
  ) {
    return this.communityService.bookmarkPost(userId, postId);
  }

  @Delete("posts/:id/bookmark")
  @UseGuards(JwtAuthGuard)
  async unbookmarkPost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
  ) {
    return this.communityService.unbookmarkPost(userId, postId);
  }

  @Get("posts/:id/bookmarked")
  @UseGuards(JwtAuthGuard)
  async hasBookmarkedPost(
    @CurrentUser("sub") userId: string,
    @Param("id") postId: string,
  ) {
    const bookmarked = await this.communityService.hasUserBookmarkedPost(userId, postId);
    return { bookmarked };
  }

  @Get("bookmarks")
  @UseGuards(JwtAuthGuard)
  async getBookmarks(
    @CurrentUser("sub") userId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.communityService.getUserBookmarks(
      userId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // ========================================
  // Pin/Unpin (Admin/Moderator Only)
  // ========================================

  @Post("posts/:id/pin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @HttpCode(HttpStatus.OK)
  async pinPost(@Param("id") postId: string) {
    return this.communityService.pinPost(postId);
  }

  @Delete("posts/:id/pin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async unpinPost(@Param("id") postId: string) {
    return this.communityService.unpinPost(postId);
  }

  // ========================================
  // Blind/Unblind (Admin/Moderator Only)
  // ========================================

  /** 게시글 블라인드(임시조치) 처리 — 관리자/운영자 전용 */
  @Post("posts/:id/blind")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @HttpCode(HttpStatus.OK)
  async blindPost(@Param("id") postId: string) {
    await this.communityService.blindPost(postId);
    return { message: "게시글이 블라인드 처리되었습니다." };
  }

  /** 게시글 블라인드 해제 — 관리자/운영자 전용 */
  @Delete("posts/:id/blind")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async unblindPost(@Param("id") postId: string) {
    await this.communityService.unblindPost(postId);
    return { message: "게시글 블라인드가 해제되었습니다." };
  }

  /** 댓글 블라인드(임시조치) 처리 — 관리자/운영자 전용 */
  @Post("comments/:id/blind")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @HttpCode(HttpStatus.OK)
  async blindComment(@Param("id") commentId: string) {
    await this.communityService.blindComment(commentId);
    return { message: "댓글이 블라인드 처리되었습니다." };
  }

  /** 댓글 블라인드 해제 — 관리자/운영자 전용 */
  @Delete("comments/:id/blind")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async unblindComment(@Param("id") commentId: string) {
    await this.communityService.unblindComment(commentId);
    return { message: "댓글 블라인드가 해제되었습니다." };
  }

  // ========================================
  // User Statistics
  // ========================================

  @Get("users/:userId/stats")
  async getUserStats(@Param("userId") userId: string) {
    return this.communityService.getUserPostStats(userId);
  }

  // ========================================
  // Report
  // ========================================

  @Post("reports")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async reportContent(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreatePostReportDto,
  ) {
    return this.communityService.reportContent(userId, dto);
  }

  // ========================================
  // Image Upload (게시글 본문 이미지)
  // ========================================

  @Post("images")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("image"))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("이미지 파일이 업로드되지 않았습니다.");
    }
    // API 서버 기준 정적 파일 URL 반환 (ServeStaticModule이 /uploads 서빙)
    const url = this.uploadService.getFileUrl(file.filename);
    return { url };
  }
}
