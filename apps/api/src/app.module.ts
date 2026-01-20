import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./modules/auth/auth.module";
import { UserModule } from "./modules/user/user.module";
import { RoomModule } from "./modules/room/room.module";
import { AuctionModule } from "./modules/auction/auction.module";
import { MatchModule } from "./modules/match/match.module";
import { RiotModule } from "./modules/riot/riot.module";
import { DiscordModule } from "./modules/discord/discord.module";
import { ClanModule } from "./modules/clan/clan.module";
import { CommunityModule } from "./modules/community/community.module";
import { ReputationModule } from "./modules/reputation/reputation.module";
import { FriendModule } from "./modules/friend/friend.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { RedisModule } from "./modules/redis/redis.module";
import { HealthController } from "./health.controller";
import { RiotTournamentService } from "./modules/riot/riot-tournament.service";

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["@.env", ".env.local", ".env"],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Core modules
    PrismaModule,
    RedisModule,

    // Feature modules
    AuthModule,
    UserModule,
    RoomModule,
    AuctionModule,
    MatchModule,
    RiotModule,
    DiscordModule,
    ClanModule,
    CommunityModule,
    ReputationModule,
    FriendModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly tournamentService: RiotTournamentService) {}

  async onModuleInit() {
    // Tournament API 초기화 (선택사항)
    // 환경변수에 RIOT_TOURNAMENT_PROVIDER_ID와 RIOT_TOURNAMENT_ID가 모두 있으면 초기화
    const hasProviderId = process.env.RIOT_TOURNAMENT_PROVIDER_ID;
    const hasTournamentId = process.env.RIOT_TOURNAMENT_ID;

    if (hasProviderId && hasTournamentId) {
      try {
        await this.tournamentService.initialize();
        console.log("✅ Tournament API initialized");
      } catch (_error) {
        console.warn(
          "⚠️  Tournament API initialization failed. Tournament Code feature will not be available.",
        );
      }
    } else {
      console.log(
        "ℹ️  Tournament API not configured. Set RIOT_TOURNAMENT_PROVIDER_ID and RIOT_TOURNAMENT_ID to enable.",
      );
    }
  }
}
