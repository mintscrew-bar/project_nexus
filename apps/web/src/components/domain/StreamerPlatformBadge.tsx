import Image from "next/image";
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

/**
 * 유튜브 마크. lucide-react 1.0 에서 브랜드 아이콘이 빠져서, 쓰던 0.309 버전의 경로를
 * 그대로 옮겨 왔다(ISC 라이선스). 겉모습은 예전 `<Youtube />` 와 같다.
 */
function YoutubeMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}

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
        <YoutubeMark className="h-5 w-5 text-red-500" />
      )}
    </span>
  );
}
