"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Avatar } from '@/components/ui';
import { cn, getRelativeTime } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 60;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
    if (atBottom) setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    } else {
      setUnreadCount((prev) => prev + 1);
    }
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
    <div className={cn('flex flex-col h-full bg-bg-secondary rounded-lg', className)}>
      {/* Messages Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-tertiary text-sm">아직 메시지가 없습니다</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.userId === currentUserId;
            return (
              <div key={msg.id} className={cn('flex gap-3 animate-fade-in', isOwn && 'flex-row-reverse')}>
                <Avatar src={msg.avatar} alt={msg.username || '?'} fallback={msg.username?.[0] || '?'} size="sm" />
                <div className={cn('flex-1 max-w-[70%]', isOwn && 'flex flex-col items-end')}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">{msg.username || '알 수 없음'}</span>
                    <span className="text-xs text-text-tertiary">{getRelativeTime(msg.createdAt)}</span>
                  </div>
                  <div className={cn('px-4 py-2 rounded-lg break-words', isOwn ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-primary')}>
                    <p className="text-sm">{msg.message}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* New message badge */}
      {!isAtBottom && unreadCount > 0 && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-accent-primary text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-1.5 hover:bg-accent-hover transition-colors animate-bounce-in z-10"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            새 메시지 {unreadCount > 1 ? `(${unreadCount})` : ''}
          </button>
        </div>
      )}

      {/* Input Form */}
      <div className="border-t border-bg-tertiary p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={disabled ? '채팅이 비활성화되었습니다' : '메시지를 입력하세요...'}
            disabled={disabled}
            className="flex-1"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || disabled}
            className={cn(
              'px-4 py-2.5 bg-accent-primary text-white font-medium rounded-lg flex-shrink-0 whitespace-nowrap',
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
