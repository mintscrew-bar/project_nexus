import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { RoomModule } from "../room/room.module";
import { AdminModule } from "../admin/admin.module";
import { AuctionModule } from "../auction/auction.module";
import { LoadRehearsalController } from "./load-rehearsal.controller";
import { LoadRehearsalService } from "./load-rehearsal.service";

@Module({
  imports: [
    PrismaModule,
    // 시크릿은 서명할 때마다 직접 넘기므로 모듈 차원 설정은 비워 둔다.
    JwtModule.register({}),
    forwardRef(() => RoomModule),
    forwardRef(() => AdminModule),
    forwardRef(() => AuctionModule),
  ],
  controllers: [LoadRehearsalController],
  providers: [LoadRehearsalService],
  exports: [LoadRehearsalService],
})
export class LoadRehearsalModule {}
