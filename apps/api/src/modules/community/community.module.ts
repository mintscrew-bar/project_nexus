import { Module } from "@nestjs/common";
import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";
import { NotificationModule } from "../notification/notification.module";
import { RedisModule } from "../redis/redis.module";
import { UploadModule } from "../upload/upload.module";
import { BoardModule } from "../board/board.module";

@Module({
  imports: [NotificationModule, RedisModule, UploadModule, BoardModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
