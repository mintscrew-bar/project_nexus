"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore, type LabPeriod } from "@/stores/lab-store";
import { adminApi } from "@/lib/api-client";
import { Badge, LoadingSpinner } from "@/components/ui";
import { ArrowRight, FlaskConical, Info, ShieldAlert } from "lucide-react";

// 기간 필터 옵션
const LAB_PERIODS: Array<{ key: LabPeriod; label: string }> = [
  { key: "30d", label: "30일" },
  { key: "90d", label: "90일" },
  { key: "all", label: "전체" },
];

// 탭 최소 데이터 단계 요건
const LAB_TAB_MIN_PHASE: Record<string, number> = {
  "/lab": 0,
  "/lab/champions": 0,
  "/lab/compositions": 2,
  "/lab/oracle": 2,
};

// 탭 잠금 해제 필요 경기 수
const LAB_PHASE_MATCH_THRESHOLD: Record<number, number> = {
  0: 0,
  1: 10,
  2: 30,
  3: 100,
  4: 300,
};

const LAB_TABS = [
  { href: "/lab", label: "메타 레이더" },
  { href: "/lab/champions", label: "챔피언 분석" },
  { href: "/lab/compositions", label: "조합 분석" },
  { href: "/lab/oracle", label: "오라클" },
];

export default function LabLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod, setPeriod } = useLabStore();
  const isAdmin = user?.role === "ADMIN";
  const canFetch = !authLoading && isAuthenticated && isAdmin;

  // URL → store 동기화
  useEffect(() => {
    const fromUrl = searchParams.get("period") as LabPeriod | null;
    if (fromUrl && LAB_PERIODS.some((p) => p.key === fromUrl) && fromUrl !== activePeriod) {
      setPeriod(fromUrl);
    }
  }, [searchParams, activePeriod, setPeriod]);

  const { data: labDataPhase } = useQuery({
    queryKey: ["lab", "data-phase"] as const,
    queryFn: () => adminApi.getLabDataPhase(),
    staleTime: 5 * 60 * 1000,
    enabled: canFetch,
  });

  const currentPhase = labDataPhase?.phase ?? 0;

  function isTabUnlocked(href: string) {
    return currentPhase >= (LAB_TAB_MIN_PHASE[href] ?? 0);
  }

  function handlePeriodChange(period: LabPeriod) {
    setPeriod(period);
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.replace(`${pathname}?${params.toString()}`);
  }

  // 인증 로딩
  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // 접근 권한 없음
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="flex items-start gap-4 rounded-2xl border border-accent-warning/20 bg-accent-warning/5 p-6">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-accent-warning" />
          <div className="space-y-2">
            <p className="text-lg font-semibold text-text-primary">Lab 접근 권한 필요</p>
            <p className="text-sm leading-6 text-text-secondary">
              현재 Lab은 관리자 전용 연구 영역입니다. 접근 권한이 필요한 경우 운영진에게 요청해 주세요.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-bg-primary/70 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-elevated"
            >
              홈으로 이동
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-bg-primary">
      {/* 히어로 — 타이틀 + 탭 + 기간 필터 */}
      <header className="border-b border-bg-tertiary">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
          {/* 상단: 제목 + 비공개 배지 */}
          <div className="mb-5 flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-accent-primary" />
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              실험실 연구 대시보드
            </h1>
            <Badge variant="warning" size="sm">비공개 프리뷰</Badge>
          </div>

          {/* 단계 + 탭 + 기간 */}
          <div className="rounded-2xl border border-white/10 bg-bg-secondary/60 p-3 space-y-3">
            {/* 데이터 단계 정보 */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="group relative inline-flex">
                <Badge variant="secondary" size="sm">
                  데이터 단계 {currentPhase}
                </Badge>
                {/* 단계 설명 툴팁 */}
                <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-56 rounded-xl border border-white/10 bg-bg-elevated p-3 text-xs shadow-lg group-hover:block">
                  <p className="mb-1.5 font-semibold text-text-primary">데이터 단계 안내</p>
                  {[
                    { phase: 0, label: "0단계", desc: "표본 부족 (집계 전)" },
                    { phase: 1, label: "1단계", desc: "10경기 이상 — 기본 집계" },
                    { phase: 2, label: "2단계", desc: "30경기 이상 — 조합·오라클 해금" },
                    { phase: 3, label: "3단계", desc: "100경기 이상 — 신뢰도 분석" },
                    { phase: 4, label: "4단계", desc: "300경기 이상 — 풀 기능" },
                  ].map((row) => (
                    <div
                      key={row.phase}
                      className={`flex items-start gap-1.5 py-0.5 ${row.phase === currentPhase ? "text-accent-primary" : "text-text-tertiary"}`}
                    >
                      <span className="shrink-0 font-medium">{row.label}:</span>
                      <span>{row.desc}</span>
                    </div>
                  ))}
                </div>
                <Info className="ml-1 h-3 w-3 text-text-tertiary group-hover:text-text-secondary" />
              </div>
              <span className="text-text-tertiary">총 {labDataPhase?.totalMatches ?? 0}경기</span>
              {typeof labDataPhase?.remainingUntilNextPhase === "number" && labDataPhase.remainingUntilNextPhase > 0 ? (
                <span className="text-text-tertiary">
                  · 다음 단계까지 {labDataPhase.remainingUntilNextPhase}경기
                </span>
              ) : null}
            </div>

            {/* 탭 네비게이션 */}
            <nav className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
              {LAB_TABS.map((tab) => {
                const unlocked = isTabUnlocked(tab.href);
                // /lab/champions/[id] 등 하위 라우트에서도 탭이 활성화되도록
                const isActive = tab.href === "/lab"
                  ? pathname === "/lab"
                  : pathname.startsWith(tab.href);

                return unlocked ? (
                  <Link
                    key={tab.href}
                    href={`${tab.href}?period=${activePeriod}`}
                    className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? "bg-accent-primary/20 text-accent-primary"
                        : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
                    }`}
                  >
                    {tab.label}
                  </Link>
                ) : (
                  <span
                    key={tab.href}
                    className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-xl bg-bg-primary/60 px-3 py-2 text-sm font-semibold text-text-tertiary opacity-50"
                  >
                    {tab.label}
                    <Badge variant="secondary" size="sm">
                      {LAB_TAB_MIN_PHASE[tab.href]}단계 필요
                    </Badge>
                  </span>
                );
              })}
            </nav>

            {/* 잠긴 탭 경고 (잠긴 탭이 있을 때만) */}
            {LAB_TABS.some((tab) => !isTabUnlocked(tab.href)) ? (
              <div className="rounded-xl border border-accent-warning/20 bg-accent-warning/10 px-3 py-2 text-xs text-text-secondary">
                {LAB_TABS.filter((tab) => !isTabUnlocked(tab.href)).map((tab) => {
                  const required = LAB_TAB_MIN_PHASE[tab.href] ?? 0;
                  const threshold = LAB_PHASE_MATCH_THRESHOLD[required] ?? 0;
                  const current = labDataPhase?.totalMatches ?? 0;
                  return (
                    <span key={tab.href} className="mr-3">
                      {tab.label}: {threshold}경기 필요 (현재 {current}경기, {Math.max(threshold - current, 0)}경기 부족)
                    </span>
                  );
                })}
              </div>
            ) : null}

            {/* 기간 필터 */}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-text-tertiary">기간</span>
              {LAB_PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePeriodChange(p.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activePeriod === p.key
                      ? "bg-accent-info/20 text-accent-info"
                      : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* 각 탭 페이지 콘텐츠 */}
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        {children}
      </main>
    </div>
  );
}
