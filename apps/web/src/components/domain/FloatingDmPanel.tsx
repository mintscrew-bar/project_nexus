"use client";

/**
 * 플로팅 DM 채팅 창
 * - FriendsPanel 왼쪽에 별도로 렌더링되는 DM 팝업 (롤 스타일)
 * - friend-store의 floatingDmTarget 상태로 제어
 * - DmChatView 컴포넌트를 그대로 재사용
 */

import { X, Minus } from "lucide-react";
import { useFriendStore } from "@/stores/friend-store";
import { useDmStore } from "@/stores/dm-store";
import { DmChatView } from "@/components/domain/DmChatView";
import { useState } from "react";

export function FloatingDmPanel() {
  const floatingDmTarget = useFriendStore((s) => s.floatingDmTarget);
  const closeFloatingDm = useFriendStore((s) => s.closeFloatingDm);
  // FriendsPanel 열림 상태 — rightOffset 계산에 반영
  const isFriendsPanelOpen = useFriendStore((s) => s.isOpen);
  const closeChat = useDmStore((s) => s.closeChat);
  // 최소화 상태 관리
  const [isMinimized, setIsMinimized] = useState(false);

  if (!floatingDmTarget) return null;

  // 닫기: 플로팅 창 + dm-store 모두 정리
  const handleClose = () => {
    closeChat();
    closeFloatingDm();
  };

  // FriendsPanel(w-72=288px) 열림 상태에 따라 rightOffset 조정
  const rightOffset = isFriendsPanelOpen ? 288 : 0;

  return (
    <div
      className="fixed bottom-0 z-50 flex flex-col bg-bg-secondary border border-bg-tertiary rounded-t-xl shadow-2xl overflow-hidden transition-[right] duration-300"
      style={{ width: 320, right: rightOffset }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary bg-bg-secondary/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          {/* 아바타 */}
          <div className="w-6 h-6 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
            {floatingDmTarget.avatar ? (
              <img
                src={floatingDmTarget.avatar}
                alt=""
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
        <div className="flex items-center gap-0.5">
          {/* 최소화/복원 토글 */}
          <button
            onClick={() => setIsMinimized((v) => !v)}
            className="p-1 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            title={isMinimized ? "복원" : "최소화"}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          {/* 닫기 */}
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            title="닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 채팅 본문 — 최소화 시 숨김 */}
      {!isMinimized && (
        <div className="h-[400px]">
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
