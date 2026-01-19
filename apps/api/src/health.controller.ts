import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./modules/prisma/prisma.service";
import { RedisService } from "./modules/redis/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const checks = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: await this.checkDatabase(),
        redis: await this.checkRedis(),
      },
    };

    const allHealthy = Object.values(checks.services).every(
      (s) => s.status === "healthy",
    );

    return {
      ...checks,
      status: allHealthy ? "ok" : "degraded",
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "healthy" };
    } catch (_error) {
      return { status: "unhealthy", error: "Database connection failed" };
    }
  }

  private async checkRedis() {
    try {
      await this.redis.ping();
      return { status: "healthy" };
    } catch (_error) {
      return { status: "unhealthy", error: "Redis connection failed" };
    }
  }
}
