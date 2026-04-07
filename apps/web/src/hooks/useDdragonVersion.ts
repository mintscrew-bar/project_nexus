"use client";

import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api-client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// DDragon 최신 버전을 React Query로 조회하는 훅
// 백엔드가 매주 월요일 새벽 4시에 동기화하므로 클라이언트 캐시도 1주일로 설정
export function useDdragonVersion() {
  const { data: version = "15.1.1" } = useQuery<string>({
    queryKey: ["ddragonVersion"],
    queryFn: () => statsApi.getDdragonVersion(),
    staleTime: WEEK_MS,
    gcTime: WEEK_MS,
  });

  return version;
}
