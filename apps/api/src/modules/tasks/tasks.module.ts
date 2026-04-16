import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { RiotModule } from "../riot/riot.module";
import { StatsModule } from "../stats/stats.module";

@Module({
  imports: [RiotModule, StatsModule],
  providers: [TasksService],
})
export class TasksModule {}
