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
import { DmMessagesQueryDto } from "./dto/dm-query.dto";

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
    @Query() query: DmMessagesQueryDto,
  ) {
    return this.dmService.getConversation(
      req.user.sub,
      userId,
      query.cursor,
      query.limit,
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
