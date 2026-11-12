import { Module } from "@nestjs/common";
import { MedalController } from "./medal.controller";
import { MedalService } from "./medal.service";

/**
 * 메달 — 원장·잔액·관리자 조정 (리텐션 기획서 Task 3).
 * 경기 메달 지급(Task 21)·상점 구매(Task 8)는 MedalService 를 가져다 쓴다.
 */
@Module({
  controllers: [MedalController],
  providers: [MedalService],
  exports: [MedalService],
})
export class MedalModule {}
