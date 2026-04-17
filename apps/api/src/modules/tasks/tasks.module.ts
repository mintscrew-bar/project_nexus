import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { LabTasksService } from "./lab-tasks.service";
import { RiotModule } from "../riot/riot.module";
import { StatsModule } from "../stats/stats.module";

@Module({
  imports: [RiotModule, StatsModule],
  providers: [TasksService, LabTasksService],
  exports: [TasksService, LabTasksService],
})
export class TasksModule {}
