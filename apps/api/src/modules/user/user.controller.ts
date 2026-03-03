import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserService } from "./user.service";
import {
  UserSettingsService,
  UpdateSettingsDto,
} from "./user-settings.service";
import { UploadService } from "../upload/upload.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userSettingsService: UserSettingsService,
    private readonly uploadService: UploadService,
  ) {}

  // ========================================
  // 정적 경로 먼저 (동적 :id 경로보다 앞에)
  // ========================================

  @Get("me")
  async getMyProfile(@CurrentUser("sub") userId: string) {
    return this.userService.getProfile(userId, userId);
  }

  @Get("stats")
  async getMyStats(@CurrentUser("sub") userId: string) {
    return this.userService.getUserStats(userId, userId);
  }

  @Get("settings")
  async getSettings(@CurrentUser("sub") userId: string) {
    return this.userSettingsService.getSettings(userId);
  }

  @Patch("me")
  async updateProfile(
    @CurrentUser("sub") userId: string,
    @Body() data: { username?: string; bio?: string },
  ) {
    return this.userService.updateProfile(userId, data);
  }

  @Patch("settings")
  async updateSettings(
    @CurrentUser("sub") userId: string,
    @Body() data: UpdateSettingsDto,
  ) {
    return this.userSettingsService.updateSettings(userId, data);
  }

  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("avatar"))
  async uploadAvatar(
    @CurrentUser("sub") userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("파일이 업로드되지 않았습니다.");
    }

    const oldAvatarUrl = await this.userService.getAvatarUrl(userId);
    if (oldAvatarUrl && oldAvatarUrl.startsWith("/uploads/")) {
      const oldFilename = oldAvatarUrl.replace("/uploads/", "");
      await this.uploadService.deleteFile(oldFilename);
    }

    const avatarUrl = this.uploadService.getFileUrl(file.filename);
    await this.userService.updateAvatar(userId, avatarUrl);

    return { avatarUrl };
  }

  /**
   * DELETE /users/me
   * 회원 탈퇴: 현재 로그인한 유저의 계정을 삭제한다.
   * - 성공 시 204 No Content 반환
   * - ChatMessage/DirectMessage는 익명으로 보존 (onDelete: SetNull)
   */
  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser("sub") userId: string): Promise<void> {
    await this.userService.deleteAccount(userId);
  }

  /**
   * POST /users/me/appeals
   * 이의신청 제출: 밴/임시제재 상태인 유저가 이의신청 사유를 제출
   */
  @Post("me/appeals")
  async submitAppeal(
    @CurrentUser("sub") userId: string,
    @Body("reason") reason: string,
  ) {
    return this.userService.submitAppeal(userId, reason);
  }

  /**
   * GET /users/me/appeals/latest
   * 내 가장 최근 이의신청 조회 (설정 페이지 상태 표시용)
   */
  @Get("me/appeals/latest")
  async getMyAppeal(@CurrentUser("sub") userId: string) {
    return this.userService.getMyAppeal(userId);
  }

  // ========================================
  // 동적 경로 (정적 경로 이후)
  // ========================================

  @Get(":id")
  async getProfile(
    @CurrentUser("sub") requesterId: string,
    @Param("id") id: string,
  ) {
    return this.userService.getProfile(id, requesterId);
  }

  @Get(":id/stats")
  async getUserStats(
    @CurrentUser("sub") requesterId: string,
    @Param("id") id: string,
  ) {
    return this.userService.getUserStats(id, requesterId);
  }
}
