import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PresenceService } from "./presence.service";
import { PresenceGateway } from "./presence.gateway";
import { UserStatus } from "@nexus/database";

@Controller("presence")
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly presenceGateway: PresenceGateway,
  ) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMyStatus(@CurrentUser("sub") userId: string) {
    return this.presenceService.getUserStatus(userId);
  }

  @Put("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateMyStatus(
    @CurrentUser("sub") userId: string,
    @Body() body: { status: "ONLINE" | "AWAY" },
  ) {
    const status = body.status === "AWAY" ? UserStatus.AWAY : UserStatus.ONLINE;

    await this.presenceService.updateStatus(userId, status);
    await this.presenceGateway.notifyStatusChange(userId, status);

    return { status };
  }

  @Get("user/:userId")
  @UseGuards(JwtAuthGuard)
  async getUserStatus(@Param("userId") userId: string) {
    return this.presenceService.getUserStatus(userId);
  }

  @Get("friends")
  @UseGuards(JwtAuthGuard)
  async getFriendsStatuses(@CurrentUser("sub") userId: string) {
    return this.presenceService.getFriendsStatuses(userId);
  }

  @Get("online")
  @UseGuards(JwtAuthGuard)
  async getOnlineUsers() {
    const onlineUserIds = this.presenceService.getOnlineUserIds();
    return { count: onlineUserIds.length, userIds: onlineUserIds };
  }
}
