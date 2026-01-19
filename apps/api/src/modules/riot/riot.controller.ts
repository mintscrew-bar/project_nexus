import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RiotService } from "./riot.service";

@Controller("riot")
@UseGuards(JwtAuthGuard)
export class RiotController {
  constructor(private readonly riotService: RiotService) {}

  @Post("verify/start")
  async startVerification(
    @CurrentUser("id") userId: string,
    @Body() data: { gameName: string; tagLine: string }
  ) {
    return this.riotService.startVerification(
      userId,
      data.gameName,
      data.tagLine
    );
  }

  @Post("verify/confirm")
  async confirmVerification(@CurrentUser("id") userId: string) {
    return this.riotService.verifyAccount(userId);
  }

  @Post("accounts/:id/sync")
  async syncAccount(@Param("id") id: string) {
    return this.riotService.syncRankedInfo(id);
  }

  @Get("summoner/:gameName/:tagLine")
  async getSummoner(
    @Param("gameName") gameName: string,
    @Param("tagLine") tagLine: string
  ) {
    return this.riotService.getSummonerByRiotId(gameName, tagLine);
  }
}
