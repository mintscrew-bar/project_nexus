import { Module } from "@nestjs/common";
import { MatchController } from "./match.controller";
import { MatchService } from "./match.service";
import { MatchGateway } from "./match.gateway";
import { RiotModule } from "../riot/riot.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule, RiotModule],
  controllers: [MatchController],
  providers: [MatchService, MatchGateway],
  exports: [MatchService, MatchGateway],
})
export class MatchModule {}
