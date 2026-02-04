import { Module, forwardRef } from "@nestjs/common";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { RoomGateway } from "./room.gateway";
import { SnakeDraftService } from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";
import { AuthModule } from "../auth/auth.module";
import { AuctionModule } from "../auction/auction.module";

@Module({
  imports: [AuthModule, forwardRef(() => AuctionModule)],
  controllers: [RoomController],
  providers: [RoomService, RoomGateway, SnakeDraftService, SnakeDraftGateway],
  exports: [RoomService, RoomGateway, SnakeDraftService, SnakeDraftGateway],
})
export class RoomModule {}
