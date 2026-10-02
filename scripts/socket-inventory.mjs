#!/usr/bin/env node
/**
 * Socket.IO 이벤트 계약 인벤토리 (읽기 전용).
 *
 * 서버(@SubscribeMessage / .emit)와 클라이언트(socket.on / socket.emit)가 서로 맞는지
 * 네임스페이스별로 대조해 불일치를 찾는다.
 *
 *   node scripts/socket-inventory.mjs            # 요약 + 불일치 출력
 *   node scripts/socket-inventory.mjs --md       # docs/technical/WEBSOCKET_EVENTS.md 용 마크다운
 *   node scripts/socket-inventory.mjs --json     # 기계가 읽는 JSON
 *
 * 한계(정적 분석이라 어쩔 수 없다):
 *   - 이벤트 이름이 변수·템플릿 문자열이면 못 잡는다(목록 끝에 "동적 이벤트"로 따로 센다).
 *   - 클라이언트의 네임스페이스는 소켓 변수 이름(auctionSocket 등)으로 추정한다.
 *     추정 못 하면 "?" 로 두고 이름만으로 대조한다.
 *   - 불일치는 "후보"다. 서버 내부 이벤트(EventEmitter)나 Socket.IO 예약 이벤트
 *     (connect, disconnect, connect_error)는 제외한다.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.join(ROOT, "apps/api/src");
const WEB = path.join(ROOT, "apps/web/src");

/** Socket.IO 가 쓰는 예약 이벤트 — 계약 대조에서 뺀다 */
const RESERVED = new Set([
  "connect",
  "disconnect",
  "connect_error",
  "reconnect",
  "reconnect_attempt",
  "reconnect_error",
  "reconnect_failed",
  "error", // 서버가 일부러 emit 하는 경우가 있어 아래에서 따로 센다
]);

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p);
const nsName = (ns) => (ns.startsWith("/") ? ns : `/${ns}`);

// ─────────────────────────── 서버 ───────────────────────────
const gatewayFiles = walk(API, (f) => f.endsWith(".gateway.ts"));
/** namespace → { file, handlers:Map<event,line>, emits:Map<event,[{line,target}]> } */
const server = new Map();
/** 헬퍼(이벤트 이름을 인자로 받아 emit 하는 메서드) → namespace */
const helperToNs = new Map();
const dynamicEmits = [];

for (const file of gatewayFiles) {
  const src = fs.readFileSync(file, "utf8");
  const ns = nsName(
    /@WebSocketGateway\(\s*\{[\s\S]*?namespace:\s*["'`]([^"'`]+)["'`]/.exec(
      src,
    )?.[1] ?? "(default)",
  );
  const entry = server.get(ns) ?? {
    files: [],
    handlers: new Map(),
    emits: new Map(),
  };
  entry.files.push(rel(file));
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    const sub = /@SubscribeMessage\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(line);
    if (sub) entry.handlers.set(sub[1], i + 1);
  });

  // 직접 emit: .emit("event"  — 앞 줄이 .to(...) 인 체인도 같은 문장으로 본다
  const flat = src;
  const emitRe = /\.emit\(\s*(["'`])([^"'`]+)\1/g;
  let m;
  while ((m = emitRe.exec(flat))) {
    const line = flat.slice(0, m.index).split("\n").length;
    const list = entry.emits.get(m[2]) ?? [];
    list.push({ line, file: rel(file) });
    entry.emits.set(m[2], list);
  }
  // 변수 이벤트: .emit(event, ...)
  const dynRe = /\.emit\(\s*([A-Za-z_][\w.]*)\s*[,)]/g;
  while ((m = dynRe.exec(flat))) {
    const line = flat.slice(0, m.index).split("\n").length;
    dynamicEmits.push({ file: rel(file), line, expr: m[1] });
    // 이 메서드가 헬퍼면(시그니처에 event: string) 호출처에서 문자열을 모은다
    const before = flat.slice(0, m.index);
    const sig =
      /(\w+)\s*\([^)]*\bevent:\s*string[^)]*\)\s*(?::\s*\w+\s*)?\{[^{}]*$/.exec(
        before,
      );
    if (sig) helperToNs.set(sig[1], ns);
  }
  server.set(ns, entry);
}

// 헬퍼 호출처(컨트롤러·서비스)에서 문자열 이벤트를 모은다
const allApiFiles = walk(
  API,
  (f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"),
);
for (const file of allApiFiles) {
  const src = fs.readFileSync(file, "utf8");
  for (const [helper, ns] of helperToNs) {
    const re = new RegExp(
      `\\b${helper}\\(\\s*[^,()]+,\\s*(["'\`])([^"'\`]+)\\1`,
      "g",
    );
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split("\n").length;
      const entry = server.get(ns);
      const list = entry.emits.get(m[2]) ?? [];
      list.push({ line, file: rel(file), via: helper });
      entry.emits.set(m[2], list);
    }
  }
}

// ───────────────────────── 클라이언트 ─────────────────────────
/** 변수 이름 → 네임스페이스 */
const VAR_NS = [
  [/room(?!Sel|List)/i, "/room"],
  [/auction/i, "/auction"],
  [/snake|draft/i, "/snake-draft"],
  [/role/i, "/role-selection"],
  [/match/i, "/match"],
  [/scrim/i, "/scrim"],
  [/clan/i, "/clan"],
  [/dm/i, "/dm"],
  [/presence/i, "/presence"],
  [/notification|notif/i, "/notification"],
];

function guessNs(varName) {
  if (!varName) return "?";
  for (const [re, ns] of VAR_NS) if (re.test(varName)) return ns;
  return "?";
}

const webFiles = walk(
  WEB,
  (f) => /\.(ts|tsx)$/.test(f) && !/\.(spec|test)\./.test(f),
);
/** event → [{ns,kind:'on'|'emit',file,line}] */
const client = [];
const dynamicClient = [];
for (const file of webFiles) {
  const src = fs.readFileSync(file, "utf8");
  const re = /(\w+)?\??\.(on|once|emit)\(\s*(["'`])([^"'`]+)\3/g;
  let m;
  while ((m = re.exec(src))) {
    const varName = m[1];
    // 소켓이 아닌 .on(...) 은 대문자·점이 들어간 DOM/프로세스 이벤트일 가능성이 높아 거른다
    if (
      /^(window|document|process|emitter|eventEmitter|body)$/i.test(
        varName ?? "",
      )
    )
      continue;
    const event = m[4];
    if (
      /^(click|keydown|keyup|resize|scroll|beforeunload|visibilitychange|online|offline|focus|blur|message|storage|pagehide|pageshow|popstate)$/.test(
        event,
      )
    )
      continue;
    const line = src.slice(0, m.index).split("\n").length;
    client.push({
      ns: guessNs(varName),
      kind: m[2] === "emit" ? "emit" : "on",
      event,
      file: rel(file),
      line,
    });
  }
  // 헬퍼 호출: emitMatchWithAck("event", ...), emitRoomEvent("event") 처럼
  // 함수 이름이 emit 으로 시작하고 첫 인자가 이벤트 이름인 경우. 네임스페이스는 함수 이름에서 추정한다.
  const helperRe = /\b(emit[A-Z]\w*)\(\s*(["'`])([^"'`]+)\2/g;
  while ((m = helperRe.exec(src))) {
    client.push({
      ns: guessNs(m[1]),
      kind: "emit",
      event: m[3],
      file: rel(file),
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  const dyn = /\w+\??\.(on|emit)\(\s*([A-Za-z_][\w.]*)\s*[,)]/g;
  while ((m = dyn.exec(src))) {
    if (/^(window|document)$/.test(m[2])) continue;
    dynamicClient.push({
      file: rel(file),
      line: src.slice(0, m.index).split("\n").length,
      expr: m[2],
    });
  }
}

// ───────────────────────── 대조 ─────────────────────────
const report = { namespaces: {}, problems: [] };
for (const [ns, s] of [...server.entries()].sort()) {
  const handlers = [...s.handlers.keys()].sort();
  const emits = [...s.emits.keys()].sort();
  const clientEmits = (e) =>
    client.filter(
      (c) =>
        c.kind === "emit" && c.event === e && (c.ns === ns || c.ns === "?"),
    );
  const clientOns = (e) =>
    client.filter(
      (c) => c.kind === "on" && c.event === e && (c.ns === ns || c.ns === "?"),
    );

  const handlerNoCaller = handlers.filter((e) => clientEmits(e).length === 0);
  const emitNoListener = emits.filter(
    (e) => !RESERVED.has(e) && clientOns(e).length === 0,
  );
  const callerNoHandler = [
    ...new Set(
      client
        .filter((c) => c.kind === "emit" && c.ns === ns)
        .map((c) => c.event)
        .filter((e) => !s.handlers.has(e) && !RESERVED.has(e)),
    ),
  ].sort();
  const listenerNoEmit = [
    ...new Set(
      client
        .filter((c) => c.kind === "on" && c.ns === ns)
        .map((c) => c.event)
        .filter((e) => !s.emits.has(e) && !RESERVED.has(e)),
    ),
  ].sort();

  report.namespaces[ns] = {
    files: s.files,
    handlers: Object.fromEntries(s.handlers),
    emits: Object.fromEntries(
      [...s.emits.entries()].map(([e, l]) => [e, l.length]),
    ),
    handlerNoCaller,
    emitNoListener,
    callerNoHandler,
    listenerNoEmit,
  };
  for (const e of callerNoHandler)
    report.problems.push({
      ns,
      kind: "클라가 보내는데 서버 핸들러 없음",
      event: e,
    });
  for (const e of listenerNoEmit)
    report.problems.push({
      ns,
      kind: "클라가 듣는데 서버가 안 보냄",
      event: e,
    });
}
report.dynamic = { server: dynamicEmits, client: dynamicClient };
report.unknownNsClient = [
  ...new Set(client.filter((c) => c.ns === "?").map((c) => c.file)),
].sort();

// ───────────────────────── 출력 ─────────────────────────
const mode = process.argv[2];
if (mode === "--json") {
  console.log(JSON.stringify(report, null, 2));
} else if (mode === "--md") {
  const out = [];
  out.push("# WebSocket Events", "");
  out.push(
    `> 자동 생성 — \`node scripts/socket-inventory.mjs --md\` (${new Date().toISOString().slice(0, 10)}).`,
    "> 손으로 고치지 않는다. 정적 분석이라 변수로 만든 이벤트 이름은 빠질 수 있다.",
    "> REST 엔드포인트는 [API_REFERENCE.md](./API_REFERENCE.md) 참조",
    "",
  );
  out.push("## 공통", "");
  out.push(
    '- 전송: 클라이언트는 `transports: ["websocket", "polling"]` (polling 폴백 허용) — `apps/web/src/lib/socket-client.ts`',
    "- 인증: 연결 시 `auth.token` 콜백으로 JWT accessToken 전달 (방송 오버레이는 broadcast 토큰)",
    "- 어댑터: Redis (`apps/api/src/adapters/redis-io.adapter.ts`)",
    "",
  );
  for (const [ns, r] of Object.entries(report.namespaces)) {
    out.push(
      `## ${ns}`,
      "",
      `파일: ${r.files.map((f) => `\`${f}\``).join(", ")}`,
      "",
    );
    out.push(
      "### 클라이언트 → 서버",
      "",
      "| 이벤트 | 핸들러 | 클라이언트 호출 |",
      "|---|---|---|",
    );
    for (const [e, line] of Object.entries(r.handlers)) {
      const callers = client.filter(
        (c) =>
          c.kind === "emit" && c.event === e && (c.ns === ns || c.ns === "?"),
      ).length;
      out.push(
        `| \`${e}\` | ${r.files[0].split("/").pop()}:${line} | ${callers ? `${callers}곳` : "**없음**"} |`,
      );
    }
    out.push(
      "",
      "### 서버 → 클라이언트",
      "",
      "| 이벤트 | emit 위치 수 | 클라이언트 리스너 |",
      "|---|---|---|",
    );
    for (const [e, n] of Object.entries(r.emits)) {
      const ls = client.filter(
        (c) =>
          c.kind === "on" && c.event === e && (c.ns === ns || c.ns === "?"),
      ).length;
      out.push(`| \`${e}\` | ${n} | ${ls ? `${ls}곳` : "**없음**"} |`);
    }
    out.push("");
  }
  console.log(out.join("\n"));
} else {
  let handlerTotal = 0;
  let emitTotal = 0;
  for (const [ns, r] of Object.entries(report.namespaces)) {
    const h = Object.keys(r.handlers).length;
    const e = Object.keys(r.emits).length;
    handlerTotal += h;
    emitTotal += e;
    console.log(
      `\n${ns}  (핸들러 ${h}, emit 이벤트 ${e})  ${r.files.join(", ")}`,
    );
    if (r.callerNoHandler.length)
      console.log(
        `  ✗ 클라가 보내는데 핸들러 없음: ${r.callerNoHandler.join(", ")}`,
      );
    if (r.listenerNoEmit.length)
      console.log(
        `  ✗ 클라가 듣는데 서버가 안 보냄: ${r.listenerNoEmit.join(", ")}`,
      );
    if (r.handlerNoCaller.length)
      console.log(
        `  · 핸들러만 있고 호출하는 클라 없음: ${r.handlerNoCaller.join(", ")}`,
      );
    if (r.emitNoListener.length)
      console.log(
        `  · 서버가 보내는데 듣는 클라 없음: ${r.emitNoListener.join(", ")}`,
      );
  }
  console.log(
    `\n합계: 네임스페이스 ${server.size}, 핸들러 ${handlerTotal}, emit 이벤트 ${emitTotal}`,
  );
  console.log(
    `동적 이벤트(이름이 변수): 서버 ${dynamicEmits.length}, 클라 ${dynamicClient.length}`,
  );
  console.log(
    `네임스페이스를 추정 못 한 클라 파일: ${report.unknownNsClient.length}개`,
  );
}
