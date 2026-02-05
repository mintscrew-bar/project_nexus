import { Module, forwardRef } from "@nestjs/common";
import { RoleSelectionService } from "./role-selection.service";
import { RoleSelectionGateway } from "./role-selection.gateway";
import { RoleSelectionController } from "./role-selection.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { MatchModule } from "../match/match.module";

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), forwardRef(() => MatchModule)],
  controllers: [RoleSelectionController],
  providers: [RoleSelectionService, RoleSelectionGateway],
  exports: [RoleSelectionService, RoleSelectionGateway],
})
export class RoleSelectionModule {}
