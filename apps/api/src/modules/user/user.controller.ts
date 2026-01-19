import { Controller, Get, Patch, Body, UseGuards, Param } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserService } from "./user.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  async getMyProfile(@CurrentUser("id") userId: string) {
    return this.userService.getProfile(userId);
  }

  @Get(":id")
  async getProfile(@Param("id") id: string) {
    return this.userService.getProfile(id);
  }

  @Patch("me")
  async updateProfile(
    @CurrentUser("id") userId: string,
    @Body() data: { nickname?: string }
  ) {
    return this.userService.updateProfile(userId, data);
  }
}
