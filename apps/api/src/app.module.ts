import {
  Module,
  OnModuleInit,
  OnApplicationShutdown,
  Logger,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { ServeStaticModule } from "@nestjs/serve-static";
import { EventEmitterModule } from "@nestjs/event-emitter";
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
import { TasksModule } from "./modules/tasks/tasks.module";
import { RankingModule } from "./modules/ranking/ranking.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { RedisModule } from "./modules/redis/redis.module";
import { ShutdownModule } from "./modules/common/shutdown.module";
import { ShutdownService } from "./modules/common/shutdown.service";
import { PrismaService } from "./modules/prisma/prisma.service";
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
        resolve(projectRoot, ".env.local"),
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

    // 애플리케이션 내부 이벤트 버스 (Discord 음성 상태 → Room Gateway 연동 등에 사용)
    EventEmitterModule.forRoot(),

    // Static file serving for uploads
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "uploads"),
      serveRoot: "/uploads",
    }),

    // Core modules
    PrismaModule,
    RedisModule,
    ShutdownModule,

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
    TasksModule,
    RankingModule,
  ],
  controllers: [HealthController],
  providers: [
    // ThrottlerGuard 글로벌 등록 — 모든 HTTP 엔드포인트에 Rate Limiting 적용
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AppModule.name);

  // SIGTERM drain 설정: 진행 중인 방을 최대 60초 기다린 후 종료
  private readonly DRAIN_TIMEOUT_MS = 60_000;
  private readonly DRAIN_CHECK_INTERVAL_MS = 5_000;

  constructor(
    private readonly tournamentService: RiotTournamentService,
    private readonly shutdownService: ShutdownService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * SIGTERM / SIGINT 수신 시 호출 (NestJS enableShutdownHooks)
   *
   * 1. ShutdownService 플래그 설정 → 신규 방 생성 / 게임 시작 차단
   * 2. 진행 중인 방(WAITING·COMPLETED 외 모든 상태)이 없어질 때까지 최대 60초 대기
   * 3. 대기 완료 또는 타임아웃 후 NestJS가 서버를 닫음
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.shutdownService.setShuttingDown();
    this.logger.warn(
      `[Shutdown] ${signal ?? "UNKNOWN"} 수신 — 진행 중인 방 드레인 시작`,
    );

    const start = Date.now();

    while (Date.now() - start < this.DRAIN_TIMEOUT_MS) {
      const activeCount = await this.prisma.room.count({
        where: {
          // WAITING(대기 중)과 COMPLETED(완료)를 제외한 모든 상태 = 진행 중
          status: { notIn: ["WAITING", "COMPLETED"] },
        },
      });

      if (activeCount === 0) {
        this.logger.log("[Shutdown] 진행 중인 방 없음 — 즉시 종료");
        return;
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      this.logger.warn(
        `[Shutdown] 진행 중인 방 ${activeCount}개 (${elapsed}s 경과) — ${this.DRAIN_CHECK_INTERVAL_MS / 1000}초 후 재확인`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, this.DRAIN_CHECK_INTERVAL_MS),
      );
    }

    this.logger.warn("[Shutdown] 드레인 타임아웃(60s) — 강제 종료");
  }

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
