import { Module } from "@nestjs/common";
import { RiotController } from "./riot.controller";
import { RiotService } from "./riot.service";
import { DataDragonService } from "./data-dragon.service";
import { RiotTournamentService } from "./riot-tournament.service";

@Module({
  controllers: [RiotController],
  providers: [RiotService, DataDragonService, RiotTournamentService],
  exports: [RiotService, DataDragonService, RiotTournamentService],
})
export class RiotModule {}
