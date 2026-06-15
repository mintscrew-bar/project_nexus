/**
 * Nexus Fresh - browser realistic room flow
 *
 * Launches Playwright browser contexts for testbot users and drives the UI:
 * auth callback, lobby, ready buttons, host start, role selection, and bracket.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const VALID_COUNTS = [10, 15, 20, 30, 40];
const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const ROLE_LABELS = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

loadEnvFiles([
  path.join(ROOT, ".env"),
  path.join(ROOT, ".env.local"),
  path.join(ROOT, "apps/api/.env"),
  path.join(ROOT, "apps/api/.env.local"),
]);

const { chromium } = requireOptional("playwright", [
  ROOT,
  path.join(ROOT, "load-test"),
]);
const jwt = requireFromProject("jsonwebtoken");
const io = requireFromProject("socket.io-client");
const { PrismaClient } = requireFromProject("@prisma/client");

function requireOptional(name, paths) {
  try {
    return require(require.resolve(name, { paths }));
  } catch {
    console.error(`${name} 패키지가 필요합니다.`);
    console.error("설치: npm --prefix load-test install");
    console.error("브라우저 설치: npx playwright install chromium");
    process.exit(1);
  }
}

function requireFromProject(name) {
  return require(require.resolve(name, {
    paths: [ROOT, path.join(ROOT, "apps/api"), path.join(ROOT, "apps/web")],
  }));
}

function loadEnvFiles(files) {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
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
Nexus browser realistic room test

Usage:
  npm run browser:room -- [options]

Options:
  --web=http://localhost:3000      Web app URL
  --base=http://localhost:4000     API/socket URL
  --count=10                      Room size: 10, 15, 20, 30, 40
  --headful                       Show browser windows
  --join-delay=150                Delay between browser joins in ms
  --keep-rooms                    Do not close generated rooms
  --skip-rps                      Skip RPS socket verification after bracket
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
  webUrl: (getArg("web") || process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, ""),
  baseUrl: (getArg("base") || process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, ""),
  count: parseCount(getArg("count") || process.env.ROOM_COUNT || "10"),
  headless: !hasFlag("headful"),
  joinDelayMs: parsePositiveInt(getArg("join-delay") || process.env.JOIN_DELAY_MS || "150", "join-delay"),
  keepRooms: hasFlag("keep-rooms") || process.env.KEEP_ROOMS === "1",
  skipRps: hasFlag("skip-rps") || process.env.SKIP_RPS === "1",
  chromiumExecutable: getArg("chromium-executable") || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
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
      update: { userId: user.id, metadata: { source: "load-test" } },
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
  if (!res.ok) console.warn(`cleanup failed room=${roomId}: status=${res.status}`);
}

async function loginBrowser(browser, user, roomId) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken: user.token }),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.warn(`[${user.username}] pageerror: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.warn(`[${user.username}] console error: ${msg.text().slice(0, 300)}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() === 429) {
      const request = response.request();
      console.warn(`[${user.username}] 429 ${request.method()} ${response.url()}`);
    }
  });

  await context.addInitScript((redirect) => {
    sessionStorage.setItem("nexus_post_login_redirect", redirect);
  }, `/tournaments/${roomId}/lobby`);

  const start = Date.now();
  await page.goto(`${config.webUrl}/auth/callback?token=${encodeURIComponent(user.token)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(`**/tournaments/${roomId}/lobby`, { timeout: 30000 });
  try {
    await page.getByText("준비 현황").waitFor({ timeout: 30000 });
  } catch (error) {
    const body = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    throw makeError(
      `${user.username} lobby did not render ready panel. url=${page.url()}`,
      body.slice(0, 1200),
    );
  }
  const consentButton = page.getByRole("button", { name: "동의" });
  if ((await consentButton.count()) > 0) {
    await consentButton.first().click({ timeout: 3000 }).catch(() => {});
  }
  return { user, context, page, loginMs: Date.now() - start };
}

async function clickReady(session) {
  const button = session.page.getByRole("button", { name: "준비하기" });
  if ((await button.count()) === 0) return 0;
  const start = Date.now();
  await button.first().click({ timeout: 10000 });
  await session.page.getByRole("button", { name: "준비 취소" }).waitFor({ timeout: 15000 });
  return Date.now() - start;
}

async function startGame(hostSession, roomId) {
  const start = Date.now();
  await hostSession.page.getByRole("button", { name: "내전 시작" }).click({ timeout: 20000 });
  await hostSession.page.waitForURL(`**/role-selection/${roomId}`, { timeout: 30000 });
  return Date.now() - start;
}

async function selectRolesInBrowser(roomId, sessions, hostToken) {
  const room = (await api(`/api/rooms/${roomId}`, { token: hostToken })).body;
  const roleByUserId = new Map();
  for (const team of room.teams || []) {
    const members = [...(team.members || [])].sort((a, b) =>
      String(a.joinedAt || "").localeCompare(String(b.joinedAt || "")),
    );
    members.forEach((member, index) => {
      roleByUserId.set(member.userId, ROLES[index % ROLES.length]);
    });
  }

  const latencies = [];
  for (const session of sessions) {
    await session.page.waitForURL(`**/role-selection/${roomId}`, { timeout: 30000 });
  }

  for (const session of sessions) {
    const role = roleByUserId.get(session.user.id);
    if (!role) continue;
    const start = Date.now();
    await session.page.getByRole("button", { name: ROLE_LABELS[role] }).first().click({
      timeout: 15000,
    });
    latencies.push(Date.now() - start);
    await delay(80 + Math.floor(Math.random() * 120));
  }

  await sessions[0].page.waitForURL(`**/tournaments/${roomId}/bracket`, { timeout: 45000 });
  return latencies;
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

async function openSocket(namespace, token) {
  const socket = io(`${config.baseUrl}${namespace}`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    timeout: 10000,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${namespace} connect timeout`)), 10000);
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

async function driveOneRps(roomId, token) {
  const bracketSocket = await openSocket("/match", token);
  let matchSocket = null;
  try {
    const bracket = await emitAck(bracketSocket, "join-bracket", { roomId });
    const matches = bracket.matches?.matches || bracket.matches || [];
    const match = matches.find((item) => item.status === "PENDING" && item.teamAId && item.teamBId);
    if (!match) return 0;
    const start = Date.now();
    matchSocket = await openSocket("/match", token);
    await emitAck(matchSocket, "join-match", { matchId: match.id });
    await waitForMatchStarted(match.id, token, 75000);
    return Date.now() - start;
  } finally {
    bracketSocket.disconnect();
    if (matchSocket) matchSocket.disconnect();
  }
}

async function waitForMatchStarted(matchId, token, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await api(`/api/matches/${matchId}`, { token, expectOk: false });
    if (res.ok && res.body?.status === "IN_PROGRESS") return;
    await delay(750);
  }
  throw new Error(`RPS/match start timeout: ${matchId}`);
}

function avg(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 필요합니다.");
  if (!process.env.JWT_ACCESS_SECRET) throw new Error("JWT_ACCESS_SECRET이 필요합니다.");

  console.log("=".repeat(64));
  console.log("Nexus browser realistic room test");
  console.log(`web=${config.webUrl} api=${config.baseUrl} count=${config.count} headless=${config.headless}`);
  console.log("=".repeat(64));

  const prisma = new PrismaClient();
  const browser = await chromium.launch({
    headless: config.headless,
    executablePath: config.chromiumExecutable || undefined,
  });
  const sessions = [];
  let roomId = null;
  const metrics = {
    login: [],
    ready: [],
    role: [],
    rps: [],
  };
  const startedAt = Date.now();

  try {
    const users = await ensureBotUsers(prisma, config.count);
    const host = users[0];
    const created = await api("/api/rooms", {
      method: "POST",
      token: host.token,
      body: {
        name: `[browser-load] ${config.count}p ${new Date().toISOString()}`,
        maxParticipants: config.count,
        teamMode: "AUTO_BALANCE",
        allowSpectators: true,
        bracketFormat: config.count > 10 ? "ROUND_ROBIN" : "SINGLE_ELIMINATION",
      },
    });
    roomId = created.body.id;

    for (const user of users) {
      const session = await loginBrowser(browser, user, roomId);
      sessions.push(session);
      metrics.login.push(session.loginMs);
      await delay(config.joinDelayMs + Math.floor(Math.random() * config.joinDelayMs));
    }

    for (const session of sessions) {
      const readyMs = await clickReady(session);
      if (readyMs) metrics.ready.push(readyMs);
    }

    const startGameMs = await startGame(sessions[0], roomId);
    metrics.role.push(...(await selectRolesInBrowser(roomId, sessions, host.token)));

    if (!config.skipRps) {
      const rpsMs = await driveOneRps(roomId, host.token);
      if (rpsMs) metrics.rps.push(rpsMs);
    }

    console.log(
      `OK browser ${config.count}p total=${Date.now() - startedAt}ms ` +
        `loginAvg=${avg(metrics.login)}ms readyAvg=${avg(metrics.ready)}ms ` +
        `start=${startGameMs}ms roleAvg=${avg(metrics.role)}ms rpsAvg=${avg(metrics.rps)}ms`,
    );
  } finally {
    for (const session of sessions) {
      await session.context.close().catch(() => {});
    }
    await browser.close().catch(() => {});
    if (sessions[0]) {
      await closeRoom(roomId, sessions[0].user.token);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
