import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as cookieParser from "cookie-parser";
import * as dotenv from "dotenv";
import { resolve } from "path";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";

const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", "..", ".env"),
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (process.env.NODE_ENV !== "production") {
    console.log(`Loading ${envPath}:`, result.error ? "FAILED" : "OK");
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["log", "error", "warn", "debug"],
  });

  const configService = app.get(ConfigService);

  app.use(cookieParser());

  // Security Headers 강화 (CSP + HSTS 포함)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            "data:",
            "https://ddragon.leagueoflegends.com",
            "https://cdn.discordapp.com",
            "https://raw.communitydragon.org",
            "https://lh3.googleusercontent.com",
          ],
        },
      },
      // HTTPS 강제: HSTS 헤더 (1년, 서브도메인 포함)
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
    }),
  );

  // CORS_ORIGINS 환경변수 파싱 + 유효한 URL만 허용 (잘못된 origin 필터링)
  const rawOrigins = configService.get<string>("CORS_ORIGINS");
  const corsOrigins: string[] = rawOrigins
    ? rawOrigins
        .split(",")
        .map((o) => o.trim())
        .filter((o) => {
          try {
            new URL(o);
            return true;
          } catch {
            console.warn(`[CORS] 유효하지 않은 origin 무시: "${o}"`);
            return false;
          }
        })
    : [configService.get("APP_URL") || "http://localhost:3000"];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix("api");

  // SIGTERM / SIGINT 수신 시 onApplicationShutdown 훅 실행 (Graceful Shutdown)
  app.enableShutdownHooks();

  const port = configService.get("PORT") || 4000;
  await app.listen(port);

  console.log(`API Server running on port ${port}`);

  // PM2 클러스터 모드: 서버 준비 완료 시그널 전송
  if (process.send) {
    process.send("ready");
  }
}

bootstrap();
