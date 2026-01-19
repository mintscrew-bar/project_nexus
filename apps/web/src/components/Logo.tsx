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

export function Logo({ className, size = "md", variant = "default" }: LogoProps) {
  const dimensions = sizeMap[size];

  if (variant === "icon-only") {
    return (
      <div className={cn("relative", className)}>
        <Image
          src="/images/nexus.png"
          alt="Nexus Logo"
          width={dimensions.width}
          height={dimensions.height}
          className="object-contain"
          priority
        />
      </div>
    );
  }

  if (variant === "text-only") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-accent-blue bg-clip-text text-transparent">
          NEXUS
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative">
        <Image
          src="/images/nexus.png"
          alt="Nexus Logo"
          width={dimensions.width}
          height={dimensions.height}
          className="object-contain"
          priority
        />
      </div>
      <span className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-accent-blue bg-clip-text text-transparent">
        NEXUS
      </span>
    </div>
  );
}
