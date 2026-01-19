import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./modules/auth/auth.module";
import { UserModule } from "./modules/user/user.module";
import { AuctionModule } from "./modules/auction/auction.module";
import { MatchModule } from "./modules/match/match.module";
import { RiotModule } from "./modules/riot/riot.module";
import { DiscordModule } from "./modules/discord/discord.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { RedisModule } from "./modules/redis/redis.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
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
    AuctionModule,
    MatchModule,
    RiotModule,
    DiscordModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
