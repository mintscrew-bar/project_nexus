"use client";

import { useCallback, useEffect, useState } from "react";
import { getDdragonVersion } from "@/lib/ddragon";

/**
 * 로컬 아이콘 → DDragon CDN 폴백 훅.
 *
 * 로컬 `public/icons/**` 에 없는 신규 챔피언/아이템 이미지를 CDN에서 받아온다.
 *
 * DDragon 버전은 비동기로 조회되는데, 로컬 이미지의 404는 그보다 먼저 발생할 수 있다.
 * 그래서 "버전이 준비된 뒤에만 onError를 붙이는" 방식은 폴백이 아예 걸리지 않는
 * 레이스가 생긴다. 이 훅은 onError를 항상 붙이고, 그 시점에 버전을 await 해서
 * src를 교체하는 방식으로 레이스를 없앤다.
 *
 * @param localUrl 우선 시도할 로컬 이미지 URL
 * @param buildCdnUrl 버전을 받아 CDN URL을 만드는 함수. null을 반환하면 폴백하지 않는다.
 */
export function useCdnFallback(
  localUrl: string,
  buildCdnUrl: (version: string) => string | null,
) {
  const [src, setSrc] = useState(localUrl);
  const [failed, setFailed] = useState(false);

  // 대상이 바뀌면 다시 로컬 우선으로 되돌린다.
  useEffect(() => {
    setSrc(localUrl);
    setFailed(false);
  }, [localUrl]);

  const onError = useCallback(async () => {
    if (failed) return;
    try {
      const cdnUrl = buildCdnUrl(await getDdragonVersion());
      // CDN URL이 없거나, 이미 CDN을 시도했는데도 실패한 경우 → 무한 루프 방지
      if (!cdnUrl || cdnUrl === src) {
        setFailed(true);
        return;
      }
      setSrc(cdnUrl);
    } catch {
      setFailed(true);
    }
  }, [buildCdnUrl, failed, src]);

  return { src, onError };
}
