import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { NotificationGateway } from "./notification.gateway";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule, JwtModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
