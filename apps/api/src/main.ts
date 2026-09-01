import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as cookieParser from "cookie-parser";
import * as dotenv from "dotenv";
import { resolve } from "path";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { RedisIoAdapter } from "./adapters/redis-io.adapter";

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

  // Cloudflared/nginx 뒤에서 실제 클라이언트 IP를 사용해야
  // 전역 Throttler가 프록시 컨테이너 IP 하나로 모든 사용자를 묶지 않는다.
  //
  // 단, `true`(모든 프록시 신뢰)를 쓰면 안 된다. proxy-addr가 X-Forwarded-For의
  // 맨 앞 값까지 거슬러 올라가므로, 클라이언트가 헤더에 아무 IP나 넣어 보내면
  // 그 값이 그대로 req.ip가 되어 IP 기반 rate limit이 통째로 무력화된다.
  // 신뢰 범위를 사설 대역으로 좁혀 도커 네트워크의 nginx만 프록시로 인정한다.
  const httpAdapter = app.getHttpAdapter().getInstance();
  if (typeof httpAdapter.set === "function") {
    const configuredProxies = configService.get<string>("TRUSTED_PROXIES");
    const trustedProxies = configuredProxies
      ? configuredProxies
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : ["loopback", "linklocal", "uniquelocal"];
    httpAdapter.set("trust proxy", trustedProxies);
  }

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
          ],
        },
      },
      // 업로드 이미지를 Next.js 프록시(다른 origin)에서 로드할 수 있도록 허용
      crossOriginResourcePolicy: { policy: "cross-origin" },
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

  // Redis pub/sub 어댑터 연결 — 실패 시 인메모리 모드로 graceful fallback
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

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
