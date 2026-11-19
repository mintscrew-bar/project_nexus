import { Module } from "@nestjs/common";
import { MedalController } from "./medal.controller";
import { MedalService } from "./medal.service";
import { MatchMedalService } from "./match-medal.service";
import { ShopController } from "./shop.controller";
import { ShopService } from "./shop.service";
import { AttendanceService } from "./attendance.service";
import { ShopCatalogService } from "./shop-catalog.service";
import { ShopAdminService } from "./shop-admin.service";
import { ShopAdminController } from "./shop-admin.controller";

/**
 * 메달 — 원장·잔액·관리자 조정(Task 3)과 꾸미기 상점 구매·장착(Task 8·9).
 * 경기 메달 지급(Task 21)은 MatchMedalService — 경기·칭찬 모듈이 정산을 부른다.
 */
@Module({
  controllers: [MedalController, ShopController, ShopAdminController],
  providers: [
    MedalService,
    ShopService,
    MatchMedalService,
    AttendanceService,
    ShopCatalogService,
    ShopAdminService,
  ],
  exports: [MedalService, ShopService, MatchMedalService],
})
export class MedalModule {}
