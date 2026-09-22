import { Module } from "@nestjs/common";
import { ClanController } from "./clan.controller";
import { ClanService } from "./clan.service";
import { ClanGateway } from "./clan.gateway";
import { AuthModule } from "../auth/auth.module";
import { UploadModule } from "../upload/upload.module";
import { DiscordInviteStatsService } from "./discord-invite-stats.service";

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [ClanController],
  providers: [ClanService, ClanGateway, DiscordInviteStatsService],
  exports: [ClanService, ClanGateway],
})
export class ClanModule {}
