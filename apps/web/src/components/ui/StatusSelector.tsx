"use client";

import { useState, useRef, useEffect } from "react";
import { StatusIndicator, type UserStatus } from "./StatusIndicator";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface StatusSelectorProps {
  currentStatus: UserStatus;
  onStatusChange: (status: "ONLINE" | "AWAY") => void;
  disabled?: boolean;
  className?: string;
}

const statusOptions: { value: "ONLINE" | "AWAY"; label: string }[] = [
  { value: "ONLINE", label: "온라인" },
  { value: "AWAY", label: "자리비움" },
];

export function StatusSelector({
  currentStatus,
  onStatusChange,
  disabled = false,
  className,
}: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (status: "ONLINE" | "AWAY") => {
    onStatusChange(status);
    setIsOpen(false);
  };

  const currentLabel =
    currentStatus === "ONLINE"
      ? "온라인"
      : currentStatus === "AWAY"
      ? "자리비움"
      : "오프라인";

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
          "bg-bg-tertiary border-bg-elevated hover:border-accent-primary/50",
          "text-sm text-text-primary",
          disabled && "opacity-50 cursor-not-allowed",
          isOpen && "border-accent-primary"
        )}
      >
        <StatusIndicator status={currentStatus} size="sm" />
        <span>{currentLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-text-tertiary transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[140px] bg-bg-secondary border border-bg-elevated rounded-lg shadow-lg overflow-hidden z-50 animate-fade-in">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors",
                "hover:bg-bg-tertiary",
                currentStatus === option.value && "bg-accent-primary/10"
              )}
            >
              <StatusIndicator status={option.value} size="sm" />
              <span className="text-text-primary">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
