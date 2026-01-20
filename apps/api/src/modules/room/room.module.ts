import { Module } from "@nestjs/common";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { RoomGateway } from "./room.gateway";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [RoomController],
  providers: [RoomService, RoomGateway],
  exports: [RoomService, RoomGateway],
})
export class RoomModule {}
