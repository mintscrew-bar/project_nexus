"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, LoadingSpinner, EmptyState, Badge, Button } from "@/components/ui";
import { Trophy, Swords, Clock, Calendar, Filter, RefreshCw } from "lucide-react";
import { matchApi } from "@/lib/api-client";

interface Team {
  id: string;
  name: string;
  members?: Array<{
    user: {
      id: string;
      username: string;
      avatar: string | null;
    };
  }>;
}

interface Match {
  id: string;
  roomId: string;
  teamA: Team | null;
  teamB: Team | null;
  winnerId: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  createdAt: string;
  completedAt: string | null;
  tournamentCode: string | null;
  room?: {
    id: string;
    name: string;
  };
}

type StatusFilter = "ALL" | "PENDING" | "IN_PROGRESS" | "COMPLETED";

export default function MatchesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const fetchMatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await matchApi.getUserMatches({
        status: statusFilter !== "ALL" ? statusFilter : undefined,
      });
      setMatches(data);
    } catch (err: any) {
      setError(err.message || "매치 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchMatches();
    }
  }, [isAuthenticated, authLoading, fetchMatches]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const getStatusBadge = (status: Match["status"]) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="default"><Clock className="h-3 w-3 mr-1" />대기 중</Badge>;
      case "IN_PROGRESS":
        return <Badge variant="primary"><Swords className="h-3 w-3 mr-1" />진행 중</Badge>;
      case "COMPLETED":
        return <Badge variant="success"><Trophy className="h-3 w-3 mr-1" />완료</Badge>;
    }
  };

  // Filtering is done on server-side now
  const filteredMatches = matches;

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">매치 목록 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
              <Swords className="h-8 w-8 text-accent-primary" />
              내 매치
            </h1>
            <p className="text-text-secondary mt-1">참여한 매치 기록을 확인하세요</p>
          </div>
          <Button variant="secondary" onClick={fetchMatches}>
            <RefreshCw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          <Filter className="h-4 w-4 text-text-secondary" />
          {(["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                statusFilter === status
                  ? "bg-accent-primary text-white"
                  : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {status === "ALL" && "전체"}
              {status === "PENDING" && "대기 중"}
              {status === "IN_PROGRESS" && "진행 중"}
              {status === "COMPLETED" && "완료"}
            </button>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-4 mb-6">
            <p className="text-accent-danger">{error}</p>
          </div>
        )}

        {/* Matches List */}
        {filteredMatches.length === 0 ? (
          <EmptyState
            icon={Swords}
            title="매치 기록이 없습니다"
            description="내전에 참여하면 매치 기록이 여기에 표시됩니다."
            action={{
              label: "내전 참여하기",
              onClick: () => router.push("/tournaments"),
            }}
          />
        ) : (
          <div className="space-y-4">
            {filteredMatches.map((match) => (
              <Card
                key={match.id}
                hoverable
                onClick={() => router.push(`/tournaments/${match.roomId}/bracket`)}
                className="cursor-pointer"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      {/* Team A */}
                      <div className="text-right min-w-[120px]">
                        <p className={`font-semibold ${
                          match.winnerId === match.teamA?.id ? "text-accent-success" : "text-text-primary"
                        }`}>
                          {match.teamA?.name || "TBD"}
                        </p>
                        {match.winnerId === match.teamA?.id && (
                          <Trophy className="h-4 w-4 text-accent-gold inline ml-1" />
                        )}
                      </div>

                      {/* VS */}
                      <div className="text-xl font-bold text-text-tertiary">
                        VS
                      </div>

                      {/* Team B */}
                      <div className="min-w-[120px]">
                        <p className={`font-semibold ${
                          match.winnerId === match.teamB?.id ? "text-accent-success" : "text-text-primary"
                        }`}>
                          {match.winnerId === match.teamB?.id && (
                            <Trophy className="h-4 w-4 text-accent-gold inline mr-1" />
                          )}
                          {match.teamB?.name || "TBD"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Room Name */}
                      {match.room && (
                        <span className="text-sm text-text-secondary">
                          {match.room.name}
                        </span>
                      )}

                      {/* Date */}
                      {(match.createdAt || match.completedAt) && (
                        <div className="text-sm text-text-secondary flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(match.completedAt || match.createdAt).toLocaleDateString("ko-KR")}
                        </div>
                      )}

                      {/* Status */}
                      {getStatusBadge(match.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Stats Summary */}
        {matches.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-text-secondary mb-1">총 경기</p>
                <p className="text-3xl font-bold text-text-primary">{matches.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-text-secondary mb-1">승리</p>
                <p className="text-3xl font-bold text-accent-success">
                  {matches.filter(m => m.status === "COMPLETED" && m.winnerId).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-text-secondary mb-1">진행 중</p>
                <p className="text-3xl font-bold text-accent-primary">
                  {matches.filter(m => m.status === "IN_PROGRESS").length}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
