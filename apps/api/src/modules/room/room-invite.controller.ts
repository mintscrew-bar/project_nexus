import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { InviteRoomDto } from "./dto";
import { RoomInviteService } from "./room-invite.service";

/**
 * 친구 내전 초대 API.
 *
 * "rooms" 아래에 두면 GET /rooms/:id 와 경로가 겹칠 수 있어 따로 뺐다.
 */
@Controller("room-invites")
@UseGuards(JwtAuthGuard)
export class RoomInviteController {
  constructor(private readonly roomInviteService: RoomInviteService) {}

  /**
   * POST /api/room-invites/:roomId — 친구를 이 방에 초대한다.
   * 같은 방·같은 친구 30초 쿨다운은 서비스가 건다. 여기서는 전체 연타만 막는다.
   */
  @Post(":roomId")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  invite(
    @Param("roomId") roomId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: InviteRoomDto,
  ) {
    return this.roomInviteService.invite(userId, roomId, dto.friendId);
  }

  /** GET /api/room-invites — 내가 받은 내전 초대(친구창 대기 탭) */
  @Get()
  list(@CurrentUser("sub") userId: string) {
    return this.roomInviteService.listReceived(userId);
  }

  /** DELETE /api/room-invites/:roomId — 받은 초대 거절 */
  @Delete(":roomId")
  decline(@Param("roomId") roomId: string, @CurrentUser("sub") userId: string) {
    return this.roomInviteService.decline(userId, roomId);
  }
}
