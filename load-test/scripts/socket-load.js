/**
 * Nexus Fresh — Socket.IO 부하 테스트
 * 프로젝트 node_modules의 socket.io-client를 재사용
 * (npm install 불필요)
 *
 * 사용법:
 *   node scripts/socket-load.js
 */

const http = require("http");
const path = require("path");

// pnpm 가상 스토어에서 socket.io-client 탐색
// pnpm은 루트 node_modules/에 직접 노출하지 않고 .pnpm/ 하위에 저장함
const IO_PATH = (() => {
  const candidates = [
    // pnpm 가상 스토어 (버전은 glob으로 찾기 어려우므로 require.resolve 사용)
    path.resolve(__dirname, "../../node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client"),
    path.resolve(__dirname, "../../node_modules/.pnpm/socket.io-client@4.8.1/node_modules/socket.io-client"),
    // 루트 node_modules (npm/yarn 환경 대비)
    path.resolve(__dirname, "../../node_modules/socket.io-client"),
    // apps/web node_modules (web 앱 의존성으로 설치된 경우)
    path.resolve(__dirname, "../../apps/web/node_modules/socket.io-client"),
  ];
  return candidates.find((p) => {
    try { require.resolve(p); return true; } catch { return false; }
  }) || candidates[2]; // 못 찾으면 기본 경로로 에러 메시지 표시
})();

let io;
try {
  io = require(IO_PATH);
} catch {
  console.error("❌ socket.io-client를 찾을 수 없습니다.");
  console.error(`   경로: ${IO_PATH}`);
  console.error("   pnpm install 이 완료됐는지 확인하세요.");
  process.exit(1);
}

const BASE_URL = "http://localhost:4000";
const TEST_USERS = [
  { email: "test1@nexus.dev", password: "test1234" },
  { email: "test2@nexus.dev", password: "test1234" },
  { email: "test3@nexus.dev", password: "test1234" },
];

// ── 지표 수집기 ───────────────────────────────────────────────
class SocketMetrics {
  constructor() {
    this.connected = 0;
    this.connectFailed = 0;
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.connectTimes = [];
    this.errors = [];
  }

  print(label) {
    const avgConnect = this.connectTimes.length
      ? Math.round(this.connectTimes.reduce((a, b) => a + b, 0) / this.connectTimes.length)
      : 0;

    console.log(`\n📡 [${label}] 소켓 결과`);
    console.log(`   연결 성공    : ${this.connected} ✅`);
    console.log(`   연결 실패    : ${this.connectFailed}${this.connectFailed > 0 ? " ⚠️" : " ✅"}`);
    console.log(`   메시지 전송  : ${this.messagesSent}`);
    console.log(`   메시지 수신  : ${this.messagesReceived}`);
    console.log(`   평균 연결시간: ${avgConnect}ms`);
    if (this.errors.length > 0) {
      console.log(`   에러 샘플   : ${this.errors.slice(0, 3).join(", ")}`);
    }
  }
}

// ── 로그인 헬퍼 ───────────────────────────────────────────────
function login(user) {
  return new Promise((resolve) => {
    const body = JSON.stringify(user);
    const req = http.request(
      {
        host: "localhost",
        port: 4000,
        path: "/api/auth/login",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data).accessToken || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ── 단일 소켓 워커 ────────────────────────────────────────────
function runSocketWorker(namespace, metrics, durationMs) {
  return new Promise(async (resolve) => {
    const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
    const token = await login(user);
    if (!token) {
      metrics.connectFailed++;
      return resolve();
    }

    const connectStart = Date.now();
    const socket = io(`${BASE_URL}${namespace}`, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });

    const cleanup = () => {
      if (socket.connected) socket.disconnect();
      resolve();
    };

    socket.on("connect", () => {
      metrics.connected++;
      metrics.connectTimes.push(Date.now() - connectStart);

      // 연결 후 메시지 전송 루프
      const interval = setInterval(() => {
        if (!socket.connected) {
          clearInterval(interval);
          return;
        }
        // 클랜 채팅 메시지 전송
        socket.emit("clan-message", { message: "부하 테스트 메시지" });
        metrics.messagesSent++;
      }, 2000);

      // 지정 시간 후 종료
      setTimeout(() => {
        clearInterval(interval);
        cleanup();
      }, durationMs);
    });

    socket.on("clan-message", () => {
      metrics.messagesReceived++;
    });

    socket.on("connect_error", (err) => {
      metrics.connectFailed++;
      metrics.errors.push(err.message);
      resolve();
    });

    // 타임아웃 안전장치
    setTimeout(cleanup, durationMs + 6000);
  });
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(50));
  console.log("  Nexus Fresh Socket.IO 부하 테스트");
  console.log("=".repeat(50));

  const PHASES = [
    { name: "소켓 워밍업",    concurrent: 3,  duration: 15_000, namespace: "/clan" },
    { name: "일반 소켓 부하", concurrent: 10, duration: 30_000, namespace: "/clan" },
  ];

  for (const phase of PHASES) {
    console.log(`\n🚀 단계: ${phase.name} (동시 ${phase.concurrent}개 소켓, ${phase.duration / 1000}초)`);
    const metrics = new SocketMetrics();

    const workers = Array.from({ length: phase.concurrent }, () =>
      runSocketWorker(phase.namespace, metrics, phase.duration)
    );

    await Promise.all(workers);
    metrics.print(phase.name);

    if (phase !== PHASES[PHASES.length - 1]) {
      console.log("\n⏳ 다음 단계까지 3초 대기...");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("  소켓 테스트 완료");
  console.log("=".repeat(50));
}

main().catch(console.error);
