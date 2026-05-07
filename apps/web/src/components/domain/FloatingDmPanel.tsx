"use client";

/**
 * 플로팅 DM 채팅 창
 * - FriendsPanel 왼쪽에 별도로 렌더링되는 DM 팝업 (롤 스타일)
 * - friend-store의 floatingDmTarget 상태로 제어
 * - DmChatView 컴포넌트를 그대로 재사용
 * - 모바일: 전체 너비 바텀시트, 데스크탑: 320px 고정 팝업
 */

import { X, Minus } from "lucide-react";
import Image from "next/image";
import { useFriendStore } from "@/stores/friend-store";
import { useDmStore } from "@/stores/dm-store";
import { DmChatView } from "@/components/domain/DmChatView";
import { useState, useEffect } from "react";

export function FloatingDmPanel() {
  const floatingDmTarget = useFriendStore((s) => s.floatingDmTarget);
  const closeFloatingDm = useFriendStore((s) => s.closeFloatingDm);
  const isFriendsPanelOpen = useFriendStore((s) => s.isOpen);
  const closeChat = useDmStore((s) => s.closeChat);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!floatingDmTarget) return null;

  const handleClose = () => {
    closeChat();
    closeFloatingDm();
  };

  // 모바일: 전체 너비 / 데스크탑: FriendsPanel 옆 320px
  const panelStyle = isMobile
    ? { left: 0, right: 0, width: "100%" }
    : { width: 320, right: isFriendsPanelOpen ? 288 : 0 };

  const chatHeight = isMobile ? "h-[60vh]" : "h-[400px]";

  return (
    <div
      className="fixed bottom-0 z-50 flex flex-col bg-bg-secondary border border-bg-tertiary rounded-t-xl shadow-2xl overflow-hidden transition-[right] duration-300"
      style={panelStyle}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-bg-tertiary bg-bg-secondary/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
            {floatingDmTarget.avatar ? (
              <Image
                src={floatingDmTarget.avatar}
                alt=""
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-muted">
                {floatingDmTarget.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <span className="font-semibold text-text-primary text-sm truncate">
            {floatingDmTarget.username}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 최소화/복원 — 모바일에서는 숨김 */}
          {!isMobile && (
            <button
              onClick={() => setIsMinimized((v) => !v)}
              className="p-1.5 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
              title={isMinimized ? "복원" : "최소화"}
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 채팅 본문 — 최소화 시 숨김 */}
      {!isMinimized && (
        <div className={chatHeight}>
          <DmChatView
            key={floatingDmTarget.id}
            otherUserId={floatingDmTarget.id}
            otherUsername={floatingDmTarget.username}
            otherAvatar={floatingDmTarget.avatar}
          />
        </div>
      )}
    </div>
  );
}
