import { Module } from "@nestjs/common";
import { DmService } from "./dm.service";
import { DmGateway } from "./dm.gateway";
import { DmController } from "./dm.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DmController],
  providers: [DmService, DmGateway],
  exports: [DmService],
})
export class DmModule {}
