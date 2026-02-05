import { Module } from "@nestjs/common";
import { RiotController } from "./riot.controller";
import { RiotService } from "./riot.service";
import { DataDragonService } from "./data-dragon.service";
import { RiotTournamentService } from "./riot-tournament.service";
import { RiotMatchService } from "./riot-match.service";
import { RiotSpectatorService } from "./riot-spectator.service";

@Module({
  controllers: [RiotController],
  providers: [RiotService, DataDragonService, RiotTournamentService, RiotMatchService, RiotSpectatorService],
  exports: [RiotService, DataDragonService, RiotTournamentService, RiotMatchService, RiotSpectatorService],
})
export class RiotModule {}
