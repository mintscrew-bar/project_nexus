import { Module, forwardRef } from "@nestjs/common";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { RoomGateway } from "./room.gateway";
import { SnakeDraftService } from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";
import { AuthModule } from "../auth/auth.module";
import { AuctionModule } from "../auction/auction.module";
import { RoleSelectionModule } from "../role-selection/role-selection.module";
import { DiscordModule } from "../discord/discord.module";
import { DiscordBotService } from "../discord/discord-bot.service";
import { DiscordVoiceService } from "../discord/discord-voice.service";

@Module({
  imports: [
    AuthModule,
    forwardRef(() => AuctionModule),
    forwardRef(() => RoleSelectionModule),
    DiscordModule,
  ],
  controllers: [RoomController],
  providers: [
    RoomService,
    RoomGateway,
    SnakeDraftService,
    SnakeDraftGateway,
    {
      provide: "DISCORD_BOT_SERVICE",
      useExisting: DiscordBotService,
    },
    {
      provide: "DISCORD_VOICE_SERVICE",
      useExisting: DiscordVoiceService,
    },
  ],
  exports: [RoomService, RoomGateway, SnakeDraftService, SnakeDraftGateway],
})
export class RoomModule {}
