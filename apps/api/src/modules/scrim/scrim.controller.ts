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
import { ScrimCollectorService } from "./scrim-collector.service";

@Controller("rooms/:roomId/scrim")
@UseGuards(JwtAuthGuard)
export class ScrimController {
  constructor(
    private readonly scrimService: ScrimService,
    private readonly scrimGateway: ScrimGateway,
    private readonly collector: ScrimCollectorService,
  ) {}

  /** 자동 수집을 쓸 수 있는 상태인지. 화면에서 버튼을 띄울지 판단한다. */
  @Get("collector")
  getCollectorState() {
    return { enabled: this.collector.isEnabled };
  }

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

  /**
   * 라운드 결과를 인게임 기록에서 찾아 채운다.
   *
   * 못 찾으면 아무것도 쓰지 않고 이유를 돌려준다 — 애매한 매치를 주워
   * 리더보드에 올리면 사람이 그걸 찾아 고치는 게 더 오래 걸린다.
   */
  @Post("rounds/:roundNumber/collect")
  async collectRound(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
    @Param("roundNumber", ParseIntPipe) roundNumber: number,
  ) {
    const result = await this.collector.collectRound(
      userId,
      roomId,
      roundNumber,
    );
    if (result.matched) {
      const scrim = await this.scrimService.getScrimByRoom(roomId);
      this.scrimGateway.broadcastScrimUpdate(roomId, "round-completed", scrim);
    }
    return result;
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
