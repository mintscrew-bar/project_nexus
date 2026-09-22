import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NudgeRoomDto } from "./dto";
import { RoomNudgeService } from "./room-nudge.service";

/**
 * 로비 호출 API.
 *
 * RoomController 에 넣지 않고 따로 둔다. RoomController 는 이미 서비스 열 개
 * 가까이를 받고 있어, 생성자에 하나 더 얹으면 기존 테스트 구성이 전부 흔들린다.
 */
@Controller("rooms")
@UseGuards(JwtAuthGuard)
export class RoomNudgeController {
  constructor(private readonly nudgeService: RoomNudgeService) {}

  /**
   * POST /api/rooms/:id/nudge — 시작을 막고 있는 참가자에게 사이트 알림 + 디스코드 DM.
   * 사유별 방당 60초 쿨다운은 서비스가 건다. 여기서는 방장 한 명의 연타만 막는다.
   */
  @Post(":id/nudge")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  nudge(
    @Param("id") roomId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: NudgeRoomDto,
  ) {
    return this.nudgeService.nudge(userId, roomId, dto.reason);
  }
}
