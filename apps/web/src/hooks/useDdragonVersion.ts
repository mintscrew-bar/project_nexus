import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api-client";
import { DDRAGON_ASSET_VERSION } from "@/lib/ddragon-champion-ids";

const DAY_MS = 24 * 60 * 60 * 1000;

// DDragon 최신 버전을 React Query로 조회하는 훅
// 패치 다음 날 방문 시 자동 갱신되도록 staleTime 24시간으로 설정
// 조회 전·실패 시 기본값은 로컬 아이콘을 받은 패치 버전이다.
export function useDdragonVersion() {
  const { data: version = DDRAGON_ASSET_VERSION } = useQuery<string>({
    queryKey: ["ddragonVersion"],
    queryFn: () => statsApi.getDdragonVersion(),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

  return version;
}
