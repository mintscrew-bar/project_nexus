import { Module } from "@nestjs/common";
import { MatchController } from "./match.controller";
import { MatchService } from "./match.service";
import { MatchGateway } from "./match.gateway";
import { MatchDataCollectionService } from "./match-data-collection.service";
import { RiotModule } from "../riot/riot.module";
import { AuthModule } from "../auth/auth.module";
import { DiscordModule } from "../discord/discord.module";
import { DiscordBotService } from "../discord/discord-bot.service";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [AuthModule, RiotModule, DiscordModule, NotificationModule],
  controllers: [MatchController],
  providers: [
    MatchService,
    MatchGateway,
    MatchDataCollectionService,
    {
      provide: 'DISCORD_BOT_SERVICE',
      useExisting: DiscordBotService,
    },
  ],
  exports: [MatchService, MatchGateway, MatchDataCollectionService],
})
export class MatchModule {}
