/**
 * Nexus Fresh - 동시 다중 방 부하 테스트
 *
 * 여러 방을 동시에 생성하고 각 방에 독립적인 봇 세트가 입장한다.
 * 방마다 인원수와 팀 모드가 무작위로 결정된다.
 *
 * 사용법:
 *   npm run room:concurrent -- --rooms=3
 *   npm run room:concurrent -- --rooms=4 --repeat=2
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");

// 방 정원으로 허용되는 값
const VALID_COUNTS = [10, 15, 20, 30, 40];

// 테스트 대상 팀 모드
const TEAM_MODES = ["AUTO_BALANCE", "SNAKE_DRAFT", "AUCTION"];

// AUTO_BALANCE만 역할선택~RPS 풀 플로우를 지원함
const FULL_FLOW_MODES = new Set(["AUTO_BALANCE"]);

const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

loadEnvFiles([
  path.join(ROOT, ".env"),
  path.join(ROOT, ".env.local"),
  path.join(ROOT, "apps/api/.env"),
  path.join(ROOT, "apps/api/.env.local"),
]);

const io = requireFromProject("socket.io-client");
const jwt = requireFromProject("jsonwebtoken");
const { PrismaClient } = requireFromProject("@prisma/client");

function requireFromProject(name) {
  return require(
    require.resolve(name, {
      paths: [ROOT, path.join(ROOT, "apps/api"), path.join(ROOT, "apps/web")],
    }),
  );
}

function loadEnvFiles(files) {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
}

function getArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printHelp() {
  console.log(`
Nexus 동시 다중 방 부하 테스트

Usage:
  npm run room:concurrent -- [options]

Options:
  --rooms=2                        동시 생성할 방 수 (2~4, 기본값 2)
  --repeat=1                       반복 횟수
  --join-delay=120                 유저 입장 간격(ms)
  --keep-rooms                     테스트 후 방 삭제 생략
  --skip-rps                       브래킷 생성 후 RPS 생략
  --base=http://localhost:4000     API 기본 URL
  --help                           도움말

Required env:
  DATABASE_URL, JWT_ACCESS_SECRET
  `);
}

if (hasFlag("help")) {
  printHelp();
  process.exit(0);
}

const config = {
  baseUrl: (getArg("base") || process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, ""),
  rooms: parseRoomsCount(getArg("rooms") || process.env.ROOMS || "2"),
  repeat: parsePositiveInt(getArg("repeat") || process.env.REPEAT || "1", "repeat"),
  joinDelayMs: parsePositiveInt(
    getArg("join-delay") || process.env.JOIN_DELAY_MS || "120",
    "join-delay",
  ),
  keepRooms: hasFlag("keep-rooms") || process.env.KEEP_ROOMS === "1",
  skipRps: hasFlag("skip-rps") || process.env.SKIP_RPS === "1",
  skipStart: hasFlag("skip-start") || process.env.SKIP_START === "1",
};

function parseRoomsCount(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 2 || value > 4) {
    throw new Error("--rooms 값은 2~4 사이의 정수여야 합니다.");
  }
  return value;
}

function parsePositiveInt(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} 값은 1 이상의 정수여야 합니다.`);
  }
  return value;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeError(message, detail) {
  const err = new Error(message);
  err.detail = detail;
  return err;
}

function signToken(user) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET이 필요합니다.");
  return jwt.sign(
    {
      sub: user.id,
      email: user.email || undefined,
      username: user.username,
      role: user.role || "USER",
    },
    secret,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "2h", jwtid: crypto.randomUUID() },
  );
}

async function api(pathname, options = {}) {
  const start = Date.now();
  const res = await fetch(`${config.baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  const result = { ok: res.ok, status: res.status, ms: Date.now() - start, body };
  if (!res.ok && options.expectOk !== false) {
    throw makeError(`${options.method || "GET"} ${pathname} failed (${res.status})`, body);
  }
  return result;
}

async function emitAck(socket, event, payload, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ACK timeout`)), timeoutMs);
    socket.emit(event, payload, (response) => {
      clearTimeout(timer);
      if (response?.error || response?.success === false) {
        reject(makeError(`${event} failed: ${response.error || "unknown"}`, response));
      } else {
        resolve(response);
      }
    });
  });
}

async function openSocket(namespace, token, label) {
  const socket = io(`${config.baseUrl}${namespace}`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    timeout: 10000,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} connect timeout`)), 10000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

// botSlotOffset: 이 방이 사용할 봇 슬롯의 시작 인덱스 (1-based)
async function ensureBotUsers(prisma, count, botSlotOffset) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const globalIndex = botSlotOffset + i;
    const suffix = String(globalIndex).padStart(3, "0");
    const username = `concbot_${suffix}`;
    const email = `${username}@nexus.test`;
    const tier = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"][globalIndex % 5];
    const mainRole = ROLES[(globalIndex - 1) % ROLES.length];
    const subRole = ROLES[globalIndex % ROLES.length];

    const user = await prisma.user.upsert({
      where: { email },
      update: { username, emailVerified: true, isBanned: false, isRestricted: false },
      create: {
        username,
        email,
        emailVerified: true,
        termsAgreements: {
          create: {
            termsOfService: true,
            privacyPolicy: true,
            ageVerification: true,
            marketingConsent: false,
          },
        },
      },
      select: { id: true, email: true, username: true, role: true },
    });

    await prisma.riotAccount.upsert({
      where: { gameName_tagLine: { gameName: username, tagLine: "BOT" } },
      update: {
        userId: user.id,
        puuid: `concbot_puuid_${suffix}`,
        tier,
        rank: "IV",
        mainRole,
        subRole,
        isPrimary: true,
      },
      create: {
        userId: user.id,
        gameName: username,
        tagLine: "BOT",
        puuid: `concbot_puuid_${suffix}`,
        tier,
        rank: "IV",
        lp: (globalIndex * 17) % 100,
        mainRole,
        subRole,
        isPrimary: true,
      },
    });

    await prisma.authProvider.upsert({
      where: {
        provider_providerId: { provider: "DISCORD", providerId: `concbot_discord_${suffix}` },
      },
      update: { userId: user.id, metadata: { source: "concurrent-load-test" } },
      create: {
        userId: user.id,
        provider: "DISCORD",
        providerId: `concbot_discord_${suffix}`,
        metadata: { source: "concurrent-load-test" },
      },
    });

    users.push({ ...user, token: signToken(user) });
  }
  return users;
}

async function closeRoom(roomId, hostToken) {
  if (!roomId || config.keepRooms) return;
  await api(`/api/rooms/${roomId}`, {
    method: "DELETE",
    token: hostToken,
    expectOk: false,
  }).catch((err) => console.warn(`cleanup failed room=${roomId}: ${err.message}`));
}

async function joinRoomLikeUsers(roomId, users, metrics) {
  const sockets = [];
  for (const user of users) {
    const start = Date.now();
    const socket = await openSocket("/room", user.token, `room:${user.username}`);
    sockets.push(socket);
    await emitAck(socket, "join-room", { roomId });
    socket.emit("is-typing", { roomId, isTyping: true });
    socket.emit("send-message", { roomId, content: `concurrent-load hello from ${user.username}` });
    socket.emit("is-typing", { roomId, isTyping: false });
    metrics.joinLatencies.push(Date.now() - start);
    await delay(config.joinDelayMs + Math.floor(Math.random() * config.joinDelayMs));
  }
  return sockets;
}

async function readyAll(roomId, users, roomSockets, metrics) {
  const room = (await api(`/api/rooms/${roomId}`, { token: users[0].token })).body;
  const readyByUserId = new Map(
    (room.participants || []).map((p) => [p.userId, !!p.isReady]),
  );
  await Promise.all(
    users.map(async (user, index) => {
      if (readyByUserId.get(user.id)) return;
      const start = Date.now();
      const response = await emitAck(roomSockets[index], "toggle-ready", { roomId });
      if (response?.isReady !== true) {
        throw makeError(`${user.username} ready 결과가 true가 아닙니다.`, response);
      }
      metrics.readyLatencies.push(Date.now() - start);
    }),
  );
}

async function waitForRoomStatus(roomId, status, token, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastRoom = null;
  while (Date.now() < deadline) {
    const res = await api(`/api/rooms/${roomId}`, { token });
    lastRoom = res.body;
    if (res.body?.status === status) return res.body;
    await delay(500);
  }
  throw makeError(
    `room status timeout: expected=${status}, actual=${lastRoom?.status}`,
    lastRoom,
  );
}

async function selectRoles(roomId, users, metrics) {
  const roleSockets = new Map();
  try {
    const joined = await Promise.all(
      users.map(async (user) => {
        const socket = await openSocket("/role-selection", user.token, `role:${user.username}`);
        roleSockets.set(user.id, socket);
        const response = await emitAck(socket, "join-room", { roomId });
        return { user, socket, response };
      }),
    );

    const room =
      joined.find((e) => e.response?.room)?.response.room ||
      (await api(`/api/role-selection/${roomId}`, { token: users[0].token })).body.room;

    const selections = [];
    for (const team of room.teams || []) {
      const members = [...(team.members || [])].sort((a, b) =>
        String(a.joinedAt || "").localeCompare(String(b.joinedAt || "")),
      );
      members.forEach((member, index) => {
        selections.push({ member, role: ROLES[index % ROLES.length] });
      });
    }

    for (const { member, role } of selections) {
      const socket = roleSockets.get(member.userId);
      if (!socket) continue;
      const start = Date.now();
      await emitAck(socket, "select-role", { roomId, role }, 15000);
      metrics.roleLatencies.push(Date.now() - start);
      await delay(80 + Math.floor(Math.random() * 120));
    }
  } finally {
    for (const socket of roleSockets.values()) socket.disconnect();
  }
}

async function waitForMatchStarted(matchId, token, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const res = await api(`/api/matches/${matchId}`, { token, expectOk: false });
    last = res.body;
    if (res.ok && res.body?.status === "IN_PROGRESS") return res.body;
    await delay(750);
  }
  throw makeError(`RPS/match start timeout: match=${matchId}`, last);
}

async function driveRps(roomId, users, metrics) {
  const bracketSocket = await openSocket("/match", users[0].token, "match:bracket");
  const matchSockets = [];
  try {
    const bracket = await emitAck(bracketSocket, "join-bracket", { roomId });
    const matches = bracket.matches?.matches || bracket.matches || [];
    const pending = matches.filter(
      (m) => m.status === "PENDING" && m.teamAId && m.teamBId,
    );
    for (const match of pending.slice(0, 1)) {
      const start = Date.now();
      const socket = await openSocket("/match", users[0].token, `match:${match.id}`);
      matchSockets.push(socket);
      await emitAck(socket, "join-match", { matchId: match.id });
      await waitForMatchStarted(match.id, users[0].token, 35000);
      metrics.rpsLatencies.push(Date.now() - start);
    }
  } finally {
    bracketSocket.disconnect();
    for (const socket of matchSockets) socket.disconnect();
  }
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

// 방 하나의 전체 플로우를 실행
async function runRoom(prisma, roomIndex, botSlotOffset, teamMode, count, iteration) {
  const label = `room[${roomIndex + 1}] mode=${teamMode} count=${count}p #${iteration}`;
  const isFullFlow = FULL_FLOW_MODES.has(teamMode);
  const bracketFormat = count > 10 ? "ROUND_ROBIN" : "SINGLE_ELIMINATION";

  const users = await ensureBotUsers(prisma, count, botSlotOffset);
  const host = users[0];
  const metrics = { joinLatencies: [], readyLatencies: [], roleLatencies: [], rpsLatencies: [] };
  let roomId = null;
  let roomSockets = [];
  const startedAt = Date.now();

  try {
    const created = await api("/api/rooms", {
      method: "POST",
      token: host.token,
      body: {
        name: `[cl] r${roomIndex + 1} ${teamMode.slice(0,4)} ${count}p #${iteration}`,
        maxParticipants: count,
        teamMode,
        bracketFormat,
        allowSpectators: true,
      },
    });
    roomId = created.body.id;
    console.log(`  [${label}] 방 생성 완료 id=${roomId}`);

    roomSockets = await joinRoomLikeUsers(roomId, users, metrics);
    console.log(`  [${label}] ${count}명 입장 완료`);

    await readyAll(roomId, users, roomSockets, metrics);
    console.log(`  [${label}] 전원 준비 완료`);

    if (config.skipStart) {
      return {
        ok: true,
        label,
        roomId,
        teamMode,
        count,
        isFullFlow: false,
        totalMs: Date.now() - startedAt,
        startGameMs: 0,
        metrics,
      };
    }

    const startGameAt = Date.now();
    await emitAck(roomSockets[0], "start-game", { roomId }, 25000);
    const startGameMs = Date.now() - startGameAt;
    console.log(`  [${label}] 게임 시작 (${startGameMs}ms)`);

    if (isFullFlow) {
      await waitForRoomStatus(roomId, "ROLE_SELECTION", host.token);
      await selectRoles(roomId, users, metrics);
      await waitForRoomStatus(roomId, "IN_PROGRESS", host.token, 30000);
      console.log(`  [${label}] 역할 선택 + 브래킷 완료`);

      if (!config.skipRps) {
        await driveRps(roomId, users, metrics);
        console.log(`  [${label}] RPS 완료`);
      }
    } else {
      // AUCTION / SNAKE_DRAFT / MANUAL_TEAM: 게임 시작까지만 확인
      // 해당 모드별 봇 로직 미구현 — 서버 처리 부하만 측정
      console.log(`  [${label}] 게임 시작 후 서버 응답 확인 (${teamMode}은 풀 플로우 미지원)`);
    }

    return {
      ok: true,
      label,
      roomId,
      teamMode,
      count,
      isFullFlow,
      totalMs: Date.now() - startedAt,
      startGameMs,
      metrics,
    };
  } catch (err) {
    return {
      ok: false,
      label,
      roomId,
      teamMode,
      count,
      isFullFlow,
      totalMs: Date.now() - startedAt,
      error: err.message,
      detail: err.detail,
      metrics,
    };
  } finally {
    for (const socket of roomSockets) socket.disconnect();
    await closeRoom(roomId, host.token);
  }
}

function printRoomResult(result) {
  const status = result.ok ? "OK  " : "FAIL";
  const flow = result.isFullFlow ? "풀플로우" : "부분플로우";
  console.log(
    `${status} ${result.label} [${flow}] total=${result.totalMs}ms` +
      ` joinAvg=${avg(result.metrics.joinLatencies)}ms` +
      ` readyAvg=${avg(result.metrics.readyLatencies)}ms` +
      (result.isFullFlow
        ? ` roleAvg=${avg(result.metrics.roleLatencies)}ms` +
          ` rpsAvg=${avg(result.metrics.rpsLatencies)}ms`
        : ""),
  );
  if (!result.ok) {
    console.log(`  error: ${result.error}`);
    if (result.detail)
      console.log(`  detail: ${JSON.stringify(result.detail).slice(0, 1200)}`);
  }
}

async function runIteration(prisma, iteration) {
  console.log(`\n--- iteration #${iteration} ---`);

  // 방마다 랜덤 인원수 & 랜덤 팀 모드 결정
  const roomConfigs = Array.from({ length: config.rooms }, (_, i) => ({
    index: i,
    count: randomPick(VALID_COUNTS),
    teamMode: randomPick(TEAM_MODES),
  }));

  // 봇 슬롯 오프셋 계산: 방 0은 1부터, 방 1은 (방0 count + 1)부터, ...
  let slotCursor = 1;
  for (const rc of roomConfigs) {
    rc.botSlotOffset = slotCursor;
    slotCursor += rc.count;
  }

  console.log("동시 실행 방 구성:");
  for (const rc of roomConfigs) {
    console.log(
      `  방${rc.index + 1}: mode=${rc.teamMode} count=${rc.count}p botSlot=${rc.botSlotOffset}~${rc.botSlotOffset + rc.count - 1}`,
    );
  }

  // 모든 방을 동시에 실행
  const settled = await Promise.allSettled(
    roomConfigs.map((rc) =>
      runRoom(prisma, rc.index, rc.botSlotOffset, rc.teamMode, rc.count, iteration),
    ),
  );

  return settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : { ok: false, label: "unknown", error: s.reason?.message || String(s.reason), metrics: { joinLatencies: [], readyLatencies: [], roleLatencies: [], rpsLatencies: [] } },
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 필요합니다.");
  if (!process.env.JWT_ACCESS_SECRET) throw new Error("JWT_ACCESS_SECRET이 필요합니다.");

  console.log("=".repeat(64));
  console.log("Nexus 동시 다중 방 부하 테스트");
  console.log(
    `base=${config.baseUrl} 동시방수=${config.rooms} repeat=${config.repeat} joinDelay=${config.joinDelayMs}ms`,
  );
  console.log("팀 모드: 방마다 랜덤 (AUTO_BALANCE=풀플로우, 나머지=부분플로우)");
  console.log("=".repeat(64));

  const health = await api("/api/health", { expectOk: false }).catch(() => null);
  if (!health?.ok) throw new Error("API 서버 health check 실패 (port 4000 확인)");

  const prisma = new PrismaClient();
  const allResults = [];

  try {
    for (let i = 1; i <= config.repeat; i++) {
      const results = await runIteration(prisma, i);
      allResults.push(...results);
      console.log(`\n--- iteration #${i} 결과 ---`);
      for (const r of results) printRoomResult(r);
    }
  } finally {
    await prisma.$disconnect();
  }

  const passed = allResults.filter((r) => r.ok).length;
  const failed = allResults.length - passed;
  console.log("\n" + "=".repeat(64));
  console.log(
    `전체 요약: total=${allResults.length} passed=${passed} failed=${failed}`,
  );

  // 팀 모드별 집계
  const byMode = {};
  for (const r of allResults) {
    if (!byMode[r.teamMode]) byMode[r.teamMode] = { ok: 0, fail: 0 };
    byMode[r.teamMode][r.ok ? "ok" : "fail"]++;
  }
  console.log("팀 모드별 결과:");
  for (const [mode, stat] of Object.entries(byMode)) {
    console.log(`  ${mode}: passed=${stat.ok} failed=${stat.fail}`);
  }
  console.log("=".repeat(64));

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.detail) console.error(JSON.stringify(err.detail, null, 2));
  process.exit(1);
});
