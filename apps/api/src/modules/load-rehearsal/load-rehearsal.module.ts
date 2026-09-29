import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RoomModule } from "../room/room.module";
import { AdminModule } from "../admin/admin.module";
import { AuctionModule } from "../auction/auction.module";
import { LoadRehearsalController } from "./load-rehearsal.controller";
import { LoadRehearsalService } from "./load-rehearsal.service";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => RoomModule),
    forwardRef(() => AdminModule),
    forwardRef(() => AuctionModule),
  ],
  controllers: [LoadRehearsalController],
  providers: [LoadRehearsalService],
  exports: [LoadRehearsalService],
})
export class LoadRehearsalModule {}
