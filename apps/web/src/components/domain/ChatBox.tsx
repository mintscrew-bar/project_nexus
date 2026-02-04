"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Input, Avatar } from '@/components/ui';
import { cn, getRelativeTime } from '@/lib/utils';

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !disabled) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-bg-secondary rounded-lg', className)}>
      {/* Messages Container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ maxHeight: '500px' }}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-tertiary text-sm">아직 메시지가 없습니다</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.userId === currentUserId;

            return (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3 animate-fade-in',
                  isOwn && 'flex-row-reverse'
                )}
              >
                {/* Avatar */}
                <Avatar
                  src={msg.avatar}
                  alt={msg.username || '?'}
                  fallback={msg.username?.[0] || '?'}
                  size="sm"
                />

                {/* Message Content */}
                <div className={cn('flex-1 max-w-[70%]', isOwn && 'flex flex-col items-end')}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">
                      {msg.username || '알 수 없음'}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {getRelativeTime(msg.createdAt)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'px-4 py-2 rounded-lg break-words',
                      isOwn
                        ? 'bg-accent-primary text-white'
                        : 'bg-bg-tertiary text-text-primary'
                    )}
                  >
                    <p className="text-sm">{msg.message}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="border-t border-bg-tertiary p-4">
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
              'px-6 py-2.5 bg-accent-primary text-white font-medium rounded-lg',
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
