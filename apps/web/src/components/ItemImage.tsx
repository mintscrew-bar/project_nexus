"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ItemTooltip } from "./ItemTooltip";
import { getDdragonVersion, itemIconUrl, fallbackTo } from "@/lib/ddragon";

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
 * 1순위: 로컬 /icons/items/{id}.png (빠름)
 * 2순위(폴백): DDragon CDN — 신규 아이템에 자동 대응
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
  const imageUrl = `/icons/items/${itemId}.png`;
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getDdragonVersion().then(setVersion).catch(() => {});
  }, []);

  const numericId = Number(itemId);
  const cdnUrl = version && Number.isFinite(numericId)
    ? itemIconUrl(numericId, version)
    : null;

  const imageElement = (
    <div className={cn("relative overflow-hidden rounded", className)}>
      <Image
        src={imageUrl}
        alt={alt || `Item ${itemId}`}
        width={size}
        height={size}
        className="object-cover rounded"
        unoptimized
        onError={cdnUrl ? fallbackTo(cdnUrl) : undefined}
      />
    </div>
  );

  if (showTooltip) {
    return <ItemTooltip itemId={itemId}>{imageElement}</ItemTooltip>;
  }

  return imageElement;
}
