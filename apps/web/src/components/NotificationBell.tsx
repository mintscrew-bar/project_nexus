"use client";

import { useEffect, useState, useRef } from "react";
import { Bell } from "lucide-react";
import { useNotificationStore } from "@/stores/notification-store";
import { NotificationDropdown } from "./NotificationDropdown";
import { useAuthStore } from "@/stores/auth-store";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { isAuthenticated } = useAuthStore();
  const { unreadCount, initialize, cleanup } = useNotificationStore();

  useEffect(() => {
    if (isAuthenticated) {
      initialize();
    }

    return () => {
      cleanup();
    };
  }, [isAuthenticated, initialize, cleanup]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        // 헤더의 다른 아이콘 버튼(친구·관리자)과 크기·색을 맞춘다.
        className={`relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
          isOpen
            ? "bg-accent-primary/10 text-accent-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
        }`}
        title="알림"
        aria-label={`알림${unreadCount > 0 ? `, 안 읽은 알림 ${unreadCount}건` : ""}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center bg-accent-danger text-white text-[9px] font-bold rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={dropdownRef}>
          <NotificationDropdown onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
