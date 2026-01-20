import { Module } from "@nestjs/common";
import { ClanController } from "./clan.controller";
import { ClanService } from "./clan.service";
import { ClanGateway } from "./clan.gateway";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ClanController],
  providers: [ClanService, ClanGateway],
  exports: [ClanService, ClanGateway],
})
export class ClanModule {}
