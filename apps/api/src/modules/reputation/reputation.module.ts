import { Module } from "@nestjs/common";
import { ReputationController } from "./reputation.controller";
import { ReputationService } from "./reputation.service";
import { CommendationService } from "./commendation.service";
import { DiscordModule } from "../discord/discord.module";

@Module({
  imports: [DiscordModule],
  controllers: [ReputationController],
  providers: [ReputationService, CommendationService],
  exports: [ReputationService, CommendationService],
})
export class ReputationModule {}
