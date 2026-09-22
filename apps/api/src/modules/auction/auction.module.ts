import { Module, forwardRef } from "@nestjs/common";
import { AuctionController } from "./auction.controller";
import { AuctionService } from "./auction.service";
import { AuctionGateway } from "./auction.gateway";
import { AuthModule } from "../auth/auth.module";
import { RoleSelectionModule } from "../role-selection/role-selection.module";
import { DiscordModule } from "../discord/discord.module";
import { DiscordVoiceService } from "../discord/discord-voice.service";
import { DiscordBotService } from "../discord/discord-bot.service";

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
    // 방이 비어 지워질 때 디스코드 공지를 "해산"으로 닫는다.
    { provide: "DISCORD_BOT_SERVICE", useExisting: DiscordBotService },
  ],
  exports: [AuctionService, AuctionGateway],
})
export class AuctionModule {}
