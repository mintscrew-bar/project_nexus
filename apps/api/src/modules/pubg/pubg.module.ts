import { Module } from "@nestjs/common";
import { PubgController } from "./pubg.controller";
import { PubgService } from "./pubg.service";
import { PubgApiService } from "./pubg-api.service";
import { PubgRateLimiterService } from "./pubg-rate-limiter.service";

@Module({
  controllers: [PubgController],
  providers: [PubgService, PubgApiService, PubgRateLimiterService],
  // 결과 수집(Phase 5)과 로비가 계정·매치 조회를 함께 쓴다.
  exports: [PubgService, PubgApiService],
})
export class PubgModule {}
