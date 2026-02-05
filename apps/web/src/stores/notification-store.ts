import { create } from "zustand";
import { notificationApi } from "@/lib/api-client";
import {
  connectNotificationSocket,
  notificationSocketHelpers,
  disconnectNotificationSocket,
} from "@/lib/socket-client";

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  data?: any;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isConnected: boolean;

  // Actions
  initialize: () => void;
  cleanup: () => void;
  fetchNotifications: (limit?: number, offset?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  deleteAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isConnected: false,

  initialize: () => {
    const socket = connectNotificationSocket();
    set({ isConnected: true });

    // Listen for new notifications
    notificationSocketHelpers.onNotification((notification: Notification) => {
      set((state) => ({
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      }));
    });

    // Listen for unread count updates
    notificationSocketHelpers.onUnreadCount((data: { count: number }) => {
      set({ unreadCount: data.count });
    });

    // Fetch initial data
    get().fetchNotifications();
    get().fetchUnreadCount();
  },

  cleanup: () => {
    disconnectNotificationSocket();
    set({ isConnected: false });
  },

  fetchNotifications: async (limit = 20, offset = 0) => {
    set({ isLoading: true });
    try {
      const notifications = await notificationApi.getNotifications(limit, offset);
      set({ notifications, isLoading: false });
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { count } = await notificationApi.getUnreadCount();
      set({ unreadCount: count });
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  },

  markAsRead: async (notificationId: string) => {
    try {
      await notificationApi.markAsRead(notificationId);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === notificationId ? { ...n, isRead: true } : n
        ),
      }));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationApi.markAllAsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  },

  deleteNotification: async (notificationId: string) => {
    try {
      await notificationApi.deleteNotification(notificationId);
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== notificationId),
      }));
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  },

  deleteAllRead: async () => {
    try {
      await notificationApi.deleteAllRead();
      set((state) => ({
        notifications: state.notifications.filter((n) => !n.isRead),
      }));
    } catch (error) {
      console.error("Failed to delete read notifications:", error);
    }
  },
}));
