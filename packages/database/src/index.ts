// @nexus/database — Prisma 클라이언트와 DB 접속 설정의 단일 출처.
//
// Prisma 7 부터 클라이언트는 node_modules(@prisma/client)가 아니라 이 패키지의
// src/generated/prisma 로 생성되고(`pnpm db:generate`), tsc 가 dist 로 함께 컴파일한다.
// PrismaClient·Prisma 네임스페이스·모델 타입·enum 을 예전 @prisma/client 와 같은 이름으로 내보낸다.
import { PrismaPg } from "@prisma/adapter-pg";

export * from "./generated/prisma/client";

// Prisma 6(Rust 엔진) 기본값에 맞춘 풀 설정.
// 7 은 node-postgres(pg) 풀을 쓰는데 pg 기본값은 최대 10개·획득 대기 무제한이라 동작이 달라진다.
// - 최대 연결 수: v6 은 물리 코어×2+1 — 이 호스트에서 13 이었다(부팅 로그 "pool with 13 connections").
// - 연결 획득 대기: v6 은 접속 5초 + 풀 대기 10초. pg 는 둘을 합친 한 값이라 10초로 둔다.
//   (무제한이면 DB 가 멈췄을 때 요청이 끝없이 쌓인다)
const DEFAULT_POOL_MAX = 13;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000;

/**
 * DATABASE_URL 로 pg 어댑터를 만든다. PrismaClient 생성 시 `{ adapter }` 로 넘긴다.
 *
 * URL 의 Prisma 전용 쿼리 파라미터는 pg 가 모르므로 떼어 내 옵션으로 옮긴다.
 * - `schema` → 어댑터의 schema 옵션 (운영 URL 은 `?schema=public`)
 * - `connection_limit` → 풀 최대 연결 수
 */
export function createPrismaAdapter(databaseUrl?: string) {
  // Prisma 6 의 PrismaClient 는 DATABASE_URL 이 없으면 .env 를 알아서 읽었다. 7 은 안 읽으므로
  // 로컬 스크립트(seed·backfill 등)가 깨지지 않게 같은 동작을 여기서 재현한다.
  // 이미 들어 있는 환경변수는 덮지 않는다(운영 컨테이너·API 는 항상 설정돼 있다).
  if (!databaseUrl && !process.env.DATABASE_URL) {
    try {
      process.loadEnvFile();
    } catch {
      // cwd 에 .env 가 없다 — 아래에서 설정 누락으로 실패시킨다
    }
  }
  databaseUrl ??= process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
  }

  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema") ?? undefined;
  const connectionLimit = Number(url.searchParams.get("connection_limit"));
  url.searchParams.delete("schema");
  url.searchParams.delete("connection_limit");

  return new PrismaPg(
    {
      connectionString: url.toString(),
      max: connectionLimit > 0 ? connectionLimit : DEFAULT_POOL_MAX,
      connectionTimeoutMillis: DEFAULT_ACQUIRE_TIMEOUT_MS,
    },
    { schema },
  );
}
