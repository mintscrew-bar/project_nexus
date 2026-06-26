"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * 클랜 정체성 공통 컴포넌트 (ClanEmblem / ClanTag)
 *
 * 앱 전반에 흩어진 클랜 로고·태그 렌더를 통일한다.
 * - 로고가 있으면 이미지, 없으면 대표색 + 태그 이니셜로 fallback
 * - 대표색(accentColor) 미설정 시 앱 기본 액센트 사용
 */

/** 클랜 대표색 기본값 (앱 로고 인디고와 동일) */
export const DEFAULT_CLAN_ACCENT = "#667EEA";

/** 태그에서 이니셜 1~2글자 추출 (영문/숫자만) */
function getInitials(tag: string): string {
  const cleaned = (tag || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.slice(0, 2) || "?";
}

interface ClanEmblemProps {
  tag: string;
  logo?: string | null;
  accentColor?: string | null;
  /** 한 변 길이(px) */
  size?: number;
  /** 모서리 라운드 (tailwind 클래스) */
  rounded?: string;
  className?: string;
}

/** 클랜 엠블럼 — 로고 또는 대표색+이니셜 */
export function ClanEmblem({
  tag,
  logo,
  accentColor,
  size = 56,
  rounded = "rounded-lg",
  className,
}: ClanEmblemProps) {
  const color = accentColor || DEFAULT_CLAN_ACCENT;

  return (
    <div
      className={cn(
        "relative flex flex-shrink-0 items-center justify-center overflow-hidden",
        rounded,
        className,
      )}
      style={{ width: size, height: size }}
    >
      {logo ? (
        <Image src={logo} alt={tag} fill className="object-cover" unoptimized />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center font-black leading-none text-white"
          style={{
            backgroundColor: color,
            fontSize: Math.round(size * 0.38),
          }}
        >
          {getInitials(tag)}
        </div>
      )}
    </div>
  );
}

interface ClanTagProps {
  tag: string;
  accentColor?: string | null;
  size?: "sm" | "md";
  onClick?: () => void;
  className?: string;
  title?: string;
}

const TAG_SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

/** 클랜 태그 배지 — 대표색 틴트 적용. onClick 있으면 button. */
export function ClanTag({
  tag,
  accentColor,
  size = "sm",
  onClick,
  className,
  title,
}: ClanTagProps) {
  const color = accentColor || DEFAULT_CLAN_ACCENT;
  const style = { color, backgroundColor: `${color}22` };
  const classes = cn(
    "inline-flex shrink-0 items-center rounded-md font-black leading-none",
    TAG_SIZE_CLASS[size],
    onClick && "cursor-pointer transition-opacity hover:opacity-80",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={classes} style={style}>
        {tag}
      </button>
    );
  }

  return (
    <span title={title} className={classes} style={style}>
      {tag}
    </span>
  );
}
