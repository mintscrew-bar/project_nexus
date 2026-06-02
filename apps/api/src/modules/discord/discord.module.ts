import { Module, OnModuleInit } from "@nestjs/common";
import { DiscordService } from "./discord.service";
import { DiscordBotService } from "./discord-bot.service";
import { DiscordVoiceService } from "./discord-voice.service";
import { DiscordController } from "./discord.controller";
import { DiscordAdminAlertService } from "./discord-admin-alert.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DiscordController],
  providers: [
    DiscordService,
    DiscordBotService,
    DiscordVoiceService,
    DiscordAdminAlertService,
  ],
  exports: [
    DiscordService,
    DiscordBotService,
    DiscordVoiceService,
    DiscordAdminAlertService,
  ],
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
