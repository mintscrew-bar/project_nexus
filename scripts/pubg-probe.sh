#!/usr/bin/env bash
#
# PUBG API 실측 (TODO_pubg_expansion Phase 0)
#
# 배그 확장이 성립하는지 확인하는 세 가지를 한 번에 본다.
#   Task 1  닉네임이 어느 샤드(steam / kakao)에서 나오는가
#   Task 2  매치 응답에 isCustomMatch·팀 구성·순위·킬이 어떤 형태로 오는가
#   Task 3  라운드 결과를 시작 시각 + 커스텀 여부로 특정할 수 있는가
#
# 키는 운영 API 컨테이너의 환경변수(PUBG_API_KEY)를 쓴다. GitHub Secrets 에서
# 배포 때 주입된 값이라 호스트 디스크에 손으로 적어둘 필요가 없고,
# 이 스크립트도 키 값을 출력하지 않는다.
#
# 사용: scripts/pubg-probe.sh <닉네임> [샤드]
#   샤드를 생략하면 steam → kakao 순으로 찾는다.
set -euo pipefail

NICKNAME="${1:-}"
SHARD="${2:-}"

if [ -z "$NICKNAME" ]; then
  echo "사용: $0 <배그닉네임> [steam|kakao]" >&2
  exit 1
fi

CONTAINER="${PUBG_PROBE_CONTAINER:-nexus-api}"

if ! docker exec "$CONTAINER" sh -c 'test -n "$PUBG_API_KEY"' 2>/dev/null; then
  echo "❌ $CONTAINER 에 PUBG_API_KEY 가 없습니다." >&2
  echo "   GitHub Secrets 에 넣은 뒤 배포해야 .env.production 에 주입됩니다." >&2
  exit 1
fi

# 실제 조회는 컨테이너 안에서 돈다. 키가 호스트 셸이나 로그로 나오지 않는다.
docker exec -e PROBE_NICKNAME="$NICKNAME" -e PROBE_SHARD="$SHARD" "$CONTAINER" node -e '
const KEY = process.env.PUBG_API_KEY;
const nickname = process.env.PROBE_NICKNAME;
const forced = process.env.PROBE_SHARD;
const shards = forced ? [forced] : ["steam", "kakao"];
const H = { Authorization: `Bearer ${KEY}`, Accept: "application/vnd.api+json" };

async function get(url) {
  const res = await fetch(url, { headers: H });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* 비 JSON 응답 */ }
  return { status: res.status, body, raw: text.slice(0, 300) };
}

(async () => {
  let found = null;

  // ── Task 1: 어느 샤드에 있는가 ──
  for (const shard of shards) {
    const url = `https://api.pubg.com/shards/${shard}/players?filter[playerNames]=${encodeURIComponent(nickname)}`;
    const r = await get(url);
    if (r.status === 200 && r.body?.data?.length) {
      const player = r.body.data[0];
      found = { shard, id: player.id, matches: (player.relationships?.matches?.data ?? []).map((m) => m.id) };
      console.log(`[Task 1] ${shard} 샤드에서 발견 — 최근 매치 ${found.matches.length}건`);
      break;
    }
    console.log(`[Task 1] ${shard}: HTTP ${r.status}${r.status === 404 ? " (없음)" : ""}`);
    if (r.status === 429) { console.log("  레이트 제한(10req/분) — 잠시 후 다시"); return; }
    if (r.status === 401) { console.log("  키가 거부됨 — PUBG_API_KEY 확인 필요"); return; }
  }

  if (!found) {
    console.log("\n결론: 어느 샤드에서도 찾지 못했습니다. 닉네임 철자/대소문자를 확인하세요.");
    return;
  }
  if (found.matches.length === 0) {
    console.log("\n결론: 계정은 찾았지만 최근 매치가 없습니다(보존 2주).");
    return;
  }

  // ── Task 2·3: 최근 매치를 훑어 커스텀 매치를 찾는다 ──
  // 전역 예산이 10req/분이라 최대 5건만 본다.
  const limit = Math.min(5, found.matches.length);
  console.log(`\n[Task 2] 최근 매치 ${limit}건 확인`);
  let custom = null;

  for (let i = 0; i < limit; i++) {
    const r = await get(`https://api.pubg.com/shards/${found.shard}/matches/${found.matches[i]}`);
    if (r.status !== 200) { console.log(`  #${i + 1} HTTP ${r.status}`); continue; }
    const a = r.body.data.attributes;
    const rosters = r.body.included.filter((x) => x.type === "roster");
    console.log(
      `  #${i + 1} ${a.createdAt} · ${a.gameMode} · ${a.mapName}` +
      ` · isCustomMatch=${a.isCustomMatch} · 팀 ${rosters.length}개`
    );
    if (a.isCustomMatch && !custom) custom = { id: found.matches[i], attrs: a, included: r.body.included };
  }

  if (!custom) {
    console.log("\n[Task 3] 최근 매치 중 커스텀이 없어 자동 매칭은 검증하지 못했습니다.");
    console.log("         커스텀 매치를 한 판 하신 뒤 다시 실행해주세요(보존 2주).");
    return;
  }

  // ── Task 3: 스크림 집계에 필요한 필드가 다 나오는가 ──
  const rosters = custom.included.filter((x) => x.type === "roster");
  const participants = new Map(
    custom.included.filter((x) => x.type === "participant").map((p) => [p.id, p.attributes.stats])
  );

  console.log(`\n[Task 3] 커스텀 매치 ${custom.id}`);
  console.log(`  시작: ${custom.attrs.createdAt} / 팀 ${rosters.length}개`);
  const rows = rosters.map((r) => {
    const members = (r.relationships?.participants?.data ?? []).map((p) => participants.get(p.id)).filter(Boolean);
    return {
      rank: r.attributes.stats?.rank,
      kills: members.reduce((sum, s) => sum + (s.kills ?? 0), 0),
      names: members.map((s) => s.name),
    };
  }).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  for (const row of rows.slice(0, 8)) {
    console.log(`  ${String(row.rank).padStart(2)}위  킬 ${String(row.kills).padStart(2)}  ${row.names.join(", ")}`);
  }
  if (rows.length > 8) console.log(`  … 외 ${rows.length - 8}팀`);

  const ok = rows.every((r) => typeof r.rank === "number") && rows.every((r) => r.names.length > 0);
  console.log(`\n결론: 순위·킬·참가자 명단 ${ok ? "전부 확보 — 자동 집계 가능" : "일부 누락 — 설계 재검토 필요"}`);
  console.log(`      매치 특정 조건: createdAt(${custom.attrs.createdAt}) + isCustomMatch=true + 참가자 명단`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
'
