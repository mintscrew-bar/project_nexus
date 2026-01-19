import { Module } from "@nestjs/common";
import { AuctionController } from "./auction.controller";
import { AuctionService } from "./auction.service";
import { AuctionGateway } from "./auction.gateway";

@Module({
  controllers: [AuctionController],
  providers: [AuctionService, AuctionGateway],
  exports: [AuctionService],
})
export class AuctionModule {}
