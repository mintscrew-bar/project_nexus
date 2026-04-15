/**
 * Data Dragon에서 최신 LoL 데이터를 가져와 lol-mappings.ts를 업데이트하는 스크립트
 *
 * 실행 방법:
 *   pnpm --filter @nexus/types mappings:update
 *
 * 업데이트 대상:
 *   - CHAMPION_MAPPINGS  : 챔피언 영문 id → 한글 name
 *   - ITEM_MAPPINGS      : 아이템 영문 name → 한글 name
 *   - RUNE_MAPPINGS      : 룬 영문 key → 한글 name
 *   - SUMMONER_SPELL_MAPPINGS : 소환사 주문 숫자 id → 한글 name
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 타입 정의
// ============================================

/** Data Dragon champion.json 내 개별 챔피언 구조 */
interface DDragonChampion {
  id: string;
  key: string;
  name: string;
}

/** Data Dragon champion.json 최상위 구조 */
interface DDragonChampionData {
  version: string;
  data: Record<string, DDragonChampion>;
}

/** Data Dragon item.json 내 개별 아이템 구조 */
interface DDragonItem {
  name: string;
  gold?: { purchasable?: boolean };
  maps?: Record<string, boolean>;
  inStore?: boolean;
}

/** Data Dragon item.json 최상위 구조 */
interface DDragonItemData {
  version: string;
  data: Record<string, DDragonItem>;
}

/** Data Dragon summoner.json 내 개별 소환사 주문 구조 */
interface DDragonSummoner {
  id: string;
  name: string;
  key: string; // 숫자를 문자열로 표현한 값 (예: "4")
}

/** Data Dragon summoner.json 최상위 구조 */
interface DDragonSummonerData {
  version: string;
  data: Record<string, DDragonSummoner>;
}

/** Data Dragon runesReforged.json 내 개별 룬 구조 */
interface DDragonRune {
  id: number;
  key: string;
  name: string;
}

/** Data Dragon runesReforged.json 내 슬롯 구조 */
interface DDragonRuneSlot {
  runes: DDragonRune[];
}

/** Data Dragon runesReforged.json 내 경로(Path) 구조 */
interface DDragonRunePath {
  id: number;
  key: string;
  name: string;
  slots: DDragonRuneSlot[];
}

// ============================================
// Data Dragon API 요청 함수
// ============================================

/**
 * 주어진 URL에서 JSON 데이터를 가져옴
 * Node 20+의 내장 fetch API 사용
 */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${url}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Data Dragon 최신 패치 버전을 가져옴
 */
async function fetchLatestVersion(): Promise<string> {
  const versions = await fetchJson<string[]>(
    'https://ddragon.leagueoflegends.com/api/versions.json',
  );
  const latest = versions[0];
  if (!latest) {
    throw new Error('versions.json 응답이 비어 있습니다.');
  }
  return latest;
}

// ============================================
// 매핑 데이터 생성 함수
// ============================================

/**
 * 챔피언 매핑 생성
 * 영문 id(예: "Aatrox") → 한글 name(예: "아트록스")
 */
async function buildChampionMappings(
  version: string,
): Promise<Record<string, string>> {
  const [enData, koData] = await Promise.all([
    fetchJson<DDragonChampionData>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    ),
    fetchJson<DDragonChampionData>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`,
    ),
  ]);

  const mappings: Record<string, string> = {};

  for (const champId of Object.keys(enData.data).sort()) {
    const koChamp = koData.data[champId];
    if (koChamp) {
      // 영문 id → 한글 name 매핑
      mappings[champId] = koChamp.name;
    }
  }

  return mappings;
}

/**
 * 아이템 매핑 생성
 * 영문 name → 한글 name
 *
 * 필터 기준:
 * - 상점에서 구매 가능한 아이템만 포함 (gold.purchasable !== false)
 * - inStore가 false인 항목 제외
 * - 소환사의 협곡(맵 11)에서 사용 가능한 아이템 우선
 */
async function buildItemMappings(
  version: string,
): Promise<Record<string, string>> {
  const [enData, koData] = await Promise.all([
    fetchJson<DDragonItemData>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
    ),
    fetchJson<DDragonItemData>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/item.json`,
    ),
  ]);

  const mappings: Record<string, string> = {};

  for (const itemId of Object.keys(enData.data)) {
    const enItem = enData.data[itemId];
    const koItem = koData.data[itemId];

    if (!enItem || !koItem) continue;

    // 상점에 없는 아이템 제외
    if (enItem.inStore === false) continue;
    // 구매 불가 아이템 제외 (gold.purchasable가 명시적으로 false인 경우)
    if (enItem.gold?.purchasable === false) continue;

    const enName = enItem.name.trim();
    const koName = koItem.name.trim();

    if (!enName || !koName) continue;
    // 중복 영문 이름이 있으면 첫 번째를 유지
    if (mappings[enName]) continue;

    mappings[enName] = koName;
  }

  // 알파벳 순으로 정렬
  return Object.fromEntries(
    Object.entries(mappings).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * 룬 매핑 생성
 * 룬 경로명 및 개별 룬 모두 포함
 * 영문 key(예: "Electrocute") → 한글 name(예: "감전")
 */
async function buildRuneMappings(
  version: string,
): Promise<Record<string, string>> {
  const [enPaths, koPaths] = await Promise.all([
    fetchJson<DDragonRunePath[]>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
    ),
    fetchJson<DDragonRunePath[]>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/runesReforged.json`,
    ),
  ]);

  const mappings: Record<string, string> = {};

  // 한글 경로를 id 기준으로 인덱싱 (빠른 조회)
  const koPathById = new Map<number, DDragonRunePath>(
    koPaths.map((p) => [p.id, p]),
  );

  for (const enPath of enPaths) {
    const koPath = koPathById.get(enPath.id);
    if (!koPath) continue;

    // 경로명 자체도 매핑 (예: "Domination" → "지배")
    mappings[enPath.key] = koPath.name;

    // 각 슬롯의 룬 매핑
    for (let slotIdx = 0; slotIdx < enPath.slots.length; slotIdx++) {
      const enSlot = enPath.slots[slotIdx];
      const koSlot = koPath.slots[slotIdx];
      if (!enSlot || !koSlot) continue;

      // 한글 룬을 id 기준으로 인덱싱
      const koRuneById = new Map<number, DDragonRune>(
        koSlot.runes.map((r) => [r.id, r]),
      );

      for (const enRune of enSlot.runes) {
        const koRune = koRuneById.get(enRune.id);
        if (koRune) {
          // 영문 key → 한글 name 매핑
          mappings[enRune.key] = koRune.name;
        }
      }
    }
  }

  return mappings;
}

/**
 * 소환사 주문 매핑 생성
 * 숫자 key(예: 4) → 한글 name(예: "점멸")
 */
async function buildSummonerSpellMappings(
  version: string,
): Promise<Record<number, string>> {
  const [enData, koData] = await Promise.all([
    fetchJson<DDragonSummonerData>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`,
    ),
    fetchJson<DDragonSummonerData>(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/summoner.json`,
    ),
  ]);

  const mappings: Record<number, string> = {};

  // 한글 데이터를 id 기준으로 인덱싱
  const koById = new Map<string, DDragonSummoner>(
    Object.values(koData.data).map((s) => [s.id, s]),
  );

  for (const enSpell of Object.values(enData.data)) {
    const koSpell = koById.get(enSpell.id);
    if (!koSpell) continue;

    const numericKey = parseInt(enSpell.key, 10);
    if (isNaN(numericKey)) continue;

    mappings[numericKey] = koSpell.name;
  }

  // key 숫자 순 정렬
  return Object.fromEntries(
    Object.entries(mappings)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([k, v]) => [parseInt(k), v]),
  ) as Record<number, string>;
}

// ============================================
// 변경 사항 diff 출력 함수
// ============================================

/**
 * 이전 매핑과 새 매핑을 비교하여 추가/제거/변경된 항목을 콘솔에 출력
 */
function printDiff(
  label: string,
  oldMap: Record<string, string>,
  newMap: Record<string, string>,
): void {
  const oldKeys = new Set(Object.keys(oldMap));
  const newKeys = new Set(Object.keys(newMap));

  const added = [...newKeys].filter((k) => !oldKeys.has(k));
  const removed = [...oldKeys].filter((k) => !newKeys.has(k));
  const changed = [...newKeys].filter(
    (k) => oldKeys.has(k) && oldMap[k] !== newMap[k],
  );

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.log(`  [${label}] 변경 없음 (총 ${newKeys.size}개)`);
    return;
  }

  console.log(`  [${label}] 총 ${newKeys.size}개 (이전: ${oldKeys.size}개)`);
  if (added.length > 0) {
    console.log(`    ✚ 추가 (${added.length}개): ${added.join(', ')}`);
  }
  if (removed.length > 0) {
    console.log(`    ✖ 제거 (${removed.length}개): ${removed.join(', ')}`);
  }
  if (changed.length > 0) {
    console.log(`    ~ 변경 (${changed.length}개):`);
    for (const k of changed) {
      console.log(`      "${k}": "${oldMap[k]}" → "${newMap[k]}"`);
    }
  }
}

// ============================================
// lol-mappings.ts 파일 파싱 및 교체 함수
// ============================================

/**
 * 현재 lol-mappings.ts에서 특정 MAPPINGS 객체의 내용을 파싱하여
 * Record<string, string> 형태로 반환
 * (변경 전 비교용 — 정확한 파싱 보다는 대략적인 diff 목적)
 */
function parseExistingMapping(
  source: string,
  exportName: string,
): Record<string, string> {
  // 예: export const CHAMPION_MAPPINGS: Record<...> = { ... };
  const regex = new RegExp(
    `export const ${exportName}[^=]+=\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`,
    's',
  );
  const match = source.match(regex);
  if (!match) return {};

  const body = match[1];
  const result: Record<string, string> = {};
  // 각 라인에서 "key": "value" 형태 추출
  const lineRegex = /["']([^"']+)["']\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(body)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

/**
 * Record<string, string> 매핑을 TypeScript 객체 리터럴 문자열로 직렬화
 * [AUTO-GENERATED START] ~ [AUTO-GENERATED END] 마커 사이에 삽입
 */
function serializeStringMapping(mapping: Record<string, string>): string {
  const lines = Object.entries(mapping).map(
    ([k, v]) => `  "${k}": "${v}",`,
  );
  return lines.join('\n');
}

/**
 * Record<number, string> 매핑을 TypeScript 객체 리터럴 문자열로 직렬화
 * [AUTO-GENERATED START] ~ [AUTO-GENERATED END] 마커 사이에 삽입
 */
function serializeNumberMapping(mapping: Record<number, string>): string {
  const lines = Object.entries(mapping).map(
    ([k, v]) => `  ${k}: "${v}",`,
  );
  return lines.join('\n');
}

/**
 * lol-mappings.ts 소스에서 exportName에 해당하는 MAPPINGS 블록의
 * [AUTO-GENERATED START] ~ [AUTO-GENERATED END] 사이 내용을 newContent로 교체
 *
 * 마커가 없으면 기존 객체 내용 전체를 마커 + 새 내용으로 교체
 */
function replaceMappingBlock(
  source: string,
  exportName: string,
  newContent: string,
): string {
  // 마커가 있는 경우 — 마커 사이만 교체
  const markerRegex = new RegExp(
    `(export const ${exportName}[^{]*\\{[\\s\\S]*?// \\[AUTO-GENERATED START\\]\\n)([\\s\\S]*?)(\\n\\s*// \\[AUTO-GENERATED END\\])`,
    's',
  );

  if (markerRegex.test(source)) {
    return source.replace(
      markerRegex,
      `$1${newContent}$3`,
    );
  }

  // 마커가 없는 경우 — 객체 {} 내부 전체를 마커 + 내용으로 교체
  // "export const XXXXX: Record<...> = {" 이후 첫 번째 닫는 "}"까지 찾아야 하는데
  // 중첩 없이 단순 객체이므로 greedy하지 않은 매칭으로 처리
  const noMarkerRegex = new RegExp(
    `(export const ${exportName}[^{]*\\{)([\\s\\S]*?)(\\n\\};)`,
    's',
  );

  return source.replace(
    noMarkerRegex,
    `$1\n  // [AUTO-GENERATED START]\n${newContent}\n  // [AUTO-GENERATED END]\n$3`,
  );
}

// ============================================
// 메인 실행 로직
// ============================================

async function main(): Promise<void> {
  console.log('==============================================');
  console.log(' LoL 매핑 자동 업데이트 스크립트');
  console.log('==============================================\n');

  // 1. 최신 버전 가져오기
  console.log('① Data Dragon 최신 버전 확인 중...');
  const version = await fetchLatestVersion();
  console.log(`   → 최신 버전: ${version}\n`);

  // 2. 모든 매핑 데이터 병렬 fetch
  console.log('② Data Dragon에서 데이터 수신 중...');
  const [championMappings, itemMappings, runeMappings, summonerSpellMappings] =
    await Promise.all([
      buildChampionMappings(version),
      buildItemMappings(version),
      buildRuneMappings(version),
      buildSummonerSpellMappings(version),
    ]);
  console.log('   → 데이터 수신 완료\n');

  // 3. 기존 파일 읽기
  const mappingsPath = path.resolve(
    __dirname,
    '../src/lol-mappings.ts',
  );

  if (!fs.existsSync(mappingsPath)) {
    throw new Error(`파일을 찾을 수 없음: ${mappingsPath}`);
  }

  const originalSource = fs.readFileSync(mappingsPath, 'utf-8');

  // 4. 변경 사항 분석 및 출력
  console.log('③ 변경 사항 분석:\n');

  const oldChampion = parseExistingMapping(originalSource, 'CHAMPION_MAPPINGS');
  const oldItem = parseExistingMapping(originalSource, 'ITEM_MAPPINGS');
  const oldRune = parseExistingMapping(originalSource, 'RUNE_MAPPINGS');
  // 소환사 주문은 Record<number, string>이므로 별도 처리 없이 개수만 비교
  const oldSummonerLines = (
    originalSource.match(/SUMMONER_SPELL_MAPPINGS[\s\S]*?\{([\s\S]*?)\}/)?.[1] ?? ''
  )
    .split('\n')
    .filter((l) => /^\s+\d+:/.test(l)).length;

  printDiff('챔피언', oldChampion, championMappings);
  printDiff('아이템', oldItem, itemMappings);
  printDiff('룬', oldRune, runeMappings);
  console.log(
    `  [소환사 주문] 총 ${Object.keys(summonerSpellMappings).length}개 (이전: ${oldSummonerLines}개)`,
  );

  // 5. 파일 교체
  console.log('\n④ lol-mappings.ts 업데이트 중...');

  let updatedSource = originalSource;

  // 파일 상단 버전 주석 업데이트
  updatedSource = updatedSource.replace(
    /출처: Riot Games Dragon API \(.+?\)/,
    `출처: Riot Games Dragon API (${version} 패치 기준)`,
  );

  // 각 MAPPINGS 블록 교체
  updatedSource = replaceMappingBlock(
    updatedSource,
    'CHAMPION_MAPPINGS',
    serializeStringMapping(championMappings),
  );
  updatedSource = replaceMappingBlock(
    updatedSource,
    'ITEM_MAPPINGS',
    serializeStringMapping(itemMappings),
  );
  updatedSource = replaceMappingBlock(
    updatedSource,
    'RUNE_MAPPINGS',
    serializeStringMapping(runeMappings),
  );
  updatedSource = replaceMappingBlock(
    updatedSource,
    'SUMMONER_SPELL_MAPPINGS',
    serializeNumberMapping(summonerSpellMappings as unknown as Record<string, string>),
  );

  // 6. 파일 쓰기
  fs.writeFileSync(mappingsPath, updatedSource, 'utf-8');

  console.log(`   → 완료: ${mappingsPath}`);
  console.log('\n==============================================');
  console.log(' 업데이트 완료!');
  console.log('==============================================\n');
}

main().catch((err) => {
  console.error('\n[오류]', err instanceof Error ? err.message : err);
  process.exit(1);
});
