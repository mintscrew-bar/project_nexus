import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DiscordModule } from "../discord/discord.module";
import { DiscordBotService } from "../discord/discord-bot.service";
import { ScrimController } from "./scrim.controller";
import { ScrimService } from "./scrim.service";
import { ScrimGateway } from "./scrim.gateway";

@Module({
  imports: [AuthModule, DiscordModule],
  controllers: [ScrimController],
  providers: [
    ScrimService,
    ScrimGateway,
    // 봇이 꺼져 있어도 스크림은 굴러가야 해서 선택 의존으로 넣는다.
    { provide: "DISCORD_BOT_SERVICE", useExisting: DiscordBotService },
  ],
  exports: [ScrimService],
})
export class ScrimModule {}
