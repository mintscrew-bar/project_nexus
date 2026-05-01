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
