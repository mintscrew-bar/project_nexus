import Image from "next/image";
import { cn } from "@/lib/utils";

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
 * Data Dragon CDN에서 챔피언 이미지를 가져옵니다.
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
  const getImageUrl = () => {
    switch (type) {
      case "square":
        return `/icons/champions/${championKey}.png`;
      case "splash": {
        const baseUrl = "https://ddragon.leagueoflegends.com";
        return `${baseUrl}/cdn/img/champion/splash/${championKey}_0.jpg`;
      }
      case "loading": {
        const baseUrl = "https://ddragon.leagueoflegends.com";
        return `${baseUrl}/cdn/img/champion/loading/${championKey}_0.jpg`;
      }
      default:
        return `/icons/champions/${championKey}.png`;
    }
  };

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
      />
    </div>
  );
}
