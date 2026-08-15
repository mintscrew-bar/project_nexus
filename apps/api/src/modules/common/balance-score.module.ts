import { Global, Module } from "@nestjs/common";
import { BalanceScoreService } from "./balance-score.service";

/**
 * 밸런스 점수 캐시는 라이엇 계정(riot)·방(room)·랭킹(ranking) 등 여러 모듈에서
 * 갱신·조회한다. 모듈마다 import 를 늘리는 대신 전역으로 둔다. (PrismaModule 과 동일)
 */
@Global()
@Module({
  providers: [BalanceScoreService],
  exports: [BalanceScoreService],
})
export class BalanceScoreModule {}
