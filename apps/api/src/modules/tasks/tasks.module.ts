import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { LabTasksService } from "./lab-tasks.service";
import { RiotModule } from "../riot/riot.module";
import { StatsModule } from "../stats/stats.module";
import { MatchModule } from "../match/match.module";

@Module({
  imports: [RiotModule, StatsModule, MatchModule],
  providers: [TasksService, LabTasksService],
  exports: [TasksService, LabTasksService],
})
export class TasksModule {}
