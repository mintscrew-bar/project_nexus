"use client";

import { useEffect } from "react";
import { adminApi, appealApi, type AdminDailyStat } from "@/lib/api-client";
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
  Activity,
  Sword,
  CheckCircle,
  XCircle,
  RefreshCw,
  UserPlus,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import { StatCard, makeDelta, type AddToast } from "./shared";
import { GAMES, type GameTitle } from "@nexus/types";
import { useQuery } from "@tanstack/react-query";

/** 대시보드에서 눌러서 갈 수 있는 화면 */
export type DashboardTarget =
  | "users"
  | "reports"
  | "appeals"
  | "rooms"
  | "clans"
  | "matches"
  | "scrims"
  | "streamers"
  | "stats";

/** /admin/stats 응답 중 대시보드가 쓰는 것 */
interface AdminStats {
  totalUsers: number;
  botUsers?: number;
  totalRooms: number;
  activeRooms: number;
  totalMatches: number;
  totalScrims?: number;
  pendingReports: number;
  pendingUserReports?: number;
  pendingPostReports?: number;
  totalClans: number;
  game: {
    waitingRooms: number;
    inProgressRooms: number;
    newRooms7d: number;
    totalRecords: number;
    records7d: number;
    needsAttention: number;
    needsAttentionLabel: string;
    linkedAccounts: number;
    streamers: number;
    pendingStreamers: number;
    posts7d: number;
  } | null;
}

const GAME_KEYS: GameTitle[] = ["LOL", "PUBG"];

/** 최근 n일 합계와 그 앞 n일 합계 — 기록이 없으면 null */
function splitSum(
  rows: AdminDailyStat[] | undefined,
  key: "newUsers" | "roomsStarted",
  n: number,
): [number | null, number | null] {
  if (!rows?.length) return [null, null];
  const sum = (part: AdminDailyStat[]) => {
    const values = part
      .map((r) => r[key])
      .filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return [sum(rows.slice(-n)), sum(rows.slice(-2 * n, -n))];
}

/**
 * 관리자 대시보드 — "오늘 처리할 것" 과 지금 숫자.
 *
 * 추이(그래프·코호트·방 깔때기)는 「통계」 탭으로 옮겼다. 여기서는
 * 1) 처리 대기(신고·이의신청·결과 미수집·스트리머 승인)를 한눈에 보고 바로 그 화면으로 가고,
 * 2) 핵심 숫자 카드에 마우스를 올리면 게임별 내역·지난주 대비가 뜨며 누르면 관련 화면으로 간다.
 * 게임별 숫자는 롤·배그를 각각 물어 나란히 보여 준다(맨 위 게임 탭은 없앴다).
 */
export function DashboardTab({
  addToast,
  onNavigate,
  canOpen,
}: {
  addToast: AddToast;
  onNavigate: (tab: DashboardTarget) => void;
  /** 이 사람이 열 수 있는 화면인가(매니저는 일부만) */
  canOpen: (tab: DashboardTarget) => boolean;
}) {
  type SystemStatus = {
    status: "ok" | "degraded";
    timestamp: string;
    services: {
      database: { status: "healthy" | "unhealthy"; error?: string };
      redis: { status: "healthy" | "unhealthy"; error?: string };
    };
  };

  // 서버 조회는 React Query 로. 전체·롤·배그 통계, 시스템 상태, 지난 2주 일별 기록,
  // 이의신청 대기 수를 따로 묻는다(한쪽이 실패해도 다른 쪽은 보인다).
  const statsQuery = useQuery({
    queryKey: ["admin-dashboard-stats", "ALL"],
    queryFn: () => adminApi.getStats() as Promise<AdminStats>,
  });
  const lolQuery = useQuery({
    queryKey: ["admin-dashboard-stats", "LOL"],
    queryFn: () =>
      adminApi.getStats({ gameTitle: "LOL" }) as Promise<AdminStats>,
  });
  const pubgQuery = useQuery({
    queryKey: ["admin-dashboard-stats", "PUBG"],
    queryFn: () =>
      adminApi.getStats({ gameTitle: "PUBG" }) as Promise<AdminStats>,
  });
  const statusQuery = useQuery({
    queryKey: ["admin-system-status"],
    queryFn: () => adminApi.getSystemStatus() as Promise<SystemStatus>,
    retry: false,
  });
  // 지난주 대비 — 2주치 일별 기록을 앞뒤로 나눈다
  const usersSeries = useQuery({
    queryKey: ["admin-stats-series", "ALL", 14],
    queryFn: () =>
      adminApi.getStatsSeries("ALL", 14) as Promise<AdminDailyStat[]>,
  });
  const lolSeries = useQuery({
    queryKey: ["admin-stats-series", "LOL", 14],
    queryFn: () =>
      adminApi.getStatsSeries("LOL", 14) as Promise<AdminDailyStat[]>,
  });
  const pubgSeries = useQuery({
    queryKey: ["admin-stats-series", "PUBG", 14],
    queryFn: () =>
      adminApi.getStatsSeries("PUBG", 14) as Promise<AdminDailyStat[]>,
  });
  const appealsQuery = useQuery({
    queryKey: ["admin-dashboard-pending-appeals"],
    queryFn: async () =>
      ((await appealApi.list({ page: 1, limit: 1, status: "PENDING" }))
        ?.total ?? 0) as number,
    enabled: canOpen("appeals"),
  });

  const stats = statsQuery.data ?? null;
  const perGame: Record<GameTitle, AdminStats["game"]> = {
    LOL: lolQuery.data?.game ?? null,
    PUBG: pubgQuery.data?.game ?? null,
  };
  const perGameClans: Record<GameTitle, number | null> = {
    LOL: lolQuery.data?.totalClans ?? null,
    PUBG: pubgQuery.data?.totalClans ?? null,
  };
  const systemStatus = statusQuery.data ?? null;
  // 시스템 상태를 못 받은 시각 — 마지막 확인 시각으로 보여 준다
  const systemStatusFailedAt =
    statusQuery.isError && statusQuery.errorUpdatedAt
      ? new Date(statusQuery.errorUpdatedAt).toISOString()
      : null;
  const loading = statsQuery.isLoading || statusQuery.isLoading;
  const fetchDashboardStats = () => {
    void statsQuery.refetch();
    void lolQuery.refetch();
    void pubgQuery.refetch();
    void statusQuery.refetch();
    void appealsQuery.refetch();
  };
  useEffect(() => {
    if (statsQuery.isError) addToast("대시보드 통계 로드 실패", "error");
  }, [statsQuery.isError, addToast]);

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  if (!stats) return null;

  const label = (g: GameTitle) => GAMES[g].shortLabel;
  const n = (v: number | null | undefined) =>
    v == null ? "-" : v.toLocaleString();
  // 눌러서 갈 수 있으면 이동 함수, 아니면 없음(매니저가 못 여는 화면)
  const go = (tab: DashboardTarget) =>
    canOpen(tab) ? () => onNavigate(tab) : undefined;

  // ── 처리할 것 ──
  const todos: Array<{
    key: string;
    label: string;
    count: number | null;
    detail?: string;
    target: DashboardTarget;
  }> = [
    {
      key: "reports",
      label: "미처리 신고",
      count: stats.pendingReports,
      detail: `유저 ${stats.pendingUserReports ?? 0} · 게시글 ${stats.pendingPostReports ?? 0}`,
      target: "reports" as DashboardTarget,
    },
    {
      key: "appeals",
      label: "이의신청 대기",
      count: appealsQuery.data ?? null,
      target: "appeals" as DashboardTarget,
    },
    ...GAME_KEYS.map((g) => ({
      key: `attention-${g}`,
      label: `${label(g)} ${perGame[g]?.needsAttentionLabel ?? "확인 필요"}`,
      count: perGame[g]?.needsAttention ?? null,
      target: (g === "PUBG" ? "scrims" : "matches") as DashboardTarget,
    })),
    {
      key: "streamers",
      label: "스트리머 승인 대기",
      count:
        perGame.LOL || perGame.PUBG
          ? (perGame.LOL?.pendingStreamers ?? 0) +
            (perGame.PUBG?.pendingStreamers ?? 0)
          : null,
      detail: GAME_KEYS.map(
        (g) => `${label(g)} ${perGame[g]?.pendingStreamers ?? "-"}`,
      ).join(" · "),
      target: "streamers" as DashboardTarget,
    },
  ].filter((t) => canOpen(t.target));

  // ── 숫자 카드 ──
  const [newUsers7, newUsersPrev7] = splitSum(usersSeries.data, "newUsers", 7);
  const latestActive = usersSeries.data?.length
    ? usersSeries.data[usersSeries.data.length - 1]
    : null;
  const weekAgoActive =
    usersSeries.data && usersSeries.data.length >= 8
      ? usersSeries.data[usersSeries.data.length - 8]
      : null;
  const startedSplit = {
    LOL: splitSum(lolSeries.data, "roomsStarted", 7),
    PUBG: splitSum(pubgSeries.data, "roomsStarted", 7),
  };
  const sumBoth = (a: number | null, b: number | null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  const newRooms7 =
    perGame.LOL || perGame.PUBG
      ? (perGame.LOL?.newRooms7d ?? 0) + (perGame.PUBG?.newRooms7d ?? 0)
      : null;

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
      <div>
        <h2 className="text-lg font-semibold text-text-primary">대시보드</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          처리할 것과 지금 숫자입니다. 기간별 추이는 「통계」 탭에서 봅니다.
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <ListChecks className="h-4 w-4 text-accent-primary" />
            처리할 것
          </h3>
          <Button size="sm" variant="outline" onClick={fetchDashboardStats}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로고침
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {todos.map((t) => {
            const pending = (t.count ?? 0) > 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onNavigate(t.target)}
                className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  pending
                    ? "border-accent-primary/30 bg-accent-primary/[0.06] hover:bg-accent-primary/[0.12]"
                    : "border-bg-tertiary bg-bg-secondary hover:bg-bg-tertiary/50"
                }`}
              >
                <span
                  className={`min-w-[2.5rem] text-center text-xl font-bold tabular-nums ${
                    pending ? "text-accent-primary" : "text-text-muted"
                  }`}
                >
                  {t.count === null ? "-" : t.count.toLocaleString()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {t.label}
                  </span>
                  <span className="block truncate text-[11px] text-text-muted">
                    {pending ? (t.detail ?? "눌러서 처리") : "처리할 것 없음"}
                  </span>
                </span>
                {pending ? (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-primary" />
                ) : (
                  <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-400/70" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">
          지금 숫자
          <span className="ml-2 text-[11px] font-normal text-text-muted">
            카드에 마우스를 올리면 게임별 내역, 누르면 그 화면으로
          </span>
        </h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="가입 유저"
            value={stats.totalUsers}
            sub={
              stats.botUsers
                ? `봇 ${stats.botUsers.toLocaleString()}명 제외`
                : undefined
            }
            delta={makeDelta(
              newUsers7,
              newUsersPrev7,
              "신규 가입, 지난주 대비",
            )}
            details={[
              { label: "최근 7일 신규", value: n(newUsers7) },
              { label: "그 전 7일 신규", value: n(newUsersPrev7) },
              ...GAME_KEYS.map((g) => ({
                label: `${label(g)} 계정 연동`,
                value: n(perGame[g]?.linkedAccounts),
              })),
            ]}
            onClick={go("users")}
            actionLabel="유저 관리로"
          />
          <StatCard
            icon={<UserPlus className="h-5 w-5" />}
            label="일간 활성"
            value={latestActive?.active1d ?? "-"}
            sub={
              latestActive
                ? `${latestActive.date.slice(5, 10)} 기준`
                : undefined
            }
            delta={makeDelta(
              latestActive?.active1d,
              weekAgoActive?.active1d,
              "일주일 전 같은 날 대비",
            )}
            details={[
              { label: "주간 활성", value: n(latestActive?.active7d) },
              { label: "월간 활성", value: n(latestActive?.active30d) },
            ]}
            onClick={go("stats")}
            actionLabel="통계로"
          />
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            label="지금 열린 방"
            value={stats.activeRooms}
            details={GAME_KEYS.map((g) => ({
              label: label(g),
              value: perGame[g]
                ? `대기 ${perGame[g]!.waitingRooms} · 진행 ${perGame[g]!.inProgressRooms}`
                : "-",
            }))}
            onClick={go("rooms")}
            actionLabel="방 관리로"
          />
          <StatCard
            icon={<Home className="h-5 w-5" />}
            label="최근 7일 새 방"
            value={newRooms7 ?? "-"}
            sub={`전체 ${stats.totalRooms.toLocaleString()}개`}
            delta={makeDelta(
              sumBoth(startedSplit.LOL[0], startedSplit.PUBG[0]),
              sumBoth(startedSplit.LOL[1], startedSplit.PUBG[1]),
              "시작한 방, 지난주 대비",
            )}
            details={GAME_KEYS.flatMap((g) => [
              { label: `${label(g)} 새 방`, value: n(perGame[g]?.newRooms7d) },
              {
                label: `${label(g)} 시작한 방`,
                value: n(startedSplit[g][0]),
              },
            ])}
            onClick={go("rooms")}
            actionLabel="방 관리로"
          />
          <StatCard
            icon={<Sword className="h-5 w-5" />}
            label="경기 기록"
            value={stats.totalMatches + (stats.totalScrims ?? 0)}
            sub={`롤 내전 ${stats.totalMatches.toLocaleString()} · 배그 스크림 ${(stats.totalScrims ?? 0).toLocaleString()}`}
            details={GAME_KEYS.map((g) => ({
              label: `${label(g)} 최근 7일`,
              value: n(perGame[g]?.records7d),
            }))}
            onClick={go("matches")}
            actionLabel="롤 내전 기록으로"
          />
          <StatCard
            icon={<Shield className="h-5 w-5" />}
            label="클랜"
            value={stats.totalClans}
            details={GAME_KEYS.map((g) => ({
              label: label(g),
              value: n(perGameClans[g]),
            }))}
            onClick={go("clans")}
            actionLabel="클랜 관리로"
          />
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent-primary" />
              서비스 상태
            </CardTitle>
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
