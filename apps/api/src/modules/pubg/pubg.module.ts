import { Module } from "@nestjs/common";
import { DiscordModule } from "../discord/discord.module";
import { DiscordBotService } from "../discord/discord-bot.service";
import { PubgController } from "./pubg.controller";
import { PubgService } from "./pubg.service";
import { PubgApiService } from "./pubg-api.service";
import { PubgRateLimiterService } from "./pubg-rate-limiter.service";
import { PubgKillMatchService } from "./pubg-kill-match.service";
import { PubgHistoryService } from "./pubg-history.service";

@Module({
  imports: [DiscordModule],
  controllers: [PubgController],
  providers: [
    PubgService,
    PubgApiService,
    PubgRateLimiterService,
    PubgKillMatchService,
    PubgHistoryService,
    // 봇이 꺼져 있어도 결과 보고는 되어야 해서 선택 의존으로 넣는다.
    { provide: "DISCORD_BOT_SERVICE", useExisting: DiscordBotService },
  ],
  // 결과 수집(Phase 5)과 로비가 계정·매치 조회를 함께 쓴다.
  exports: [
    PubgService,
    PubgApiService,
    PubgKillMatchService,
    PubgHistoryService,
  ],
})
export class PubgModule {}
