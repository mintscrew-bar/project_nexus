'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useDmStore, DirectMessage } from '@/stores/dm-store';
import { dmApi } from '@/lib/api-client';
import { dmSocketHelpers } from '@/lib/socket-client';
import { cn } from '@/lib/utils';
import { Send, Loader2 } from 'lucide-react';

interface Props {
  otherUserId: string;
  otherUsername: string;
  otherAvatar: string | null;
}

export function DmChatView({ otherUserId, otherUsername, otherAvatar }: Props) {
  const { user } = useAuthStore();
  const {
    messages,
    hasMore,
    nextCursor,
    typingUsers,
    setMessages,
    prependMessages,
    appendMessage,
    clearUnread,
    setTyping,
    updateConversationLastMessage,
  } = useDmStore();

  const myMessages = messages[otherUserId] ?? [];
  const isOtherTyping = typingUsers[otherUserId] ?? false;

  const [input, setInput] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // 초기 메시지 로드 + 읽음 처리
  useEffect(() => {
    const init = async () => {
      try {
        const data = await dmApi.getMessages(otherUserId);
        setMessages(otherUserId, data.messages, data.nextCursor);
        await dmApi.markAsRead(otherUserId);
        dmSocketHelpers.markRead(otherUserId);
        clearUnread(otherUserId);
      } finally {
        setIsInitialLoad(false);
      }
    };
    init();
  }, [otherUserId, setMessages, clearUnread]);

  // 새 메시지 소켓 수신
  useEffect(() => {
    const handler = (msg: DirectMessage) => {
      const isRelevant =
        (msg.senderId === otherUserId) || (msg.receiverId === otherUserId);
      if (!isRelevant) return;

      appendMessage(msg);
      updateConversationLastMessage(otherUserId, msg);

      // 상대방이 보낸 메시지면 읽음 처리
      if (msg.senderId === otherUserId) {
        dmApi.markAsRead(otherUserId).catch(() => {});
        dmSocketHelpers.markRead(otherUserId);
      }
    };

    dmSocketHelpers.onNewMessage(handler);
    return () => {
      // off는 offAllListeners가 아닌 개별 제거가 불가하므로 무시 (언마운트 시 FriendsPanel이 처리)
    };
  }, [otherUserId, appendMessage, updateConversationLastMessage]);

  // 타이핑 인디케이터 수신
  useEffect(() => {
    dmSocketHelpers.onUserTyping((data) => {
      if (data.userId === otherUserId) {
        setTyping(otherUserId, true);
      }
    });
    dmSocketHelpers.onUserStoppedTyping((data) => {
      if (data.userId === otherUserId) {
        setTyping(otherUserId, false);
      }
    });
  }, [otherUserId, setTyping]);

  // 초기 로드 후 맨 아래로 스크롤
  useEffect(() => {
    if (!isInitialLoad) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [isInitialLoad]);

  // 새 메시지 도착 시 맨 아래로 스크롤 (내가 보낸 것 or 이미 맨 아래 근처)
  const prevLengthRef = useRef(myMessages.length);
  useEffect(() => {
    if (myMessages.length > prevLengthRef.current) {
      const lastMsg = myMessages[myMessages.length - 1];
      if (lastMsg?.senderId === user?.id) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevLengthRef.current = myMessages.length;
  }, [myMessages, user?.id]);

  // 더 이전 메시지 로드 (스크롤 최상단)
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore[otherUserId]) return;
    const cursor = nextCursor[otherUserId];
    if (!cursor) return;

    setIsLoadingMore(true);
    const prevScrollHeight = containerRef.current?.scrollHeight ?? 0;

    try {
      const data = await dmApi.getMessages(otherUserId, cursor);
      prependMessages(otherUserId, data.messages, data.nextCursor);

      // 스크롤 위치 유지
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const newScrollHeight = containerRef.current.scrollHeight;
          containerRef.current.scrollTop = newScrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, nextCursor, otherUserId, prependMessages]);

  // Intersection Observer로 최상단 감지
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0.1 },
    );
    if (topRef.current) observer.observe(topRef.current);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      dmSocketHelpers.sendIsTyping(otherUserId, true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      dmSocketHelpers.sendIsTyping(otherUserId, false);
    }, 2000);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput('');
    setIsSending(true);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      dmSocketHelpers.sendIsTyping(otherUserId, false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }

    dmSocketHelpers.sendMessage(otherUserId, text);
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  if (isInitialLoad) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 목록 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0"
      >
        {/* 더 이전 메시지 로드 트리거 */}
        <div ref={topRef} className="h-1" />
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          </div>
        )}

        {myMessages.length === 0 && (
          <p className="text-center text-text-muted text-sm py-8">
            {otherUsername}님과 대화를 시작하세요.
          </p>
        )}

        {myMessages.map((msg, idx) => {
          const isMine = msg.senderId === user?.id;
          const prevMsg = myMessages[idx - 1];
          const showAvatar = !isMine && prevMsg?.senderId !== msg.senderId;
          const isConsecutive = prevMsg?.senderId === msg.senderId;

          return (
            <div
              key={msg.id}
              className={cn(
                'flex items-end gap-1.5',
                isMine ? 'flex-row-reverse' : 'flex-row',
                isConsecutive ? 'mt-0.5' : 'mt-3',
              )}
            >
              {/* 아바타 (상대방만) */}
              {!isMine && (
                <div className="w-6 flex-shrink-0">
                  {showAvatar && (
                    <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center overflow-hidden">
                      {otherAvatar ? (
                        <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-text-muted">
                          {otherUsername[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 말풍선 */}
              <div
                className={cn(
                  'max-w-[75%] px-3 py-1.5 rounded-2xl text-sm leading-relaxed',
                  isMine
                    ? 'bg-accent-primary text-white rounded-br-sm'
                    : 'bg-bg-tertiary text-text-primary rounded-bl-sm',
                )}
              >
                {msg.content}
              </div>

              {/* 시간 */}
              <span className="text-[10px] text-text-muted flex-shrink-0 mb-0.5">
                {formatTime(msg.createdAt)}
              </span>
            </div>
          );
        })}

        {/* 타이핑 인디케이터 */}
        {isOtherTyping && (
          <div className="flex items-end gap-1.5 mt-2">
            <div className="w-6 flex-shrink-0" />
            <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-bg-tertiary">
              <div className="flex gap-1 items-center h-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="px-3 py-2 border-t border-bg-tertiary">
        <div className="flex items-center gap-2 bg-bg-tertiary rounded-xl px-3 py-1.5">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`${otherUsername}에게 메시지 보내기...`}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className={cn(
              'p-1 rounded-lg transition-colors',
              input.trim()
                ? 'text-accent-primary hover:bg-accent-primary/10'
                : 'text-text-muted cursor-not-allowed',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
