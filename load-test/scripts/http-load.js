/**
 * Nexus Fresh — HTTP API 부하 테스트
 * Node.js 내장 http 모듈만 사용 (npm install 불필요)
 *
 * 사용법:
 *   node scripts/http-load.js          # 일반 테스트
 *   node scripts/http-load.js --stress # 스트레스 테스트
 */

const http = require("http");

const BASE = { host: "localhost", port: 4000 };
const IS_STRESS = process.argv.includes("--stress");

// ── 테스트 단계 설정 ──────────────────────────────────────────
const PHASES = IS_STRESS
  ? [
      { name: "워밍업",    concurrent: 5,  duration: 10_000 },
      { name: "일반 부하", concurrent: 20, duration: 30_000 },
      { name: "스트레스",  concurrent: 50, duration: 20_000 },
    ]
  : [
      { name: "워밍업",    concurrent: 3,  duration: 10_000 },
      { name: "일반 부하", concurrent: 10, duration: 30_000 },
    ];

// ── 지표 수집기 ───────────────────────────────────────────────
class Metrics {
  constructor() {
    this.total = 0;
    this.success = 0;
    this.errors = 0;
    this.latencies = [];
    this.statusCodes = {};
  }

  record(statusCode, latencyMs) {
    this.total++;
    this.latencies.push(latencyMs);
    this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;
    if (statusCode >= 200 && statusCode < 400) this.success++;
    else this.errors++;
  }

  percentile(p) {
    if (!this.latencies.length) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[idx];
  }

  print(phaseName) {
    const avg = this.latencies.length
      ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
      : 0;

    console.log(`\n📊 [${phaseName}] 결과`);
    console.log(`   총 요청수   : ${this.total}`);
    console.log(`   성공 (2xx)  : ${this.success}`);
    console.log(`   에러        : ${this.errors}${this.errors > 0 ? " ⚠️" : " ✅"}`);
    console.log(`   응답시간`);
    console.log(`     평균      : ${avg}ms`);
    console.log(`     p50       : ${this.percentile(50)}ms`);
    console.log(`     p95       : ${this.percentile(95)}ms ${this.percentile(95) > 1000 ? "⚠️ 느림" : "✅"}`);
    console.log(`     p99       : ${this.percentile(99)}ms`);
    console.log(`     최대      : ${Math.max(...this.latencies)}ms`);
    console.log(`   상태코드    :`, this.statusCodes);
  }
}

// ── HTTP 요청 헬퍼 ────────────────────────────────────────────
function request(options, body = null) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request({ ...BASE, ...options }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          latency: Date.now() - start,
          body: data,
        });
      });
    });
    req.on("error", () => resolve({ status: 0, latency: Date.now() - start, body: "" }));
    if (body) req.write(body);
    req.end();
  });
}

function post(path, json) {
  const body = JSON.stringify(json);
  return request(
    {
      path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    },
    body
  );
}

function get(path, token) {
  return request({
    path,
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// ── 시나리오 정의 ─────────────────────────────────────────────
const TEST_USERS = [
  { email: "test1@nexus.dev", password: "test1234" },
  { email: "test2@nexus.dev", password: "test1234" },
  { email: "test3@nexus.dev", password: "test1234" },
];

async function scenarioLoginProfile(metrics) {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  // 1. 로그인
  const loginRes = await post("/api/auth/login", user);
  metrics.record(loginRes.status, loginRes.latency);
  if (loginRes.status !== 200) return;

  let token;
  try {
    token = JSON.parse(loginRes.body).accessToken;
  } catch {
    return;
  }
  if (!token) return;

  // 2. 내 프로필 조회
  const meRes = await get("/api/users/me", token);
  metrics.record(meRes.status, meRes.latency);
}

async function scenarioRoomList(metrics) {
  const res = await get("/api/rooms");
  metrics.record(res.status, res.latency);
}

async function scenarioClanInfo(metrics) {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

  const loginRes = await post("/api/auth/login", user);
  metrics.record(loginRes.status, loginRes.latency);
  if (loginRes.status !== 200) return;

  let token;
  try {
    token = JSON.parse(loginRes.body).accessToken;
  } catch {
    return;
  }
  if (!token) return;

  const clanRes = await get("/api/clans", token);
  metrics.record(clanRes.status, clanRes.latency);
}

// 시나리오 가중치 배분
const SCENARIOS = [
  { fn: scenarioLoginProfile, weight: 4 },
  { fn: scenarioRoomList,     weight: 3 },
  { fn: scenarioClanInfo,     weight: 3 },
];

function pickScenario() {
  const total = SCENARIOS.reduce((s, sc) => s + sc.weight, 0);
  let r = Math.random() * total;
  for (const sc of SCENARIOS) {
    r -= sc.weight;
    if (r <= 0) return sc.fn;
  }
  return SCENARIOS[0].fn;
}

// ── 단계별 실행 ───────────────────────────────────────────────
async function runPhase(phase) {
  console.log(`\n🚀 단계 시작: ${phase.name} (동시 ${phase.concurrent}명, ${phase.duration / 1000}초)`);
  const metrics = new Metrics();
  const endAt = Date.now() + phase.duration;

  // concurrent 수만큼 워커를 동시에 실행, 각 워커는 종료 전까지 계속 요청
  const workers = Array.from({ length: phase.concurrent }, async () => {
    while (Date.now() < endAt) {
      const scenario = pickScenario();
      await scenario(metrics);
    }
  });

  await Promise.all(workers);
  metrics.print(phase.name);
  return metrics;
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(50));
  console.log("  Nexus Fresh HTTP 부하 테스트");
  console.log(`  모드: ${IS_STRESS ? "스트레스" : "일반"}`);
  console.log("=".repeat(50));

  // 서버 연결 확인
  const health = await get("/api/health").catch(() => null);
  if (!health || health.status === 0) {
    // /api/health 없으면 로그인으로 연결 확인
    const check = await post("/api/auth/login", TEST_USERS[0]);
    if (check.status === 0) {
      console.error("\n❌ 서버에 연결할 수 없습니다. localhost:4000 실행 여부 확인.");
      process.exit(1);
    }
  }
  console.log("✅ 서버 연결 확인\n");

  for (const phase of PHASES) {
    await runPhase(phase);
    // 단계 사이 2초 대기
    if (phase !== PHASES[PHASES.length - 1]) {
      console.log("\n⏳ 다음 단계까지 2초 대기...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("  테스트 완료");
  console.log("=".repeat(50));
}

main().catch(console.error);
