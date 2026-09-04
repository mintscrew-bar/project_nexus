import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateScrimDto, SubmitRoundResultDto } from "./dto";
import { PointRuleDto } from "./dto/create-scrim.dto";
import { ScrimService } from "./scrim.service";
import { ScrimGateway } from "./scrim.gateway";

@Controller("rooms/:roomId/scrim")
@UseGuards(JwtAuthGuard)
export class ScrimController {
  constructor(
    private readonly scrimService: ScrimService,
    private readonly scrimGateway: ScrimGateway,
  ) {}

  @Get()
  getScrim(@Param("roomId") roomId: string) {
    return this.scrimService.getScrimByRoom(roomId);
  }

  @Post()
  async createScrim(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
    @Body() dto: CreateScrimDto,
  ) {
    const scrim = await this.scrimService.createScrim(userId, roomId, dto);
    this.scrimGateway.broadcastScrimUpdate(roomId, "scrim-created", scrim);
    return scrim;
  }

  @Post("rounds/:roundNumber/start")
  async startRound(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
    @Param("roundNumber", ParseIntPipe) roundNumber: number,
  ) {
    const round = await this.scrimService.startRound(
      userId,
      roomId,
      roundNumber,
    );
    this.scrimGateway.broadcastScrimUpdate(roomId, "round-started", round);
    return round;
  }

  @Post("rounds/:roundNumber/result")
  async submitRoundResult(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
    @Param("roundNumber", ParseIntPipe) roundNumber: number,
    @Body() dto: SubmitRoundResultDto,
  ) {
    const scrim = await this.scrimService.submitRoundResult(
      userId,
      roomId,
      roundNumber,
      dto,
    );
    this.scrimGateway.broadcastScrimUpdate(roomId, "round-completed", scrim);
    return scrim;
  }

  @Patch("point-rule")
  async updatePointRule(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
    @Body() rule: PointRuleDto,
  ) {
    const scrim = await this.scrimService.updatePointRule(userId, roomId, rule);
    this.scrimGateway.broadcastScrimUpdate(roomId, "scrim-updated", scrim);
    return scrim;
  }

  @Post("complete")
  async completeScrim(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
  ) {
    const scrim = await this.scrimService.completeScrim(userId, roomId);
    this.scrimGateway.broadcastScrimUpdate(roomId, "scrim-completed", scrim);
    return scrim;
  }
}
