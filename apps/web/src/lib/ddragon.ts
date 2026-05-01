/**
 * DDragon 최신 패치 버전 동기화 유틸
 *
 * 모든 프론트엔드 컴포넌트가 룬/아이템/챔피언 데이터를 가져올 때
 * 백엔드 /api/stats/ddragon-version 으로 최신 버전을 받아 사용한다.
 *
 * - 모듈 레벨 캐시: 같은 페이지 세션에서는 한 번만 요청
 * - sessionStorage 캐시: 새 탭에서도 즉시 사용 가능 (1시간 TTL)
 * - 실패 시 fallback 으로 16.9.1 반환 (사용자 시점의 최신)
 *
 * 주의: api-client.ts와의 순환 의존을 피하기 위해 fetch 를 직접 사용한다.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const STORAGE_KEY = "nexus:ddragon-version";
const STORAGE_TTL_MS = 60 * 60 * 1000; // 1시간
const FALLBACK_VERSION = "16.9.1";

let inMemory: string | null = null;
let inflight: Promise<string> | null = null;

interface CachedEntry {
  version: string;
  fetchedAt: number;
}

function readSessionCache(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed?.version || !parsed?.fetchedAt) return null;
    if (Date.now() - parsed.fetchedAt > STORAGE_TTL_MS) return null;
    return parsed.version;
  } catch {
    return null;
  }
}

function writeSessionCache(version: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version, fetchedAt: Date.now() }),
    );
  } catch {
    // sessionStorage 사용 불가(쿠키 차단 등) — 무시
  }
}

/**
 * 최신 DDragon 버전을 반환한다.
 * 모듈 캐시 → sessionStorage 캐시 → 백엔드 API 순으로 조회한다.
 */
export async function getDdragonVersion(): Promise<string> {
  if (inMemory) return inMemory;

  const cached = readSessionCache();
  if (cached) {
    inMemory = cached;
    return cached;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/stats/ddragon-version`, {
        // 인증 불필요한 공개 엔드포인트
        credentials: "omit",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { version: string };
      const version = data.version || FALLBACK_VERSION;
      inMemory = version;
      writeSessionCache(version);
      return version;
    } catch {
      // 백엔드 호출 실패 시 fallback — 캐시는 하지 않음(다음 호출에서 재시도)
      return FALLBACK_VERSION;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** 캐시를 비우고 다음 호출에서 재조회 (관리자/디버그용) */
export function invalidateDdragonVersion(): void {
  inMemory = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // 무시
    }
  }
}

// ────────────────────────────────────────────────────────────
// CDN URL 헬퍼 — 새 패치에서 추가된 룬/아이템/챔피언 이미지가
// 로컬에 없을 때 폴백으로 사용
// ────────────────────────────────────────────────────────────

const DDRAGON_CDN = "https://ddragon.leagueoflegends.com/cdn";
const COMMUNITY_DRAGON_PERK =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images";

/**
 * 룬 아이콘 CDN URL.
 * - iconPath가 있으면(룬 메타데이터에서 가져온 경우) 공식 DDragon 사용
 * - 없으면(rune ID 만 알 때) Community Dragon의 ID 기반 URL 사용
 */
export function runeIconUrl(opts: { iconPath?: string; runeId?: number }): string {
  if (opts.iconPath) {
    return `${DDRAGON_CDN}/img/${opts.iconPath}`;
  }
  // Community Dragon: ID 기반으로 안정적으로 접근 가능
  return `${COMMUNITY_DRAGON_PERK}/${opts.runeId}.png`;
}

/** 아이템 아이콘 CDN URL */
export function itemIconUrl(itemId: number, version: string): string {
  return `${DDRAGON_CDN}/${version}/img/item/${itemId}.png`;
}

/** 챔피언 아이콘 CDN URL (key는 영문 키, 예: "Aatrox") */
export function championIconUrl(championKey: string, version: string): string {
  return `${DDRAGON_CDN}/${version}/img/champion/${championKey}.png`;
}

/** 소환사 주문 아이콘 CDN URL */
export function summonerSpellIconUrl(spellName: string, version: string): string {
  return `${DDRAGON_CDN}/${version}/img/spell/Summoner${spellName}.png`;
}

/** 룬 스타일(계열) 아이콘 CDN URL */
export function runeStyleIconUrl(styleId: number): string {
  return `${COMMUNITY_DRAGON_PERK}/${styleId}.png`;
}

/**
 * <img onError> 핸들러 — 로컬 아이콘 로드 실패 시 CDN 으로 폴백
 * 사용: <Image onError={fallbackTo(cdnUrl)} ... />
 * 이미 한 번 폴백되면 무한 루프 방지를 위해 더 이상 핸들러 발동 안 함
 */
export function fallbackTo(
  cdnUrl: string,
): (e: React.SyntheticEvent<HTMLImageElement>) => void {
  return (e) => {
    const img = e.currentTarget;
    if (img.dataset.fallbackUsed === "1") return;
    img.dataset.fallbackUsed = "1";
    img.src = cdnUrl;
  };
}
