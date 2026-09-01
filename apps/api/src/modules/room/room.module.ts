import { Module, OnModuleInit, forwardRef } from "@nestjs/common";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { RoomGateway } from "./room.gateway";
import { SnakeDraftService } from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";
import { AuthModule } from "../auth/auth.module";
import { AuctionModule } from "../auction/auction.module";
import { RoleSelectionModule } from "../role-selection/role-selection.module";
import { MatchModule } from "../match/match.module";
import { DiscordModule } from "../discord/discord.module";
import { DiscordBotService } from "../discord/discord-bot.service";
import { DiscordVoiceService } from "../discord/discord-voice.service";
import { StreamerModule } from "../streamer/streamer.module";
import { StatsModule } from "../stats/stats.module";

@Module({
  imports: [
    AuthModule,
    forwardRef(() => AuctionModule),
    forwardRef(() => RoleSelectionModule),
    forwardRef(() => MatchModule),
    DiscordModule,
    StreamerModule,
    StatsModule,
  ],
  controllers: [RoomController],
  providers: [
    RoomService,
    RoomGateway,
    SnakeDraftService,
    SnakeDraftGateway,
    {
      provide: "DISCORD_BOT_SERVICE",
      useExisting: DiscordBotService,
    },
    {
      provide: "DISCORD_VOICE_SERVICE",
      useExisting: DiscordVoiceService,
    },
  ],
  exports: [RoomService, RoomGateway, SnakeDraftService, SnakeDraftGateway],
})
export class RoomModule implements OnModuleInit {
  constructor(
    private readonly roomService: RoomService,
    private readonly discordBotService: DiscordBotService,
  ) {}

  onModuleInit() {
    // 디스코드 모집 공지의 "참가하기" 버튼이 방 참가를 실행할 수 있게 연결한다.
    // RoomModule이 DiscordModule을 임포트하므로 반대 방향 임포트는 순환이 된다.
    // 봇이 이미 쓰는 세터 주입 방식(setVoiceService)과 같은 형태로 배선한다.
    this.discordBotService.setRoomJoiner(this.roomService);
  }
}
