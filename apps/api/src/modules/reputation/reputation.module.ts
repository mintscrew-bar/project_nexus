import { Module } from "@nestjs/common";
import { ReputationController } from "./reputation.controller";
import { ReputationService } from "./reputation.service";
import { DiscordModule } from "../discord/discord.module";

@Module({
  imports: [DiscordModule],
  controllers: [ReputationController],
  providers: [ReputationService],
  exports: [ReputationService],
})
export class ReputationModule {}
