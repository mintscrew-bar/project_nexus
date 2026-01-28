import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuctionService } from "./auction.service";

@Controller("auctions")
@UseGuards(JwtAuthGuard)
export class AuctionController {
  constructor(private readonly auctionService: AuctionService) {}

  @Post(":roomId/start")
  @HttpCode(HttpStatus.OK)
  async startAuction(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
  ) {
    return this.auctionService.startAuction(userId, roomId);
  }

  @Get(":roomId/state")
  async getAuctionState(@Param("roomId") roomId: string) {
    const state = this.auctionService.getAuctionState(roomId);
    if (!state) {
      return { error: "Auction not started" };
    }
    return { state };
  }
}
