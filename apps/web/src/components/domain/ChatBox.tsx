"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Avatar } from '@/components/ui';
import { cn, getRelativeTime } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { UserName } from '@/components/cosmetics/UserName';

interface Message {
  id: string;
  userId: string;
  username: string;
  message: string;
  createdAt: string;
  avatar?: string;
}

interface ChatBoxProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  currentUserId?: string;
  disabled?: boolean;
  className?: string;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
  messages,
  onSendMessage,
  currentUserId,
  disabled = false,
  className,
}) => {
  const [inputValue, setInputValue] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // 마지막으로 바닥에서 본 메시지 수. 안 읽은 수는 여기서 계산한다 — 예전엔 메시지가
  // 늘 때마다 효과에서 setUnreadCount(+1) 했다(react-hooks/set-state-in-effect).
  const [seenCount, setSeenCount] = useState(messages.length);
  const unreadCount = isAtBottom ? 0 : Math.max(0, messages.length - seenCount);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior });
      }
      setSeenCount(messages.length);
    },
    [messages.length],
  );

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 60;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    // 바닥에 있었거나 바닥에 닿았으면 지금까지의 메시지는 다 본 것
    if (atBottom || isAtBottom) setSeenCount(messages.length);
    setIsAtBottom(atBottom);
  }, [isAtBottom, messages.length]);

  // 바닥에 있을 때 새 메시지가 오면 따라 내려간다(화면 조작만, 상태는 바꾸지 않는다)
  useEffect(() => {
    if (!isAtBottom) return;
    const container = scrollContainerRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
  }, [messages.length, isAtBottom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !disabled) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      setTimeout(() => scrollToBottom(), 50);
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-bg-secondary rounded-lg', className)}>
      {/* Messages Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 basis-0 overflow-y-auto p-4 space-y-3 overscroll-contain"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-tertiary text-sm">아직 메시지가 없습니다</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.userId === currentUserId;
            return (
              <div key={msg.id} className={cn('flex min-w-0 gap-3 animate-fade-in', isOwn && 'flex-row-reverse')}>
                <Avatar src={msg.avatar} alt={msg.username || '?'} fallback={msg.username?.[0] || '?'} size="sm" />
                <div className={cn('min-w-0 flex-1 max-w-[70%]', isOwn && 'flex flex-col items-end')}>
                  <div className="flex max-w-full items-baseline gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">
                      {/* 장착한 닉네임 글꼴 — 같은 순간 그려진 메시지들의 장착 조회는 한 번으로 묶인다 */}
                      <UserName userId={msg.userId}>{msg.username || '알 수 없음'}</UserName>
                    </span>
                    <span className="text-xs text-text-tertiary">{getRelativeTime(msg.createdAt)}</span>
                  </div>
                  <div className={cn('px-4 py-2 rounded-lg break-words', isOwn ? 'bg-accent-primary text-accent-on' : 'bg-bg-tertiary text-text-primary')}>
                    <p className="whitespace-pre-wrap text-sm">{msg.message}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New message badge */}
      {!isAtBottom && unreadCount > 0 && (
        <div className="relative">
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-accent-primary text-accent-on text-xs font-medium rounded-full shadow-lg flex items-center gap-1.5 hover:bg-accent-hover transition-colors animate-bounce-in z-10"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            새 메시지 {unreadCount > 1 ? `(${unreadCount})` : ''}
          </button>
        </div>
      )}

      {/* Input Form */}
      <div className="min-h-0 flex-shrink-0 border-t border-bg-tertiary p-3">
        <form onSubmit={handleSubmit} className="flex min-w-0 gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={disabled ? '채팅이 비활성화되었습니다' : '메시지를 입력하세요...'}
            disabled={disabled}
            className="min-w-0 flex-1"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || disabled}
            className={cn(
              'px-4 py-2.5 bg-accent-primary text-accent-on font-medium rounded-lg flex-shrink-0 whitespace-nowrap',
              'transition-colors duration-150',
              'hover:bg-accent-hover active:bg-accent-active',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            전송
          </button>
        </form>
      </div>
    </div>
  );
};
