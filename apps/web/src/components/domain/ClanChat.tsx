"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import Image from "next/image";
import { useClanStore } from "@/stores/clan-store";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import {
  Users,
  Send,
  Flag,
  X,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Megaphone,
} from "lucide-react";
import { reputationApi } from "@/lib/api-client";
import { motion, AnimatePresence } from "framer-motion";

// ========================================
// Props 타입 정의
// ========================================

interface ClanChatProps {
  clanId: string;
  /** 현재 사용자의 클랜 내 역할 — 메시지 삭제 권한 판단에 사용 */
  myRole?: "OWNER" | "OFFICER" | "MEMBER" | null;
}

// ========================================
// 상수 정의
// ========================================

// 신고 사유 목록
const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "TOXICITY", label: "욕설/비하/혐오 표현" },
  { value: "GRIEFING", label: "스팸/방해 행위" },
  { value: "CHEATING", label: "치팅/핵 사용" },
  { value: "OTHER", label: "기타" },
];

type ReportReason = "TOXICITY" | "AFK" | "GRIEFING" | "CHEATING" | "OTHER";

interface ReportTarget {
  messageId: string;
  targetUserId: string;
  targetUsername: string;
  content: string;
}

// URL 감지 정규식 — http(s) 및 www 접두어 포함 URL 매칭
const URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;

// ========================================
// 유틸 함수
// ========================================

/**
 * 한국어 날짜 문자열 생성 (년.월.일 요일 형식)
 */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

/**
 * 두 날짜 문자열이 같은 날인지 확인
 */
function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * 메시지 content 내 URL을 자동으로 <a> 태그로 변환한 React 노드 배열 반환
 */
function renderContentWithLinks(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // regex lastIndex를 초기화하기 위해 새로 생성
  const regex = new RegExp(URL_REGEX.source, "gi");

  while ((match = regex.exec(content)) !== null) {
    // URL 앞의 일반 텍스트
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const url = match[0];
    // 프로토콜이 없으면 https:// 추가
    const href = url.startsWith("http") ? url : `https://${url}`;
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-primary underline hover:text-accent-hover break-all"
      >
        {url}
      </a>,
    );

    lastIndex = regex.lastIndex;
  }

  // 나머지 텍스트
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [content];
}

// ========================================
// 공지 배너 컴포넌트 (Task 21)
// ========================================

/**
 * 채팅 영역 상단에 표시되는 접을 수 있는 공지 배너
 * - 최신 공지 1개만 표시
 * - 접으면 한 줄 요약, 펼치면 전체 내용
 */
function AnnouncementBanner({ clanId }: { clanId: string }) {
  const { announcements, fetchAnnouncements } = useClanStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // 마운트 시 공지사항 로드
  useEffect(() => {
    fetchAnnouncements(clanId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clanId]);

  // 최신 고정 공지 또는 최신 공지 1개
  const latestAnnouncement = useMemo(() => {
    const pinned = announcements.find((a) => a.isPinned);
    return pinned || announcements[0] || null;
  }, [announcements]);

  if (!latestAnnouncement) return null;

  return (
    <div className="border-b border-bg-tertiary bg-accent-primary/5">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent-primary/10 transition-colors"
      >
        <Megaphone className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
        <span
          className={cn(
            "flex-1 text-xs text-text-secondary",
            !isExpanded && "truncate",
          )}
        >
          {isExpanded
            ? latestAnnouncement.content
            : latestAnnouncement.content}
        </span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 text-text-tertiary flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 text-text-tertiary flex-shrink-0" />
        )}
      </button>

      {/* 펼친 상태: 작성자 및 날짜 표시 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2">
              <p className="text-xs text-text-primary whitespace-pre-wrap leading-relaxed">
                {latestAnnouncement.content}
              </p>
              <p className="text-[10px] text-text-tertiary mt-1">
                {latestAnnouncement.author?.username ?? "알 수 없음"} ·{" "}
                {new Date(latestAnnouncement.createdAt).toLocaleDateString("ko-KR")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ========================================
// 메인 컴포넌트
// ========================================

export function ClanChat({ clanId, myRole }: ClanChatProps) {
  const { user } = useAuthStore();
  const {
    chatMessages,
    chatNextCursor,
    isLoadingMore,
    typingUsers,
    isConnected,
    fetchChatMessages,
    fetchMoreMessages,
    deleteChatMessage,
    connectToClan,
    disconnectFromClan,
    sendChatMessage,
    setTypingStatus,
    resetUnread,
  } = useClanStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // 타이핑 디바운스를 위한 타임아웃 ref
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 신고 모달 상태
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("TOXICITY");
  const [reportDescription, setReportDescription] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // 메시지 삭제 처리 중인 ID 추적
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // 초기 마운트 시 소켓 연결 + 메시지 로드
  useEffect(() => {
    fetchChatMessages(clanId);
    connectToClan(clanId);
    resetUnread();

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

  // 채팅 포커스 시 미읽음 카운트 리셋
  useEffect(() => {
    if (isAtBottom) {
      resetUnread();
    }
  }, [chatMessages.length, isAtBottom, resetUnread]);

  // 무한 스크롤: 상단 근처 도달 시 이전 메시지 로드
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);

    // 상단 50px 이내 도달 시 이전 메시지 로드
    if (el.scrollTop < 50 && chatNextCursor && !isLoadingMore) {
      const prevScrollHeight = el.scrollHeight;
      fetchMoreMessages(clanId).then(() => {
        // 스크롤 위치 유지: 새로 추가된 높이만큼 스크롤 보정
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            const newScrollHeight = scrollContainerRef.current.scrollHeight;
            scrollContainerRef.current.scrollTop =
              newScrollHeight - prevScrollHeight;
          }
        });
      });
    }
  }, [chatNextCursor, isLoadingMore, fetchMoreMessages, clanId]);

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

  // 메시지 삭제 핸들러
  const handleDeleteMessage = async (messageId: string) => {
    setDeletingIds((prev) => new Set(prev).add(messageId));
    try {
      await deleteChatMessage(clanId, messageId);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  /**
   * 메시지 삭제 가능 여부 판단
   * - 본인 메시지는 항상 삭제 가능
   * - OWNER, OFFICER는 다른 사람의 메시지도 삭제 가능
   */
  const canDelete = (msgUserId: string): boolean => {
    if (!user) return false;
    if (msgUserId === user.id) return true;
    return myRole === "OWNER" || myRole === "OFFICER";
  };

  // 신고 모달 열기
  const openReport = (msg: {
    id: string;
    userId: string;
    user?: { username: string };
    content: string;
  }) => {
    setReportTarget({
      messageId: msg.id,
      targetUserId: msg.userId,
      targetUsername: msg.user?.username ?? "알 수 없음",
      content: msg.content,
    });
    setReportReason("TOXICITY");
    setReportDescription("");
    setReportSuccess(false);
  };

  // 신고 제출
  const handleSubmitReport = async () => {
    if (!reportTarget || !reportDescription.trim()) return;
    setIsSubmittingReport(true);
    try {
      await reputationApi.reportUser({
        targetUserId: reportTarget.targetUserId,
        clanChatMessageId: reportTarget.messageId,
        reason: reportReason,
        description: reportDescription.trim(),
      });
      setReportSuccess(true);
    } catch {
      // 에러는 무시 (중복 신고 등)
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // 타이핑 중인 다른 유저 목록 (본인 제외)
  const otherTypingUsers = Array.from(typingUsers.entries())
    .filter(([uid]) => uid !== user?.id)
    .map(([, username]) => username);

  return (
    <div className="flex flex-col h-full relative">
      {/* 공지 배너 (Task 21) */}
      <AnnouncementBanner clanId={clanId} />

      {/* 메시지 목록 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-bg-elevated"
      >
        {/* 이전 메시지 로딩 인디케이터 */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-4 h-4 text-text-tertiary animate-spin" />
            <span className="text-xs text-text-tertiary ml-2">
              이전 메시지 불러오는 중...
            </span>
          </div>
        )}

        {chatMessages.length === 0 && !isLoadingMore && (
          <p className="text-center text-text-tertiary text-sm py-8">
            아직 채팅 메시지가 없습니다. 첫 번째로 인사를 남겨보세요!
          </p>
        )}

        {chatMessages.map((msg, idx) => {
          const isMe = msg.userId === user?.id;
          const prevMsg = chatMessages[idx - 1];
          // 같은 유저가 연속으로 보낸 메시지면 아바타/이름 생략
          const showHeader = !prevMsg || prevMsg.userId !== msg.userId;

          // 날짜 구분선: 이전 메시지와 날짜가 다르면 삽입
          const showDateSeparator =
            !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);

          return (
            <div key={msg.id}>
              {/* 날짜 구분선 */}
              {showDateSeparator && (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-bg-elevated" />
                  <span className="text-[10px] text-text-tertiary font-medium px-2">
                    {formatDateLabel(msg.createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-bg-elevated" />
                </div>
              )}

              <div
                className={cn(
                  "group flex items-end gap-2",
                  isMe && "flex-row-reverse",
                )}
              >
                {/* 아바타 (연속 메시지이거나 내 메시지면 숨김) */}
                {!isMe && (
                  <div
                    className={cn(
                      "relative w-8 h-8 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0",
                      !showHeader && "invisible", // 공간 유지하되 숨김
                    )}
                  >
                    {msg.user?.avatar ? (
                      <Image
                        src={msg.user.avatar}
                        alt={msg.user?.username ?? ""}
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
                    isMe && "items-end",
                  )}
                >
                  {/* 이름 + 시간 (첫 메시지만) */}
                  {showHeader && !isMe && (
                    <span className="text-xs text-text-tertiary mb-1 px-1">
                      {msg.user?.username ?? "알 수 없음"}
                    </span>
                  )}

                  {/* 말풍선 + 액션 버튼들 */}
                  <div
                    className={cn(
                      "flex items-center gap-1",
                      isMe && "flex-row-reverse",
                    )}
                  >
                    <div
                      className={cn(
                        "px-3 py-2 rounded-2xl text-sm break-words",
                        isMe
                          ? "bg-accent-primary text-white rounded-br-sm"
                          : "bg-bg-elevated text-text-primary rounded-bl-sm",
                      )}
                    >
                      {/* URL 자동 링크 처리된 메시지 내용 */}
                      {renderContentWithLinks(msg.content)}
                    </div>

                    {/* 액션 버튼 그룹: 삭제 + 신고 (hover 시 표시) */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* 메시지 삭제 버튼 — 본인 메시지 또는 OWNER/OFFICER */}
                      {canDelete(msg.userId) && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          disabled={deletingIds.has(msg.id)}
                          title="메시지 삭제"
                          className="p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-bg-elevated disabled:opacity-40"
                        >
                          {deletingIds.has(msg.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      )}

                      {/* 본인 메시지가 아닐 때만 신고 버튼 표시 */}
                      {!isMe && (
                        <button
                          onClick={() => openReport(msg)}
                          title="메시지 신고"
                          className="p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-bg-elevated"
                        >
                          <Flag className="h-3 w-3" />
                        </button>
                      )}
                    </div>
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
              {otherTypingUsers.length > 2 &&
                ` 외 ${otherTypingUsers.length - 2}명`}
              이 입력 중...
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

      {/* ─── 신고 모달 ──────────────────────────────────────────── */}
      {reportTarget && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-bg-secondary border border-bg-elevated rounded-xl w-full max-w-sm shadow-xl">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Flag className="h-4 w-4 text-red-400" />
                메시지 신고
              </h3>
              <button
                onClick={() => setReportTarget(null)}
                className="p-1 rounded hover:bg-bg-elevated text-text-tertiary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {reportSuccess ? (
              /* 신고 완료 화면 */
              <div className="p-6 text-center">
                <p className="text-sm text-text-primary font-medium mb-1">
                  신고가 접수되었습니다
                </p>
                <p className="text-xs text-text-tertiary mb-4">
                  운영팀이 검토 후 조치할 예정입니다.
                </p>
                <button
                  onClick={() => setReportTarget(null)}
                  className="px-4 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-hover"
                >
                  확인
                </button>
              </div>
            ) : (
              /* 신고 폼 */
              <div className="p-4 space-y-4">
                {/* 신고 대상 메시지 미리보기 */}
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <p className="text-xs text-text-tertiary mb-1">
                    {reportTarget.targetUsername}의 메시지
                  </p>
                  <p className="text-sm text-text-secondary line-clamp-2">
                    {reportTarget.content}
                  </p>
                </div>

                {/* 신고 사유 선택 */}
                <div>
                  <label className="text-xs text-text-tertiary mb-1.5 block">
                    신고 사유
                  </label>
                  <div className="space-y-1.5">
                    {REPORT_REASONS.map((r) => (
                      <label
                        key={r.label}
                        className="flex items-center gap-2 cursor-pointer group/r"
                      >
                        <input
                          type="radio"
                          name="reportReason"
                          value={r.value}
                          checked={reportReason === r.value}
                          onChange={() => setReportReason(r.value)}
                          className="accent-accent-primary"
                        />
                        <span className="text-sm text-text-secondary group-hover/r:text-text-primary">
                          {r.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 상세 설명 */}
                <div>
                  <label className="text-xs text-text-tertiary mb-1.5 block">
                    상세 설명 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="신고 내용을 구체적으로 작성해주세요."
                    maxLength={500}
                    rows={3}
                    className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
                  />
                  <p className="text-xs text-text-tertiary text-right mt-1">
                    {reportDescription.length}/500
                  </p>
                </div>

                {/* 버튼 */}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setReportTarget(null)}
                    className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary bg-bg-tertiary rounded-lg"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={isSubmittingReport || !reportDescription.trim()}
                    className="px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingReport ? "신고 중..." : "신고하기"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
