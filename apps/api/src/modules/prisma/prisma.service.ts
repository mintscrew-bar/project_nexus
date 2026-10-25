import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient, createPrismaAdapter } from "@nexus/database";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      // Prisma 7 은 드라이버 어댑터가 필수다. 풀 크기·대기 시간은 createPrismaAdapter 가
      // Prisma 6 기본값에 맞춰 둔다(@nexus/database 참고).
      adapter: createPrismaAdapter(),
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "info", "warn", "error"]
          : ["error"],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === "production") {
      throw new Error("cleanDatabase is not allowed in production");
    }

    const models = Reflect.ownKeys(this).filter(
      (key) =>
        typeof key === "string" && !key.startsWith("_") && !key.startsWith("$"),
    );

    return Promise.all(
      models.map((modelKey) => {
        const model = this[modelKey as keyof this];
        if (model && typeof (model as any).deleteMany === "function") {
          return (model as any).deleteMany();
        }
        return Promise.resolve();
      }),
    );
  }
}
