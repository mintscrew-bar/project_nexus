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
  const result = dotenv.config({ path: envPath, override: true });
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

  app.use(helmet());

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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix("api");

  const port = configService.get("PORT") || 4000;
  await app.listen(port);

  console.log(`API Server running on port ${port}`);
}

bootstrap();
