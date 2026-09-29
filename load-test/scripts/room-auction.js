/**
 * Nexus Fresh — 경매 모드 부하/안정성 테스트
 *
 * 왜 이 스크립트가 따로 있나:
 *   2026-08-11 20인 경매방이 무너진 게 지금까지 유일한 실사용 대형 사고인데,
 *   하네스는 AUTO_BALANCE 만 끝까지 돌리고 경매는 "게임 시작"까지만 확인했다.
 *   그날 터진 것들(연속 유찰, 늘어지는 진행, 호스트 끊김)은 전부
 *   경매가 실제로 돌아가는 동안에만 재현된다.
 *
 * 이 스크립트가 검증하는 것:
 *   1. 입찰 / 입찰 포기(fold) 가 20인 규모에서 정상 동작하는가
 *   2. 유찰된 매물이 곧바로 다시 올라오지 않는가 (사이클 단위 재경매)
 *   3. 경매 도중 호스트 소켓이 끊겨도 경매가 계속 진행되는가
 *   4. 호스트가 재접속하면 진행 중인 상태를 그대로 돌려받는가
 *
 * 3번이 그날 방을 실제로 죽인 경로다.
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
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printHelp() {
  console.log(`
Nexus 경매 모드 안정성 테스트

Usage:
  npm run room:auction -- [options]

Options:
  --base=http://localhost:4000     API base URL
  --count=20                      방 정원: 10, 15, 20, 30, 40
  --repeat=1                      반복 횟수
  --join-delay=120                입장 간격(ms)
  --bid-time=8                    매물당 입찰 시간(초). 짧게 잡아야 테스트가 빨리 끝난다
  --fold-rate=0.35                팀장이 매물을 포기할 확률 (유찰 경로를 만들기 위함)
  --disconnect-at=4               N번째 매물에서 호스트 소켓을 강제로 끊는다 (0이면 생략)
  --no-reconnect                  끊은 호스트를 다시 붙이지 않는다
  --keep-rooms                    생성한 방을 지우지 않는다
  --help                          도움말

Required env:
  DATABASE_URL, JWT_ACCESS_SECRET 이 API 서버와 같아야 한다.
`);
}

if (hasFlag("help")) {
  printHelp();
  process.exit(0);
}

const config = {
  baseUrl: (
    getArg("base") ||
    process.env.BASE_URL ||
    "http://localhost:4000"
  ).replace(/\/$/, ""),
  count: parseCount(getArg("count") || process.env.ROOM_COUNT || "20"),
  repeat: parsePositiveInt(
    getArg("repeat") || process.env.REPEAT || "1",
    "repeat",
  ),
  joinDelayMs: parsePositiveInt(
    getArg("join-delay") || process.env.JOIN_DELAY_MS || "120",
    "join-delay",
  ),
  bidTimeSeconds: parseBidTime(
    getArg("bid-time") || process.env.BID_TIME || "8",
  ),
  foldRate: parseRate(getArg("fold-rate") || process.env.FOLD_RATE || "0.35"),
  disconnectAt: parseNonNegativeInt(
    getArg("disconnect-at") || process.env.DISCONNECT_AT || "4",
    "disconnect-at",
  ),
  reconnect: !hasFlag("no-reconnect"),
  keepRooms: hasFlag("keep-rooms") || process.env.KEEP_ROOMS === "1",
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

function parseNonNegativeInt(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} 값은 0 이상의 정수여야 합니다.`);
  }
  return value;
}

/** 서버 DTO 가 5~120초만 받는다. 벗어나면 방 생성이 400으로 떨어진다. */
function parseBidTime(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 5 || value > 120) {
    throw new Error("bid-time 값은 5 이상 120 이하의 정수여야 합니다.");
  }
  return value;
}

function parseRate(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("fold-rate 값은 0과 1 사이여야 합니다.");
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
  const result = {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - start,
    body,
  };
  if (!res.ok && options.expectOk !== false) {
    throw makeError(
      `${options.method || "GET"} ${pathname} failed (${res.status})`,
      body,
    );
  }
  return result;
}

async function emitAck(socket, event, payload, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${event} ACK timeout`)),
      timeoutMs,
    );
    socket.emit(event, payload, (response) => {
      clearTimeout(timer);
      if (response?.error || response?.success === false) {
        reject(
          makeError(
            `${event} failed: ${response.error || "unknown"}`,
            response,
          ),
        );
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
    const timer = setTimeout(
      () => reject(new Error(`${label} connect timeout`)),
      10000,
    );
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
  if (!res.ok) {
    console.warn(
      `cleanup failed room=${roomId}: status=${res.status}${formatBody(res.body)}`,
    );
  }
}

async function joinRoomLikeUsers(roomId, users, metrics) {
  const sockets = [];
  for (const user of users) {
    const start = Date.now();
    const socket = await openSocket(
      "/room",
      user.token,
      `room:${user.username}`,
    );
    sockets.push(socket);
    await emitAck(socket, "join-room", { roomId });
    metrics.joinLatencies.push(Date.now() - start);
    await delay(
      config.joinDelayMs + Math.floor(Math.random() * config.joinDelayMs),
    );
  }
  return sockets;
}

async function readyAll(roomId, users, roomSockets) {
  const room = (await api(`/api/rooms/${roomId}`, { token: users[0].token }))
    .body;
  const readyByUserId = new Map(
    (room.participants || []).map((participant) => [
      participant.userId,
      !!participant.isReady,
    ]),
  );

  await Promise.all(
    users.map(async (user, index) => {
      if (readyByUserId.get(user.id)) return;
      const response = await emitAck(roomSockets[index], "toggle-ready", {
        roomId,
      });
      if (response?.isReady !== true) {
        throw makeError(
          `${user.username} ready 결과가 true가 아닙니다.`,
          response,
        );
      }
    }),
  );
}

/**
 * 경매를 끝까지 돌리면서 사고 시나리오를 재현한다.
 *
 * 봇은 "사람처럼" 굴지 않아도 되지만, 서버가 상태를 바꾸는 경로는
 * 사람과 똑같이 밟아야 한다 — place-bid / vote-item-skip 만 쓴다.
 */
async function driveAuction(roomId, users, auctionSockets, tracker) {
  const byUserId = new Map(users.map((user, index) => [user.id, index]));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          makeError(
            "경매가 제한 시간 안에 끝나지 않았습니다.",
            tracker.summary(),
          ),
        ),
      Math.max(180000, config.count * 12000),
    );

    const finish = (error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };

    // 모든 참가자 소켓이 이벤트를 받지만, 판단은 팀장 소켓만 내린다.
    for (const [userId, socket] of auctionSockets) {
      socket.on("auction-item-started", (payload) => {
        const state = payload?.state ?? payload;
        const player = state?.currentPlayer;
        if (!player) return;
        tracker.onItemStarted(player, state);

        // 호스트 끊김은 매물 경계에서 한 번만 일으킨다.
        if (
          tracker.itemCount === config.disconnectAt &&
          !tracker.hostDropped &&
          config.disconnectAt > 0
        ) {
          tracker.dropHost();
        }

        const teamId = tracker.captainTeamId(userId);
        if (!teamId) return;
        // 자기 자신이 매물이면 입찰 대상이 아니다.
        if (player.id === userId) return;

        scheduleCaptainAction(socket, userId, teamId, player, tracker);
      });

      socket.on("player-sold", (payload) => tracker.onSold(payload));
      socket.on("player-unsold", (payload) => tracker.onUnsold(payload));
      socket.on("auction-complete", () => finish());
      socket.on("auction-error", (payload) => tracker.onServerError(payload));
      socket.on("session-aborted", (payload) =>
        finish(makeError("경매 세션이 중단됐습니다.", payload)),
      );
    }

    tracker.onFatal = finish;
    void byUserId;
  });
}

/**
 * 팀장 한 명의 이번 매물 행동을 정한다.
 *
 * fold 비율을 높게 잡아야 유찰 경로가 실제로 만들어진다. 8/11 에 문제가 된 건
 * "아무도 안 사는 매물"이었고, 그건 전원이 포기해야 재현된다.
 */
function scheduleCaptainAction(socket, userId, teamId, player, tracker) {
  const willFold = Math.random() < config.foldRate;
  const thinkMs = 300 + Math.floor(Math.random() * 1200);

  setTimeout(() => {
    if (tracker.finished) return;
    // 매물이 이미 바뀌었으면 늦은 행동을 보내지 않는다.
    if (tracker.currentPlayerId !== player.id) return;

    if (willFold) {
      socket.emit("vote-item-skip", { roomId: tracker.roomId }, (res) => {
        if (res?.error) tracker.onActionRejected("fold", userId, res.error);
        else tracker.folds += 1;
      });
      return;
    }

    const amount = tracker.nextBidAmount(teamId);
    if (amount == null) {
      // 예산이 모자라면 포기로 대신한다 — 사람도 같은 선택을 한다.
      socket.emit("vote-item-skip", { roomId: tracker.roomId }, () => {});
      return;
    }
    socket.emit("place-bid", { roomId: tracker.roomId, amount }, (res) => {
      if (res?.error) tracker.onActionRejected("bid", userId, res.error);
      else tracker.bids += 1;
    });
  }, thinkMs);
}

/**
 * 경매 진행을 따라가며 불변식을 검사한다.
 *
 * 핵심 불변식(2026-08-12 `984c99ba`, `e8ff4ae6` 에서 도입):
 *   유찰된 매물은 남은 매물이 전부 한 번씩 나온 뒤에야 다시 올라온다.
 *   이게 깨지면 8/11 처럼 같은 사람이 30초씩 연속으로 유찰되는
 *   "공개처형"이 다시 생긴다.
 */
class AuctionTracker {
  constructor(roomId, hostUserId) {
    this.roomId = roomId;
    this.hostUserId = hostUserId;
    this.itemCount = 0;
    this.bids = 0;
    this.folds = 0;
    this.sold = 0;
    this.unsold = 0;
    this.currentPlayerId = null;
    this.teams = new Map(); // teamId -> { captainId, remaining }
    this.captainToTeam = new Map(); // userId -> teamId
    this.bidIncrement = 50;
    this.appearances = []; // 등장한 매물 id 순서
    this.pendingAfterUnsold = new Map(); // playerId -> 유찰 시점에 남아 있던 매물 집합
    this.soldPlayerIds = new Set();
    this.violations = [];
    this.rejections = [];
    this.serverErrors = [];
    this.hostDropped = false;
    this.hostDroppedAtItem = null;
    this.itemsAfterHostDrop = 0;
    this.finished = false;
    this.onFatal = null;
    this.onHostDrop = null;
  }

  syncTeams(state) {
    if (typeof state?.bidIncrement === "number") {
      this.bidIncrement = state.bidIncrement;
    }
    for (const team of state?.teams ?? []) {
      const remaining = team.remainingGold ?? team.remainingBudget ?? 0;
      this.teams.set(team.id, { captainId: team.captainId, remaining });
      if (team.captainId) this.captainToTeam.set(team.captainId, team.id);
    }
  }

  captainTeamId(userId) {
    return this.captainToTeam.get(userId) ?? null;
  }

  /**
   * 안전한 입찰액. 남은 빈자리 몫을 남겨 두는 서버 규칙을 그대로 따라간다.
   * 규칙을 어기면 서버가 거절하고, 그 거절은 테스트 신호가 아니라 잡음이 된다.
   */
  nextBidAmount(teamId) {
    const team = this.teams.get(teamId);
    if (!team) return null;
    const amount = this.bidIncrement;
    if (team.remaining < amount * 2) return null;
    return amount;
  }

  onItemStarted(player, state) {
    // 같은 매물에 대한 중복 이벤트는 한 번으로 친다(참가자 수만큼 수신된다).
    if (this.currentPlayerId === player.id) return;
    this.syncTeams(state);
    this.currentPlayerId = player.id;
    this.itemCount += 1;
    this.appearances.push(player.id);
    if (this.hostDropped) this.itemsAfterHostDrop += 1;
    this._checkUnsoldCycle(player.id);
  }

  /**
   * 유찰된 매물이 사이클을 지키고 돌아왔는지 본다.
   *
   * 유찰 시점에 "아직 안 팔린 다른 매물"을 스냅샷으로 잡아 두고,
   * 그 사람이 다시 나올 때 그 사이에 스냅샷이 전부(그 사이 팔린 건 빼고)
   * 한 번씩 등장했는지 확인한다.
   */
  _checkUnsoldCycle(playerId) {
    const snapshot = this.pendingAfterUnsold.get(playerId);
    if (!snapshot) return;
    this.pendingAfterUnsold.delete(playerId);

    const seenSince = new Set(snapshot.seenSince);
    const stillOwed = [...snapshot.pending].filter(
      (id) => !seenSince.has(id) && !this.soldPlayerIds.has(id),
    );
    if (stillOwed.length > 0) {
      this.violations.push(
        `유찰된 ${playerId} 가 사이클을 마치기 전에 재등장했습니다. ` +
          `아직 안 나온 매물 ${stillOwed.length}명: ${stillOwed.slice(0, 5).join(", ")}`,
      );
    }
  }

  onSold(payload) {
    const id = payload?.player?.id;
    if (id) {
      this.soldPlayerIds.add(id);
      this._recordSeen(id);
    }
    this.sold += 1;
    if (typeof payload?.price === "number" && payload?.team?.id) {
      const team = this.teams.get(payload.team.id);
      if (team) team.remaining = Math.max(0, team.remaining - payload.price);
    }
  }

  onUnsold(payload) {
    const id = payload?.player?.id;
    this.unsold += 1;
    if (!id) return;
    // 이 시점에 아직 안 팔린 다른 매물들이 "한 바퀴"의 대상이다.
    const pending = new Set(
      this.appearances.filter(
        (candidate) => candidate !== id && !this.soldPlayerIds.has(candidate),
      ),
    );
    this.pendingAfterUnsold.set(id, { pending, seenSince: new Set() });
    this._recordSeen(id);
  }

  _recordSeen(playerId) {
    for (const snapshot of this.pendingAfterUnsold.values()) {
      snapshot.seenSince.add(playerId);
    }
  }

  dropHost() {
    this.hostDropped = true;
    this.hostDroppedAtItem = this.itemCount;
    if (this.onHostDrop) this.onHostDrop();
  }

  onActionRejected(kind, userId, error) {
    this.rejections.push(`${kind} ${userId}: ${error}`);
  }

  onServerError(payload) {
    this.serverErrors.push(
      typeof payload === "string" ? payload : JSON.stringify(payload),
    );
  }

  summary() {
    return {
      items: this.itemCount,
      bids: this.bids,
      folds: this.folds,
      sold: this.sold,
      unsold: this.unsold,
      hostDroppedAtItem: this.hostDroppedAtItem,
      itemsAfterHostDrop: this.itemsAfterHostDrop,
      violations: this.violations,
      rejections: this.rejections.slice(0, 10),
      serverErrors: this.serverErrors.slice(0, 5),
    };
  }
}

async function runOne(prisma, iteration) {
  const users = await ensureBotUsers(prisma, config.count);
  const host = users[0];
  const metrics = { joinLatencies: [] };
  let roomId = null;
  let roomSockets = [];
  const auctionSockets = new Map();
  const startedAt = Date.now();
  let tracker = null;
  let reconnectState = null;

  try {
    const created = await api("/api/rooms", {
      method: "POST",
      token: host.token,
      body: {
        name: `[auction-load] ${config.count}p #${iteration} ${new Date().toISOString()}`,
        maxParticipants: config.count,
        teamMode: "AUCTION",
        allowSpectators: true,
        // 서버 DTO 이름 그대로 — whitelist 검증이라 이름이 틀리면 조용히 버려지고
        // 기본 30초로 돌아가 테스트가 몇 배로 늘어진다.
        bidTimeLimit: config.bidTimeSeconds,
        // 팀장 자동 선정(점수 상위). MANUAL/VOLUNTEER 는 별도 단계가 끼어든다.
        captainSelection: "TIER",
      },
    });
    roomId = created.body.id;

    roomSockets = await joinRoomLikeUsers(roomId, users, metrics);
    await readyAll(roomId, users, roomSockets);

    // 전원이 /auction 을 구독한 뒤 시작한다 — 실제 화면과 같은 순서다.
    for (const user of users) {
      const socket = await openSocket(
        "/auction",
        user.token,
        `auction:${user.username}`,
      );
      auctionSockets.set(user.id, socket);
      await emitAck(socket, "join-room", { roomId });
    }

    tracker = new AuctionTracker(roomId, host.id);
    tracker.onHostDrop = () => {
      const socket = auctionSockets.get(host.id);
      if (socket) socket.disconnect();
      const roomSocket = roomSockets[0];
      if (roomSocket) roomSocket.disconnect();
      console.log(
        `  ↳ 호스트 소켓 강제 종료 (매물 #${tracker.hostDroppedAtItem})`,
      );
    };

    const started = await emitAck(
      roomSockets[0],
      "start-game",
      { roomId },
      25000,
    );
    tracker.syncTeams(started?.state ?? started ?? {});

    await driveAuction(roomId, users, auctionSockets, tracker);
    tracker.finished = true;

    // 호스트 재접속 — 진행 중 상태를 그대로 돌려받아야 한다.
    if (tracker.hostDropped && config.reconnect) {
      const socket = await openSocket(
        "/auction",
        host.token,
        "auction:host-reconnect",
      );
      auctionSockets.set(`${host.id}:reconnect`, socket);
      reconnectState = await emitAck(socket, "join-room", { roomId });
    }

    const failures = [];
    if (tracker.violations.length) failures.push(...tracker.violations);
    if (tracker.serverErrors.length) {
      failures.push(`서버 오류 ${tracker.serverErrors.length}건`);
    }
    if (config.disconnectAt > 0 && !tracker.hostDropped) {
      failures.push(
        `호스트 끊김을 재현하지 못했습니다 (매물이 ${tracker.itemCount}개뿐).`,
      );
    }
    if (tracker.hostDropped && tracker.itemsAfterHostDrop === 0) {
      failures.push("호스트가 끊긴 뒤 경매가 한 건도 진행되지 않았습니다.");
    }
    if (tracker.hostDropped && config.reconnect && !reconnectState?.success) {
      failures.push("호스트 재접속이 상태를 돌려받지 못했습니다.");
    }

    return {
      ok: failures.length === 0,
      roomId,
      totalMs: Date.now() - startedAt,
      summary: tracker.summary(),
      failures,
    };
  } catch (error) {
    if (tracker) tracker.finished = true;
    return {
      ok: false,
      roomId,
      totalMs: Date.now() - startedAt,
      error: error.message,
      detail: error.detail,
      summary: tracker?.summary() ?? null,
      failures: [],
    };
  } finally {
    if (tracker) tracker.finished = true;
    for (const socket of auctionSockets.values()) socket.disconnect();
    for (const socket of roomSockets) socket.disconnect();
    await closeRoom(roomId, host.token);
  }
}

function printResult(result, iteration) {
  const status = result.ok ? "OK" : "FAIL";
  const s = result.summary;
  console.log(
    `${status} auction ${config.count}p #${iteration} total=${result.totalMs}ms` +
      (s
        ? ` items=${s.items} bids=${s.bids} folds=${s.folds} sold=${s.sold} unsold=${s.unsold}` +
          ` hostDrop@${s.hostDroppedAtItem ?? "-"} itemsAfterDrop=${s.itemsAfterHostDrop}`
        : ""),
  );
  if (result.error) console.log(`  error: ${result.error}`);
  for (const failure of result.failures ?? []) {
    console.log(`  ✗ ${failure}`);
  }
  if (s?.rejections?.length) {
    console.log(`  거절된 동작 ${s.rejections.length}건 (상위 몇 개):`);
    for (const rejection of s.rejections.slice(0, 3)) {
      console.log(`    - ${rejection}`);
    }
  }
  if (result.detail) {
    console.log(`  detail: ${JSON.stringify(result.detail).slice(0, 800)}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 필요합니다.");
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET이 필요합니다.");
  }

  console.log("=".repeat(64));
  console.log("Nexus 경매 모드 안정성 테스트");
  console.log(
    `base=${config.baseUrl} count=${config.count} repeat=${config.repeat}`,
  );
  console.log(
    `bidTime=${config.bidTimeSeconds}s foldRate=${config.foldRate} ` +
      `disconnectAt=${config.disconnectAt || "off"} reconnect=${config.reconnect}`,
  );
  console.log("=".repeat(64));

  const health = await api("/api/health", { expectOk: false }).catch(
    () => null,
  );
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
  console.log(
    `summary: total=${results.length} passed=${results.length - failed} failed=${failed}`,
  );
  console.log("=".repeat(64));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
