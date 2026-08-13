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

@Module({
  imports: [DiscordModule, NotificationModule],
  controllers: [StreamerController, ChzzkOAuthController],
  providers: [
    StreamerService,
    StreamerVerificationService,
    ChzzkOAuthService,
    ChzzkLiveProvider,
    SoopLiveProvider,
    LiveProviderRegistry,
  ],
  exports: [StreamerService],
})
export class StreamerModule {}
