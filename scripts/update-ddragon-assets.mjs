#!/usr/bin/env node
/**
 * Data Dragon 최신 패치의 아이콘을 apps/web/public/icons 로 받아온다.
 *
 * 실행:  node scripts/update-ddragon-assets.mjs [버전]
 *        버전을 빼면 https://ddragon.leagueoflegends.com/api/versions.json 의 첫 값(최신)을 쓴다.
 *
 * 받는 것:
 *   - icons/champions/{챔피언키}.png   (champion.json 의 image.full)
 *   - icons/items/{아이템ID}.png        (item.json 의 전체 키)
 *   - icons/spells/{주문키}.png         (summoner.json 의 image.full)
 *   - icons/perks/{룬ID}.png            (runesReforged.json 의 계열·룬 icon 경로)
 *   - src/lib/ddragon-champion-ids.ts   (숫자 ID → 챔피언 키 표)
 *
 * 왜 로컬에 두나: 화면은 1순위로 로컬 아이콘을 쓰고, 없을 때만 CDN 으로 넘어간다.
 * 패치마다 신규 챔피언·아이템이 생기는데 로컬이 낡으면 매번 CDN 폴백을 타거나
 * (폴백이 없는 곳은) "?" 가 뜬다(2026-10-01 운영자 제보). 패치 후 이 스크립트를 돌린다.
 *
 * 기존 파일은 덮어쓴다(같은 키라도 패치에서 그림이 바뀔 수 있다). 지우지는 않는다 —
 * 예전 패치 기록(아이템 등)이 옛 ID 를 참조할 수 있다.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = path.join(ROOT, "apps/web/public/icons");
const ID_MAP_FILE = path.join(ROOT, "apps/web/src/lib/ddragon-champion-ids.ts");
const BASE = "https://ddragon.leagueoflegends.com";
/** 동시 다운로드 수. DDragon 은 정적 CDN 이라 여유 있지만 과하게 몰지 않는다 */
const CONCURRENCY = 16;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** url → file 다운로드. 실패해도 전체를 멈추지 않고 실패 목록에 남긴다 */
async function downloadAll(jobs, label) {
  const failed = [];
  let done = 0;
  const queue = [...jobs];
  async function worker() {
    while (queue.length) {
      const { url, file } = queue.shift();
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
        done++;
      } catch (error) {
        failed.push(`${path.basename(file)} (${error.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`  ${label}: ${done}/${jobs.length}`);
  if (failed.length) console.log(`    실패: ${failed.join(", ")}`);
  return failed.length;
}

async function main() {
  const version =
    process.argv[2] ?? (await getJson(`${BASE}/api/versions.json`))[0];
  console.log(`Data Dragon ${version}`);
  const data = (name) =>
    getJson(`${BASE}/cdn/${version}/data/ko_KR/${name}.json`);

  const [champions, items, spells, runes] = await Promise.all([
    data("champion"),
    data("item"),
    data("summoner"),
    data("runesReforged"),
  ]);

  for (const dir of ["champions", "items", "spells", "perks"]) {
    await fs.mkdir(path.join(ICONS, dir), { recursive: true });
  }

  let failures = 0;
  failures += await downloadAll(
    Object.values(champions.data).map((c) => ({
      url: `${BASE}/cdn/${version}/img/champion/${c.image.full}`,
      file: path.join(ICONS, "champions", c.image.full),
    })),
    "챔피언",
  );
  failures += await downloadAll(
    Object.keys(items.data).map((id) => ({
      url: `${BASE}/cdn/${version}/img/item/${id}.png`,
      file: path.join(ICONS, "items", `${id}.png`),
    })),
    "아이템",
  );
  failures += await downloadAll(
    Object.values(spells.data).map((s) => ({
      url: `${BASE}/cdn/${version}/img/spell/${s.image.full}`,
      file: path.join(ICONS, "spells", s.image.full),
    })),
    "소환사 주문",
  );
  // 룬 이미지는 버전 없는 경로(cdn/img/...)에 있다.
  const perkJobs = [];
  for (const style of runes) {
    perkJobs.push({
      url: `${BASE}/cdn/img/${style.icon}`,
      file: path.join(ICONS, "perks", `${style.id}.png`),
    });
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        perkJobs.push({
          url: `${BASE}/cdn/img/${rune.icon}`,
          file: path.join(ICONS, "perks", `${rune.id}.png`),
        });
      }
    }
  }
  failures += await downloadAll(perkJobs, "룬");

  // 숫자 ID → 챔피언 키 표. 선호 챔피언은 숫자 ID 로 저장돼 이 표로 아이콘을 찾는다.
  const entries = Object.values(champions.data)
    .map((c) => [Number(c.key), c.id])
    .sort((a, b) => a[0] - b[0]);
  const body = entries.map(([id, key]) => `  ${id}: "${key}",`).join("\n");
  await fs.writeFile(
    ID_MAP_FILE,
    `// 자동 생성 — scripts/update-ddragon-assets.mjs (Data Dragon ${version}). 손으로 고치지 않는다.\n` +
      `// 챔피언 숫자 ID(champion.json 의 key) → 챔피언 키(id, 아이콘 파일 이름).\n\n` +
      `export const DDRAGON_ASSET_VERSION = "${version}";\n\n` +
      `export const CHAMPION_ID_TO_KEY: Record<number, string> = {\n${body}\n};\n`,
  );
  console.log(
    `  챔피언 ID 표: ${entries.length}개 → ${path.relative(ROOT, ID_MAP_FILE)}`,
  );

  if (failures) {
    console.error(`실패 ${failures}건 — 위 목록 확인`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
