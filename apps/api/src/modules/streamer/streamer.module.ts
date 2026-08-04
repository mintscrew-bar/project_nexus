import { Module } from "@nestjs/common";
import { StreamerController } from "./streamer.controller";
import { StreamerService } from "./streamer.service";
import { StreamerVerificationService } from "./streamer-verification.service";
import { ChzzkLiveProvider } from "./providers/chzzk-live.provider";
import { SoopLiveProvider } from "./providers/soop-live.provider";
import { LiveProviderRegistry } from "./providers/live-provider.registry";

@Module({
  controllers: [StreamerController],
  providers: [
    StreamerService,
    StreamerVerificationService,
    ChzzkLiveProvider,
    SoopLiveProvider,
    LiveProviderRegistry,
  ],
  exports: [StreamerService],
})
export class StreamerModule {}
