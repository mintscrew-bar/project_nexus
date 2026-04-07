import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { RiotModule } from "../riot/riot.module";

@Module({
  imports: [RiotModule],
  providers: [TasksService],
})
export class TasksModule {}
