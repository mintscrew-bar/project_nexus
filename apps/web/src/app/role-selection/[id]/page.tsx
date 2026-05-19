"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRoleSelectionStore } from "@/stores/role-selection-store";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { GameChatPanel } from "@/components/domain/GameChatPanel";
import { LoadingSpinner, Badge, Avatar, Button, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Clock, Check, Users, TimerReset } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
type Role = (typeof ROLES)[number];

const ROLE_META: Record<Role, { label: string; icon: string; color: string }> = {
  TOP: { label: "탑", icon: "⚔️", color: "text-red-400" },
  JUNGLE: { label: "정글", icon: "🌲", color: "text-green-400" },
  MID: { label: "미드", icon: "⭐", color: "text-yellow-400" },
  ADC: { label: "원딜", icon: "🏹", color: "text-blue-400" },
  SUPPORT: { label: "서포터", icon: "🛡️", color: "text-pink-400" },
};

export default function RoleSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const { addToast } = useToast();
  const { user } = useAuthStore();
  const hasRedirected = useRef(false);
  const [isAborting, setIsAborting] = useState(false);
  const [isAbortConfirmOpen, setIsAbortConfirmOpen] = useState(false);

  const {
    room,
    timeRemaining,
    isConnected,
    isLoading,
    isCompleted,
    navigationTarget,
    error,
    connect,
    disconnect,
    selectRole,
    cancelRole,
    extendTimer,
    hasExtended,
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
  } = useRoleSelectionStore();

  // connect/disconnect는 zustand 스토어 함수로 참조가 안정적이므로 dependency에서 제외
  useEffect(() => {
    if (roomId) connect(roomId);
    return () => disconnect();
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasRedirected.current) return;
    if (isCompleted) {
      hasRedirected.current = true;
      addToast("역할 선택 완료! 대진표로 이동합니다.", "success");
      router.push(navigationTarget ?? `/tournaments/${roomId}/bracket`);
    }
  }, [isCompleted, navigationTarget, roomId, router, addToast]);

  useEffect(() => {
    if (!sessionAbortedAt) return;
    addToast(sessionAbortMessage ?? "내전이 종료되어 로비로 이동합니다.", "warning");
    clearSessionAbort();
    // 사용자가 toast 메시지를 읽을 수 있도록 약간의 딜레이 후 이동
    const timer = setTimeout(() => router.push(`/tournaments/${roomId}/lobby`), 1500);
    return () => clearTimeout(timer);
  }, [sessionAbortedAt, sessionAbortMessage, clearSessionAbort, addToast, router, roomId]);

  const handleAbortToLobby = () => setIsAbortConfirmOpen(true);

  const handleAbortConfirm = async () => {
    setIsAbortConfirmOpen(false);
    setIsAborting(true);
    try {
      await roomApi.abortToLobby(roomId);
      addToast("내전을 종료하고 대기실로 복귀합니다.", "success");
      router.push(`/tournaments/${roomId}/lobby`);
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "내전 종료에 실패했습니다.",
        "error",
      );
    } finally {
      setIsAborting(false);
    }
  };

  const handleSelectRole = async (role: Role) => {
    try {
      await selectRole(roomId, role);
    } catch (err: any) {
      addToast(err.message || "역할 선택에 실패했습니다.", "error");
    }
  };

  const handleCancelRole = async () => {
    try {
      await cancelRole(roomId);
    } catch (err: any) {
      addToast(err.message || "역할 취소에 실패했습니다.", "error");
    }
  };

  const handleExtendTimer = async () => {
    try {
      await extendTimer(roomId);
      addToast("시간이 15초 연장됐습니다.", "success");
    } catch (err: any) {
      addToast(err.message || "시간 연장에 실패했습니다.", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">역할 선택 방에 연결 중...</p>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent-danger mb-4">{error}</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <p className="text-text-secondary">역할 선택 대기 중...</p>
      </div>
    );
  }

  const timerColor =
    timeRemaining <= 10
      ? "text-accent-danger"
      : timeRemaining <= 20
        ? "text-accent-warning"
        : "text-accent-primary";

  return (
    <div className="flex-grow p-4 md:p-8">
      <ConfirmModal
        isOpen={isAbortConfirmOpen}
        onClose={() => setIsAbortConfirmOpen(false)}
        onConfirm={handleAbortConfirm}
        title="내전 종료"
        message="현재 판을 종료하고 대기실로 돌아가시겠습니까? 이 판은 전적에 반영되지 않습니다."
        confirmText="종료"
        cancelText="취소"
        variant="danger"
        isLoading={isAborting}
      />
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
              역할 선택
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              원하는 포지션을 선택하세요. 시간 종료 시 선호 포지션으로 자동 배정됩니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="danger"
              size="sm"
              isLoading={isAborting}
              onClick={handleAbortToLobby}
            >
              내전 종료
            </Button>
            <Badge variant={isConnected ? "success" : "danger"}>
              {isConnected ? "● 연결됨" : "● 연결 끊김"}
            </Badge>
            <button
              onClick={handleExtendTimer}
              disabled={hasExtended || !isConnected}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all",
                hasExtended
                  ? "bg-bg-tertiary text-text-muted border-bg-tertiary cursor-not-allowed opacity-50"
                  : "bg-accent-primary/10 text-accent-primary border-accent-primary/30 hover:bg-accent-primary/20"
              )}
            >
              <TimerReset className="h-4 w-4" />
              {hasExtended ? "연장 사용됨" : "+15초"}
            </button>
            <div className="flex items-center gap-2 bg-bg-secondary border border-bg-tertiary rounded-xl px-4 py-2">
              <Clock className={cn("h-5 w-5", timerColor)} />
              <span className={cn("text-2xl font-bold tabular-nums", timerColor)}>
                {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-accent-danger/10 border border-accent-danger/30 rounded-lg text-sm text-accent-danger">
            {error}
          </div>
        )}

        {/* Teams */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {room.teams.map((team) => {
            const isMyTeam = team.members.some((m) => m.userId === user?.id);
            const takenRoles = team.members
              .filter((m) => m.assignedRole)
              .map((m) => m.assignedRole as Role);

            const myMember = team.members.find((m) => m.userId === user?.id);
            const myRole = myMember?.assignedRole as Role | null;

            return (
              <div
                key={team.id}
                className={cn(
                  "bg-bg-secondary border rounded-xl overflow-hidden",
                  isMyTeam ? "border-accent-primary" : "border-bg-tertiary"
                )}
              >
                {/* Team Header */}
                <div className={cn(
                  "px-5 py-3 flex items-center justify-between",
                  isMyTeam ? "bg-accent-primary/10" : "bg-bg-tertiary/50"
                )}>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-text-secondary" />
                    <h2 className="font-bold text-text-primary">{team.name}</h2>
                    {isMyTeam && (
                      <Badge variant="primary" size="sm">내 팀</Badge>
                    )}
                  </div>
                  <span className="text-xs text-text-tertiary">
                    {takenRoles.length}/{team.members.length} 선택 완료
                  </span>
                </div>

                {/* Members + Role Selection */}
                <div className="p-4 space-y-3">
                  {team.members.map((member) => {
                    const memberRole = member.assignedRole as Role | null;
                    const isMe = member.userId === user?.id;

                    return (
                      <div key={member.id} className="space-y-2">
                        <div className={cn(
                          "flex items-center gap-3 p-3 rounded-lg",
                          isMe ? "bg-accent-primary/5 border border-accent-primary/20" : "bg-bg-tertiary"
                        )}>
                          <Avatar
                            src={member.user.avatar}
                            alt={member.user.username}
                            fallback={member.user.username[0]}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm font-medium truncate",
                              isMe ? "text-accent-primary" : "text-text-primary"
                            )}>
                              {member.user.username}
                              {isMe && <span className="text-xs ml-1">(나)</span>}
                            </p>
                          </div>
                          {memberRole ? (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-accent-success/10 rounded-md">
                              <span>{ROLE_META[memberRole]?.icon}</span>
                              <span className="text-xs font-bold text-accent-success">
                                {ROLE_META[memberRole]?.label}
                              </span>
                              <Check className="h-3.5 w-3.5 text-accent-success" />
                            </div>
                          ) : (
                            <span className="text-xs text-text-tertiary px-2 py-1 bg-bg-secondary rounded-md">
                              미선택
                            </span>
                          )}
                        </div>

                        {/* Role buttons - 내 팀원이면 역할 변경 가능 (자동 배정 후에도) */}
                        {isMe && (
                          <div className="flex gap-1.5 pl-11">
                            {ROLES.map((role) => {
                              const takenByOther = team.members.some(
                                (m) => m.assignedRole === role && m.userId !== user?.id
                              );
                              const isMyCurrentRole = myRole === role;
                              const meta = ROLE_META[role];
                              return (
                                <button
                                  key={role}
                                  onClick={() => {
                                    if (isMyCurrentRole) {
                                      handleCancelRole();
                                    } else if (!takenByOther) {
                                      handleSelectRole(role);
                                    }
                                  }}
                                  disabled={takenByOther && !isMyCurrentRole || !isConnected}
                                  title={isMyCurrentRole ? "클릭해서 취소" : undefined}
                                  className={cn(
                                    "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-all",
                                    isMyCurrentRole
                                      ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/30 ring-1 ring-accent-primary/20 hover:bg-accent-danger/20 hover:text-accent-danger hover:border-accent-danger/30"
                                      : takenByOther
                                        ? "bg-bg-tertiary/50 text-text-muted cursor-not-allowed opacity-40"
                                        : "bg-bg-tertiary hover:bg-bg-elevated hover:scale-105 active:scale-95 cursor-pointer text-text-primary"
                                  )}
                                >
                                  <span className="text-lg">{meta.icon}</span>
                                  <span>{meta.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom info */}
        <div className="mt-6 text-center">
          <p className="text-text-tertiary text-sm">
            직접 선택하지 않으면 선호 포지션(주/부) 기준으로 자동 배정됩니다.
          </p>
        </div>
      </div>

      {/* 채팅 패널 (플로팅) */}
      <GameChatPanel roomId={roomId} />
    </div>
  );
}
