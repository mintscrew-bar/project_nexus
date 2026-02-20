import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join, resolve } from "path";

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
import { PresenceModule } from "./modules/presence/presence.module";
import { RoleSelectionModule } from "./modules/role-selection/role-selection.module";
import { StatsModule } from "./modules/stats/stats.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { AdminModule } from "./modules/admin/admin.module";
import { DmModule } from "./modules/dm/dm.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { RedisModule } from "./modules/redis/redis.module";
import { HealthController } from "./health.controller";
import { RiotTournamentService } from "./modules/riot/riot-tournament.service";

// dist/에서 실행되므로 상위 디렉토리로 이동하여 .env 파일 경로 설정
const apiRoot = resolve(__dirname, "..");
const projectRoot = resolve(apiRoot, "../..");

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(apiRoot, ".env.local"),
        resolve(apiRoot, ".env"),
        resolve(projectRoot, ".env"),
      ],
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

    // Static file serving for uploads
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "uploads"),
      serveRoot: "/uploads",
    }),

    // Core modules
    PrismaModule,
    RedisModule,

    // Feature modules
    AuthModule,
    UserModule,
    RoomModule,
    AuctionModule,
    RoleSelectionModule,
    MatchModule,
    RiotModule,
    StatsModule,
    DiscordModule,
    ClanModule,
    CommunityModule,
    ReputationModule,
    FriendModule,
    PresenceModule,
    NotificationModule,
    AdminModule,
    DmModule,
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
