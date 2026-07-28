#!/usr/bin/env node
// @ts-check
/**
 * 버전 자동 범프 (컨벤셔널 커밋 기반, "적당히" 경량 버전).
 *
 * 판정 규칙 (배포 단위 = origin/main..HEAD 커밋들의 성격을 종합):
 *   - major : 커밋에 `type!:` 또는 본문 `BREAKING CHANGE` 존재. (드묾 — 보통은 수동 지정)
 *   - minor : "유저 체감" feat 이 하나라도 있음. 즉 scope 가 인프라(ci/deploy/build/infra/deps)가 아닌 feat.
 *   - patch : 그 외 전부 (fix/chore/refactor/perf/docs/style + 인프라 feat).
 *
 * 사용:
 *   node scripts/bump-version.mjs            # 자동 판정 후 3개 package.json 갱신
 *   node scripts/bump-version.mjs --dry      # 계산만, 파일 미수정
 *   node scripts/bump-version.mjs major|minor|patch   # 등급 강제
 *   BASE_REF=origin/main node scripts/bump-version.mjs # 비교 기준 변경(기본 origin/main)
 *
 * 화면 버전(설정 페이지)은 next.config가 apps/web/package.json 을 읽어 자동 동기화하므로
 * 여기서는 세 package.json 만 갱신하면 된다.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = ["package.json", "apps/api/package.json", "apps/web/package.json"];
// feat 이어도 유저 체감이 없어 minor 로 안 올리는 scope 들
const INFRA_SCOPES = new Set(["ci", "deploy", "build", "infra", "deps", "release", "chore"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const forced = args.find((a) => ["major", "minor", "patch"].includes(a));

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

/** origin/main..HEAD 의 커밋 제목 목록 + 본문 전체를 얻는다. */
function collectCommits() {
  const base = process.env.BASE_REF || "origin/main";
  try {
    sh(`git rev-parse --verify ${base}`);
  } catch {
    console.error(`⚠️  기준 ref '${base}' 를 찾을 수 없음. git fetch 후 재시도하거나 BASE_REF 를 지정하세요.`);
    process.exit(1);
  }
  const range = `${base}..HEAD`;
  const subjects = sh(`git log --format=%s ${range}`).split("\n").filter(Boolean);
  const bodies = sh(`git log --format=%B ${range}`);
  return { subjects, bodies, range };
}

/** 커밋들로부터 major|minor|patch 판정 */
function decideBump(subjects, bodies) {
  const reasons = [];
  let level = "patch";

  if (/BREAKING CHANGE/.test(bodies) || subjects.some((s) => /^\w+(\([^)]*\))?!:/.test(s))) {
    reasons.push("BREAKING CHANGE 또는 `!:` 발견 → major");
    return { level: "major", reasons };
  }

  // type(scope): ... 파싱
  const featScopeRe = /^feat(?:\(([^)]*)\))?!?:/;
  const userFeats = subjects.filter((s) => {
    const m = s.match(featScopeRe);
    if (!m) return false;
    const scope = (m[1] || "").trim();
    return !INFRA_SCOPES.has(scope); // 인프라 scope feat 은 제외
  });
  if (userFeats.length > 0) {
    level = "minor";
    reasons.push(`유저 체감 feat ${userFeats.length}건 → minor`);
    userFeats.slice(0, 5).forEach((s) => reasons.push(`  · ${s}`));
  } else {
    reasons.push("유저 체감 feat 없음 → patch");
  }
  return { level, reasons };
}

function nextVersion(current, level) {
  const [maj, min, pat] = current.split(".").map(Number);
  if (level === "major") return `${maj + 1}.0.0`;
  if (level === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function readVersion(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8")).version;
}

// --- 실행 ---
const current = readVersion("package.json");
let level, reasons;

if (forced) {
  level = forced;
  reasons = [`등급 강제 지정: ${forced}`];
} else {
  const { subjects, bodies, range } = collectCommits();
  if (subjects.length === 0) {
    console.error(`⚠️  ${range} 에 커밋이 없습니다. 올릴 변경분이 없어 종료합니다.`);
    process.exit(1);
  }
  ({ level, reasons } = decideBump(subjects, bodies));
}

const next = nextVersion(current, level);

console.log(`\n버전 범프: ${current} → ${next}  (${level})`);
console.log("판정 근거:");
reasons.forEach((r) => console.log(`  ${r}`));

// 세 package.json 버전 일치 확인
const mismatched = TARGETS.filter((t) => readVersion(t) !== current);
if (mismatched.length > 0) {
  console.error(`\n⚠️  버전이 어긋난 파일: ${mismatched.join(", ")} (기준 ${current}). 수동 확인 필요.`);
  process.exit(1);
}

if (dryRun) {
  console.log("\n[--dry] 파일은 수정하지 않았습니다.");
  process.exit(0);
}

for (const rel of TARGETS) {
  const path = join(ROOT, rel);
  const raw = readFileSync(path, "utf8");
  // version 필드만 정확히 치환 (다른 "x.y.z" 오염 방지)
  const updated = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);
  writeFileSync(path, updated);
  console.log(`  ✓ ${rel}`);
}
console.log(`\n완료. 커밋: chore: 버전 ${next}로 범프`);
