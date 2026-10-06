import { Module, forwardRef } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PrismaModule } from "../prisma/prisma.module";
import { RoomModule } from "../room/room.module";
import { TasksModule } from "../tasks/tasks.module";
import { DiscordModule } from "../discord/discord.module";
import { DmModule } from "../dm/dm.module";
import { NotificationModule } from "../notification/notification.module";
import { AdminStatsSnapshotService } from "./admin-stats-snapshot.service";
import { AdminOpsAlertService } from "./admin-ops-alert.service";
import { ClientErrorLogController } from "./client-error-log.controller";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => RoomModule),
    TasksModule,
    DiscordModule,
    DmModule,
    NotificationModule,
  ],
  controllers: [AdminController, ClientErrorLogController],
  providers: [AdminService, AdminStatsSnapshotService, AdminOpsAlertService],
  exports: [AdminService],
})
export class AdminModule {}
