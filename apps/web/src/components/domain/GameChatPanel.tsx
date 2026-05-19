"use client";

import { useState, useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useAuthStore } from "@/stores/auth-store";
import { ChatBox } from "./ChatBox";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GameChatPanelProps {
  roomId: string;
  /** true on the final stage (bracket) — triggers full socket cleanup on unmount */
  isFinalStage?: boolean;
  /** "floating": 우측 하단 토글 버튼 (기본). "inline": 부모 컨테이너 안에 직접 렌더링 */
  variant?: "floating" | "inline";
  /** inline 모드용 추가 className */
  className?: string;
}

export function GameChatPanel({ roomId, isFinalStage, variant = "floating", className }: GameChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isConnected, connect, disconnect, sendMessage } =
    useChatStore();
  const { user } = useAuthStore();
  const prevCountRef = useRef(messages.length);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    connect(roomId);
    return () => {
      // 항상 언마운트 시 소켓 정리 (이전: isFinalStage일 때만 정리)
      disconnect();
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track unread messages when panel is closed
  useEffect(() => {
    if (!isOpen && messages.length > prevCountRef.current) {
      setUnread((u) => u + (messages.length - prevCountRef.current));
    }
    prevCountRef.current = messages.length;
  }, [messages.length, isOpen]);

  // Clear unread when panel opens
  useEffect(() => {
    if (isOpen) setUnread(0);
  }, [isOpen]);

  // inline 모드: 토글 없이 항상 표시 (hooks 호출 이후로 분기)
  if (variant === "inline") {
    return (
      <div className={cn("flex flex-col bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden", className)}>
        <div className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary/50 border-b border-bg-tertiary flex-shrink-0">
          <MessageSquare className="h-4 w-4 text-accent-primary" />
          <span className="font-semibold text-text-primary text-sm">채팅</span>
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            isConnected ? "bg-accent-success" : "bg-accent-danger",
          )} />
        </div>
        <ChatBox
          messages={messages}
          onSendMessage={sendMessage}
          currentUserId={user?.id}
          disabled={!isConnected}
          className="flex-1 rounded-none border-0"
        />
      </div>
    );
  }

  return (
    <>
      {/* Floating toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-accent-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-accent-hover transition-colors"
        >
          <MessageSquare className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-danger text-white text-xs font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel — 모바일: 풀스크린, 데스크톱: 우측 하단 고정 */}
      {isOpen && (
        <div className={cn(
          "fixed z-50 bg-bg-primary border border-bg-tertiary shadow-2xl flex flex-col overflow-hidden animate-fade-in",
          // 모바일: 전체 화면
          "inset-0 rounded-none",
          // sm 이상: 우측 하단 고정 패널
          "sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[360px] sm:h-[480px] sm:rounded-xl",
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-bg-tertiary flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-accent-primary" />
              <span className="font-medium text-text-primary text-sm">
                채팅
              </span>
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  isConnected ? "bg-accent-success" : "bg-accent-danger",
                )}
              />
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ChatBox */}
          <ChatBox
            messages={messages}
            onSendMessage={sendMessage}
            currentUserId={user?.id}
            disabled={!isConnected}
            className="flex-1 rounded-none"
          />
        </div>
      )}
    </>
  );
}
