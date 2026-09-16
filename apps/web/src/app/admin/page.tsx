"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { ClansTab } from "@/components/admin/game/ClansTab";
import { RoomsTab } from "@/components/admin/game/RoomsTab";
import { MatchesTab } from "@/components/admin/game/MatchesTab";
import { ScrimsTab } from "@/components/admin/game/ScrimsTab";
import {
  AdminGameScopeProvider,
  AdminGameSwitch,
  useAdminGameScope,
} from "@/components/admin/game-scope";
import type { GameTitle } from "@nexus/types";
import { DiscordGuildLinksTab } from "@/components/admin/system/DiscordGuildLinksTab";
import { ErrorLogsTab } from "@/components/admin/system/ErrorLogsTab";
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
  Bug,
} from "lucide-react";

type Tab =
  | "dashboard"
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
  | "appeals"
  | "discord"
  | "errors";

interface TabItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
  /**
   * 이 탭이 다루는 게임. 있으면 전역 스위치가 다른 게임일 때 숨긴다.
   *
   * 롤 내전(`Match`)과 배그 스크림(`Scrim`)은 진행 방식도 데이터도 달라
   * 탭이 갈렸다. "롤을 보는 중" 인데 배그 전용 탭이 남아 있으면 전역
   * 스위치가 전역이 아니게 된다. 비우면 게임과 무관한 탭이다.
   */
  game?: GameTitle;
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
        label: "스트리머",
        icon: <Radio className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "게임 운영",
    tabs: [
      { id: "clans", label: "클랜 관리", icon: <Shield className="h-4 w-4" /> },
      { id: "rooms", label: "방 관리", icon: <Home className="h-4 w-4" /> },
      {
        id: "scrims",
        label: "스크림 기록 (배그)",
        icon: <Crosshair className="h-4 w-4" />,
        game: "PUBG",
      },
      {
        id: "matches",
        game: "LOL",
        label: "내전 기록 (롤)",
        icon: <Swords className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "시스템",
    tabs: [
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
    ],
  },
];

const ALL_TABS: TabItem[] = TAB_GROUPS.flatMap((group) => group.tabs);

const isAdminTab = (value: string | null): value is Tab =>
  !!value && ALL_TABS.some((tab) => tab.id === value);

function AdminPageInner() {
  const { game } = useAdminGameScope();
  // 권한 가드는 admin/layout.tsx에서 처리 (미인증/USER → notFound)
  const { user } = useAuthStore();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const isAdmin = user?.role === "ADMIN";

  // 권한과 게임 범위로 탭을 걸러내고, 남은 탭이 없는 그룹은 통째로 숨긴다.
  const visibleGroups = useMemo(() => {
    return TAB_GROUPS.map((group) => ({
      ...group,
      tabs: group.tabs.filter(
        (tab) =>
          (isAdmin || MODERATOR_TABS.includes(tab.id)) &&
          // 게임 전용 탭은 그 게임을 보는 중이거나 전체일 때만 보인다.
          (!tab.game || !game || tab.game === game),
      ),
    })).filter((group) => group.tabs.length > 0);
  }, [isAdmin, game]);

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

  useEffect(() => {
    const tab = searchParams.get("tab");
    const nextTab =
      isAdminTab(tab) && visibleTabIds.includes(tab) ? tab : "dashboard";
    setActiveTab(nextTab);
    if (tab && tab !== nextTab) {
      router.replace(buildHref("dashboard"), { scroll: false });
    }
  }, [searchParams, router, visibleTabIds, buildHref]);

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      router.replace(buildHref(tab), { scroll: false });
    },
    [router, buildHref],
  );

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)]">
      {/* 사이드바 — 모바일에서는 상단 가로 스크롤 탭바, 데스크톱에서는 세로 사이드바 */}
      <aside className="flex flex-shrink-0 flex-col border-b border-bg-tertiary bg-bg-secondary md:w-52 md:border-b-0 md:border-r">
        <div className="hidden flex-col gap-3 border-b border-bg-tertiary/80 px-4 py-4 md:flex">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent-primary" />
            <span className="font-bold text-text-primary text-sm">
              관리자 패널
            </span>
          </div>
          {/* 전역 게임 범위. 여기서 한 번 정하면 아래 탭들이 따라간다 —
              탭을 옮길 때마다 다시 고르지 않아도 된다. */}
          <AdminGameSwitch />
        </div>
        {/* 모바일에서는 가로 탭바 위에 한 줄로 */}
        <div className="flex items-center justify-end border-b border-bg-tertiary/80 px-3 py-2 md:hidden">
          <AdminGameSwitch />
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
        {activeTab === "dashboard" && <DashboardTab addToast={addToast} />}
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
        {activeTab === "community" && (
          <CommunityTab addToast={addToast} isAdmin={isAdmin} />
        )}
        {activeTab === "announcements" && (
          <AnnouncementsTab addToast={addToast} />
        )}
        {activeTab === "streamers" && <StreamersTab addToast={addToast} />}
        {activeTab === "clans" && <ClansTab addToast={addToast} />}
        {activeTab === "rooms" && <RoomsTab addToast={addToast} />}
        {activeTab === "scrims" && <ScrimsTab addToast={addToast} />}
        {activeTab === "matches" && <MatchesTab addToast={addToast} />}
        {activeTab === "discord" && (
          <DiscordGuildLinksTab addToast={addToast} />
        )}
      </main>
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
