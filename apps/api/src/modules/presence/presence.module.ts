import { Module } from "@nestjs/common";
import { PresenceService } from "./presence.service";
import { PresenceGateway } from "./presence.gateway";
import { PresenceController } from "./presence.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { FriendModule } from "../friend/friend.module";

@Module({
  imports: [PrismaModule, AuthModule, FriendModule],
  controllers: [PresenceController],
  providers: [PresenceService, PresenceGateway],
  exports: [PresenceService, PresenceGateway],
})
export class PresenceModule {}
