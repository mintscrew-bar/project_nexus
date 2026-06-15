/**
 * Nexus Fresh - room capacity stability test
 *
 * Creates rooms for the backend-supported capacities, fills them with admin
 * test bots, marks the host ready, starts the room over Socket.IO, and verifies
 * the resulting team layout.
 */

const path = require("path");

const DEFAULT_BASE_URL = "http://localhost:4000";
const VALID_COUNTS = [10, 15, 20, 30, 40];

function resolveSocketClient() {
  const searchPaths = [
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
    path.resolve(__dirname, "../../../apps/web"),
  ];

  try {
    return require(require.resolve("socket.io-client", { paths: searchPaths }));
  } catch {
    console.error("socket.io-client를 찾을 수 없습니다.");
    console.error("프로젝트 루트에서 pnpm install 또는 load-test에서 npm install을 확인하세요.");
    process.exit(1);
  }
}

const io = resolveSocketClient();

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printHelp() {
  console.log(`
Nexus room capacity stability test

Usage:
  npm run room:capacity -- [options]

Options:
  --base=http://localhost:4000     API base URL
  --counts=10,15,20,30,40         Room sizes to test
  --repeat=1                      Repeat count per room size
  --team-mode=AUTO_BALANCE        AUTO_BALANCE, SNAKE_DRAFT, AUCTION, MANUAL_TEAM
  --no-start                      Stop after create/fill/ready validation
  --keep-rooms                    Do not close generated rooms
  --help                          Show this help

Auth:
  ADMIN_TOKEN or ADMIN_EMAIL + ADMIN_PASSWORD is required.
  HOST_TOKEN or HOST_EMAIL + HOST_PASSWORD can be set separately.
`);
}

if (hasFlag("help")) {
  printHelp();
  process.exit(0);
}

const config = {
  baseUrl: (getArg("base") || process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
  counts: parseCounts(getArg("counts") || process.env.ROOM_COUNTS || VALID_COUNTS.join(",")),
  repeat: parsePositiveInt(getArg("repeat") || process.env.REPEAT || "1", "repeat"),
  teamMode: getArg("team-mode") || process.env.TEAM_MODE || "AUTO_BALANCE",
  noStart: hasFlag("no-start") || process.env.NO_START === "1",
  keepRooms: hasFlag("keep-rooms") || process.env.KEEP_ROOMS === "1",
};

function parseCounts(raw) {
  const counts = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));

  const invalid = counts.filter((count) => !VALID_COUNTS.includes(count));
  if (counts.length === 0 || invalid.length > 0) {
    throw new Error(`counts는 ${VALID_COUNTS.join(", ")} 중에서만 선택할 수 있습니다. invalid=${invalid.join(",")}`);
  }

  return [...new Set(counts)];
}

function parsePositiveInt(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} 값은 1 이상의 정수여야 합니다.`);
  }
  return value;
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

async function api(pathname, options = {}) {
  const start = Date.now();
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${config.baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
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

  const result = {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - start,
    body,
  };

  if (!res.ok && options.expectOk !== false) {
    throw makeError(`${options.method || "GET"} ${pathname} failed (${res.status})`, body);
  }

  return result;
}

async function login(email, password) {
  if (!email || !password) return null;
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return res.body?.accessToken || res.body?.token || null;
}

async function resolveTokens() {
  const adminToken =
    process.env.ADMIN_TOKEN ||
    (await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD));

  if (!adminToken) {
    throw new Error("ADMIN_TOKEN 또는 ADMIN_EMAIL/ADMIN_PASSWORD가 필요합니다.");
  }

  const hostToken =
    process.env.HOST_TOKEN ||
    (process.env.HOST_EMAIL || process.env.HOST_PASSWORD
      ? await login(process.env.HOST_EMAIL, process.env.HOST_PASSWORD)
      : null) ||
    adminToken;

  if (!hostToken) {
    throw new Error("HOST_TOKEN 또는 HOST_EMAIL/HOST_PASSWORD 로그인에 실패했습니다.");
  }

  return { adminToken, hostToken };
}

async function emitAck(socket, event, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${event} ACK timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    socket.emit(event, payload, (response) => {
      clearTimeout(timer);
      if (response?.error) {
        reject(makeError(`${event} failed: ${response.error}`, response));
      } else {
        resolve(response);
      }
    });
  });
}

async function withRoomSocket(token, fn) {
  const socket = io(`${config.baseUrl}/room`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    timeout: 10000,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket connect timeout")), 10000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  try {
    return await fn(socket);
  } finally {
    socket.disconnect();
  }
}

function countPlayers(room) {
  return (room.participants || []).filter((participant) => participant.role === "PLAYER").length;
}

function validateTeams(room, expectedPlayers) {
  const expectedTeams = expectedPlayers / 5;
  const teams = room.teams || [];
  if (teams.length !== expectedTeams) {
    throw makeError(`팀 수가 맞지 않습니다. expected=${expectedTeams}, actual=${teams.length}`, {
      teams: teams.map((team) => ({ id: team.id, members: team.members?.length || 0 })),
    });
  }

  const badTeams = teams.filter((team) => (team.members || []).length !== 5);
  if (badTeams.length > 0) {
    throw makeError("5인 팀으로 구성되지 않은 팀이 있습니다.", {
      teams: badTeams.map((team) => ({ id: team.id, name: team.name, members: team.members?.length || 0 })),
    });
  }
}

function assertRoomReady(room, expectedPlayers) {
  const players = (room.participants || []).filter((participant) => participant.role === "PLAYER");
  if (players.length !== expectedPlayers) {
    throw makeError(`플레이어 수가 맞지 않습니다. expected=${expectedPlayers}, actual=${players.length}`, {
      participants: room.participants?.length,
    });
  }

  const unready = players.filter((participant) => !participant.isReady);
  if (unready.length > 0) {
    throw makeError("준비되지 않은 플레이어가 있습니다.", {
      users: unready.map((participant) => participant.user?.username || participant.userId),
    });
  }
}

async function cleanupRoom(roomId, adminToken) {
  if (!roomId || config.keepRooms) return;
  const res = await api(`/api/admin/rooms/${roomId}/close`, {
    method: "POST",
    token: adminToken,
    expectOk: false,
  }).catch((err) => {
    console.warn(`cleanup failed room=${roomId}: ${err.message}`);
  });
  if (res && !res.ok) {
    console.warn(`cleanup failed room=${roomId}: status=${res.status}${formatBody(res.body)}`);
  }
}

async function runOne(count, iteration, tokens) {
  const marks = [];
  let roomId = null;
  const mark = (step, ms) => marks.push({ step, ms });

  const startedAt = Date.now();
  try {
    const created = await api("/api/rooms", {
      method: "POST",
      token: tokens.hostToken,
      body: {
        name: `[load] ${count}p #${iteration} ${new Date().toISOString()}`,
        maxParticipants: count,
        teamMode: config.teamMode,
        allowSpectators: true,
        bracketFormat: count > 10 ? "ROUND_ROBIN" : "SINGLE_ELIMINATION",
      },
    });
    roomId = created.body.id;
    mark("create", created.ms);

    const fill = await api(`/api/admin/rooms/${roomId}/add-bot`, {
      method: "POST",
      token: tokens.adminToken,
      body: { count: count - 1 },
    });
    mark("add-bot", fill.ms);

    const ready = await withRoomSocket(tokens.hostToken, async (socket) => {
      const joinStart = Date.now();
      await emitAck(socket, "join-room", { roomId });
      mark("socket-join", Date.now() - joinStart);

      const readyStart = Date.now();
      const response = await emitAck(socket, "toggle-ready", { roomId });
      mark("ready", Date.now() - readyStart);
      return response;
    });

    if (ready?.isReady !== true) {
      throw makeError("호스트 ready 토글 결과가 true가 아닙니다.", ready);
    }

    const beforeStart = await api(`/api/rooms/${roomId}`);
    mark("precheck", beforeStart.ms);
    assertRoomReady(beforeStart.body, count);

    if (!config.noStart) {
      await withRoomSocket(tokens.hostToken, async (socket) => {
        await emitAck(socket, "join-room", { roomId });
        const start = Date.now();
        await emitAck(socket, "start-game", { roomId }, 20000);
        mark("start-game", Date.now() - start);
      });

      const afterStart = await api(`/api/rooms/${roomId}`);
      mark("postcheck", afterStart.ms);
      const allowedStatuses = new Set(["DRAFT_COMPLETED", "ROLE_SELECTION", "IN_PROGRESS"]);
      if (!allowedStatuses.has(afterStart.body.status)) {
        throw makeError(`게임 시작 후 상태가 예상과 다릅니다. status=${afterStart.body.status}`, afterStart.body);
      }

      if (config.teamMode === "AUTO_BALANCE") {
        validateTeams(afterStart.body, count);
      }
    }

    return {
      ok: true,
      count,
      iteration,
      roomId,
      totalMs: Date.now() - startedAt,
      marks,
    };
  } catch (error) {
    return {
      ok: false,
      count,
      iteration,
      roomId,
      totalMs: Date.now() - startedAt,
      marks,
      error: error.message,
      detail: error.detail,
    };
  } finally {
    await cleanupRoom(roomId, tokens.adminToken);
  }
}

function printResult(result) {
  const icon = result.ok ? "OK" : "FAIL";
  const stepText = result.marks.map((mark) => `${mark.step}:${mark.ms}ms`).join(" ");
  console.log(`${icon} ${result.count}p #${result.iteration} ${result.totalMs}ms ${stepText}`);
  if (!result.ok) {
    console.log(`  error: ${result.error}`);
    if (result.detail) {
      console.log(`  detail: ${JSON.stringify(result.detail).slice(0, 1200)}`);
    }
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Nexus room capacity stability test");
  console.log(`base=${config.baseUrl}`);
  console.log(`counts=${config.counts.join(",")} repeat=${config.repeat} teamMode=${config.teamMode}`);
  console.log(`start=${config.noStart ? "skip" : "yes"} cleanup=${config.keepRooms ? "keep rooms" : "close rooms"}`);
  console.log("=".repeat(60));

  const health = await api("/api/health", { expectOk: false }).catch(() => null);
  if (!health || health.status === 0) {
    console.warn("health check에 실패했습니다. 로그인 요청으로 서버 연결을 계속 확인합니다.");
  }

  const tokens = await resolveTokens();
  const results = [];

  for (let iteration = 1; iteration <= config.repeat; iteration++) {
    for (const count of config.counts) {
      const result = await runOne(count, iteration, tokens);
      results.push(result);
      printResult(result);
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log("=".repeat(60));
  console.log(`summary: total=${results.length} passed=${results.length - failed.length} failed=${failed.length}`);
  console.log("=".repeat(60));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
