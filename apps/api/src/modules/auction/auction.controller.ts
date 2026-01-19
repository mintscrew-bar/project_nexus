import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuctionService } from "./auction.service";

@Controller("auctions")
@UseGuards(JwtAuthGuard)
export class AuctionController {
  constructor(private readonly auctionService: AuctionService) {}

  @Post()
  async create(
    @CurrentUser("id") userId: string,
    @Body()
    data: {
      name: string;
      maxTeams: number;
      teamBudget: number;
      minBid: number;
    },
  ) {
    return this.auctionService.create({
      ...data,
      hostId: userId,
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.auctionService.findById(id);
  }

  @Post(":id/join")
  async join(@Param("id") id: string, @CurrentUser("id") userId: string) {
    return this.auctionService.join(id, userId);
  }

  @Post(":id/start")
  async start(@Param("id") id: string, @CurrentUser("id") userId: string) {
    return this.auctionService.startAuction(id, userId);
  }
}
