"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { adminApi, appealApi } from "@/lib/api-client";
import { BoardsTab } from "@/components/admin/BoardsTab";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import {
  Shield,
  Users,
  Home,
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
  Flag,
  MessageSquare,
  Sword,
  BookOpen,
  Megaphone,
  Ban,
  CheckCircle,
  XCircle,
  Pin,
  Trash2,
  X,
  AlertTriangle,
  Database,
  RefreshCw,
  ChevronDown,
  Bot,
} from "lucide-react";

type Tab =
  | "dashboard"
  | "users"
  | "reports"
  | "community"
  | "clans"
  | "rooms"
  | "chatlogs"
  | "announcements"
  | "appeals"
  | "discord";

// MODERATOR(매니저)가 접근 가능한 탭 — 유저 관리는 제재 권한용으로 포함(밴/역할변경 UI는 ADMIN만 노출)
const MODERATOR_TABS: Tab[] = ["dashboard", "users", "reports", "community", "chatlogs", "appeals"];

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "대시보드", icon: <Activity className="h-4 w-4" /> },
  { id: "users", label: "유저 관리", icon: <Users className="h-4 w-4" /> },
  { id: "reports", label: "신고 관리", icon: <Flag className="h-4 w-4" /> },
  { id: "community", label: "커뮤니티", icon: <BookOpen className="h-4 w-4" /> },
  { id: "clans", label: "클랜 관리", icon: <Shield className="h-4 w-4" /> },
  { id: "rooms", label: "방 관리", icon: <Home className="h-4 w-4" /> },
  { id: "chatlogs", label: "채팅 로그", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "announcements", label: "공지 발송", icon: <Megaphone className="h-4 w-4" /> },
  { id: "appeals", label: "이의신청", icon: <Sword className="h-4 w-4" /> },
  { id: "discord", label: "디스코드 연동", icon: <MessageSquare className="h-4 w-4" /> },
];

export default function AdminPage() {
  // 권한 가드는 admin/layout.tsx에서 처리 (미인증/USER → notFound)
  const { user } = useAuthStore();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const isAdmin = user?.role === "ADMIN";

  const visibleTabs = isAdmin
    ? TABS
    : TABS.filter((tab) => MODERATOR_TABS.includes(tab.id));

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)]">
      {/* 사이드바 — 모바일에서는 상단 가로 스크롤 탭바, 데스크톱에서는 세로 사이드바 */}
      <aside className="md:w-48 flex-shrink-0 border-b md:border-b-0 md:border-r border-bg-tertiary bg-bg-secondary flex flex-col">
        <div className="hidden md:flex items-center gap-2 px-4 py-4 border-b border-bg-tertiary">
          <Shield className="h-5 w-5 text-accent-primary" />
          <span className="font-bold text-text-primary text-sm">관리자 패널</span>
        </div>
        <nav className="flex md:flex-col md:flex-1 overflow-x-auto md:overflow-x-visible scrollbar-none py-1 md:py-2">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors whitespace-nowrap flex-shrink-0 md:w-full ${
                activeTab === tab.id
                  ? "bg-accent-primary/10 text-accent-primary font-medium border-b-2 md:border-b-0 border-accent-primary"
                  : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {activeTab === "dashboard" && <DashboardTab addToast={addToast} />}
        {activeTab === "users" && <UsersTab addToast={addToast} currentUserId={user?.id} isAdmin={isAdmin} />}
        {activeTab === "reports" && <ReportsTab addToast={addToast} />}
        {activeTab === "community" && <CommunityTab addToast={addToast} isAdmin={isAdmin} />}
        {activeTab === "clans" && <ClansTab addToast={addToast} />}
        {activeTab === "rooms" && <RoomsTab addToast={addToast} />}
        {activeTab === "chatlogs" && <ChatLogsTab />}
        {activeTab === "announcements" && <AnnouncementsTab addToast={addToast} />}
        {activeTab === "appeals" && <AppealsTab addToast={addToast} />}
        {activeTab === "discord" && <DiscordGuildLinksTab addToast={addToast} />}
      </main>
    </div>
  );
}

// ── 공통 유틸 ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="text-accent-primary flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-text-muted text-xs truncate">{label}</p>
          <p className="text-xl font-bold text-text-primary">{value.toLocaleString()}</p>
          {sub && <p className="text-[10px] text-text-muted truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <Button variant="outline" size="sm" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-text-secondary">{page} / {totalPages}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-secondary border border-bg-tertiary rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-tertiary">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── 대시보드 ─────────────────────────────────────────────────────────────────

function DashboardTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
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
    matchStatsCacheSize: { ranked: number; normal: number; aram: number; custom: number; all: number };
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
  const [systemStatusFailedAt, setSystemStatusFailedAt] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState<MatchQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [fetchTriggeringGroup, setFetchTriggeringGroup] = useState<
    "ranked" | "normal" | "aram" | "custom" | "all" | null
  >(null);
  const [lastSeedingResult, setLastSeedingResult] = useState<SeedHighTiersResponse | null>(null);

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    setQueueLoading(true);

    const [statsResult, queueStatsResult] = await Promise.allSettled([
      adminApi.getStats(),
      adminApi.getMatchQueueStats(),
    ]);

    const systemStatusResult = await adminApi.getSystemStatus().catch(() => null);

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
      addToast(
        `매치 수집 수동 실행 완료 (${queueGroup ?? "all"})`,
        "success",
      );
      await fetchDashboardStats();
    } catch {
      addToast(
        `매치 수집 수동 실행 실패 (${queueGroup ?? "all"})`,
        "error",
      );
    } finally {
      setFetchTriggeringGroup(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!stats) return null;

  const serviceRows = [
    { label: "Web", status: "healthy" as const, detail: "관리자 페이지 응답 중" },
    {
      label: "API",
      status: systemStatus ? (systemStatus.status === "ok" ? "healthy" : "unhealthy") : "unhealthy",
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
        <StatCard icon={<Users className="h-5 w-5" />} label="전체 유저" value={stats.totalUsers} />
        <StatCard icon={<Home className="h-5 w-5" />} label="전체 방" value={stats.totalRooms} />
        <StatCard icon={<Activity className="h-5 w-5" />} label="활성 방" value={stats.activeRooms} />
        <StatCard icon={<Sword className="h-5 w-5" />} label="전체 매치" value={stats.totalMatches} />
        <StatCard icon={<Flag className="h-5 w-5" />} label="미처리 신고" value={stats.pendingReports} sub={`유저 ${stats.pendingUserReports ?? 0} / 게시글 ${stats.pendingPostReports ?? 0}`} />
        <StatCard icon={<Shield className="h-5 w-5" />} label="전체 클랜" value={stats.totalClans} />
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
              disabled={queueLoading || seeding || fetchTriggeringGroup !== null}
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
                <div key={service.label} className="rounded-lg bg-bg-tertiary/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">{service.label}</p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        healthy
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {healthy ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {healthy ? "정상" : "확인 필요"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-muted">{service.detail}</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-text-muted">
            최근 확인: {lastStatusCheckedAt ? new Date(lastStatusCheckedAt).toLocaleString("ko-KR") : "-"}
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
                disabled={queueLoading || seeding || fetchTriggeringGroup !== null}
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
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">KnownPuuid 전체</p>
                <p className="text-lg font-semibold text-text-primary">{queueStats.knownPuuids.total.toLocaleString()}</p>
                <p className="text-[11px] text-text-muted">Nexus {queueStats.knownPuuids.nexusUsers} / Seeded {queueStats.knownPuuids.seeded}</p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">Ranked 대기</p>
                <p className="text-lg font-semibold text-text-primary">{queueStats.fetchPending.ranked.total.toLocaleString()}</p>
                <p className="text-[11px] text-text-muted">Nexus {queueStats.fetchPending.ranked.nexus} / Seeded {queueStats.fetchPending.ranked.seeded}</p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">RiotMatchCache</p>
                <p className="text-lg font-semibold text-text-primary">{queueStats.riotMatchCacheSize.toLocaleString()}</p>
                <p className="text-[11px] text-text-muted">StatsQueue {queueStats.statsRecomputeQueueSize}</p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">비랭크 대기</p>
                <p className="text-lg font-semibold text-text-primary">{(queueStats.fetchPending.normal + queueStats.fetchPending.aram + queueStats.fetchPending.custom).toLocaleString()}</p>
                <p className="text-[11px] text-text-muted">N {queueStats.fetchPending.normal} / A {queueStats.fetchPending.aram} / C {queueStats.fetchPending.custom}</p>
              </div>
              <div className="rounded-lg bg-bg-tertiary/60 p-3">
                <p className="text-xs text-text-muted">Seeded 정책</p>
                <p className="text-lg font-semibold text-text-primary">
                  P{queueStats.seededPolicy.priority} · {queueStats.seededPolicy.slotCap} 슬롯
                </p>
                <p className="text-[11px] text-text-muted">
                  stale {queueStats.seededPolicy.staleHours}h / backfill {queueStats.seededPolicy.initialBackfillLimit}
                </p>
              </div>
            </div>
          )}

          {lastSeedingResult?.summary && (
            <div className="rounded-lg border border-bg-tertiary p-3 text-xs text-text-secondary">
              <p className="text-text-primary font-medium mb-2">최근 시딩 결과</p>
              <p>
                대상 {lastSeedingResult.summary.targetCount}명 (챌 {lastSeedingResult.summary.challengerCount}, 그마 {lastSeedingResult.summary.grandmasterCount}) ·
                추가 {lastSeedingResult.summary.insertedCount} · 갱신 {lastSeedingResult.summary.updatedCount} ·
                실패 {lastSeedingResult.summary.failedCount} · puuid 누락 {lastSeedingResult.summary.missingPuuidCount}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── 유저 관리 ─────────────────────────────────────────────────────────────────

type UserRole = "USER" | "MODERATOR" | "ADMIN";
type UserKindFilter = "users" | "bots" | "all";
type UserRoleFilter = "all" | UserRole;
type StreamerProfileSummary = {
  platform: "CHZZK" | "SOOP" | "YOUTUBE";
  channelUrl: string;
  channelName: string | null;
  isActive: boolean;
};
interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  isBot?: boolean;
  role: UserRole;
  isBanned: boolean;
  banReason: string | null;
  banUntil: string | null;
  isRestricted: boolean;
  restrictedUntil: string | null;
  createdAt: string;
  authProviders: { provider: string }[];
  riotAccounts: {
    id: string;
    gameName: string;
    tagLine: string;
    puuid?: string;
    tier: string;
    rank: string;
    isPrimary: boolean;
  }[];
  streamerProfiles?: StreamerProfileSummary[];
  _count: { reportsReceived: number };
}

const ROLE_LABELS: Record<UserRole, string> = {
  USER: "일반",
  MODERATOR: "매니저",
  ADMIN: "관리자",
};
const ROLE_VARIANTS: Record<UserRole, "default" | "primary" | "secondary" | "danger" | "gold"> = {
  USER: "default",
  MODERATOR: "secondary",
  ADMIN: "danger",
};
const USER_KIND_FILTERS: Array<{ value: UserKindFilter; label: string }> = [
  { value: "users", label: "일반 유저" },
  { value: "bots", label: "테스트 봇" },
  { value: "all", label: "전체" },
];
const USER_ROLE_FILTERS: Array<{ value: UserRoleFilter; label: string }> = [
  { value: "all", label: "전체 권한" },
  { value: "USER", label: "일반" },
  { value: "MODERATOR", label: "매니저" },
  { value: "ADMIN", label: "관리자" },
];

const BAN_REASONS = [
  { value: "욕설/비매너", label: "욕설/비매너" },
  { value: "의도적 게임 방해", label: "의도적 게임 방해" },
  { value: "핵/치팅 사용", label: "핵/치팅 사용" },
  { value: "잠수/이탈 반복", label: "잠수/이탈 반복" },
  { value: "부적절한 닉네임/콘텐츠", label: "부적절한 닉네임/콘텐츠" },
  { value: "스팸/도배", label: "스팸/도배" },
  { value: "OTHER", label: "직접 입력" },
] as const;


// 등록된 라이엇 계정 표시 — 주 계정만 노출, 추가 계정은 드롭다운으로 펼침
function RiotAccountsCell({ accounts }: { accounts: AdminUser["riotAccounts"] }) {
  const [open, setOpen] = useState(false);

  if (!accounts || accounts.length === 0) {
    return <span className="text-xs text-text-muted">-</span>;
  }

  // 주 계정 우선, 없으면 첫 번째
  const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
  const others = accounts.filter((a) => a.id !== primary.id);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => others.length > 0 && setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-xs ${
          others.length > 0 ? "hover:text-accent-primary cursor-pointer" : "cursor-default"
        } text-text-primary`}
      >
        <span className="font-medium">
          {primary.gameName}#{primary.tagLine}
        </span>
        {others.length > 0 && (
          <span className="flex items-center gap-0.5 text-text-muted">
            <span className="text-[10px]">+{others.length}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        )}
      </button>
      {open && others.length > 0 && (
        <>
          {/* 바깥 클릭 시 닫힘 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-bg-tertiary bg-bg-secondary shadow-lg py-1">
            {others.map((acc) => (
              <div key={acc.id} className="px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary/50">
                <span className="font-medium">{acc.gameName}#{acc.tagLine}</span>
                <span className="ml-2 text-text-muted">
                  {acc.tier}{acc.rank ? ` ${acc.rank}` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UsersTab({ addToast, currentUserId, isAdmin }: { addToast: (msg: string, type: "success" | "error") => void; currentUserId?: string; isAdmin: boolean }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<UserKindFilter>("users");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [banModal, setBanModal] = useState<AdminUser | null>(null);
  const [banReasonSelect, setBanReasonSelect] = useState("");
  const [banReasonCustom, setBanReasonCustom] = useState("");
  const [restrictModal, setRestrictModal] = useState<AdminUser | null>(null);
  const [restrictUntil, setRestrictUntil] = useState("");

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers({
        page,
        limit,
        search: search || undefined,
        kind,
        role: roleFilter === "all" ? undefined : roleFilter,
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      addToast("유저 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, kind, roleFilter, addToast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (u: AdminUser, role: UserRole) => {
    if (role === u.role) return;
    setUpdatingId(u.id);
    try {
      await adminApi.updateUserRole(u.id, role);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role } : x));
      addToast(`${u.username} 권한 변경 완료`, "success");
    } catch {
      addToast("권한 변경 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const resetBanForm = () => {
    setBanModal(null); setBanReasonSelect(""); setBanReasonCustom("");
  };

  const banReasonFinal = banReasonSelect === "OTHER" ? banReasonCustom : banReasonSelect;

  const handleBan = async () => {
    if (!banModal) return;
    setUpdatingId(banModal.id);
    try {
      await adminApi.banUser(banModal.id, banReasonFinal, undefined);
      setUsers((prev) => prev.map((x) => x.id === banModal.id ? { ...x, isBanned: true, banReason: banReasonFinal, banUntil: null } : x));
      addToast(`${banModal.username} 영구 밴 완료`, "success");
      resetBanForm();
    } catch {
      addToast("밴 처리 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUnban = async (u: AdminUser) => {
    setUpdatingId(u.id);
    try {
      await adminApi.unbanUser(u.id);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, isBanned: false, banReason: null, banUntil: null } : x));
      addToast(`${u.username} 밴 해제 완료`, "success");
    } catch {
      addToast("밴 해제 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRestrict = async () => {
    if (!restrictModal || !restrictUntil) return;
    setUpdatingId(restrictModal.id);
    try {
      await adminApi.restrictUser(restrictModal.id, restrictUntil);
      setUsers((prev) => prev.map((x) => x.id === restrictModal.id ? { ...x, isRestricted: true, restrictedUntil: restrictUntil } : x));
      addToast(`${restrictModal.username} 제재 완료`, "success");
      setRestrictModal(null); setRestrictUntil("");
    } catch {
      addToast("제재 처리 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUnrestrict = async (u: AdminUser) => {
    setUpdatingId(u.id);
    try {
      await adminApi.unrestrictUser(u.id);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, isRestricted: false, restrictedUntil: null } : x));
      addToast(`${u.username} 제재 해제 완료`, "success");
    } catch {
      addToast("제재 해제 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">유저 관리</h2>
          <p className="mt-1 text-xs text-text-muted">
            테스트용 봇과 실제 가입 유저를 분리해서 확인합니다.
          </p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }} className="flex gap-2">
          <input
            type="text" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름/이메일 검색..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-bg-tertiary text-text-primary text-sm w-48 focus:outline-none focus:border-accent-primary"
          />
          <Button type="submit" size="sm" variant="outline"><Search className="h-4 w-4" /></Button>
        </form>
      </div>
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex w-fit rounded-lg border border-bg-tertiary bg-bg-secondary p-1">
            {USER_KIND_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setKind(filter.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  kind === filter.value
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="inline-flex w-fit rounded-lg border border-bg-tertiary bg-bg-secondary p-1">
            {USER_ROLE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setRoleFilter(filter.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  roleFilter === filter.value
                    ? "bg-bg-tertiary text-text-primary"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-muted">
          {USER_KIND_FILTERS.find((filter) => filter.value === kind)?.label}
          {" · "}
          {USER_ROLE_FILTERS.find((filter) => filter.value === roleFilter)?.label}
          {" "}
          {total.toLocaleString()}명
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">유저</th>
                    <th className="text-left px-4 py-3 font-medium">롤 닉</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">신고</th>
                    <th className="text-left px-4 py-3 font-medium">권한</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-muted">
                        조건에 맞는 {kind === "bots" ? "테스트 봇" : "유저"}가 없습니다.
                      </td>
                    </tr>
                  ) : users.map((u) => {
                    const canModerateUser = isAdmin || u.role === "USER";

                    return (
                    <tr key={u.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                      <td className="px-4 py-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-text-primary">{u.username}</span>
                            {u.isBot && (
                              <Badge variant="secondary" className="inline-flex items-center gap-1 text-[10px]">
                                <Bot className="h-3 w-3" />봇
                              </Badge>
                            )}
                            {(u.streamerProfiles ?? []).some((p) => p.isActive) && (
                              <Badge variant="gold" className="text-[10px]">
                                streamer
                              </Badge>
                            )}
                            {u.id === currentUserId && <span className="text-[10px] text-accent-primary">(나)</span>}
                          </div>
                          <p className="text-xs text-text-muted">{u.email ?? "-"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RiotAccountsCell accounts={u.riotAccounts} />
                      </td>
                      <td className="px-4 py-3">
                        {u.isBanned ? (
                          <Badge variant="danger" className="text-[10px]">밴</Badge>
                        ) : u.isRestricted ? (
                          <Badge variant="secondary" className="text-[10px]">제재</Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px]">정상</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs">
                        {u._count.reportsReceived > 0 ? (
                          <span className="text-red-400 font-medium">{u._count.reportsReceived}건</span>
                        ) : "없음"}
                      </td>
                      <td className="px-4 py-3">
                        {/* 권한 변경은 ADMIN만 가능. 매니저에게는 배지로만 표시 */}
                        {!isAdmin || u.id === currentUserId ? (
                          <Badge variant={ROLE_VARIANTS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                        ) : updatingId === u.id ? (
                          <LoadingSpinner />
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                            className="px-2 py-1 rounded bg-bg-tertiary text-text-primary text-xs focus:outline-none cursor-pointer"
                          >
                            <option value="USER">일반</option>
                            <option value="MODERATOR">매니저</option>
                            <option value="ADMIN">관리자</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.id !== currentUserId && canModerateUser && (
                          <div className="flex gap-1">
                            {/* 밴/밴해제는 ADMIN 전용. 매니저는 제재만 가능 */}
                            {isAdmin && (u.isBanned ? (
                              <Button size="sm" variant="outline" onClick={() => handleUnban(u)} disabled={updatingId === u.id}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />밴해제
                              </Button>
                            ) : (
                              <Button size="sm" variant="danger" onClick={() => setBanModal(u)}>
                                <Ban className="h-3.5 w-3.5 mr-1" />밴
                              </Button>
                            ))}
                            {u.isRestricted ? (
                              <Button size="sm" variant="outline" onClick={() => handleUnrestrict(u)} disabled={updatingId === u.id}>
                                해제
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => setRestrictModal(u)}>
                                <AlertTriangle className="h-3.5 w-3.5 mr-1" />제재
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>

      {/* 밴 모달 */}
      {banModal && (
        <Modal title={`${banModal.username} 밴`} onClose={resetBanForm}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">사유 *</label>
              <div className="flex flex-wrap gap-1.5">
                {BAN_REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setBanReasonSelect(r.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      banReasonSelect === r.value
                        ? "bg-red-500/20 text-red-400 border border-red-500/50"
                        : "bg-bg-tertiary text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {banReasonSelect === "OTHER" && (
                <input
                  type="text" value={banReasonCustom} onChange={(e) => setBanReasonCustom(e.target.value)}
                  placeholder="사유를 직접 입력하세요"
                  className="w-full mt-2 px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
              )}
            </div>
            <p className="text-xs text-red-400">영구 밴이 적용됩니다.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetBanForm}>취소</Button>
              <Button variant="danger" onClick={handleBan} disabled={!banReasonFinal.trim()}>영구 밴 적용</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 제재 모달 */}
      {restrictModal && (
        <Modal title={`${restrictModal.username} 제재`} onClose={() => { setRestrictModal(null); setRestrictUntil(""); }}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">제재 만료일 *</label>
              <input
                type="datetime-local" value={restrictUntil} onChange={(e) => setRestrictUntil(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setRestrictModal(null); setRestrictUntil(""); }}>취소</Button>
              <Button variant="danger" onClick={handleRestrict} disabled={!restrictUntil}>제재 적용</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── 신고 관리 ─────────────────────────────────────────────────────────────────

interface UserReportItem {
  id: string;
  category: "user";
  reason: string;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reporter: { id: string; username: string; avatar?: string };
  target: { id: string; username: string; avatar?: string; isBanned?: boolean };
  match?: { id: string } | null;
  /** 클랜 채팅 메시지 신고인 경우 해당 메시지 정보 */
  clanChatMessage?: { id: string; content: string; createdAt: string } | null;
}

interface PostReportItem {
  id: string;
  category: "post";
  reason: string;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reporter: { id: string; username: string; avatar?: string };
  targetLabel: string;
  post?: { id: string; title: string } | null;
  comment?: { id: string; content: string } | null;
}

type ReportItem = UserReportItem | PostReportItem;

const REPORT_CATEGORIES = [
  { key: "user", label: "유저 신고" },
  { key: "post", label: "게시글 신고" },
] as const;

const REASON_LABELS: Record<string, string> = {
  TOXICITY: "욕설/비매너",
  AFK: "잠수/이탈",
  GRIEFING: "고의 방해",
  CHEATING: "치팅/핵",
  SPAM: "스팸",
  HARASSMENT: "괴롭힘",
  INAPPROPRIATE: "부적절한 콘텐츠",
  MISINFORMATION: "허위 정보",
  OTHER: "기타",
};

function ReportsTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<"user" | "post">("user");
  const [status, setStatus] = useState<string>("PENDING");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<ReportItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNote, setReviewNote] = useState("");
  const [banWithApprove, setBanWithApprove] = useState(false);
  const [banReasonSelect, setBanReasonSelect] = useState("");
  const [banReasonCustom, setBanReasonCustom] = useState("");

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getReports({ page, limit, status: status || undefined, category });
      setReports(data.reports);
      setTotal(data.total);
    } catch {
      addToast("신고 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, category, addToast]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const resetReviewBanForm = () => {
    setReviewModal(null); setReviewNote(""); setBanWithApprove(false);
    setBanReasonSelect(""); setBanReasonCustom("");
  };

  const reportBanReasonFinal = banReasonSelect === "OTHER" ? banReasonCustom : banReasonSelect;

  const handleReview = async () => {
    if (!reviewModal) return;
    try {
      await adminApi.reviewReport(reviewModal.id, reviewStatus, reviewNote, reviewModal.category);
      // 승인 + 밴 체크 시 대상 유저 영구 밴 처리
      if (reviewStatus === "APPROVED" && banWithApprove && reviewModal.category === "user") {
        const target = (reviewModal as UserReportItem).target;
        const reason = reportBanReasonFinal || reviewNote || reviewModal.reason;
        try {
          await adminApi.banUser(target.id, reason, undefined);
          addToast(`${target.username} 영구 밴 처리 완료`, "success");
        } catch {
          addToast("신고는 처리됐으나 밴 적용 실패", "error");
        }
      }
      setReports((prev) => prev.map((r) => r.id === reviewModal.id ? { ...r, status: reviewStatus } : r));
      addToast("신고 처리 완료", "success");
      resetReviewBanForm();
    } catch {
      addToast("신고 처리 실패", "error");
    }
  };

  const handleQuickBan = async (target: { id: string; username: string }) => {
    try {
      await adminApi.banUser(target.id, "관리자 밴", undefined);
      addToast(`${target.username} 밴 완료`, "success");
      fetchReports();
    } catch {
      addToast("밴 처리 실패", "error");
    }
  };

  const handleQuickUnban = async (target: { id: string; username: string }) => {
    try {
      await adminApi.unbanUser(target.id);
      addToast(`${target.username} 밴 해제 완료`, "success");
      fetchReports();
    } catch {
      addToast("밴 해제 실패", "error");
    }
  };

  const STATUS_LABELS: Record<string, string> = { PENDING: "대기", APPROVED: "승인", REJECTED: "거부" };
  const STATUS_VARIANTS: Record<string, "default" | "secondary" | "danger"> = { PENDING: "secondary", APPROVED: "default", REJECTED: "danger" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">신고 관리</h2>
        <div className="flex items-center gap-2">
          <select
            value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none"
          >
            <option value="">전체</option>
            <option value="PENDING">대기</option>
            <option value="APPROVED">승인</option>
            <option value="REJECTED">거부</option>
          </select>
          <span className="text-text-muted text-xs">총 {total}건</span>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1 bg-bg-tertiary/50 p-1 rounded-lg w-fit">
        {REPORT_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => { setCategory(cat.key); setPage(1); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              category === cat.key
                ? "bg-accent-primary text-white"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : reports.length === 0 ? (
            <p className="text-center text-text-muted py-12">신고가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">신고자</th>
                    <th className="text-left px-4 py-3 font-medium">
                      {category === "user" ? "대상 유저" : "대상 콘텐츠"}
                    </th>
                    <th className="text-left px-4 py-3 font-medium">사유</th>
                    <th className="text-left px-4 py-3 font-medium">내용</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">날짜</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.reporter.avatar && (
                            <Image
                              src={r.reporter.avatar}
                              alt=""
                              width={20}
                              height={20}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span className="text-text-secondary">{r.reporter.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.category === "user" ? (
                          <div className="flex items-center gap-2">
                            {(r as UserReportItem).target.avatar && (
                              <Image
                                src={(r as UserReportItem).target.avatar!}
                                alt=""
                                width={20}
                                height={20}
                                className="w-5 h-5 rounded-full"
                              />
                            )}
                            <span className="font-medium text-text-primary">
                              {(r as UserReportItem).target.username}
                            </span>
                            {(r as UserReportItem).target.isBanned && (
                              <Badge variant="danger" className="text-[9px]">차단됨</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-secondary text-xs max-w-40 truncate block">
                            {(r as PostReportItem).targetLabel}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {REASON_LABELS[r.reason] ?? r.reason}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs max-w-48">
                        <span className="truncate block">{r.description || "-"}</span>
                        {/* 클랜 채팅 메시지 신고인 경우 태그 표시 */}
                        {r.category === "user" && (r as UserReportItem).clanChatMessage && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300">
                            클랜 채팅
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[r.status] ?? "default"} className="text-[10px]">
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {r.status === "PENDING" && (
                            <Button size="sm" variant="outline" onClick={() => setReviewModal(r)}>처리</Button>
                          )}
                          {r.category === "user" && (
                            (r as UserReportItem).target.isBanned ? (
                              <Button size="sm" variant="outline" onClick={() => handleQuickUnban((r as UserReportItem).target)}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />밴해제
                              </Button>
                            ) : (
                              <Button size="sm" variant="danger" onClick={() => handleQuickBan((r as UserReportItem).target)}>
                                <Ban className="h-3.5 w-3.5 mr-1" />밴
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>

      {reviewModal && (
        <Modal title="신고 처리" onClose={() => { setReviewModal(null); setReviewNote(""); }}>
          <div className="space-y-3">
            <div className="bg-bg-tertiary rounded-lg p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 text-text-muted text-xs">
                <Badge variant="secondary" className="text-[9px]">
                  {reviewModal.category === "user" ? "유저 신고" : "게시글 신고"}
                </Badge>
                <span>{REASON_LABELS[reviewModal.reason] ?? reviewModal.reason}</span>
              </div>
              <p className="text-text-primary">{reviewModal.description ?? reviewModal.reason}</p>
              {reviewModal.category === "user" && (
                <p className="text-text-muted text-xs">
                  대상: {(reviewModal as UserReportItem).target.username}
                </p>
              )}
              {reviewModal.category === "post" && (
                <p className="text-text-muted text-xs">
                  대상: {(reviewModal as PostReportItem).targetLabel}
                </p>
              )}
              {/* 클랜 채팅 메시지 신고인 경우 메시지 내용 표시 */}
              {reviewModal.category === "user" && (reviewModal as UserReportItem).clanChatMessage && (
                <div className="mt-2 bg-bg-secondary rounded-lg p-2 border border-bg-elevated">
                  <p className="text-[10px] text-text-muted mb-1">신고된 클랜 채팅 메시지</p>
                  <p className="text-xs text-text-secondary">
                    {(reviewModal as UserReportItem).clanChatMessage!.content}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {(["APPROVED", "REJECTED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setReviewStatus(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    reviewStatus === s
                      ? s === "APPROVED" ? "bg-green-500/20 text-green-400 border border-green-500/50" : "bg-red-500/20 text-red-400 border border-red-500/50"
                      : "bg-bg-tertiary text-text-muted"
                  }`}
                >
                  {s === "APPROVED" ? "승인 (제재)" : "거부"}
                </button>
              ))}
            </div>
            <textarea
              value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
              placeholder="검토 메모 (선택)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
            {/* 승인 시 밴 옵션 (유저 신고만) */}
            {reviewStatus === "APPROVED" && reviewModal.category === "user" && (
              <div className="space-y-2 border border-red-500/20 rounded-lg p-3 bg-red-500/5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={banWithApprove}
                    onChange={(e) => setBanWithApprove(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-red-400 font-medium">
                    대상 유저 ({(reviewModal as UserReportItem).target.username}) 밴 적용
                  </span>
                </label>
                {banWithApprove && (
                  <div className="space-y-2 pl-6 pt-1">
                    <label className="block text-xs text-text-muted">밴 사유</label>
                    <div className="flex flex-wrap gap-1.5">
                      {BAN_REASONS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setBanReasonSelect(r.value)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            banReasonSelect === r.value
                              ? "bg-red-500/20 text-red-400 border border-red-500/50"
                              : "bg-bg-tertiary text-text-muted hover:text-text-primary"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    {banReasonSelect === "OTHER" && (
                      <input
                        type="text" value={banReasonCustom} onChange={(e) => setBanReasonCustom(e.target.value)}
                        placeholder="사유를 직접 입력하세요"
                        className="w-full mt-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-red-500/50"
                      />
                    )}
                    <p className="text-[11px] text-red-400">영구 밴이 적용됩니다.</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetReviewBanForm}>취소</Button>
              <Button variant="primary" onClick={handleReview}>처리 완료</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── 커뮤니티 ─────────────────────────────────────────────────────────────────

interface AdminPost {
  id: string;
  title: string;
  isPinned: boolean;
  createdAt: string;
  author: { username: string };
  _count: { comments: number; likes: number };
}

/**
 * 커뮤니티 관리 탭 — 게시글 관리 + 게시판 관리를 서브탭으로 통합.
 * 게시판 관리는 ADMIN 전용이라 관리자에게만 서브탭을 노출한다.
 */
function CommunityTab({
  addToast,
  isAdmin,
}: {
  addToast: (msg: string, type: "success" | "error") => void;
  isAdmin: boolean;
}) {
  const [subTab, setSubTab] = useState<"posts" | "boards">("posts");

  const subTabs: { id: "posts" | "boards"; label: string }[] = [
    { id: "posts", label: "게시글" },
    ...(isAdmin ? [{ id: "boards" as const, label: "게시판" }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* 서브탭 네비게이션 */}
      <div className="flex gap-1 border-b border-border">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              subTab === t.id
                ? "border-accent-primary text-accent-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "posts" && <CommunityPostsTab addToast={addToast} />}
      {subTab === "boards" && isAdmin && <BoardsTab addToast={addToast} />}
    </div>
  );
}

/** 게시글 관리 (검색/고정/삭제) */
function CommunityPostsTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getPosts({ page, limit, search: search || undefined });
      setPosts(data.posts);
      setTotal(data.total);
    } catch {
      addToast("게시글 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, addToast]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleDelete = async (post: AdminPost) => {
    if (!confirm(`"${post.title}" 게시글을 삭제하시겠습니까?`)) return;
    try {
      await adminApi.deletePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      addToast("게시글 삭제 완료", "success");
    } catch {
      addToast("게시글 삭제 실패", "error");
    }
  };

  const handlePin = async (post: AdminPost) => {
    try {
      await adminApi.pinPost(post.id, !post.isPinned);
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, isPinned: !p.isPinned } : p));
      addToast(post.isPinned ? "고정 해제 완료" : "고정 완료", "success");
    } catch {
      addToast("고정 처리 실패", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">커뮤니티 관리</h2>
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }} className="flex gap-2">
          <input
            type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="제목 검색..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-48 focus:outline-none focus:border-accent-primary"
          />
          <Button type="submit" size="sm" variant="outline"><Search className="h-4 w-4" /></Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : posts.length === 0 ? (
            <p className="text-center text-text-muted py-12">게시글이 없습니다.</p>
          ) : (
            <>
              {/* 모바일: 가로 한 줄 압축형 (제목+작성자 한 줄, 아이콘 버튼) */}
              <div className="md:hidden divide-y divide-bg-tertiary/50">
                {posts.map((post) => (
                  <div key={post.id} className="flex items-center gap-2 px-3 py-2.5">
                    {post.isPinned && (
                      <Pin className="h-3.5 w-3.5 text-accent-primary flex-shrink-0" />
                    )}
                    {/* 제목 + 작성자/날짜 한 줄 */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {post.title}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        {post.author.username} · 댓글 {post._count.comments} · ♥ {post._count.likes} ·{" "}
                        {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    {/* 아이콘 액션 버튼 */}
                    <button
                      onClick={() => handlePin(post)}
                      className={cn(
                        "flex-shrink-0 rounded-md p-2 transition-colors",
                        post.isPinned
                          ? "text-accent-primary bg-accent-primary/10"
                          : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary",
                      )}
                      aria-label={post.isPinned ? "고정 해제" : "고정"}
                    >
                      <Pin className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(post)}
                      className="flex-shrink-0 rounded-md p-2 text-accent-danger hover:bg-accent-danger/10 transition-colors"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* 데스크톱: 테이블 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-bg-tertiary text-text-muted">
                      <th className="text-left px-4 py-3 font-medium">제목</th>
                      <th className="text-left px-4 py-3 font-medium">작성자</th>
                      <th className="text-left px-4 py-3 font-medium">댓글/좋아요</th>
                      <th className="text-left px-4 py-3 font-medium">날짜</th>
                      <th className="text-left px-4 py-3 font-medium">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr key={post.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {post.isPinned && <Pin className="h-3.5 w-3.5 text-accent-primary" />}
                            <span className="font-medium text-text-primary truncate max-w-64">{post.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{post.author.username}</td>
                        <td className="px-4 py-3 text-text-muted text-xs">
                          댓글 {post._count.comments} · 좋아요 {post._count.likes}
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs">
                          {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => handlePin(post)}>
                              <Pin className="h-3.5 w-3.5 mr-1" />{post.isPinned ? "해제" : "고정"}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => handleDelete(post)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── 클랜 관리 ─────────────────────────────────────────────────────────────────

interface AdminClan {
  id: string;
  name: string;
  tag: string;
  createdAt: string;
  owner: { username: string };
  _count: { members: number };
}

function ClansTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
  const [clans, setClans] = useState<AdminClan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchClans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getClans({ page, limit, search: search || undefined });
      setClans(data.clans);
      setTotal(data.total);
    } catch {
      addToast("클랜 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, addToast]);

  useEffect(() => { fetchClans(); }, [fetchClans]);

  const handleDelete = async (clan: AdminClan) => {
    if (!confirm(`"${clan.name}" 클랜을 삭제하시겠습니까?`)) return;
    try {
      await adminApi.deleteClan(clan.id);
      setClans((prev) => prev.filter((c) => c.id !== clan.id));
      addToast("클랜 삭제 완료", "success");
    } catch {
      addToast("클랜 삭제 실패", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">클랜 관리</h2>
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }} className="flex gap-2">
          <input
            type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="클랜명 검색..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-48 focus:outline-none focus:border-accent-primary"
          />
          <Button type="submit" size="sm" variant="outline"><Search className="h-4 w-4" /></Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : clans.length === 0 ? (
            <p className="text-center text-text-muted py-12">클랜이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">클랜명</th>
                    <th className="text-left px-4 py-3 font-medium">태그</th>
                    <th className="text-left px-4 py-3 font-medium">오너</th>
                    <th className="text-left px-4 py-3 font-medium">멤버</th>
                    <th className="text-left px-4 py-3 font-medium">생성일</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {clans.map((clan) => (
                    <tr key={clan.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                      <td className="px-4 py-3 font-medium text-text-primary">{clan.name}</td>
                      <td className="px-4 py-3"><Badge variant="default" className="text-[10px]">{clan.tag}</Badge></td>
                      <td className="px-4 py-3 text-text-secondary">{clan.owner.username}</td>
                      <td className="px-4 py-3 text-text-muted">{clan._count.members}명</td>
                      <td className="px-4 py-3 text-text-muted text-xs">
                        {new Date(clan.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="danger" onClick={() => handleDelete(clan)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── 방 관리 ───────────────────────────────────────────────────────────────────

interface AdminRoom {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  host: { username: string };
  _count: { participants: number };
}

function RoomsTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getRooms({ page, limit, status: status || undefined });
      setRooms(data.rooms);
      setTotal(data.total);
    } catch {
      addToast("방 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, addToast]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const handleClose = async (room: AdminRoom) => {
    if (!confirm(`"${room.name}" 방을 삭제하시겠습니까? 참가자는 방에서 제거됩니다.`)) return;
    try {
      await adminApi.closeRoom(room.id);
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      setTotal((prev) => Math.max(0, prev - 1));
      addToast("방 삭제 완료", "success");
    } catch {
      addToast("방 삭제 실패", "error");
    }
  };

  const STATUS_LABELS: Record<string, string> = { WAITING: "대기", IN_PROGRESS: "진행중", COMPLETED: "완료" };
  const STATUS_VARIANTS: Record<string, "default" | "secondary" | "danger"> = {
    WAITING: "secondary", IN_PROGRESS: "default", COMPLETED: "default",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">방 관리</h2>
        <select
          value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none"
        >
          <option value="">전체</option>
          <option value="WAITING">대기</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="COMPLETED">완료</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : rooms.length === 0 ? (
            <p className="text-center text-text-muted py-12">방이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">방 이름</th>
                    <th className="text-left px-4 py-3 font-medium">호스트</th>
                    <th className="text-left px-4 py-3 font-medium">참가자</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">생성일</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                      <td className="px-4 py-3 font-medium text-text-primary">{room.name}</td>
                      <td className="px-4 py-3 text-text-secondary">{room.host.username}</td>
                      <td className="px-4 py-3 text-text-muted">{room._count.participants}명</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[room.status] ?? "default"} className="text-[10px]">
                          {STATUS_LABELS[room.status] ?? room.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs">
                        {new Date(room.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="danger" onClick={() => handleClose(room)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          {room.status === "COMPLETED" ? "삭제" : "강제종료"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── 채팅 로그 ─────────────────────────────────────────────────────────────────

// DM·클랜 채팅은 개인정보보호법·통신비밀보호법상 임의 열람 위법 소지 → 제외
// 클랜 채팅은 신고 접수 건에 한해 신고 관리 탭에서 확인
type ChatLogCategory = "room";

interface ChatLog {
  id: string;
  category: ChatLogCategory;
  content: string;
  location: string;
  userId: string | null;
  username: string;
  avatar: string | null;
  createdAt: string;
}

// 방 채팅만 허용 (내전 진행 중 신고 대응 목적, 이용약관 고지됨)
const CHAT_CATEGORIES: { id: ChatLogCategory; label: string }[] = [
  { id: "room", label: "방 채팅" },
];

const LOCATION_HEADERS: Record<ChatLogCategory, string> = {
  room: "방",
};

function ChatLogsTab() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<ChatLogCategory>("room");
  const [roomName, setRoomName] = useState("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [userInput, setUserInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getChatLogs({
        page, limit,
        category,
        roomName: (category === "room" && roomName) ? roomName : undefined,
        userId: userId || undefined,
        search: search || undefined,
      });
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, category, roomName, userId, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleCategoryChange = (cat: ChatLogCategory) => {
    setCategory(cat);
    setPage(1);
    setRoomName("");
    setRoomInput("");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setRoomName(roomInput);
    setUserId(userInput);
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-text-primary">채팅 로그</h2>
        <span className="text-xs text-text-muted">총 {total.toLocaleString()}건</span>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-1 w-fit">
        {CHAT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              category === cat.id
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 필터 */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        {category === "room" && (
          <input
            type="text" value={roomInput} onChange={(e) => setRoomInput(e.target.value)}
            placeholder="방 이름..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-36 focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
        )}
        <input
          type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)}
          placeholder="유저 ID..."
          className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-44 focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <input
          type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          placeholder="내용 검색..."
          className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-40 focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <Button type="submit" size="sm" variant="outline"><Search className="h-4 w-4" /></Button>
        {(roomName || userId || search) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => {
            setRoomName(""); setUserId(""); setSearch("");
            setRoomInput(""); setUserInput(""); setSearchInput("");
            setPage(1);
          }}>
            <X className="h-4 w-4 mr-1" /> 초기화
          </Button>
        )}
      </form>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : logs.length === 0 ? (
            <p className="text-center text-text-muted py-12">채팅 로그가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium w-40">시간</th>
                    <th className="text-left px-4 py-3 font-medium w-32">{LOCATION_HEADERS[category]}</th>
                    <th className="text-left px-4 py-3 font-medium w-28">유저</th>
                    <th className="text-left px-4 py-3 font-medium">내용</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                      <td className="px-4 py-2.5 text-text-muted text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-secondary truncate max-w-[8rem]" title={log.location}>
                        {log.location}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {log.avatar ? (
                            <Image
                              src={log.avatar}
                              alt=""
                              width={20}
                              height={20}
                              className="w-5 h-5 rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-bg-tertiary" />
                          )}
                          <span className="text-text-secondary text-xs truncate max-w-[5rem]" title={log.username}>
                            {log.username}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-text-primary">
                        <p className="truncate max-w-lg" title={log.content}>{log.content}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

// ── 공지 발송 ─────────────────────────────────────────────────────────────────

function AnnouncementsTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      await adminApi.sendAnnouncement(title, message, link || undefined);
      addToast("공지가 전체 유저에게 발송되었습니다.", "success");
      setTitle(""); setMessage(""); setLink("");
    } catch {
      addToast("공지 발송 실패", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-text-primary">전체 공지 발송</h2>
      <Card>
        <CardContent className="p-5">
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1.5">제목 *</label>
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="공지 제목"
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">내용 *</label>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="공지 내용"
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">링크 (선택)</label>
              <input
                type="text" value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex gap-2 text-sm text-yellow-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>이 공지는 <strong>모든 가입 유저</strong>에게 알림으로 전송됩니다.</span>
            </div>
            <Button type="submit" disabled={!title.trim() || !message.trim() || sending} className="w-full">
              {sending ? <LoadingSpinner /> : <><Megaphone className="h-4 w-4 mr-2" />전체 공지 발송</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 이의신청 관리 탭 ─────────────────────────────────────────────────────────

function AppealsTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
  const [appeals, setAppeals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  // 처리 모달 상태
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  const LIMIT = 20;

  const fetchAppeals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appealApi.list({ page, limit: LIMIT, status: statusFilter || undefined });
      setAppeals(data.appeals);
      setTotal(data.total);
    } catch {
      addToast("이의신청 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, addToast]);

  useEffect(() => { fetchAppeals(); }, [fetchAppeals]);

  const handleReview = async (status: "APPROVED" | "REJECTED") => {
    if (!reviewTarget) return;
    setIsReviewing(true);
    try {
      await appealApi.review(reviewTarget.id, status, adminNote.trim() || undefined);
      addToast(status === "APPROVED" ? "이의신청을 승인했습니다. 제재가 해제되었습니다." : "이의신청을 거절했습니다.", "success");
      setReviewTarget(null);
      setAdminNote("");
      fetchAppeals();
    } catch (e: any) {
      addToast(e?.response?.data?.message ?? "처리 중 오류가 발생했습니다.", "error");
    } finally {
      setIsReviewing(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  const statusBadge = (s: string) => {
    if (s === "PENDING") return <Badge className="bg-yellow-500/20 text-yellow-400 border-0">심사중</Badge>;
    if (s === "APPROVED") return <Badge className="bg-green-500/20 text-green-400 border-0">승인</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 border-0">거절</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">이의신청 관리</h2>
        <div className="flex gap-2">
          {(["", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-accent-primary text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              {s === "" ? "전체" : s === "PENDING" ? "심사중" : s === "APPROVED" ? "승인" : "거절"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : appeals.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">이의신청이 없습니다.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-bg-tertiary">
              {appeals.map((appeal) => (
                <div key={appeal.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* 유저 정보 */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-text-primary text-sm">{appeal.user?.username}</span>
                        {statusBadge(appeal.status)}
                        {appeal.user?.isBanned && (
                          <span className="text-xs text-accent-danger">밴</span>
                        )}
                        {appeal.user?.isRestricted && (
                          <span className="text-xs text-accent-warning">임시제재</span>
                        )}
                      </div>
                      {/* 밴 사유 */}
                      {appeal.user?.banReason && (
                        <p className="text-xs text-text-muted mb-1">밴 사유: {appeal.user.banReason}</p>
                      )}
                      {/* 이의신청 사유 */}
                      <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{appeal.reason}</p>
                      {/* 관리자 메모 */}
                      {appeal.adminNote && (
                        <p className="text-xs text-text-muted mt-1">관리자 메모: {appeal.adminNote}</p>
                      )}
                      <p className="text-xs text-text-muted mt-1">
                        접수: {new Date(appeal.createdAt).toLocaleString("ko-KR")}
                        {appeal.reviewer && ` · 처리: ${appeal.reviewer.username}`}
                      </p>
                    </div>
                    {/* 처리 버튼 (PENDING만) */}
                    {appeal.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setReviewTarget(appeal); setAdminNote(""); }}
                      >
                        심사하기
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* 심사 모달 */}
      {reviewTarget && (
        <Modal title={`이의신청 심사 — ${reviewTarget.user?.username}`} onClose={() => setReviewTarget(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-muted mb-1">이의신청 사유</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap bg-bg-tertiary rounded-lg p-3">
                {reviewTarget.reason}
              </p>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">관리자 메모 (선택)</label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={3}
                placeholder="유저에게 전달할 메모 (선택)"
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-accent-success hover:bg-accent-success/80"
                onClick={() => handleReview("APPROVED")}
                disabled={isReviewing}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                승인 (제재 해제)
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-accent-danger text-accent-danger hover:bg-accent-danger/10"
                onClick={() => handleReview("REJECTED")}
                disabled={isReviewing}
              >
                <XCircle className="h-4 w-4 mr-1" />
                거절
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── 디스코드 길드 연동 (멀티 길드) ────────────────────────────────────────────

interface DiscordGuildLink {
  id: string;
  guildId: string;
  guildName: string | null;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  activatedAt: string | null;
  createdAt: string;
  owner: { id: string; username: string; avatar: string | null } | null;
  clan: { id: string; name: string; tag: string } | null;
}

const GUILD_STATUS_META: Record<
  DiscordGuildLink["status"],
  { label: string; variant: "default" | "secondary" | "danger" | "success" }
> = {
  PENDING: { label: "승인 대기", variant: "secondary" },
  ACTIVE: { label: "활성", variant: "success" },
  DISABLED: { label: "비활성", variant: "danger" },
};

function DiscordGuildLinksTab({ addToast }: { addToast: (msg: string, type: "success" | "error") => void }) {
  const [links, setLinks] = useState<DiscordGuildLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sendingTestAlert, setSendingTestAlert] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getDiscordGuildLinks();
      setLinks(data);
    } catch {
      addToast("길드 연동 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const handleApprove = async (link: DiscordGuildLink) => {
    setUpdatingId(link.id);
    try {
      await adminApi.approveDiscordGuildLink(link.id);
      setLinks((prev) => prev.map((l) => l.id === link.id ? { ...l, status: "ACTIVE", activatedAt: new Date().toISOString() } : l));
      addToast(`${link.guildName || link.guildId} 승인 완료`, "success");
    } catch (err: any) {
      addToast(err?.response?.data?.message || "승인 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDisable = async (link: DiscordGuildLink) => {
    setUpdatingId(link.id);
    try {
      await adminApi.disableDiscordGuildLink(link.id);
      setLinks((prev) => prev.map((l) => l.id === link.id ? { ...l, status: "DISABLED" } : l));
      addToast(`${link.guildName || link.guildId} 비활성화`, "success");
    } catch {
      addToast("비활성화 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSendTestAlert = async () => {
    setSendingTestAlert(true);
    try {
      await adminApi.sendDiscordTestAlert();
      addToast("Discord 테스트 알림을 전송했습니다.", "success");
    } catch (err: any) {
      addToast(err?.response?.data?.message || "Discord 테스트 알림 전송 실패", "error");
    } finally {
      setSendingTestAlert(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-text-primary">디스코드 길드 연동</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSendTestAlert}
            isLoading={sendingTestAlert}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            테스트 알림
          </Button>
          <Button size="sm" variant="outline" onClick={fetchLinks}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-text-muted">
        유저가 봇을 자신의 디스코드 서버에 추가하면 &quot;승인 대기&quot;로 등록됩니다. 승인하면 해당 서버에서 내전 채널이 생성됩니다.
      </p>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : links.length === 0 ? (
            <p className="text-center text-text-muted py-12 text-sm">연동된 길드가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">서버</th>
                    <th className="text-left px-4 py-3 font-medium">소유자</th>
                    <th className="text-left px-4 py-3 font-medium">클랜</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => {
                    const meta = GUILD_STATUS_META[link.status];
                    return (
                      <tr key={link.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                        <td className="px-4 py-3">
                          <span className="font-medium text-text-primary">{link.guildName || "(이름 미확인)"}</span>
                          <p className="text-xs text-text-muted font-mono">{link.guildId}</p>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{link.owner?.username ?? "-"}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {link.clan ? `[${link.clan.tag}] ${link.clan.name}` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {link.status !== "ACTIVE" && (
                              <Button size="sm" variant="outline" disabled={updatingId === link.id} onClick={() => handleApprove(link)}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />승인
                              </Button>
                            )}
                            {link.status !== "DISABLED" && (
                              <Button size="sm" variant="danger" disabled={updatingId === link.id} onClick={() => handleDisable(link)}>
                                <Ban className="h-3.5 w-3.5 mr-1" />비활성
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
