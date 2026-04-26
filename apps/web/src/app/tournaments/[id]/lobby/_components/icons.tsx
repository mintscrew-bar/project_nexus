import { getChampionIcon, getChampionIconById } from "@/components/matches/match-utils";

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

export const POSITION_ICON_URLS = {
  TOP: "/icons/positions/position-top.svg",
  JUNGLE: "/icons/positions/position-jungle.svg",
  MID: "/icons/positions/position-middle.svg",
  MIDDLE: "/icons/positions/position-middle.svg",
  ADC: "/icons/positions/position-bottom.svg",
  BOTTOM: "/icons/positions/position-bottom.svg",
  SUPPORT: "/icons/positions/position-utility.svg",
  UTILITY: "/icons/positions/position-utility.svg",
} as const;

export const POSITION_LABELS: Record<string, string> = {
  TOP: "탑", JUNGLE: "정글", MID: "미드", MIDDLE: "미드",
  ADC: "원딜", BOTTOM: "원딜", SUPPORT: "서포터", UTILITY: "서포터",
};

export function PositionIcon({ position, className = "", opacity = 1, showLabel = false }: { position: string; className?: string; opacity?: number; showLabel?: boolean }) {
  const iconUrl = POSITION_ICON_URLS[position as keyof typeof POSITION_ICON_URLS];
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
          onError={(e) => {
            // 로드 실패 시 빈 원 대신 fallback 표시
            e.currentTarget.style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
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
