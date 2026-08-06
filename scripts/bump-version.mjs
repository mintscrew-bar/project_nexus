#!/usr/bin/env node
// @ts-check
/**
 * 컨벤셔널 커밋을 기준으로 앱 버전을 올리고 세 package.json을 동기화한다.
 *
 * 사용:
 *   pnpm bump
 *   pnpm bump --dry
 *   pnpm bump major|minor|patch
 *   BASE_REF=<ref> pnpm bump
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = ["package.json", "apps/api/package.json", "apps/web/package.json"];
const INFRA_SCOPES = new Set([
  "ci",
  "deploy",
  "build",
  "infra",
  "deps",
  "release",
  "chore",
]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const forced = args.find((arg) => ["major", "minor", "patch"].includes(arg));

/** @param {string[]} commandArgs */
function git(commandArgs) {
  return execFileSync("git", commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

function collectCommits() {
  const base = process.env.BASE_REF || "origin/main";
  try {
    git(["rev-parse", "--verify", base]);
  } catch {
    console.error(
      `⚠️  기준 ref '${base}'를 찾을 수 없습니다. git fetch 후 다시 실행하거나 BASE_REF를 지정하세요.`,
    );
    process.exit(1);
  }

  const range = `${base}..HEAD`;
  const subjects = git(["log", "--format=%s", range])
    .split("\n")
    .filter(Boolean);
  const bodies = git(["log", "--format=%B", range]);
  return { subjects, bodies, range };
}

/**
 * @param {string[]} subjects
 * @param {string} bodies
 */
function decideBump(subjects, bodies) {
  const reasons = [];

  if (
    /BREAKING CHANGE/.test(bodies) ||
    subjects.some((subject) => /^\w+(\([^)]*\))?!:/.test(subject))
  ) {
    reasons.push("BREAKING CHANGE 또는 !: 발견 → major");
    return { level: "major", reasons };
  }

  const featScopePattern = /^feat(?:\(([^)]*)\))?!?:/;
  const userFeatures = subjects.filter((subject) => {
    const match = subject.match(featScopePattern);
    if (!match) return false;
    return !INFRA_SCOPES.has((match[1] || "").trim());
  });

  if (userFeatures.length > 0) {
    reasons.push(`유저 체감 feat ${userFeatures.length}건 → minor`);
    userFeatures
      .slice(0, 5)
      .forEach((subject) => reasons.push(`  · ${subject}`));
    return { level: "minor", reasons };
  }

  reasons.push("유저 체감 feat 없음 → patch");
  return { level: "patch", reasons };
}

/** @param {string} current @param {string} level */
function nextVersion(current, level) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`지원하지 않는 버전 형식: ${current}`);
  }
  const [major, minor, patch] = parts;
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** @param {string} relativePath */
function readVersion(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8")).version;
}

const current = readVersion("package.json");
let level;
let reasons;

if (forced) {
  level = forced;
  reasons = [`등급 강제 지정: ${forced}`];
} else {
  const { subjects, bodies, range } = collectCommits();
  if (subjects.length === 0) {
    console.error(`⚠️  ${range}에 커밋이 없어 종료합니다.`);
    process.exit(1);
  }
  ({ level, reasons } = decideBump(subjects, bodies));
}

const next = nextVersion(current, level);
console.log(`\n버전 범프: ${current} → ${next} (${level})`);
console.log("판정 근거:");
reasons.forEach((reason) => console.log(`  ${reason}`));

const mismatched = TARGETS.filter((target) => readVersion(target) !== current);
if (mismatched.length > 0) {
  console.error(
    `\n⚠️  버전이 어긋난 파일: ${mismatched.join(", ")} (기준 ${current})`,
  );
  process.exit(1);
}

if (dryRun) {
  console.log("\n[--dry] 파일은 수정하지 않았습니다.");
  process.exit(0);
}

for (const relativePath of TARGETS) {
  const path = join(ROOT, relativePath);
  const source = readFileSync(path, "utf8");
  const updated = source.replace(
    /("version":\s*")\d+\.\d+\.\d+(")/,
    `$1${next}$2`,
  );
  writeFileSync(path, updated);
  console.log(`  ✓ ${relativePath}`);
}

console.log(`\n완료. 커밋: chore: 버전 ${next}로 범프`);
