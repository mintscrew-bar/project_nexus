import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { LabTasksService } from "./lab-tasks.service";
import { StreamerTasksService } from "./streamer-tasks.service";
import { RiotModule } from "../riot/riot.module";
import { StatsModule } from "../stats/stats.module";
import { MatchModule } from "../match/match.module";
import { StreamerModule } from "../streamer/streamer.module";

@Module({
  imports: [RiotModule, StatsModule, MatchModule, StreamerModule],
  providers: [TasksService, LabTasksService, StreamerTasksService],
  exports: [TasksService, LabTasksService, StreamerTasksService],
})
export class TasksModule {}
