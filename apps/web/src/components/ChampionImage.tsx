"use client";

import { useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { championIconUrl } from "@/lib/ddragon";
import { useCdnFallback } from "@/hooks/use-cdn-fallback";
import { useDdragonStore } from "@/stores/ddragon-store";

interface ChampionImageProps {
  championKey: string;
  size?: number;
  type?: "square" | "splash" | "loading";
  className?: string;
  alt?: string;
}

/**
 * 챔피언 이미지 컴포넌트
 *
 * square: 1순위 로컬 → 폴백 DDragon CDN (신규 챔피언 자동 대응)
 * splash/loading: DDragon CDN 직접 사용
 *
 * alt/title에는 DDragon의 한글 챔피언명(예: "아트록스")을 사용한다.
 * 아직 목록이 로드되지 않았으면 영문 키로 폴백한다.
 *
 * @param championKey 챔피언 키 (예: "Aatrox", "Ahri")
 * @param size 이미지 크기 (픽셀)
 * @param type 이미지 타입: "square" (아이콘), "splash" (스플래시), "loading" (로딩)
 */
export function ChampionImage({
  championKey,
  size = 64,
  type = "square",
  className,
  alt,
}: ChampionImageProps) {
  const champions = useDdragonStore((s) => s.champions);
  const fetchChampions = useDdragonStore((s) => s.fetchChampions);

  // 챔피언 목록은 스토어가 한 번만 받아온다(이미 로드됐으면 no-op).
  useEffect(() => {
    void fetchChampions();
  }, [fetchChampions]);

  // championKey는 DDragon의 id(영문 키). 한글명은 name 필드에 들어있다.
  const koreanName = useMemo(
    () => champions.find((c) => c.id === championKey)?.name,
    [champions, championKey],
  );
  const displayName = koreanName ?? championKey;

  const localUrl =
    type === "square"
      ? `/icons/champions/${championKey}.png`
      : `https://ddragon.leagueoflegends.com/cdn/img/champion/${
          type === "splash" ? "splash" : "loading"
        }/${championKey}_0.jpg`;

  // splash/loading은 이미 CDN이라 폴백 대상이 아니다.
  const buildCdnUrl = useCallback(
    (version: string) =>
      type === "square" ? championIconUrl(championKey, version) : null,
    [championKey, type],
  );

  const { src, onError } = useCdnFallback(localUrl, buildCdnUrl);

  return (
    <div className={cn("relative overflow-hidden rounded", className)}>
      <Image
        src={src}
        alt={alt || displayName}
        title={displayName}
        width={size}
        height={size}
        className={cn(
          "object-cover",
          type === "square" && "rounded",
          type === "splash" && "rounded-lg"
        )}
        unoptimized // Data Dragon은 외부 CDN이므로 Next.js 최적화 비활성화
        onError={onError}
      />
    </div>
  );
}
