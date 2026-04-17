import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { FriendService } from "./friend.service";

@Controller("friends")
@UseGuards(JwtAuthGuard)
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  // ========================================
  // Friend Request Management
  // ========================================

  @Post("requests/:userId")
  @HttpCode(HttpStatus.CREATED)
  async sendFriendRequest(
    @CurrentUser("sub") userId: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.friendService.sendFriendRequest(userId, targetUserId);
  }

  @Post("requests/:friendshipId/accept")
  @HttpCode(HttpStatus.OK)
  async acceptFriendRequest(
    @CurrentUser("sub") userId: string,
    @Param("friendshipId") friendshipId: string,
  ) {
    return this.friendService.acceptFriendRequest(userId, friendshipId);
  }

  @Post("requests/:friendshipId/reject")
  @HttpCode(HttpStatus.OK)
  async rejectFriendRequest(
    @CurrentUser("sub") userId: string,
    @Param("friendshipId") friendshipId: string,
  ) {
    return this.friendService.rejectFriendRequest(userId, friendshipId);
  }

  @Delete("requests/:friendshipId")
  async cancelFriendRequest(
    @CurrentUser("sub") userId: string,
    @Param("friendshipId") friendshipId: string,
  ) {
    return this.friendService.cancelFriendRequest(userId, friendshipId);
  }

  // ========================================
  // Friend List Management
  // ========================================

  @Get()
  async getFriends(@CurrentUser("sub") userId: string) {
    return this.friendService.getFriends(userId);
  }

  @Get("requests/pending")
  async getPendingRequests(@CurrentUser("sub") userId: string) {
    return this.friendService.getPendingRequests(userId);
  }

  @Get("requests/sent")
  async getSentRequests(@CurrentUser("sub") userId: string) {
    return this.friendService.getSentRequests(userId);
  }

  @Delete(":friendId")
  async removeFriend(
    @CurrentUser("sub") userId: string,
    @Param("friendId") friendId: string,
  ) {
    return this.friendService.removeFriend(userId, friendId);
  }

  // ========================================
  // Block Management
  // ========================================

  @Post("block/:userId")
  @HttpCode(HttpStatus.OK)
  async blockUser(
    @CurrentUser("sub") userId: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.friendService.blockUser(userId, targetUserId);
  }

  @Delete("block/:userId")
  async unblockUser(
    @CurrentUser("sub") userId: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.friendService.unblockUser(userId, targetUserId);
  }

  @Get("blocked")
  async getBlockedUsers(@CurrentUser("sub") userId: string) {
    return this.friendService.getBlockedUsers(userId);
  }

  // ========================================
  // Friend Status Check
  // ========================================

  @Get("status/:userId")
  async getFriendshipStatus(
    @CurrentUser("sub") userId: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.friendService.getFriendshipStatus(userId, targetUserId);
  }

  // ========================================
  // Statistics
  // ========================================

  @Get("stats")
  async getFriendStats(@CurrentUser("sub") userId: string) {
    return this.friendService.getFriendStats(userId);
  }
}
