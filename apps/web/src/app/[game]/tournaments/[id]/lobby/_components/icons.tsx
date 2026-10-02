import { getChampionIcon, getChampionIconById } from "@/components/matches/match-utils";
import { getRoleIcon } from "@/lib/role-icon";

export function getChampionIconUrl(championId: string) {
  const raw = String(championId ?? "").trim();
  if (!raw) return "";

  // DB의 championPreference.championId가 숫자 문자열인 경우(예: "103")
  // 매치 유틸의 ID->key 매핑을 사용해 실제 아이콘 경로를 구한다.
  if (/^\d+$/.test(raw)) {
    return getChampionIconById(Number(raw));
  }

  // 문자열 키인 경우(예: "Ahri")는 그대로 챔피언 키 경로를 사용한다.
  return getChampionIcon(raw);
}

/**
 * 로컬 아이콘이 없을 때 쓰는 CDN 주소. CommunityDragon 은 숫자 ID("805")와
 * 챔피언 키("Locke") 모두 받고 항상 최신 패치를 따라간다.
 */
export function championCdnUrl(championId: string) {
  const raw = String(championId ?? "").trim();
  return `https://cdn.communitydragon.org/latest/champion/${encodeURIComponent(raw)}/square`;
}

export const POSITION_LABELS: Record<string, string> = {
  TOP: "탑", JUNGLE: "정글", MID: "미드", MIDDLE: "미드",
  ADC: "원딜", BOTTOM: "원딜", SUPPORT: "서포터", UTILITY: "서포터",
};

export function PositionIcon({ position, className = "", opacity = 1, showLabel = false }: { position: string; className?: string; opacity?: number; showLabel?: boolean }) {
  const iconUrl = getRoleIcon(position);
  if (!iconUrl) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconUrl} alt={position} className={`w-4 h-4 brightness-0 invert ${className}`} style={{ opacity }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      {showLabel && <span className="text-xs text-text-secondary">{POSITION_LABELS[position] || position}</span>}
    </span>
  );
}

export function ChampionIcon({ championId, size = 24 }: { championId: string; size?: number }) {
  const iconUrl = getChampionIconUrl(championId);
  return (
    <div className="rounded-full overflow-hidden bg-bg-tertiary flex-shrink-0 border border-bg-tertiary" style={{ width: size, height: size }}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={championId}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          // 자체 폴백(CommunityDragon → "?")이 있다 — 전역 IconCdnFallback 은 건너뛴다
          data-own-fallback=""
          onError={(e) => {
            const img = e.currentTarget;
            // 1차 실패(로컬 아이콘 없음 — 신규 챔피언 등): CommunityDragon 으로 한 번 더.
            // 숫자 ID·챔피언 키 둘 다 받는다. 그래도 안 되면 "?" 를 보인다.
            if (!img.dataset.cdnTried) {
              img.dataset.cdnTried = "1";
              img.src = championCdnUrl(championId);
              return;
            }
            img.style.display = "none";
            const fallback = img.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      ) : null}
      <div
        className="w-full h-full hidden items-center justify-center bg-bg-elevated text-[10px] font-bold text-text-muted"
        aria-label="champion-fallback"
      >
        ?
      </div>
    </div>
  );
}
