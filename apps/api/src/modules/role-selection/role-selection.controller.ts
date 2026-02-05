import { Controller, Get, Post, Body, Param, UseGuards, Req } from "@nestjs/common";
import { RoleSelectionService } from "./role-selection.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Role } from "@nexus/database";

@Controller("role-selection")
@UseGuards(JwtAuthGuard)
export class RoleSelectionController {
  constructor(private readonly roleSelectionService: RoleSelectionService) {}

  @Get(":roomId")
  async getRoleSelectionData(@Param("roomId") roomId: string) {
    return this.roleSelectionService.getRoleSelectionData(roomId);
  }

  @Post(":roomId/start")
  async startRoleSelection(@Param("roomId") roomId: string) {
    return this.roleSelectionService.startRoleSelection(roomId);
  }

  @Post(":roomId/select-role")
  async selectRole(
    @Param("roomId") roomId: string,
    @Req() req: any,
    @Body() body: { role: Role },
  ) {
    const userId = req.user.id;
    return this.roleSelectionService.selectRole(userId, roomId, body.role);
  }

  @Post(":roomId/complete")
  async completeRoleSelection(@Param("roomId") roomId: string) {
    return this.roleSelectionService.completeRoleSelection(roomId);
  }
}
