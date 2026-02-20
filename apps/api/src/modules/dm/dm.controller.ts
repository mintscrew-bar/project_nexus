import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DmService } from "./dm.service";

@Controller("dm")
@UseGuards(JwtAuthGuard)
export class DmController {
  constructor(private readonly dmService: DmService) {}

  @Get("conversations")
  getConversations(@Request() req: any) {
    return this.dmService.getConversationList(req.user.sub);
  }

  @Get("conversations/:userId")
  getMessages(
    @Request() req: any,
    @Param("userId") userId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.dmService.getConversation(
      req.user.sub,
      userId,
      cursor,
      limit ? parseInt(limit) : 30,
    );
  }

  @Post("conversations/:userId/read")
  async markAsRead(@Request() req: any, @Param("userId") userId: string) {
    await this.dmService.markAsRead(req.user.sub, userId);
    return { success: true };
  }

  @Get("unread-count")
  async getUnreadCount(@Request() req: any) {
    const total = await this.dmService.getUnreadCount(req.user.sub);
    return { total };
  }
}
