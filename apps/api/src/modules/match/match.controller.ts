import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MatchService } from "./match.service";

@Controller("matches")
@UseGuards(JwtAuthGuard)
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.matchService.findById(id);
  }

  @Get("auction/:auctionId")
  async getByAuction(@Param("auctionId") auctionId: string) {
    return this.matchService.getMatchesByAuction(auctionId);
  }
}
