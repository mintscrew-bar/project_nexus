import { Module } from "@nestjs/common";
import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";
import { NotificationModule } from "../notification/notification.module";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [NotificationModule, RedisModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
