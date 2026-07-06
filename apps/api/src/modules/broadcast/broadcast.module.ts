import { Module } from "@nestjs/common";
import { BroadcastController } from "./broadcast.controller";
import { BroadcastService } from "./broadcast.service";
import { RoomModule } from "../room/room.module";

@Module({
  imports: [RoomModule],
  controllers: [BroadcastController],
  providers: [BroadcastService],
})
export class BroadcastModule {}
