import { cn } from "@/lib/utils";

export type UserStatus = "ONLINE" | "OFFLINE" | "AWAY";

interface StatusIndicatorProps {
  status: UserStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<
  UserStatus,
  { color: string; pulseColor: string; label: string }
> = {
  ONLINE: {
    color: "bg-accent-success",
    pulseColor: "bg-accent-success/50",
    label: "온라인",
  },
  OFFLINE: {
    color: "bg-text-tertiary",
    pulseColor: "bg-text-tertiary/50",
    label: "오프라인",
  },
  AWAY: {
    color: "bg-accent-gold",
    pulseColor: "bg-accent-gold/50",
    label: "자리비움",
  },
};

const sizeConfig = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-4 w-4",
};

export function StatusIndicator({
  status,
  size = "md",
  showLabel = false,
  className,
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizeClass = sizeConfig[size];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="relative flex">
        <span
          className={cn(
            "rounded-full",
            sizeClass,
            config.color
          )}
        />
        {status === "ONLINE" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              config.pulseColor
            )}
          />
        )}
      </span>
      {showLabel && (
        <span className="text-xs text-text-secondary">{config.label}</span>
      )}
    </div>
  );
}
