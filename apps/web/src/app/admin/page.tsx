"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/ui/Toast";
import { DashboardTab } from "@/components/admin/DashboardTab";
import { UsersTab } from "@/components/admin/users/UsersTab";
import { ReportsTab } from "@/components/admin/users/ReportsTab";
import { AppealsTab } from "@/components/admin/users/AppealsTab";
import { ChatLogsTab } from "@/components/admin/users/ChatLogsTab";
import { CommunityTab } from "@/components/admin/content/CommunityTab";
import { AnnouncementsTab } from "@/components/admin/content/AnnouncementsTab";
import { StreamersTab } from "@/components/admin/content/StreamersTab";
import { MedalsTab } from "@/components/admin/content/MedalsTab";
import { ShopTab } from "@/components/admin/content/ShopTab";
import { ClansTab } from "@/components/admin/game/ClansTab";
import { RoomsTab } from "@/components/admin/game/RoomsTab";
import { MatchesTab } from "@/components/admin/game/MatchesTab";
import { ScrimsTab } from "@/components/admin/game/ScrimsTab";
import { StatsTab } from "@/components/admin/StatsTab";
import {
  AdminGameFilter,
  AdminGameScopeProvider,
} from "@/components/admin/game-scope";
import { DiscordGuildLinksTab } from "@/components/admin/system/DiscordGuildLinksTab";
import { BotCleanupTab } from "@/components/admin/system/BotCleanupTab";
import { AuditLogsTab } from "@/components/admin/system/AuditLogsTab";
import { ErrorLogsTab } from "@/components/admin/system/ErrorLogsTab";
import { RehearsalTab } from "@/components/admin/system/RehearsalTab";
import {
  Shield,
  Users,
  Home,
  Activity,
  Flag,
  MessageSquare,
  Sword,
  Swords,
  BookOpen,
  Megaphone,
  Radio,
  Bot,
  Crosshair,
  FlaskConical,
  Bug,
  ClipboardList,
  Trash2,
  Medal,
  BarChart3,
  ShoppingBag,
} from "lucide-react";
import { useResetOn } from "@/hooks/useResetOn";

type Tab =
  | "dashboard"
  | "stats"
  | "users"
  | "reports"
  | "community"
  | "clans"
  | "rooms"
  | "matches"
  | "scrims"
  | "chatlogs"
  | "announcements"
  | "streamers"
  | "medals"
  | "shop"
  | "appeals"
  | "discord"
  | "errors"
  | "audit"
  | "botcleanup"
  | "rehearsal";

interface TabItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  /**
   * 화면 안에 게임 필터 칩(전체/롤/배그)을 띄우는가.
   *
   * 예전엔 맨 위 공통·롤·배그 탭을 먼저 골라야 사이드바 메뉴가 바뀌었다(메뉴가 사라졌다
   * 나타나 헷갈렸다). 이제 메뉴는 기능별로 늘 같고, 두 게임 모두에 있는 화면(방·클랜·
   * 커뮤니티·스트리머·통계)만 화면 안에서 게임으로 거른다. 한 게임 전용 화면(롤 내전·배그
   * 스크림·경매 리허설)은 이름에 게임을 붙여 둔다.
   */
  gameFilter?: boolean;
}

/** 사이드바 그룹 — label이 null이면 헤더 없이 단독으로 표시한다. */
interface TabGroup {
  label: string | null;
  tabs: TabItem[];
}

// MODERATOR(매니저)가 접근 가능한 탭 — 유저 관리는 제재 권한용으로 포함(밴/역할변경 UI는 ADMIN만 노출)
// 내전 기록은 조회 전용이라 매니저에게도 연다.
const MODERATOR_TABS: Tab[] = [
  "dashboard",
  "stats",
  "users",
  "reports",
  "community",
  "matches",
  "scrims",
  "chatlogs",
  "appeals",
];

// 기능별 그룹 구성. 순서가 곧 사이드바 노출 순서다.
const TAB_GROUPS: TabGroup[] = [
  {
    label: null,
    tabs: [
      {
        id: "dashboard",
        label: "대시보드",
        icon: <Activity className="h-4 w-4" />,
      },
      {
        id: "stats",
        gameFilter: true,
        label: "통계",
        icon: <BarChart3 className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "유저·제재",
    tabs: [
      { id: "users", label: "유저 관리", icon: <Users className="h-4 w-4" /> },
      { id: "reports", label: "신고 관리", icon: <Flag className="h-4 w-4" /> },
      { id: "appeals", label: "이의신청", icon: <Sword className="h-4 w-4" /> },
      {
        id: "chatlogs",
        label: "채팅 로그",
        icon: <MessageSquare className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "콘텐츠",
    tabs: [
      {
        id: "community",
        gameFilter: true,
        label: "커뮤니티",
        icon: <BookOpen className="h-4 w-4" />,
      },
      {
        id: "announcements",
        label: "공지 발송",
        icon: <Megaphone className="h-4 w-4" />,
      },
      {
        id: "streamers",
        gameFilter: true,
        label: "스트리머",
        icon: <Radio className="h-4 w-4" />,
      },
      // 메달 경제 운영(Task 17) — 계정 공통이라 공통 범위, ADMIN 전용(MODERATOR_TABS 에 넣지 않음)
      {
        id: "medals",
        label: "메달·원장",
        icon: <Medal className="h-4 w-4" />,
      },
      {
        id: "shop",
        label: "상점 관리",
        icon: <ShoppingBag className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "게임 운영",
    tabs: [
      {
        id: "clans",
        gameFilter: true,
        label: "클랜 관리",
        icon: <Shield className="h-4 w-4" />,
      },
      {
        id: "rooms",
        gameFilter: true,
        label: "방 관리",
        icon: <Home className="h-4 w-4" />,
      },
      {
        id: "scrims",
        label: "배그 스크림 기록",
        icon: <Crosshair className="h-4 w-4" />,
      },
      {
        id: "matches",
        label: "롤 내전 기록",
        icon: <Swords className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "시스템",
    tabs: [
      {
        id: "audit",
        label: "관리 기록",
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        id: "errors",
        label: "오류 로그",
        icon: <Bug className="h-4 w-4" />,
      },
      {
        id: "discord",
        label: "디스코드 연동",
        icon: <Bot className="h-4 w-4" />,
      },
      {
        id: "botcleanup",
        label: "봇 정리",
        icon: <Trash2 className="h-4 w-4" />,
      },
      {
        id: "rehearsal",
        label: "롤 경매 리허설",
        icon: <FlaskConical className="h-4 w-4" />,
      },
    ],
  },
];

const ALL_TABS: TabItem[] = TAB_GROUPS.flatMap((group) => group.tabs);

const isAdminTab = (value: string | null): value is Tab =>
  !!value && ALL_TABS.some((tab) => tab.id === value);

function AdminPageInner() {
  // 권한 가드는 admin/layout.tsx에서 처리 (미인증/USER → notFound)
  const { user } = useAuthStore();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 방금 누른 탭 — 주소가 바뀌기 전 잠깐 동안만 쓴다(주소가 바뀌면 비워진다)
  const [pendingTab, setActiveTab] = useResetOn<Tab | null>(
    null,
    searchParams.toString(),
  );

  const isAdmin = user?.role === "ADMIN";

  // 권한으로 탭을 걸러내고, 남은 탭이 없는 그룹은 통째로 숨긴다. 게임으로는 거르지 않는다.
  const visibleGroups = useMemo(() => {
    return TAB_GROUPS.map((group) => ({
      ...group,
      tabs: group.tabs.filter(
        (tab) => isAdmin || MODERATOR_TABS.includes(tab.id),
      ),
    })).filter((group) => group.tabs.length > 0);
  }, [isAdmin]);

  const visibleTabIds = useMemo(
    () => visibleGroups.flatMap((group) => group.tabs.map((tab) => tab.id)),
    [visibleGroups],
  );

  /**
   * 탭을 URL 에 싣되 **다른 쿼리는 보존한다.**
   *
   * 전에는 `/admin?tab=…` 으로 통째로 갈아치웠다. 게임 범위(`?game=`)도 같은
   * URL 에 있으므로 그대로 두면 탭을 옮길 때마다 범위가 전체로 풀린다 —
   * 그러면 "전역" 스위치가 아니다.
   */
  const buildHref = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "dashboard") params.delete("tab");
      else params.set("tab", tab);
      const query = params.toString();
      return query ? `/admin?${query}` : "/admin";
    },
    [searchParams],
  );

  // 보일 탭은 주소(?tab=)에서 계산한다 — 예전엔 효과에서 setActiveTab 했다
  // (react-hooks/set-state-in-effect). 모르는 탭·권한 밖 탭은 대시보드.
  const tabParam = searchParams.get("tab");
  const urlTab: Tab =
    isAdminTab(tabParam) && visibleTabIds.includes(tabParam)
      ? tabParam
      : "dashboard";
  const activeTab: Tab = pendingTab ?? urlTab;

  // 모르는 탭·권한 밖 탭으로 들어오면 주소를 대시보드로 고친다
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== urlTab) {
      router.replace(buildHref("dashboard"), { scroll: false });
    }
  }, [searchParams, router, urlTab, buildHref]);
  const activeTabItem = ALL_TABS.find((tab) => tab.id === activeTab);

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      router.replace(buildHref(tab), { scroll: false });
    },
    [router, buildHref, setActiveTab],
  );

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 사이드바 — 모바일에서는 상단 가로 스크롤 탭바, 데스크톱에서는 세로 사이드바 */}
        <aside className="flex flex-shrink-0 flex-col border-b border-bg-tertiary bg-bg-secondary md:w-52 md:border-b-0 md:border-r">
          <div className="hidden flex-col gap-3 border-b border-bg-tertiary/80 px-4 py-4 md:flex">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-accent-primary" />
              <span className="font-bold text-text-primary text-sm">
                관리자 패널
              </span>
            </div>
          </div>
          <nav
            className="scrollbar-none flex gap-1 overflow-x-auto p-1.5 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-2"
            aria-label="관리자 메뉴"
          >
            {visibleGroups.map((group, groupIndex) => (
              <div key={group.label ?? "__root__"} className="contents">
                {/* 모바일(가로 탭바)에서는 그룹 헤더 대신 세로 구분선으로 경계를 표시 */}
                {groupIndex > 0 && (
                  <div
                    className="my-1.5 w-px flex-shrink-0 self-stretch bg-bg-tertiary md:hidden"
                    aria-hidden
                  />
                )}
                {group.label && (
                  <p className="hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted md:block">
                    {group.label}
                  </p>
                )}
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    aria-current={activeTab === tab.id ? "page" : undefined}
                    className={`flex flex-shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 md:w-full ${
                      activeTab === tab.id
                        ? "border-accent-primary/30 bg-bg-tertiary font-semibold text-accent-primary"
                        : "border-transparent text-text-secondary hover:-translate-y-px hover:border-bg-elevated hover:bg-bg-tertiary/70 hover:text-text-primary md:hover:translate-y-0 md:hover:translate-x-0.5"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* 메인 콘텐츠 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* 두 게임 모두에 있는 화면만 게임으로 거른다 */}
          {activeTabItem?.gameFilter && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs text-text-muted">게임</span>
              <AdminGameFilter />
            </div>
          )}
          {activeTab === "dashboard" && (
            <DashboardTab
              addToast={addToast}
              onNavigate={handleTabChange}
              canOpen={(tab) => visibleTabIds.includes(tab)}
            />
          )}
          {activeTab === "stats" && <StatsTab />}
          {activeTab === "users" && (
            <UsersTab
              addToast={addToast}
              currentUserId={user?.id}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === "reports" && <ReportsTab addToast={addToast} />}
          {activeTab === "appeals" && <AppealsTab addToast={addToast} />}
          {activeTab === "chatlogs" && <ChatLogsTab />}
          {activeTab === "errors" && <ErrorLogsTab />}
          {activeTab === "botcleanup" && <BotCleanupTab addToast={addToast} />}
          {activeTab === "audit" && <AuditLogsTab addToast={addToast} />}
          {activeTab === "community" && (
            <CommunityTab addToast={addToast} isAdmin={isAdmin} />
          )}
          {activeTab === "announcements" && (
            <AnnouncementsTab addToast={addToast} />
          )}
          {activeTab === "streamers" && <StreamersTab addToast={addToast} />}
          {activeTab === "medals" && <MedalsTab addToast={addToast} />}
          {activeTab === "shop" && <ShopTab addToast={addToast} />}
          {activeTab === "clans" && <ClansTab addToast={addToast} />}
          {activeTab === "rooms" && <RoomsTab addToast={addToast} />}
          {activeTab === "scrims" && (
            <ScrimsTab addToast={addToast} isAdmin={isAdmin} />
          )}
          {activeTab === "matches" && (
            <MatchesTab addToast={addToast} isAdmin={isAdmin} />
          )}
          {activeTab === "discord" && (
            <DiscordGuildLinksTab addToast={addToast} />
          )}
          {activeTab === "rehearsal" && <RehearsalTab addToast={addToast} />}
        </main>
      </div>
    </div>
  );
}

/**
 * 게임 범위를 관리자 화면 전체에 깔아 준다.
 *
 * 탭마다 드롭다운을 두면 탭을 옮길 때마다 다시 고르게 된다. 운영자는 보통
 * "지금은 배그를 본다" 상태로 여러 탭을 오간다.
 */
export default function AdminPage() {
  return (
    <AdminGameScopeProvider>
      <AdminPageInner />
    </AdminGameScopeProvider>
  );
}
