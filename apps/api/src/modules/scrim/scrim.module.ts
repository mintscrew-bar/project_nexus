import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScrimController } from "./scrim.controller";
import { ScrimService } from "./scrim.service";
import { ScrimGateway } from "./scrim.gateway";

@Module({
  imports: [AuthModule],
  controllers: [ScrimController],
  providers: [ScrimService, ScrimGateway],
  exports: [ScrimService],
})
export class ScrimModule {}
