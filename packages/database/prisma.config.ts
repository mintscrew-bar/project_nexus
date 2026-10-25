// Prisma CLI 설정 (Prisma 7 부터 스키마 경로·마이그레이션 경로·접속 URL 은 여기서 준다).
//
// 쓰는 곳이 두 군데라 경로는 이 파일 기준 상대경로로 둔다:
//   - 로컬/CI: packages/database 에서 `pnpm db:generate`, `db:push` 등
//   - 운영 API 컨테이너: /app/prisma.config.ts 로 복사돼 entrypoint 의 `migrate deploy` 가 읽는다
//     (같은 폴더에 prisma/ 가 있다)
import { defineConfig } from "prisma/config";

// Prisma 7 은 .env 를 자동으로 읽지 않는다. 로컬에서는 이 폴더의 .env 를 읽어 준다.
// 이미 들어 있는 환경변수(CI·컨테이너)는 덮지 않는다. 파일이 없으면 조용히 넘어간다.
try {
  process.loadEnvFile();
} catch {
  // .env 없음 — 환경변수만 쓴다
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // generate 는 URL 이 필요 없다 — CI 처럼 DATABASE_URL 이 없는 곳에서도 돌아가도록 빈 값을 허용한다
    url: process.env.DATABASE_URL ?? "",
  },
});
