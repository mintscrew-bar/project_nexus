import { Module, OnModuleInit } from "@nestjs/common";
import { DiscordService } from "./discord.service";
import { DiscordBotService } from "./discord-bot.service";
import { DiscordVoiceService } from "./discord-voice.service";
import { DiscordController } from "./discord.controller";
import { DiscordAdminAlertService } from "./discord-admin-alert.service";
import { DiscordEmojiService } from "./discord-emoji.service";
import { DiscordScheduleService } from "./discord-schedule.service";
import { DiscordAvatarRefreshService } from "./discord-avatar-refresh.service";
import { AuthModule } from "../auth/auth.module";
import { RankingModule } from "../ranking/ranking.module";
import { MedalModule } from "../medal/medal.module";
import { PubgRankingService } from "../pubg/pubg-ranking.service";

@Module({
  // 봇 명령(leaderboard·stats·attendance·medal)이 웹과 같은 값을 쓰도록 서비스를 그대로 가져온다
  imports: [AuthModule, RankingModule, MedalModule],
  controllers: [DiscordController],
  providers: [
    // PubgModule 은 DiscordModule 을 import 해서 모듈째 가져오면 순환이 된다.
    // 배그 랭킹 서비스는 Prisma 만 쓰는 상태 없는 계산이라 여기서 따로 만든다.
    PubgRankingService,
    DiscordService,
    DiscordBotService,
    DiscordVoiceService,
    DiscordAdminAlertService,
    DiscordEmojiService,
    DiscordScheduleService,
    DiscordAvatarRefreshService,
  ],
  exports: [
    DiscordService,
    DiscordBotService,
    DiscordVoiceService,
    DiscordAdminAlertService,
    DiscordEmojiService,
    DiscordScheduleService,
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
