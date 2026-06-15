/**
 * Nexus Fresh - realistic room flow test
 *
 * This script uses login-capable testbot users and drives the same HTTP and
 * Socket.IO events real clients use: join room, chat/typing, ready, start game,
 * role selection, bracket subscription, and RPS match start.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const VALID_COUNTS = [10, 15, 20, 30, 40];
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
  return require(require.resolve(name, {
    paths: [ROOT, path.join(ROOT, "apps/api"), path.join(ROOT, "apps/web")],
  }));
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
Nexus realistic room stability test

Usage:
  npm run room:realistic -- [options]

Options:
  --base=http://localhost:4000     API base URL
  --count=40                      Room size: 10, 15, 20, 30, 40
  --repeat=1                      Repeat count
  --join-delay=120                Delay between user joins in ms
  --rps-matches=1                 Number of pending matches to drive through RPS
  --keep-rooms                    Do not close generated rooms
  --skip-rps                      Stop after bracket generation
  --help                          Show this help

Required env:
  DATABASE_URL and JWT_ACCESS_SECRET must match the API server.
`);
}

if (hasFlag("help")) {
  printHelp();
  process.exit(0);
}

const config = {
  baseUrl: (getArg("base") || process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, ""),
  count: parseCount(getArg("count") || process.env.ROOM_COUNT || "40"),
  repeat: parsePositiveInt(getArg("repeat") || process.env.REPEAT || "1", "repeat"),
  joinDelayMs: parsePositiveInt(getArg("join-delay") || process.env.JOIN_DELAY_MS || "120", "join-delay"),
  rpsMatches: parsePositiveInt(getArg("rps-matches") || process.env.RPS_MATCHES || "1", "rps-matches"),
  keepRooms: hasFlag("keep-rooms") || process.env.KEEP_ROOMS === "1",
  skipRps: hasFlag("skip-rps") || process.env.SKIP_RPS === "1",
};

function parseCount(raw) {
  const value = Number(raw);
  if (!VALID_COUNTS.includes(value)) {
    throw new Error(`count는 ${VALID_COUNTS.join(", ")} 중 하나여야 합니다.`);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeError(message, detail) {
  const err = new Error(message);
  err.detail = detail;
  return err;
}

function formatBody(body) {
  if (!body) return "";
  return ` body=${JSON.stringify(body).slice(0, 500)}`;
}

function signToken(user) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET이 필요합니다.");
  }
  return jwt.sign(
    {
      sub: user.id,
      email: user.email || undefined,
      username: user.username,
      role: user.role || "USER",
    },
    secret,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "2h",
      jwtid: crypto.randomUUID(),
    },
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

async function ensureBotUsers(prisma, count) {
  const users = [];
  for (let i = 1; i <= count; i++) {
    const suffix = String(i).padStart(2, "0");
    const username = `testbot_${suffix}`;
    const email = `${username}@nexus.test`;
    const tier = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"][i % 5];
    const mainRole = ROLES[(i - 1) % ROLES.length];
    const subRole = ROLES[i % ROLES.length];

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        username,
        emailVerified: true,
        isBanned: false,
        isRestricted: false,
      },
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
        puuid: `loadtest_bot_puuid_${suffix}`,
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
        puuid: `loadtest_bot_puuid_${suffix}`,
        tier,
        rank: "IV",
        lp: (i * 17) % 100,
        mainRole,
        subRole,
        isPrimary: true,
      },
    });

    await prisma.authProvider.upsert({
      where: {
        provider_providerId: {
          provider: "DISCORD",
          providerId: `loadtest_discord_${suffix}`,
        },
      },
      update: {
        userId: user.id,
        metadata: { source: "load-test" },
      },
      create: {
        userId: user.id,
        provider: "DISCORD",
        providerId: `loadtest_discord_${suffix}`,
        metadata: { source: "load-test" },
      },
    });

    users.push({ ...user, token: signToken(user) });
  }
  return users;
}

async function closeRoom(roomId, hostToken) {
  if (!roomId || config.keepRooms) return;
  const res = await api(`/api/rooms/${roomId}`, {
    method: "DELETE",
    token: hostToken,
    expectOk: false,
  }).catch((error) => ({ ok: false, status: 0, body: error.message }));
  if (!res.ok) {
    console.warn(`cleanup failed room=${roomId}: status=${res.status}${formatBody(res.body)}`);
  }
}

async function joinRoomLikeUsers(roomId, users, metrics) {
  const sockets = [];
  for (const user of users) {
    const start = Date.now();
    const socket = await openSocket("/room", user.token, `room:${user.username}`);
    sockets.push(socket);
    await emitAck(socket, "join-room", { roomId });
    socket.emit("is-typing", { roomId, isTyping: true });
    socket.emit("send-message", {
      roomId,
      content: `load-test hello from ${user.username}`,
    });
    socket.emit("is-typing", { roomId, isTyping: false });
    metrics.joinLatencies.push(Date.now() - start);
    await delay(config.joinDelayMs + Math.floor(Math.random() * config.joinDelayMs));
  }
  return sockets;
}

async function readyAll(roomId, users, roomSockets, metrics) {
  const room = (await api(`/api/rooms/${roomId}`, { token: users[0].token })).body;
  const readyByUserId = new Map(
    (room.participants || []).map((participant) => [
      participant.userId,
      !!participant.isReady,
    ]),
  );

  await Promise.all(users.map(async (user, index) => {
    if (readyByUserId.get(user.id)) return;
    const start = Date.now();
    const response = await emitAck(roomSockets[index], "toggle-ready", { roomId });
    if (response?.isReady !== true) {
      throw makeError(`${user.username} ready 결과가 true가 아닙니다.`, response);
    }
    metrics.readyLatencies.push(Date.now() - start);
  }));
}

async function selectRoles(roomId, users, metrics) {
  const roleSockets = new Map();
  try {
    const joined = await Promise.all(users.map(async (user) => {
      const socket = await openSocket("/role-selection", user.token, `role:${user.username}`);
      roleSockets.set(user.id, socket);
      const response = await emitAck(socket, "join-room", { roomId });
      return { user, socket, response };
    }));

    const room =
      joined.find((entry) => entry.response?.room)?.response.room ||
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

    for (const selection of selections) {
      const { member, role } = selection;
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

async function waitForRoomStatus(roomId, status, token, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastRoom = null;
  while (Date.now() < deadline) {
    const res = await api(`/api/rooms/${roomId}`, { token });
    lastRoom = res.body;
    if (res.body?.status === status) return res.body;
    await delay(500);
  }
  throw makeError(`room status timeout: expected=${status}, actual=${lastRoom?.status}`, lastRoom);
}

async function driveRps(roomId, users, metrics) {
  const bracketSocket = await openSocket("/match", users[0].token, "match:bracket");
  const matchSockets = [];
  try {
    const bracket = await emitAck(bracketSocket, "join-bracket", { roomId });
    const matches = bracket.matches?.matches || bracket.matches || [];
    const pending = matches.filter((match) => match.status === "PENDING" && match.teamAId && match.teamBId);

    for (const match of pending.slice(0, Math.min(config.rpsMatches, pending.length))) {
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

function avg(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function runOne(prisma, iteration) {
  const users = await ensureBotUsers(prisma, config.count);
  const host = users[0];
  const metrics = {
    joinLatencies: [],
    readyLatencies: [],
    roleLatencies: [],
    rpsLatencies: [],
  };
  let roomId = null;
  let roomSockets = [];
  const startedAt = Date.now();

  try {
    const created = await api("/api/rooms", {
      method: "POST",
      token: host.token,
      body: {
        name: `[realistic-load] ${config.count}p #${iteration} ${new Date().toISOString()}`,
        maxParticipants: config.count,
        teamMode: "AUTO_BALANCE",
        allowSpectators: true,
        bracketFormat: config.count > 10 ? "ROUND_ROBIN" : "SINGLE_ELIMINATION",
      },
    });
    roomId = created.body.id;

    roomSockets = await joinRoomLikeUsers(roomId, users, metrics);
    await readyAll(roomId, users, roomSockets, metrics);

    const startGameStartedAt = Date.now();
    await emitAck(roomSockets[0], "start-game", { roomId }, 25000);
    const startGameMs = Date.now() - startGameStartedAt;

    await waitForRoomStatus(roomId, "ROLE_SELECTION", host.token);
    await selectRoles(roomId, users, metrics);
    await waitForRoomStatus(roomId, "IN_PROGRESS", host.token, 30000);

    if (!config.skipRps) {
      await driveRps(roomId, users, metrics);
    }

    return {
      ok: true,
      roomId,
      totalMs: Date.now() - startedAt,
      startGameMs,
      metrics,
    };
  } catch (error) {
    return {
      ok: false,
      roomId,
      totalMs: Date.now() - startedAt,
      error: error.message,
      detail: error.detail,
      metrics,
    };
  } finally {
    for (const socket of roomSockets) socket.disconnect();
    await closeRoom(roomId, host.token);
  }
}

function printResult(result, iteration) {
  const status = result.ok ? "OK" : "FAIL";
  console.log(
    `${status} realistic ${config.count}p #${iteration} total=${result.totalMs}ms ` +
      `joinAvg=${avg(result.metrics.joinLatencies)}ms ` +
      `readyAvg=${avg(result.metrics.readyLatencies)}ms ` +
      `roleAvg=${avg(result.metrics.roleLatencies)}ms ` +
      `rpsAvg=${avg(result.metrics.rpsLatencies)}ms`,
  );
  if (!result.ok) {
    console.log(`  error: ${result.error}`);
    if (result.detail) console.log(`  detail: ${JSON.stringify(result.detail).slice(0, 1200)}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL이 필요합니다.");
  }
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET이 필요합니다.");
  }

  console.log("=".repeat(64));
  console.log("Nexus realistic room stability test");
  console.log(`base=${config.baseUrl} count=${config.count} repeat=${config.repeat}`);
  console.log(
    `joinDelay=${config.joinDelayMs}ms rps=${config.skipRps ? "skip" : config.rpsMatches}`,
  );
  console.log("=".repeat(64));

  const health = await api("/api/health", { expectOk: false }).catch(() => null);
  if (!health?.ok) throw new Error("API health check failed");

  const prisma = new PrismaClient();
  const results = [];
  try {
    for (let i = 1; i <= config.repeat; i++) {
      const result = await runOne(prisma, i);
      results.push(result);
      printResult(result, i);
    }
  } finally {
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.ok).length;
  console.log("=".repeat(64));
  console.log(`summary: total=${results.length} passed=${results.length - failed} failed=${failed}`);
  console.log("=".repeat(64));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
