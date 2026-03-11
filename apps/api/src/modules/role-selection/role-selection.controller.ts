import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { RoleSelectionService } from "./role-selection.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "@nexus/database";

@Controller("role-selection")
@UseGuards(JwtAuthGuard)
export class RoleSelectionController {
  constructor(
    private readonly roleSelectionService: RoleSelectionService,
    private readonly prisma: PrismaService,
  ) {}

  /** 호스트 여부 확인 헬퍼 */
  private async assertHost(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (room?.hostId !== userId) {
      throw new ForbiddenException("호스트만 이 작업을 수행할 수 있습니다.");
    }
  }

  @Get(":roomId")
  async getRoleSelectionData(@Param("roomId") roomId: string) {
    return this.roleSelectionService.getRoleSelectionData(roomId);
  }

  @Post(":roomId/start")
  async startRoleSelection(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
  ) {
    await this.assertHost(userId, roomId);
    return this.roleSelectionService.startRoleSelection(roomId);
  }

  @Post(":roomId/select-role")
  async selectRole(
    @Param("roomId") roomId: string,
    @CurrentUser("sub") userId: string,
    @Body() body: { role: Role },
  ) {
    return this.roleSelectionService.selectRole(userId, roomId, body.role);
  }

  @Post(":roomId/complete")
  async completeRoleSelection(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
  ) {
    await this.assertHost(userId, roomId);
    return this.roleSelectionService.completeRoleSelection(roomId);
  }
}
