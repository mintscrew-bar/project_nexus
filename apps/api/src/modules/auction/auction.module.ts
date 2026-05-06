import { Module, forwardRef } from "@nestjs/common";
import { AuctionController } from "./auction.controller";
import { AuctionService } from "./auction.service";
import { AuctionGateway } from "./auction.gateway";
import { AuthModule } from "../auth/auth.module";
import { RoleSelectionModule } from "../role-selection/role-selection.module";
import { DiscordModule } from "../discord/discord.module";
import { DiscordVoiceService } from "../discord/discord-voice.service";

@Module({
  imports: [AuthModule, forwardRef(() => RoleSelectionModule), DiscordModule],
  controllers: [AuctionController],
  providers: [
    AuctionService,
    AuctionGateway,
    {
      provide: "DISCORD_VOICE_SERVICE",
      useExisting: DiscordVoiceService,
    },
  ],
  exports: [AuctionService, AuctionGateway],
})
export class AuctionModule {}
