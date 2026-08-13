/**
 * 티어 엠블럼 경로 단일 진입점.
 *
 * 기존에는 `/icons/tiers/${tier.toLowerCase()}.png` 를 6개 파일에서 각자
 * 만들고 있었고, UNRANKED 가드가 있는 곳과 없는 곳이 섞여 있어 일부 화면은
 * 존재하지 않는 unranked.png 를 요청하고 있었다.
 *
 * 에셋은 96px WebP 로 서빙한다. 실제 렌더 크기는 11~26px 이라
 * 원본 500x500 PNG(개당 113~196KB)는 40배 이상 과했다.
 */

/** 엠블럼이 존재하는 티어 (UNRANKED 는 대응 이미지가 없다) */
const TIER_KEYS = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
] as const;

export type TierKey = (typeof TIER_KEYS)[number];

const TIER_KEY_SET = new Set<string>(TIER_KEYS);

/**
 * 티어 문자열을 엠블럼 경로로 변환한다.
 * 미연동(null/빈값)·UNRANKED·알 수 없는 값은 모두 null 을 돌려주므로,
 * 호출부는 반환값이 truthy 일 때만 <img> 를 그리면 된다.
 *
 * "GOLD", "gold", "Gold IV" 처럼 랭크가 붙은 형태도 허용한다.
 */
export function getTierIcon(tier?: string | null): string | null {
  if (!tier) return null;

  const key = tier.trim().toLowerCase();
  if (!key) return null;

  // 정확히 일치하는 경우가 대부분이라 먼저 확인한다.
  if (TIER_KEY_SET.has(key)) return `/icons/tiers/${key}.webp`;

  // "gold iv", "grandmaster 1" 같이 랭크가 섞여 오는 경우를 위한 폴백.
  // grandmaster 가 master 를 포함하므로 긴 이름부터 검사해야 한다.
  const matched = [...TIER_KEYS]
    .sort((a, b) => b.length - a.length)
    .find((t) => key.includes(t));

  return matched ? `/icons/tiers/${matched}.webp` : null;
}

/** 티어 문자열에서 정규화된 티어 키만 뽑는다 (색상 매핑 등에 사용) */
export function getTierKey(tier?: string | null): TierKey | null {
  if (!tier) return null;
  const key = tier.trim().toLowerCase();
  if (TIER_KEY_SET.has(key)) return key as TierKey;
  return (
    [...TIER_KEYS]
      .sort((a, b) => b.length - a.length)
      .find((t) => key.includes(t)) ?? null
  );
}
