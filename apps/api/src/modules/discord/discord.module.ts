import { Module, OnModuleInit } from "@nestjs/common";
import { DiscordService } from "./discord.service";
import { DiscordBotService } from "./discord-bot.service";
import { DiscordVoiceService } from "./discord-voice.service";

@Module({
  providers: [DiscordService, DiscordBotService, DiscordVoiceService],
  exports: [DiscordService, DiscordBotService, DiscordVoiceService],
})
export class DiscordModule implements OnModuleInit {
  constructor(
    private readonly botService: DiscordBotService,
    private readonly voiceService: DiscordVoiceService,
  ) {}

  async onModuleInit() {
    // Connect VoiceService with Bot's Discord client
    const client = this.botService.getClient();
    this.voiceService.setClient(client);
    this.botService.setVoiceService(this.voiceService);
  }
}
