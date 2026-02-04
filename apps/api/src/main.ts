import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { AppModule } from "./app.module";

// ConfigModule이 작동하기 전에 .env 파일을 먼저 로드
const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
];

console.log('📂 CWD:', process.cwd());
console.log('📂 .env paths:', envPaths);

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath, override: true });
  console.log(`📄 Loading ${envPath}:`, result.error ? 'FAILED' : 'OK');
}

console.log('🔑 DISCORD_CLIENT_ID after dotenv:', process.env.DISCORD_CLIENT_ID);
console.log('🔑 DISCORD_CALLBACK_URL after dotenv:', process.env.DISCORD_CALLBACK_URL);
console.log('🔑 GOOGLE_CLIENT_ID after dotenv:', process.env.GOOGLE_CLIENT_ID);
console.log('🔑 GOOGLE_CALLBACK_URL after dotenv:', process.env.GOOGLE_CALLBACK_URL);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Use cookie-parser middleware
  app.use(cookieParser());

  // Security
  app.use(helmet());

  // CORS
  const corsOrigins = configService
    .get("CORS_ORIGINS")
    ?.split(",")
    .map((origin: string) => origin.trim()) || [
    configService.get("APP_URL") || "http://localhost:3000",
  ];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global prefix
  app.setGlobalPrefix("api");

  const port = configService.get("PORT") || 4000;
  await app.listen(port);

  console.log(`🚀 API Server running on http://localhost:${port}`);
}

bootstrap();
