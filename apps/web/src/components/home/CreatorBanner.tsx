"use client";

import Image from "next/image";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

const BANNER_IMAGE = "/images/banners/creator-recruit-banner.png";

interface CreatorBannerProps {
  isActive?: boolean;
  className?: string;
  priority?: boolean;
}

export function CreatorBanner({
  isActive = true,
  className,
  priority = false,
}: CreatorBannerProps) {
  return (
    <a
      href={NEXUS_DISCORD_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative block aspect-[3/2] w-full overflow-hidden rounded-2xl border border-violet-100 bg-[#fff8ef]",
        "shadow-[0_18px_56px_rgba(83,61,135,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
        className,
      )}
      aria-label="NEXUS 내전 운영 모집 배너 열기"
      data-active={isActive}
    >
      <Image
        src={BANNER_IMAGE}
        alt="NEXUS 내전 운영 모집 배너"
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 1180px"
        className="object-cover object-center"
      />
    </a>
  );
}
