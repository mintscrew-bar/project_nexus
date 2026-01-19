import { Module } from "@nestjs/common";
import { DiscordService } from "./discord.service";
import { DiscordBotService } from "./discord-bot.service";

@Module({
  providers: [DiscordService, DiscordBotService],
  exports: [DiscordService, DiscordBotService],
})
export class DiscordModule {}
