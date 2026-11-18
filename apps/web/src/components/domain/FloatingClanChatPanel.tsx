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
import { useQuery } from "@tanstack/react-query";
import { useFriendStore } from "@/stores/friend-store";
import { useAuthStore } from "@/stores/auth-store";
import { useClanStore } from "@/stores/clan-store";
import { clanApi } from "@/lib/api-client";
import { ClanChat } from "@/components/domain/ClanChat";
import { clanGameFromLocation } from "@/lib/clan-game";
import { useOpenCount } from "@/hooks/useOpenCount";

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

  // 모바일 감지
  const [isMobile, setIsMobile] = useState(false);
  // 최소화 상태
  const [isMinimized, setIsMinimized] = useState(false);
  // 패널 높이 (드래그 리사이즈)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  // 드래그 리사이즈 중 여부
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(DEFAULT_HEIGHT);

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

  // 펼쳐져 있으면 pulse 를 보이지 않는다 — 효과에서 끄던 것을 그릴 때 계산으로
  const showPulse = hasPulse && isMinimized;

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

  // 내 클랜 정보 — 창이 열려 있을 때만 조회한다. 예전엔 효과에서 fetchMyClan() 을 불러
  // 로딩·결과를 setState 했다(react-hooks/set-state-in-effect). 창을 다시 열면
  // 열 때마다 키(openCount)가 바뀌어 새로 불러온다. 지난번 "클랜 없음" 결과가 남아
  // 있으면 그사이 가입했어도 열자마자 닫혀 버리므로, 지난 결과는 쓰지 않는다.
  const clanGame = clanGameFromLocation();
  const openCount = useOpenCount(isClanChatOpen);
  const myClanQuery = useQuery({
    queryKey: ["floating-clan-chat", "my-clan", clanGame, openCount],
    enabled: isClanChatOpen && isAuthenticated,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const c = (await clanApi.getMyClan(clanGame)) as {
        id?: string;
        name?: string;
        tag?: string;
        myRole?: "OWNER" | "OFFICER" | "MEMBER";
      } | null;
      if (!c?.id) return null;
      return {
        clan: { id: c.id, name: c.name ?? "", tag: c.tag ?? "" },
        // 현재 유저의 클랜 내 역할 (메시지 삭제 권한 판단에 사용)
        role: c.myRole ?? null,
      };
    },
  });
  const myClan = myClanQuery.data?.clan ?? null;
  const myRole = myClanQuery.data?.role ?? null;
  // 받아 온 것이 없을 때 불러오는 중이면 스피너
  const isLoadingClan = myClanQuery.isFetching && !myClanQuery.data;
  // API 에러 상태 — 에러 시 패널을 바로 닫지 않고 재시도 UI 제공
  const fetchError = myClanQuery.isError && !myClanQuery.isFetching;
  // 재시도 버튼용
  const fetchMyClan = () => void myClanQuery.refetch();

  // 클랜이 없으면 자동으로 닫기 — 스토어 동작이라 효과에서 불러도 된다
  const hasNoClan = myClanQuery.isSuccess && myClanQuery.data === null;
  useEffect(() => {
    if (hasNoClan) closeClanChat();
  }, [hasNoClan, closeClanChat]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!isClanChatOpen) return null;

  // 모바일: 전체 너비 바텀시트 / 데스크탑: 320px 팝업
  const friendsPanelWidth = isFriendsPanelOpen ? 288 : 0;
  const rightOffset = friendsPanelWidth + (floatingDmTarget ? 320 + 4 : 0);
  const panelStyle = isMobile
    ? { left: 0, right: 0, width: "100%" }
    : { width: 320, right: rightOffset };

  return (
    <div
      className="fixed bottom-0 z-50 flex flex-col bg-bg-secondary border border-bg-tertiary rounded-t-xl shadow-2xl overflow-hidden transition-[right] duration-300"
      style={panelStyle}
    >
      {/* 리사이즈 핸들 — 데스크탑 전용 드래그 영역 */}
      {!isMinimized && !isMobile && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-10 hover:bg-accent-primary/20 transition-colors"
        />
      )}

      {/* 헤더 */}
      <motion.div
        animate={
          showPulse
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
          showPulse ? { duration: 1, repeat: 1, ease: "easeInOut" } : {}
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
          {/* 최소화/복원 — 모바일에서는 숨김 */}
          {!isMobile && (
            <button
              onClick={() => {
                // 접고 펼칠 때 지난 pulse 를 지운다(다시 접었을 때 남아 있지 않게)
                setHasPulse(false);
                setIsMinimized((v) => !v);
              }}
              className="p-1.5 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
              title={isMinimized ? "복원" : "최소화"}
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={closeClanChat}
            className="p-1.5 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* 채팅 본문 */}
      {!isMinimized && (
        <div
          className={isMobile ? "h-[60vh]" : ""}
          style={isMobile ? {} : { height: panelHeight }}
        >
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-primary text-accent-on rounded-lg hover:bg-accent-hover transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                다시 시도
              </button>
            </div>
          ) : myClan ? (
            <ClanChat clanId={myClan.id} myRole={myRole} />
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
