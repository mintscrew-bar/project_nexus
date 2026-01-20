import { Module } from "@nestjs/common";
import { AuctionController } from "./auction.controller";
import { AuctionService } from "./auction.service";
import { AuctionGateway } from "./auction.gateway";
import { AuctionStateService } from "./auction-state.service";
import { AuctionTimerService } from "./auction-timer.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AuctionController],
  providers: [
    AuctionService,
    AuctionGateway,
    AuctionStateService,
    AuctionTimerService,
  ],
  exports: [AuctionService, AuctionGateway, AuctionStateService],
})
export class AuctionModule {}
