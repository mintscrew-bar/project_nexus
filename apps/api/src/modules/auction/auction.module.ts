import { Module, forwardRef } from "@nestjs/common";
import { AuctionController } from "./auction.controller";
import { AuctionService } from "./auction.service";
import { AuctionGateway } from "./auction.gateway";
import { AuctionStateService } from "./auction-state.service";
import { AuctionTimerService } from "./auction-timer.service";
import { AuthModule } from "../auth/auth.module";
import { RoleSelectionModule } from "../role-selection/role-selection.module";

@Module({
  imports: [AuthModule, forwardRef(() => RoleSelectionModule)],
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
