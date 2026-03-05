"use client";

/**
 * 플로팅 클랜 채팅 창
 * - FriendsPanel 왼쪽에 렌더링되는 클랜 채팅 팝업 (롤 스타일)
 * - friend-store의 isClanChatOpen 상태로 제어
 * - ClanChat 컴포넌트를 그대로 재사용
 * - DM 창이 열려 있으면 더 왼쪽에 배치
 *
 * [개선] 읽지 않은 메시지 뱃지 (unreadCount)
 * [개선] 최소화 상태에서 새 메시지 → 헤더 pulse 애니메이션
 * [개선] 드래그 리사이즈: panelHeight (min 200, max 600, default 420)
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Minus, Shield, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFriendStore } from "@/stores/friend-store";
import { useAuthStore } from "@/stores/auth-store";
import { useClanStore } from "@/stores/clan-store";
import { clanApi } from "@/lib/api-client";
import { ClanChat } from "@/components/domain/ClanChat";

// ========================================
// 리사이즈 관련 상수
// ========================================

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 420;

export function FloatingClanChatPanel() {
  const isClanChatOpen = useFriendStore((s) => s.isClanChatOpen);
  const closeClanChat = useFriendStore((s) => s.closeClanChat);
  const floatingDmTarget = useFriendStore((s) => s.floatingDmTarget);
  // FriendsPanel 열림 상태 — rightOffset 계산에 반영
  const isFriendsPanelOpen = useFriendStore((s) => s.isOpen);
  const { isAuthenticated } = useAuthStore();

  // clan-store에서 미읽음 카운트 가져오기
  const unreadCount = useClanStore((s) => s.unreadCount);

  // 최소화 상태
  const [isMinimized, setIsMinimized] = useState(false);
  // 패널 높이 (드래그 리사이즈)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  // 드래그 리사이즈 중 여부
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(DEFAULT_HEIGHT);

  // 내 클랜 정보
  const [myClan, setMyClan] = useState<{
    id: string;
    name: string;
    tag: string;
  } | null>(null);
  const [isLoadingClan, setIsLoadingClan] = useState(false);
  // API 에러 상태 — 에러 시 패널을 바로 닫지 않고 재시도 UI 제공
  const [fetchError, setFetchError] = useState(false);

  // 최소화 상태에서 새 메시지 도착 감지 → pulse 효과
  const [hasPulse, setHasPulse] = useState(false);
  const prevUnreadRef = useRef(unreadCount);

  // 최소화 상태에서 unreadCount가 증가하면 pulse 활성화
  useEffect(() => {
    if (isMinimized && unreadCount > prevUnreadRef.current) {
      setHasPulse(true);
      // 2초 후 pulse 제거
      const timer = setTimeout(() => setHasPulse(false), 2000);
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, isMinimized]);

  // 최소화 해제 시 pulse 초기화
  useEffect(() => {
    if (!isMinimized) {
      setHasPulse(false);
    }
  }, [isMinimized]);

  // ========================================
  // 드래그 리사이즈 핸들러
  // ========================================

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startY.current = e.clientY;
      startHeight.current = panelHeight;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        // 위로 드래그하면 높이 증가 (bottom 고정이므로 Y 감소 = 높이 증가)
        const deltaY = startY.current - ev.clientY;
        const newHeight = Math.min(
          MAX_HEIGHT,
          Math.max(MIN_HEIGHT, startHeight.current + deltaY),
        );
        setPanelHeight(newHeight);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight],
  );

  // 클랜 정보 조회 함수 (초기 + 재시도 공통)
  const fetchMyClan = () => {
    setIsLoadingClan(true);
    setFetchError(false);
    clanApi
      .getMyClan()
      .then((clan: unknown) => {
        const c = clan as { id?: string; name?: string; tag?: string } | null;
        if (c?.id) {
          setMyClan({ id: c.id, name: c.name ?? "", tag: c.tag ?? "" });
        } else {
          // 클랜이 없으면 자동으로 닫기
          setMyClan(null);
          closeClanChat();
        }
      })
      .catch(() => {
        // API 에러 시 패널을 닫지 않고 에러 상태만 설정 (재시도 가능)
        setMyClan(null);
        setFetchError(true);
      })
      .finally(() => setIsLoadingClan(false));
  };

  // 클랜 채팅 창 열릴 때 내 클랜 정보 조회
  useEffect(() => {
    if (!isClanChatOpen || !isAuthenticated) return;
    fetchMyClan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClanChatOpen, isAuthenticated]);

  if (!isClanChatOpen) return null;

  // FriendsPanel(w-72=288px) 열림 상태에 따라 rightOffset 조정
  // 패널이 닫혀있으면 오른쪽 끝(0px)부터, 열려있으면 패널 너비만큼 오프셋
  const friendsPanelWidth = isFriendsPanelOpen ? 288 : 0;
  // DM 플로팅 창이 열려있으면 추가 오프셋 (DM 창 320px + 간격 4px)
  const rightOffset =
    friendsPanelWidth + (floatingDmTarget ? 320 + 4 : 0);

  return (
    <div
      className="fixed bottom-0 z-50 flex flex-col bg-bg-secondary border border-bg-tertiary rounded-t-xl shadow-2xl overflow-hidden transition-[right] duration-300"
      style={{ width: 320, right: rightOffset }}
    >
      {/* 리사이즈 핸들 — 상단 테두리 위 투명 드래그 영역 */}
      {!isMinimized && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-10 hover:bg-accent-primary/20 transition-colors"
        />
      )}

      {/* 헤더 */}
      <motion.div
        animate={
          hasPulse
            ? {
                backgroundColor: [
                  "rgba(var(--accent-primary-rgb, 99, 102, 241), 0)",
                  "rgba(var(--accent-primary-rgb, 99, 102, 241), 0.15)",
                  "rgba(var(--accent-primary-rgb, 99, 102, 241), 0)",
                ],
              }
            : {}
        }
        transition={
          hasPulse
            ? { duration: 1, repeat: 1, ease: "easeInOut" }
            : {}
        }
        className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary bg-bg-secondary/95 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-accent-primary flex-shrink-0" />
          <span className="font-semibold text-text-primary text-sm truncate">
            {myClan ? `[${myClan.tag}] ${myClan.name}` : "클랜 채팅"}
          </span>

          {/* 읽지 않은 메시지 뱃지 */}
          <AnimatePresence>
            {unreadCount > 0 && isMinimized && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setIsMinimized((v) => !v)}
            className="p-1 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            title={isMinimized ? "복원" : "최소화"}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={closeClanChat}
            className="p-1 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            title="닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>

      {/* 채팅 본문 */}
      {!isMinimized && (
        <div style={{ height: panelHeight }}>
          {isLoadingClan ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
            </div>
          ) : fetchError ? (
            /* API 에러 시 재시도 UI */
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <p className="text-sm text-text-secondary">
                클랜 정보를 불러올 수 없습니다.
              </p>
              <button
                onClick={fetchMyClan}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-primary text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                다시 시도
              </button>
            </div>
          ) : myClan ? (
            <ClanChat clanId={myClan.id} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
              클랜에 가입되어 있지 않습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
