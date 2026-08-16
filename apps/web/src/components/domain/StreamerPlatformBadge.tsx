import Image from "next/image";
import { Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamerPlatformKind } from "@/lib/api-client";

const PLATFORM_LABELS: Record<StreamerPlatformKind, string> = {
  CHZZK: "치지직",
  SOOP: "SOOP",
  YOUTUBE: "유튜브",
};

const PLATFORM_ICONS: Partial<Record<StreamerPlatformKind, string>> = {
  CHZZK: "/icons/chzzk.png",
  SOOP: "/icons/soop.ico",
};

export function StreamerPlatformBadge({
  platform,
  className,
}: {
  platform: StreamerPlatformKind;
  className?: string;
}) {
  const label = PLATFORM_LABELS[platform];
  const icon = PLATFORM_ICONS[platform];

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-bg-elevated bg-bg-tertiary text-text-primary",
        className,
      )}
    >
      {icon ? (
        <Image
          src={icon}
          alt=""
          width={20}
          height={20}
          unoptimized
          className="h-5 w-5 object-contain"
        />
      ) : (
        <Youtube className="h-5 w-5 text-red-500" aria-hidden="true" />
      )}
    </span>
  );
}
