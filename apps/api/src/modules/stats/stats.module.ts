import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";
import { LabStatsService } from "./lab-stats.service";
import { RiotModule } from "../riot/riot.module";

@Module({
  imports: [RiotModule],
  controllers: [StatsController],
  providers: [StatsService, LabStatsService],
  exports: [StatsService, LabStatsService],
})
export class StatsModule {}
