import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NotificationService } from "./notification.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get user's notifications
   */
  @Get()
  async getNotifications(
    @CurrentUser("sub") userId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.notificationService.getByUserId(
      userId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /**
   * Get unread count
   */
  @Get("unread-count")
  async getUnreadCount(@CurrentUser("sub") userId: string) {
    const count = await this.notificationService.getUnreadCount(userId);
    return { count };
  }

  /**
   * Mark notification as read
   */
  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @CurrentUser("sub") userId: string,
    @Param("id") notificationId: string,
  ) {
    return this.notificationService.markAsRead(notificationId, userId);
  }

  /**
   * Mark all notifications as read
   */
  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@CurrentUser("sub") userId: string) {
    await this.notificationService.markAllAsRead(userId);
    return { message: "All notifications marked as read" };
  }

  /**
   * Delete notification
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNotification(
    @CurrentUser("sub") userId: string,
    @Param("id") notificationId: string,
  ) {
    await this.notificationService.delete(notificationId, userId);
  }

  /**
   * Delete all read notifications
   */
  @Delete("read/all")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAllRead(@CurrentUser("sub") userId: string) {
    await this.notificationService.deleteAllRead(userId);
  }
}
