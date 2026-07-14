import { Module, forwardRef } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PrismaModule } from "../prisma/prisma.module";
import { RoomModule } from "../room/room.module";
import { TasksModule } from "../tasks/tasks.module";
import { DiscordModule } from "../discord/discord.module";
import { DmModule } from "../dm/dm.module";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => RoomModule),
    TasksModule,
    DiscordModule,
    DmModule,
    NotificationModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
