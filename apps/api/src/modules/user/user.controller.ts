import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
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
    return this.userService.getProfile(userId);
  }

  @Get("stats")
  async getMyStats(@CurrentUser("sub") userId: string) {
    return this.userService.getUserStats(userId);
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

  // ========================================
  // 동적 경로 (정적 경로 이후)
  // ========================================

  @Get(":id")
  async getProfile(@Param("id") id: string) {
    return this.userService.getProfile(id);
  }

  @Get(":id/stats")
  async getUserStats(@Param("id") id: string) {
    return this.userService.getUserStats(id);
  }
}
