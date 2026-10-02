import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// PostgreSQL 임시 테이블만 수정한다. 운영 테이블은 가리고 마지막에 전부 롤백한다.
const root = new URL("../", import.meta.url);
const migrations = [
  "20261002_add_streamer_games",
  "20261002_add_board_game_scope",
];
const sql = `
BEGIN;
CREATE TEMP TABLE streamer_profiles (id text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE boards (
  id text PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL,
  "fullName" text, description text, "iconName" text,
  "order" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ON COMMIT DROP;
INSERT INTO streamer_profiles VALUES ('legacy-streamer');
INSERT INTO boards (id, slug, name) VALUES ('legacy-free', 'free', '자유'), ('legacy-notice', 'notice', '공지');
${migrations.map((name) => readFileSync(fileURLToPath(new URL(`packages/database/prisma/migrations/${name}/migration.sql`, root)), "utf8")).join("\n")}
DO $$ BEGIN
  IF (SELECT games FROM streamer_profiles WHERE id = 'legacy-streamer') <> ARRAY['LOL']::"GameTitle"[] THEN
    RAISE EXCEPTION '기존 스트리머 기본 게임 보존 실패';
  END IF;
  IF (SELECT "gameTitle" FROM boards WHERE id = 'legacy-free') <> 'LOL' THEN
    RAISE EXCEPTION '기존 롤 게시판 보존 실패';
  END IF;
  IF (SELECT "gameTitle" FROM boards WHERE id = 'legacy-notice') IS NOT NULL THEN
    RAISE EXCEPTION '공통 공지 보존 실패';
  END IF;
  IF (SELECT COUNT(*) FROM boards WHERE "gameTitle" = 'PUBG') <> 3 THEN
    RAISE EXCEPTION '배그 게시판 생성 실패';
  END IF;
END $$;
ROLLBACK;
`;
const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "nexus-postgres",
    "sh",
    "-c",
    'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ],
  { input: sql, encoding: "utf8" },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr || String(result.error));
  process.exit(1);
}
console.log("프로필·게임 범위 마이그레이션 검증 통과 (임시 테이블, 전부 롤백)");
