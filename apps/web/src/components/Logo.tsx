import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "icon-only" | "text-only";
}

const sizeMap = {
  sm: { width: 32, height: 32 },
  md: { width: 48, height: 48 },
  lg: { width: 64, height: 64 },
  xl: { width: 96, height: 96 },
};

// 실제 표시 크기는 Tailwind 클래스로 제어한다(width/height 속성은 intrinsic 비율용).
// 모바일에서 한 단계 작게, md 이상에서 본래 크기로 커지도록 반응형으로 둔다.
const sizeClassMap = {
  sm: "h-7 w-7 md:h-8 md:w-8",
  md: "h-7 w-7 md:h-10 md:w-10",
  lg: "h-12 w-12 md:h-16 md:w-16",
  xl: "h-16 w-16 md:h-24 md:w-24",
};

// 텍스트 로고 크기도 모바일에서 축소
const textClassMap = {
  sm: "text-base md:text-lg",
  md: "text-lg md:text-2xl",
  lg: "text-xl md:text-3xl",
  xl: "text-2xl md:text-4xl",
};

export function Logo({ className, size = "md", variant = "default" }: LogoProps) {
  const dimensions = sizeMap[size];
  const imgClass = sizeClassMap[size];
  const textClass = textClassMap[size];

  if (variant === "icon-only") {
    return (
      <div className={cn("relative", className)}>
        <Image
          src="/images/nexus.png"
          alt="Nexus Logo"
          width={dimensions.width}
          height={dimensions.height}
          className={cn("object-contain", imgClass)}
          priority
        />
      </div>
    );
  }

  if (variant === "text-only") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className={cn("font-bold text-text-primary", textClass)}>
          NEXUS
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 md:gap-3", className)}>
      <div className="relative">
        <Image
          src="/images/nexus.png"
          alt="Nexus Logo"
          width={dimensions.width}
          height={dimensions.height}
          className={cn("object-contain", imgClass)}
          priority
        />
      </div>
      <span className={cn("font-bold text-text-primary", textClass)}>
        NEXUS
      </span>
    </div>
  );
}
