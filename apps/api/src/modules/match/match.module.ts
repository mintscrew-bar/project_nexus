import { Module } from "@nestjs/common";
import { MatchController } from "./match.controller";
import { MatchService } from "./match.service";
import { MatchGateway } from "./match.gateway";
import { MatchDataCollectionService } from "./match-data-collection.service";
import { MatchBracketService } from "./match-bracket.service";
import { MatchAdvancementService } from "./match-advancement.service";
import { RiotModule } from "../riot/riot.module";
import { AuthModule } from "../auth/auth.module";
import { DiscordModule } from "../discord/discord.module";
import { DiscordBotService } from "../discord/discord-bot.service";
import { DiscordVoiceService } from "../discord/discord-voice.service";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [AuthModule, RiotModule, DiscordModule, NotificationModule],
  controllers: [MatchController],
  providers: [
    MatchService,
    MatchGateway,
    MatchDataCollectionService,
    MatchBracketService,
    MatchAdvancementService,
    {
      provide: "DISCORD_BOT_SERVICE",
      useExisting: DiscordBotService,
    },
    {
      provide: "DISCORD_VOICE_SERVICE",
      useExisting: DiscordVoiceService,
    },
  ],
  exports: [
    MatchService,
    MatchGateway,
    MatchDataCollectionService,
    MatchBracketService,
    MatchAdvancementService,
  ],
})
export class MatchModule {}
