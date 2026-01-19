import Image from "next/image";
import { cn } from "@/lib/utils";

interface ItemImageProps {
  itemId: string;
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * 아이템 이미지 컴포넌트
 * 
 * Data Dragon CDN에서 아이템 이미지를 가져옵니다.
 * 
 * @param itemId 아이템 ID (예: "1001", "3031")
 */
export function ItemImage({
  itemId,
  size = 64,
  className,
  alt,
}: ItemImageProps) {
  const getImageUrl = () => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "14.1.1";
    const baseUrl = "https://ddragon.leagueoflegends.com";
    return `${baseUrl}/cdn/${version}/img/item/${itemId}.png`;
  };

  return (
    <div className={cn("relative overflow-hidden rounded", className)}>
      <Image
        src={getImageUrl()}
        alt={alt || `Item ${itemId}`}
        width={size}
        height={size}
        className="object-cover rounded"
        unoptimized
      />
    </div>
  );
}
