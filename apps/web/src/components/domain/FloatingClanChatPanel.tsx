"use client";

/**
 * 플로팅 클랜 채팅 창
 * - FriendsPanel 왼쪽에 렌더링되는 클랜 채팅 팝업 (롤 스타일)
 * - friend-store의 isClanChatOpen 상태로 제어
 * - ClanChat 컴포넌트를 그대로 재사용
 * - DM 창이 열려 있으면 더 왼쪽에 배치
 */

import { useEffect, useState } from "react";
import { X, Minus, Shield } from "lucide-react";
import { useFriendStore } from "@/stores/friend-store";
import { useAuthStore } from "@/stores/auth-store";
import { clanApi } from "@/lib/api-client";
import { ClanChat } from "@/components/domain/ClanChat";

export function FloatingClanChatPanel() {
  const isClanChatOpen = useFriendStore((s) => s.isClanChatOpen);
  const closeClanChat = useFriendStore((s) => s.closeClanChat);
  const floatingDmTarget = useFriendStore((s) => s.floatingDmTarget);
  const { isAuthenticated } = useAuthStore();
  // 최소화 상태
  const [isMinimized, setIsMinimized] = useState(false);
  // 내 클랜 정보
  const [myClan, setMyClan] = useState<{ id: string; name: string; tag: string } | null>(null);
  const [isLoadingClan, setIsLoadingClan] = useState(false);

  // 클랜 채팅 창 열릴 때 내 클랜 정보 조회
  useEffect(() => {
    if (!isClanChatOpen || !isAuthenticated) return;
    setIsLoadingClan(true);
    clanApi
      .getMyClan()
      .then((clan: any) => {
        if (clan?.id) setMyClan({ id: clan.id, name: clan.name, tag: clan.tag });
        else {
          setMyClan(null);
          // 클랜이 없으면 자동으로 닫기
          closeClanChat();
        }
      })
      .catch(() => {
        setMyClan(null);
        closeClanChat();
      })
      .finally(() => setIsLoadingClan(false));
  }, [isClanChatOpen, isAuthenticated, closeClanChat]);

  if (!isClanChatOpen) return null;

  // DM 플로팅 창이 열려있으면 더 왼쪽에 배치 (DM 창 320px + 간격)
  const rightOffset = floatingDmTarget ? 288 + 320 + 4 : 288;

  return (
    <div
      className="fixed bottom-0 z-50 flex flex-col bg-bg-secondary border border-bg-tertiary rounded-t-xl shadow-2xl overflow-hidden"
      style={{ width: 320, right: rightOffset }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary bg-bg-secondary/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-accent-primary flex-shrink-0" />
          <span className="font-semibold text-text-primary text-sm truncate">
            {myClan ? `[${myClan.tag}] ${myClan.name}` : "클랜 채팅"}
          </span>
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
      </div>

      {/* 채팅 본문 */}
      {!isMinimized && (
        <div className="h-[420px]">
          {isLoadingClan ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
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
