import { Module } from "@nestjs/common";
import { StreamerController } from "./streamer.controller";
import { StreamerService } from "./streamer.service";
import { StreamerVerificationService } from "./streamer-verification.service";
import { ChzzkLiveProvider } from "./providers/chzzk-live.provider";
import { SoopLiveProvider } from "./providers/soop-live.provider";
import { LiveProviderRegistry } from "./providers/live-provider.registry";
import { DiscordModule } from "../discord/discord.module";
import { NotificationModule } from "../notification/notification.module";
import { ChzzkOAuthService } from "./chzzk-oauth.service";
import { ChzzkOAuthController } from "./chzzk-oauth.controller";
import { StreamerPageService } from "./streamer-page.service";
import { RankingModule } from "../ranking/ranking.module";

@Module({
  // RankingModule — 스트리머 페이지의 본인 내전 점수
  imports: [DiscordModule, NotificationModule, RankingModule],
  controllers: [StreamerController, ChzzkOAuthController],
  providers: [
    StreamerService,
    StreamerPageService,
    StreamerVerificationService,
    ChzzkOAuthService,
    ChzzkLiveProvider,
    SoopLiveProvider,
    LiveProviderRegistry,
  ],
  exports: [StreamerService],
})
export class StreamerModule {}
