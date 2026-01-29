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
    // TODO: API에서 버전을 가져와서 동적으로 생성하거나
    // 환경변수로 최신 버전을 관리
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    const baseUrl = "https://ddragon.leagueoflegends.com";

    switch (type) {
      case "square":
        return `${baseUrl}/cdn/${version}/img/champion/${championKey}.png`;
      case "splash":
        return `${baseUrl}/cdn/img/champion/splash/${championKey}_0.jpg`;
      case "loading":
        return `${baseUrl}/cdn/img/champion/loading/${championKey}_0.jpg`;
      default:
        return `${baseUrl}/cdn/${version}/img/champion/${championKey}.png`;
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
