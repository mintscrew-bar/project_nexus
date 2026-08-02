"use client";

import { useNotificationStore } from "@/stores/notification-store";
import { NotificationItem } from "./NotificationItem";
import { CheckCheck, Trash2 } from "lucide-react";

interface NotificationDropdownProps {
  onClose: () => void;
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
  const {
    notifications,
    isLoading,
    markAllAsRead,
    deleteAllRead,
  } = useNotificationStore();

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const handleDeleteAllRead = async () => {
    await deleteAllRead();
  };

  return (
    <div className="absolute right-0 mt-2 w-96 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary bg-bg-primary">
        <h3 className="font-semibold text-text-primary">알림</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllAsRead}
            className="text-xs text-text-secondary hover:text-accent-primary transition-colors flex items-center gap-1"
            title="모두 읽음 처리"
          >
            <CheckCheck size={14} />
            모두 읽음
          </button>
          <button
            onClick={handleDeleteAllRead}
            className="text-xs text-text-secondary hover:text-red-500 transition-colors flex items-center gap-1"
            title="읽은 알림 삭제"
          >
            <Trash2 size={14} />
            읽은 알림 삭제
          </button>
        </div>
      </div>

      {/* Notification List */}
      <div className="max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <Bell size={48} className="mb-2 opacity-50" />
            <p className="text-sm">알림이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-bg-tertiary">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-bg-tertiary bg-bg-primary text-center">
          <a
            href="/notifications"
            className="text-sm text-accent-primary hover:text-accent-gold transition-colors"
            onClick={onClose}
          >
            모든 알림 보기
          </a>
        </div>
      )}
    </div>
  );
}

function Bell({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>
  );
}
