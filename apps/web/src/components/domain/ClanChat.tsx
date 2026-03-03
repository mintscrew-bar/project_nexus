"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Image from "next/image";
import { useClanStore } from "@/stores/clan-store";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { Users, Send } from "lucide-react";

interface ClanChatProps {
  clanId: string;
}

export function ClanChat({ clanId }: ClanChatProps) {
  const { user } = useAuthStore();
  const {
    chatMessages,
    typingUsers,
    isConnected,
    fetchChatMessages,
    connectToClan,
    disconnectFromClan,
    sendChatMessage,
    setTypingStatus,
  } = useClanStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // 타이핑 디바운스를 위한 타임아웃 ref
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 초기 마운트 시 소켓 연결 + 메시지 로드
  useEffect(() => {
    fetchChatMessages(clanId);
    connectToClan(clanId);

    return () => {
      // 언마운트 시 타이핑 중지 후 소켓 해제
      setTypingStatus(clanId, false);
      disconnectFromClan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clanId]);

  // 새 메시지 도착 시 스크롤 하단 유지
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length, isAtBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);

    // 타이핑 상태 전송 (디바운스)
    setTypingStatus(clanId, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus(clanId, false);
    }, 2000);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !isConnected) return;

    sendChatMessage(clanId, trimmed);
    setInput("");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingStatus(clanId, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 타이핑 중인 다른 유저 목록 (본인 제외)
  const otherTypingUsers = Array.from(typingUsers.entries())
    .filter(([uid]) => uid !== user?.id)
    .map(([, username]) => username);

  return (
    <div className="flex flex-col h-[420px]">
      {/* 메시지 목록 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-bg-elevated"
      >
        {chatMessages.length === 0 && (
          <p className="text-center text-text-tertiary text-sm py-8">
            아직 채팅 메시지가 없습니다. 첫 번째로 인사를 남겨보세요!
          </p>
        )}

        {chatMessages.map((msg, idx) => {
          const isMe = msg.userId === user?.id;
          const prevMsg = chatMessages[idx - 1];
          // 같은 유저가 연속으로 보낸 메시지면 아바타/이름 생략
          const showHeader = !prevMsg || prevMsg.userId !== msg.userId;

          return (
            <div
              key={msg.id}
              className={cn("flex items-end gap-2", isMe && "flex-row-reverse")}
            >
              {/* 아바타 (연속 메시지이거나 내 메시지면 숨김) */}
              {!isMe && (
                <div
                  className={cn(
                    "relative w-8 h-8 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0",
                    !showHeader && "invisible" // 공간 유지하되 숨김
                  )}
                >
                  {msg.avatar ? (
                    <Image
                      src={msg.avatar}
                      alt={msg.username}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users className="h-4 w-4 text-text-tertiary" />
                    </div>
                  )}
                </div>
              )}

              <div
                className={cn(
                  "flex flex-col max-w-[70%]",
                  isMe && "items-end"
                )}
              >
                {/* 이름 + 시간 (첫 메시지만) */}
                {showHeader && !isMe && (
                  <span className="text-xs text-text-tertiary mb-1 px-1">
                    {msg.username}
                  </span>
                )}
                {/* 말풍선 */}
                <div
                  className={cn(
                    "px-3 py-2 rounded-2xl text-sm break-words",
                    isMe
                      ? "bg-accent-primary text-white rounded-br-sm"
                      : "bg-bg-elevated text-text-primary rounded-bl-sm"
                  )}
                >
                  {msg.content}
                </div>
                {/* 시간 */}
                <span className="text-xs text-text-tertiary mt-1 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}

        {/* 타이핑 인디케이터 */}
        {otherTypingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
            <span>
              {otherTypingUsers.slice(0, 2).join(", ")}
              {otherTypingUsers.length > 2 && ` 외 ${otherTypingUsers.length - 2}명`}이 입력 중...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      <div className="border-t border-bg-tertiary p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "메시지를 입력하세요..." : "연결 중..."}
          disabled={!isConnected}
          maxLength={500}
          className="flex-1 px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !input.trim()}
          aria-label="메시지 전송"
          className="p-2 rounded-lg bg-accent-primary text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
