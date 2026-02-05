"use client";

import { useNotificationStore, Notification } from "@/stores/notification-store";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { X, UserPlus, Trophy, MessageSquare, Users } from "lucide-react";
import { useRouter } from "next/navigation";

interface NotificationItemProps {
  notification: Notification;
  onClose: () => void;
}

export function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const router = useRouter();
  const { markAsRead, deleteNotification } = useNotificationStore();

  const handleClick = async () => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
      onClose();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  };

  const getIcon = () => {
    switch (notification.type) {
      case "FRIEND_REQUEST":
      case "FRIEND_ACCEPTED":
        return <UserPlus size={20} className="text-blue-500" />;
      case "MATCH_STARTING":
      case "MATCH_RESULT":
        return <Trophy size={20} className="text-yellow-500" />;
      case "COMMENT":
      case "MENTION":
        return <MessageSquare size={20} className="text-green-500" />;
      case "TEAM_INVITE":
        return <Users size={20} className="text-purple-500" />;
      default:
        return <MessageSquare size={20} className="text-gray-500" />;
    }
  };

  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
    locale: ko,
  });

  return (
    <div
      onClick={handleClick}
      className={`px-4 py-3 hover:bg-bg-tertiary transition-colors cursor-pointer relative group ${
        !notification.isRead ? "bg-bg-tertiary/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-1">{getIcon()}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{notification.title}</p>
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-text-tertiary mt-1">{timeAgo}</p>
        </div>

        {/* Unread indicator & Delete button */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {!notification.isRead && (
            <div className="w-2 h-2 bg-accent-primary rounded-full"></div>
          )}
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-red-500 p-1"
            aria-label="Delete notification"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
