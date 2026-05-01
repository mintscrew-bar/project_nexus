"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { getDdragonVersion, championIconUrl, fallbackTo } from "@/lib/ddragon";

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
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    if (type === "square") {
      getDdragonVersion().then(setVersion).catch(() => {});
    }
  }, [type]);

  const getImageUrl = () => {
    switch (type) {
      case "square":
        return `/icons/champions/${championKey}.png`;
      case "splash":
        return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_0.jpg`;
      case "loading":
        return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championKey}_0.jpg`;
      default:
        return `/icons/champions/${championKey}.png`;
    }
  };

  // square 타입만 폴백 적용 (splash/loading은 이미 CDN)
  const onErrorHandler =
    type === "square" && version
      ? fallbackTo(championIconUrl(championKey, version))
      : undefined;

  return (
    <div className={cn("relative overflow-hidden rounded", className)}>
      <Image
        src={getImageUrl()}
        alt={alt || `${championKey} ${type} image`}
        width={size}
        height={size}
        className={cn(
          "object-cover",
          type === "square" && "rounded",
          type === "splash" && "rounded-lg"
        )}
        unoptimized // Data Dragon은 외부 CDN이므로 Next.js 최적화 비활성화
        onError={onErrorHandler}
      />
    </div>
  );
}
