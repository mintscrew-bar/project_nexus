import { Module, forwardRef } from "@nestjs/common";
import { ClanController } from "./clan.controller";
import { ClanService } from "./clan.service";
import { ClanGateway } from "./clan.gateway";
import { AuthModule } from "../auth/auth.module";
import { NotificationModule } from "../notification/notification.module";
import { UploadModule } from "../upload/upload.module";

@Module({
  imports: [AuthModule, forwardRef(() => NotificationModule), UploadModule],
  controllers: [ClanController],
  providers: [ClanService, ClanGateway],
  exports: [ClanService, ClanGateway],
})
export class ClanModule {}
