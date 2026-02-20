"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuction } from "@/hooks/useAuction";
import { useAuthStore } from "@/stores/auth-store";
import { AuctionBoard } from "@/components/domain";
import { LoadingSpinner, Badge } from "@/components/ui";

export default function AuctionRoomPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;
  const { user } = useAuthStore();
  const hasRedirected = useRef(false);

  const {
    auctionState,
    players,
    teams,
    isConnected,
    isLoading,
    error,
    placeBid,
  } = useAuction(auctionId);

  useEffect(() => {
    if (hasRedirected.current) return;
    if (auctionState?.status === "COMPLETED") {
      hasRedirected.current = true;
      router.push(`/role-selection/${auctionId}`);
    }
  }, [auctionState?.status, auctionId, router]);

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">경매 방에 연결 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent-danger mb-4">오류: {error}</p>
          <p className="text-text-secondary">경매 방에 연결할 수 없습니다</p>
        </div>
      </div>
    );
  }

  if (!auctionState) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">경매 시작 대기 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8 relative">
      <div className="absolute top-4 right-4 z-10">
        <Badge variant={isConnected ? 'success' : 'danger'}>
          {isConnected ? '● 연결됨' : '● 연결 끊김'}
        </Badge>
      </div>

      <div className="container mx-auto">
        <div className="mb-6 animate-fade-in">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            경매 진행 중
          </h1>
          <p className="text-text-secondary">
            Room ID: <span className="text-accent-primary font-mono">{auctionId}</span>
          </p>
        </div>

        <AuctionBoard
          auctionState={auctionState}
          teams={teams}
          currentUserId={user?.id}
          onPlaceBid={placeBid}
          disabled={!isConnected}
        />
      </div>
    </div>
  );
}
