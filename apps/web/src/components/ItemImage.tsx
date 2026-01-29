"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { ItemTooltip } from "./ItemTooltip";

interface ItemImageProps {
  itemId: string;
  size?: number;
  className?: string;
  alt?: string;
  showTooltip?: boolean;
}

/**
 * 아이템 이미지 컴포넌트
 *
 * Data Dragon CDN에서 아이템 이미지를 가져옵니다.
 *
 * @param itemId 아이템 ID (예: "1001", "3031")
 * @param showTooltip true면 호버 시 아이템 정보 툴팁 표시
 */
export function ItemImage({
  itemId,
  size = 64,
  className,
  alt,
  showTooltip = false,
}: ItemImageProps) {
  const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
  const imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;

  const imageElement = (
    <div className={cn("relative overflow-hidden rounded", className)}>
      <Image
        src={imageUrl}
        alt={alt || `Item ${itemId}`}
        width={size}
        height={size}
        className="object-cover rounded"
        unoptimized
      />
    </div>
  );

  if (showTooltip) {
    return <ItemTooltip itemId={itemId}>{imageElement}</ItemTooltip>;
  }

  return imageElement;
}
