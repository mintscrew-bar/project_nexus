"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRoleSelectionStore } from "@/stores/role-selection-store";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner, Badge, Avatar } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Clock, Check, Users } from "lucide-react";
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

  const {
    room,
    timeRemaining,
    isConnected,
    isLoading,
    isCompleted,
    error,
    connect,
    disconnect,
    selectRole,
  } = useRoleSelectionStore();

  useEffect(() => {
    if (roomId) connect(roomId);
    return () => disconnect();
  }, [roomId, connect, disconnect]);

  useEffect(() => {
    if (hasRedirected.current) return;
    if (isCompleted) {
      hasRedirected.current = true;
      addToast("역할 선택 완료! 대진표로 이동합니다.", "success");
      router.push(`/tournaments/${roomId}/bracket`);
    }
  }, [isCompleted, roomId, router, addToast]);

  const handleSelectRole = async (role: Role) => {
    try {
      await selectRole(roomId, role);
    } catch (err: any) {
      addToast(err.message || "역할 선택에 실패했습니다.", "error");
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
      : timeRemaining <= 30
        ? "text-accent-warning"
        : "text-accent-primary";

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
              역할 선택
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              각 팀원이 담당할 포지션을 선택하세요
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isConnected ? "success" : "danger"}>
              {isConnected ? "● 연결됨" : "● 연결 끊김"}
            </Badge>
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

                        {/* Role buttons - only for me, only if no role yet */}
                        {isMe && !myRole && (
                          <div className="flex gap-1.5 pl-11">
                            {ROLES.map((role) => {
                              const taken = takenRoles.includes(role);
                              const meta = ROLE_META[role];
                              return (
                                <button
                                  key={role}
                                  onClick={() => handleSelectRole(role)}
                                  disabled={taken || !isConnected}
                                  className={cn(
                                    "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-all",
                                    taken
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
            시간이 만료되면 남은 역할이 자동으로 배정됩니다
          </p>
        </div>
      </div>
    </div>
  );
}
