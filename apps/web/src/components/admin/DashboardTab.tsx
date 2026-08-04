"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import {
  Shield,
  Users,
  Home,
  Flag,
  Activity,
  Sword,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { StatCard, type AddToast } from "./shared";

export function DashboardTab({ addToast }: { addToast: AddToast }) {
  type SystemStatus = {
    status: "ok" | "degraded";
    timestamp: string;
    services: {
      database: { status: "healthy" | "unhealthy"; error?: string };
      redis: { status: "healthy" | "unhealthy"; error?: string };
    };
  };

  const [stats, setStats] = useState<any>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemStatusFailedAt, setSystemStatusFailedAt] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    const statsResult = await Promise.resolve(adminApi.getStats())
      .then((value) => ({ status: "fulfilled" as const, value }))
      .catch((reason) => ({ status: "rejected" as const, reason }));

    const systemStatusResult = await adminApi
      .getSystemStatus()
      .catch(() => null);

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
    } else {
      addToast("대시보드 통계 로드 실패", "error");
    }

    if (systemStatusResult) {
      setSystemStatus(systemStatusResult as SystemStatus);
      setSystemStatusFailedAt(null);
    } else {
      setSystemStatus(null);
      setSystemStatusFailedAt(new Date().toISOString());
    }

    setLoading(false);
  }, [addToast]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  if (!stats) return null;

  const serviceRows = [
    {
      label: "Web",
      status: "healthy" as const,
      detail: "관리자 페이지 응답 중",
    },
    {
      label: "API",
      status: systemStatus
        ? systemStatus.status === "ok"
          ? "healthy"
          : "unhealthy"
        : "unhealthy",
      detail: systemStatus ? "/api/health 응답" : "헬스체크 실패",
    },
    {
      label: "DB",
      status: systemStatus?.services.database.status ?? "unhealthy",
      detail: systemStatus?.services.database.error ?? "Postgres 연결",
    },
    {
      label: "Redis",
      status: systemStatus?.services.redis.status ?? "unhealthy",
      detail: systemStatus?.services.redis.error ?? "Redis 연결",
    },
  ];

  const lastStatusCheckedAt = systemStatus?.timestamp ?? systemStatusFailedAt;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">대시보드</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="가입 유저"
          value={stats.totalUsers}
          sub={
            stats.botUsers
              ? `봇 ${stats.botUsers.toLocaleString()}명 제외`
              : undefined
          }
        />
        <StatCard
          icon={<Home className="h-5 w-5" />}
          label="전체 방"
          value={stats.totalRooms}
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="활성 방"
          value={stats.activeRooms}
        />
        <StatCard
          icon={<Sword className="h-5 w-5" />}
          label="전체 매치"
          value={stats.totalMatches}
        />
        <StatCard
          icon={<Flag className="h-5 w-5" />}
          label="미처리 신고"
          value={stats.pendingReports}
          sub={`유저 ${stats.pendingUserReports ?? 0} / 게시글 ${stats.pendingPostReports ?? 0}`}
        />
        <StatCard
          icon={<Shield className="h-5 w-5" />}
          label="전체 클랜"
          value={stats.totalClans}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent-primary" />
              서비스 상태
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchDashboardStats}
              disabled={loading}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {serviceRows.map((service) => {
              const healthy = service.status === "healthy";
              return (
                <div
                  key={service.label}
                  className="rounded-lg bg-bg-tertiary/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">
                      {service.label}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        healthy
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {healthy ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {healthy ? "정상" : "확인 필요"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    {service.detail}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-text-muted">
            최근 확인:{" "}
            {lastStatusCheckedAt
              ? new Date(lastStatusCheckedAt).toLocaleString("ko-KR")
              : "-"}
          </p>
        </CardContent>
      </Card>

    </div>
  );
}
