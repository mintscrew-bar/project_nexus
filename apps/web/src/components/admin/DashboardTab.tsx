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
  Database,
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

  type MatchQueueStats = {
    knownPuuids: { total: number; nexusUsers: number; seeded: number };
    fetchPending: {
      ranked: { total: number; nexus: number; seeded: number };
      normal: number;
      aram: number;
      custom: number;
    };
    seededPolicy: {
      priority: number;
      slotCap: number;
      staleHours: number;
      initialBackfillLimit: number;
    };
    riotMatchCacheSize: number;
    matchStatsCacheSize: {
      ranked: number;
      normal: number;
      aram: number;
      custom: number;
      all: number;
    };
    statsRecomputeQueueSize: number;
  };

  type SeedHighTiersResponse = {
    ok: boolean;
    skipped: boolean;
    reason?: string;
    summary?: {
      challengerCount: number;
      grandmasterCount: number;
      targetCount: number;
      insertedCount: number;
      updatedCount: number;
      failedCount: number;
      missingPuuidCount: number;
    };
  };

  const [stats, setStats] = useState<any>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemStatusFailedAt, setSystemStatusFailedAt] = useState<
    string | null
  >(null);
  const [queueStats, setQueueStats] = useState<MatchQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [fetchTriggeringGroup, setFetchTriggeringGroup] = useState<
    "ranked" | "normal" | "aram" | "custom" | "all" | null
  >(null);
  const [lastSeedingResult, setLastSeedingResult] =
    useState<SeedHighTiersResponse | null>(null);

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    setQueueLoading(true);

    const [statsResult, queueStatsResult] = await Promise.allSettled([
      adminApi.getStats(),
      adminApi.getMatchQueueStats(),
    ]);

    const systemStatusResult = await adminApi
      .getSystemStatus()
      .catch(() => null);

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
    } else {
      addToast("대시보드 통계 로드 실패", "error");
    }

    if (queueStatsResult.status === "fulfilled") {
      setQueueStats(queueStatsResult.value as MatchQueueStats);
    } else {
      addToast("매치 큐 통계 로드 실패", "error");
    }

    if (systemStatusResult) {
      setSystemStatus(systemStatusResult as SystemStatus);
      setSystemStatusFailedAt(null);
    } else {
      setSystemStatus(null);
      setSystemStatusFailedAt(new Date().toISOString());
    }

    setLoading(false);
    setQueueLoading(false);
  }, [addToast]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const handleSeedHighTiers = async () => {
    setSeeding(true);
    try {
      const result = (await adminApi.seedHighTiers()) as SeedHighTiersResponse;
      setLastSeedingResult(result);
      if (result.skipped) {
        addToast(`시딩 건너뜀: ${result.reason ?? "락 점유 중"}`, "error");
      } else {
        addToast("고티어 시딩 실행 완료", "success");
      }
      await fetchDashboardStats();
    } catch {
      addToast("고티어 시딩 실행 실패", "error");
    } finally {
      setSeeding(false);
    }
  };

  const handleTriggerFetch = async (
    queueGroup?: "ranked" | "normal" | "aram" | "custom",
  ) => {
    const label = queueGroup ?? "all";
    setFetchTriggeringGroup(label);
    try {
      await adminApi.triggerMatchFetch(queueGroup);
      addToast(`매치 수집 수동 실행 완료 (${queueGroup ?? "all"})`, "success");
      await fetchDashboardStats();
    } catch {
      addToast(`매치 수집 수동 실행 실패 (${queueGroup ?? "all"})`, "error");
    } finally {
      setFetchTriggeringGroup(null);
    }
  };

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
              disabled={
                queueLoading || seeding || fetchTriggeringGroup !== null
              }
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-accent-primary" />
              매치 수집 운영
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={fetchDashboardStats}
                disabled={
                  queueLoading || seeding || fetchTriggeringGroup !== null
                }
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                새로고침
              </Button>
              <Button
                size="sm"
                onClick={handleSeedHighTiers}
                disabled={seeding || fetchTriggeringGroup !== null}
              >
                {seeding ? "실행 중..." : "고티어 시딩 실행"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerFetch(undefined)}
              disabled={seeding || fetchTriggeringGroup !== null}
            >
              {fetchTriggeringGroup === "all" ? "실행 중..." : "전체 수집 실행"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerFetch("ranked")}
              disabled={seeding || fetchTriggeringGroup !== null}
            >
              {fetchTriggeringGroup === "ranked"
                ? "실행 중..."
                : "랭크 수집 실행"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerFetch("normal")}
              disabled={seeding || fetchTriggeringGroup !== null}
            >
              {fetchTriggeringGroup === "normal"
                ? "실행 중..."
                : "일반 수집 실행"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerFetch("aram")}
              disabled={seeding || fetchTriggeringGroup !== null}
            >
              {fetchTriggeringGroup === "aram"
                ? "실행 중..."
                : "칼바람 수집 실행"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerFetch("custom")}
              disabled={seeding || fetchTriggeringGroup !== null}
            >
              {fetchTriggeringGroup === "custom"
                ? "실행 중..."
                : "내전 수집 실행"}
            </Button>
          </div>

          {queueLoading || !queueStats ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">KnownPuuid 전체</p>
                <p className="text-lg font-semibold text-text-primary">
                  {queueStats.knownPuuids.total.toLocaleString()}
                </p>
                <p className="text-[11px] text-text-muted">
                  Nexus {queueStats.knownPuuids.nexusUsers} / Seeded{" "}
                  {queueStats.knownPuuids.seeded}
                </p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">Ranked 대기</p>
                <p className="text-lg font-semibold text-text-primary">
                  {queueStats.fetchPending.ranked.total.toLocaleString()}
                </p>
                <p className="text-[11px] text-text-muted">
                  Nexus {queueStats.fetchPending.ranked.nexus} / Seeded{" "}
                  {queueStats.fetchPending.ranked.seeded}
                </p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">RiotMatchCache</p>
                <p className="text-lg font-semibold text-text-primary">
                  {queueStats.riotMatchCacheSize.toLocaleString()}
                </p>
                <p className="text-[11px] text-text-muted">
                  StatsQueue {queueStats.statsRecomputeQueueSize}
                </p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">비랭크 대기</p>
                <p className="text-lg font-semibold text-text-primary">
                  {(
                    queueStats.fetchPending.normal +
                    queueStats.fetchPending.aram +
                    queueStats.fetchPending.custom
                  ).toLocaleString()}
                </p>
                <p className="text-[11px] text-text-muted">
                  N {queueStats.fetchPending.normal} / A{" "}
                  {queueStats.fetchPending.aram} / C{" "}
                  {queueStats.fetchPending.custom}
                </p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">Seeded 정책</p>
                <p className="text-lg font-semibold text-text-primary">
                  P{queueStats.seededPolicy.priority} ·{" "}
                  {queueStats.seededPolicy.slotCap} 슬롯
                </p>
                <p className="text-[11px] text-text-muted">
                  stale {queueStats.seededPolicy.staleHours}h / backfill{" "}
                  {queueStats.seededPolicy.initialBackfillLimit}
                </p>
              </div>
            </div>
          )}

          {lastSeedingResult?.summary && (
            <div className="rounded-lg border border-bg-tertiary p-3 text-xs text-text-secondary">
              <p className="text-text-primary font-medium mb-2">
                최근 시딩 결과
              </p>
              <p>
                대상 {lastSeedingResult.summary.targetCount}명 (챌{" "}
                {lastSeedingResult.summary.challengerCount}, 그마{" "}
                {lastSeedingResult.summary.grandmasterCount}) · 추가{" "}
                {lastSeedingResult.summary.insertedCount} · 갱신{" "}
                {lastSeedingResult.summary.updatedCount} · 실패{" "}
                {lastSeedingResult.summary.failedCount} · puuid 누락{" "}
                {lastSeedingResult.summary.missingPuuidCount}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
