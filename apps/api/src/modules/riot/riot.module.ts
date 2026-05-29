import { Module } from "@nestjs/common";
import { RiotController } from "./riot.controller";
import { RiotService } from "./riot.service";
import { DataDragonService } from "./data-dragon.service";
import { RiotTournamentService } from "./riot-tournament.service";
import { RiotMatchService } from "./riot-match.service";
import { RiotSpectatorService } from "./riot-spectator.service";
import { RiotRateLimiterService } from "./riot-rate-limiter.service";
import { DiscordModule } from "../discord/discord.module";

@Module({
  imports: [DiscordModule],
  controllers: [RiotController],
  providers: [
    RiotService,
    DataDragonService,
    RiotTournamentService,
    RiotMatchService,
    RiotSpectatorService,
    RiotRateLimiterService,
  ],
  exports: [
    RiotService,
    DataDragonService,
    RiotTournamentService,
    RiotMatchService,
    RiotSpectatorService,
    RiotRateLimiterService,
  ],
})
export class RiotModule {}
