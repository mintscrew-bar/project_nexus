"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { io, Socket } from "socket.io-client";
import { Users, Clock, CheckCircle, ExternalLink } from "lucide-react";
import Image from "next/image";

type Role = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

interface User {
  id: string;
  username: string;
  avatar: string | null;
}

interface TeamMember {
  id: string;
  userId: string;
  assignedRole: Role | null;
  user: User;
}

interface Team {
  id: string;
  name: string;
  color: string;
  members: TeamMember[];
}

interface DiscordChannel {
  channelId: string;
  channelName: string;
  teamId: string | null;
}

interface RoomData {
  id: string;
  name: string;
  teams: Team[];
  discordChannels: DiscordChannel[];
}

const ROLE_LABELS: Record<Role, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

const ROLE_COLORS: Record<Role, string> = {
  TOP: "bg-blue-600",
  JUNGLE: "bg-green-600",
  MID: "bg-yellow-600",
  ADC: "bg-red-600",
  SUPPORT: "bg-purple-600",
};

export default function RoleSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const { user: currentUser, token } = useAuthStore();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(120); // 2 minutes in seconds
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    if (!token || !roomId) return;

    const socketInstance = io(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/role-selection`,
      {
        auth: { token },
        transports: ["websocket"],
      }
    );

    socketInstance.on("connect", () => {
      console.log("Connected to role selection");
      setIsConnected(true);
      socketInstance.emit("join-room", { roomId });
    });

    socketInstance.on("disconnect", () => {
      console.log("Disconnected from role selection");
      setIsConnected(false);
    });

    socketInstance.on("join-room", (data: any) => {
      if (data.room) {
        setRoom(data.room);
        setTimeRemaining(Math.floor(data.timeRemaining / 1000));
      }
    });

    socketInstance.on("role-selected", (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          teams: prev.teams.map((team) => {
            if (team.id !== data.teamId) return team;

            return {
              ...team,
              members: team.members.map((member) =>
                member.id === data.memberId
                  ? { ...member, assignedRole: data.role }
                  : member
              ),
            };
          }),
        };
      });
    });

    socketInstance.on("timer-tick", (data: any) => {
      setTimeRemaining(Math.floor(data.timeRemaining / 1000));
    });

    socketInstance.on("role-selection-completed", () => {
      router.push(`/tournaments/${roomId}/bracket`);
    });

    socketInstance.on("role-selection-timeout", (data: any) => {
      setError(data.message);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token, roomId, router]);

  const handleSelectRole = (role: Role) => {
    if (!socket || !isConnected) return;

    socket.emit("select-role", { roomId, role });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getCurrentUserTeam = () => {
    if (!room || !currentUser) return null;

    return room.teams.find((team) =>
      team.members.some((member) => member.userId === currentUser.id)
    );
  };

  const getCurrentUserMember = () => {
    const team = getCurrentUserTeam();
    if (!team || !currentUser) return null;

    return team.members.find((member) => member.userId === currentUser.id);
  };

  const isRoleTaken = (teamId: string, role: Role) => {
    if (!room) return false;

    const team = room.teams.find((t) => t.id === teamId);
    if (!team) return false;

    const currentMember = getCurrentUserMember();
    return team.members.some(
      (member) => member.assignedRole === role && member.id !== currentMember?.id
    );
  };

  const allRolesSelected = () => {
    if (!room) return false;

    return room.teams.every((team) =>
      team.members.every((member) => member.assignedRole !== null)
    );
  };

  const getTeamDiscordChannel = (teamId: string) => {
    if (!room) return null;
    return room.discordChannels.find((ch) => ch.teamId === teamId);
  };

  if (!isConnected && !error) {
    return (
      <div className="flex-grow p-8 text-center text-text-secondary">
        <p>라인 선택 단계에 연결하는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow p-8 text-center">
        <p className="text-accent-danger mb-4">{error}</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex-grow p-8 text-center text-text-secondary">
        <p>방 정보를 기다리는 중...</p>
      </div>
    );
  }

  const currentUserTeam = getCurrentUserTeam();
  const currentUserMember = getCurrentUserMember();

  return (
    <div className="flex-grow p-8">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4 text-text-primary">
            라인 선택
          </h1>
          <div className="flex items-center justify-center gap-4 text-text-secondary">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span className="text-2xl font-mono font-bold">
                {formatTime(timeRemaining)}
              </span>
            </div>
            {allRolesSelected() && (
              <div className="flex items-center gap-2 text-accent-success">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">모든 라인 선택 완료!</span>
              </div>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {room.teams.map((team) => {
            const isCurrentUserTeam = team.id === currentUserTeam?.id;
            const discordChannel = getTeamDiscordChannel(team.id);

            return (
              <div
                key={team.id}
                className={`bg-bg-secondary border-2 rounded-xl p-6 ${
                  isCurrentUserTeam
                    ? "border-accent-primary"
                    : "border-bg-tertiary"
                }`}
              >
                {/* Team Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2
                    className="text-2xl font-bold"
                    style={{ color: team.color }}
                  >
                    {team.name}
                  </h2>
                  {discordChannel && (
                    <a
                      href={`https://discord.com/channels/${process.env.NEXT_PUBLIC_DISCORD_GUILD_ID}/${discordChannel.channelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      음성 채널
                    </a>
                  )}
                </div>

                {/* Team Members */}
                <div className="space-y-3">
                  {team.members.map((member) => {
                    const isCurrentMember = member.userId === currentUser?.id;

                    return (
                      <div
                        key={member.id}
                        className={`p-4 rounded-lg ${
                          isCurrentMember
                            ? "bg-accent-primary/10 border-2 border-accent-primary"
                            : "bg-bg-tertiary"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="relative w-10 h-10 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
                              {member.user.avatar ? (
                                <Image
                                  src={member.user.avatar}
                                  alt={member.user.username}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Users className="h-5 w-5 text-text-tertiary" />
                                </div>
                              )}
                            </div>
                            <span className="font-semibold text-text-primary">
                              {member.user.username}
                              {isCurrentMember && (
                                <span className="ml-2 text-xs text-accent-primary">
                                  (나)
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Selected Role Badge */}
                          {member.assignedRole && (
                            <div
                              className={`px-3 py-1 rounded-lg text-white font-medium text-sm ${
                                ROLE_COLORS[member.assignedRole]
                              }`}
                            >
                              {ROLE_LABELS[member.assignedRole]}
                            </div>
                          )}
                        </div>

                        {/* Role Selection (only for current user) */}
                        {isCurrentMember && !member.assignedRole && (
                          <div className="grid grid-cols-5 gap-2">
                            {(
                              Object.keys(ROLE_LABELS) as Role[]
                            ).map((role) => {
                              const isTaken = isRoleTaken(team.id, role);

                              return (
                                <button
                                  key={role}
                                  onClick={() => handleSelectRole(role)}
                                  disabled={isTaken}
                                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                                    isTaken
                                      ? "bg-bg-elevated text-text-tertiary cursor-not-allowed opacity-50"
                                      : `${ROLE_COLORS[role]} hover:opacity-80 text-white`
                                  }`}
                                >
                                  {ROLE_LABELS[role]}
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

        {/* Instructions */}
        <div className="mt-8 p-6 bg-bg-secondary border border-bg-tertiary rounded-xl text-center">
          <p className="text-text-secondary">
            {currentUserMember?.assignedRole
              ? "라인 선택이 완료되었습니다. 다른 팀원들을 기다리는 중..."
              : "원하는 라인을 선택해주세요. 팀원과 중복되지 않게 선택할 수 있습니다."}
          </p>
        </div>
      </div>
    </div>
  );
}
