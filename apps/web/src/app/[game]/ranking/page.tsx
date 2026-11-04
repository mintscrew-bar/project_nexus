"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCurrentGame, useGamePrefix } from "@/hooks/useCurrentGame";
import { PubgRankingPage } from "./_PubgRankingPage";
import { rankingApi } from "@/lib/api-client";
import { Skeleton, Button, EmptyState } from "@/components/ui";
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  Users,
  Search,
  X,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { RankingTour } from "@/components/onboarding/PrimaryPageTours";
import { AdSlotCard } from "@/components/ads/AdSlot";
import { LolRankingRow, type LolRankingEntry } from "./_LolRankingRow";

/** 종합 + 라인별 탭. value 가 없으면 종합(nexus_rankings) */
const ROLE_TABS = [
  { value: undefined, label: "종합" },
  { value: "TOP", label: "탑" },
  { value: "JUNGLE", label: "정글" },
  { value: "MID", label: "미드" },
  { value: "ADC", label: "원딜" },
  { value: "SUPPORT", label: "서포터" },
] as const;
type RankingRole = Exclude<(typeof ROLE_TABS)[number]["value"], undefined>;

/**
 * 롤과 배그는 줄 세우는 기준 자체가 다르다 — 롤은 승률, 배그는 누적 포인트.
 * 같은 표에 올릴 수 없어 화면을 갈랐다.
 */
export default function RankingPage() {
  const game = useCurrentGame();
  if (game === "PUBG") return <PubgRankingPage />;
  return <LolRankingPage />;
}

function LolRankingPage() {
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"global" | "clan">("global");
  const [role, setRole] = useState<RankingRole | undefined>(undefined);
  const limit = 50;
  // 닉네임·소환사명 검색. 프로필의 "랭킹 #N" 링크가 ?q= 로 이름을 넘겨준다.
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search.trim(), 300);
  useEffect(() => {
    // 서버 렌더와 어긋나지 않게 마운트 뒤에 주소의 검색어를 읽는다
    const q = new URLSearchParams(window.location.search).get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setSearch(q);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["globalRanking", page, debouncedSearch, role ?? "ALL"],
    queryFn: () =>
      rankingApi.getGlobalRanking(
        page,
        limit,
        debouncedSearch || undefined,
        role,
      ),
    staleTime: 2 * 60 * 1000,
    // 검색어를 칠 때마다 목록이 스켈레톤으로 깜빡이지 않게 이전 결과를 잠시 보여준다
    placeholderData: (previous) => previous,
    enabled: tab === "global",
  });

  return (
    <div className="min-h-screen">
      <RankingTour />
      {/* Header */}
      <div className="border-b border-bg-tertiary bg-bg-secondary">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="h-8 w-8 text-accent-gold" />
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
              랭킹
            </h1>
          </div>
          <p className="text-text-secondary">
            Nexus 내전 기록 기반 랭킹 (1판만 해도 등록)
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            점수는 판수를 반영한 보정 승률입니다 — 모두에게 5판 분량의 50%를
            깔고 계산해, 몇 판 안 한 전승보다 많이 뛰고 많이 이긴 사람이 위로
            옵니다. KDA·챔피언은 기록이 수집된 내전 기준입니다.
          </p>

          {/* Tabs */}
          <div data-tour="ranking-tabs" className="flex gap-2 mt-4">
            <button
              onClick={() => {
                setTab("global");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "global"
                  ? "bg-accent-primary text-accent-on"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              <Trophy className="h-4 w-4 inline mr-1.5" />
              글로벌
            </button>
            <button
              onClick={() => {
                setTab("clan");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "clan"
                  ? "bg-accent-primary text-accent-on"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              <Users className="h-4 w-4 inline mr-1.5" />
              클랜
            </button>
          </div>
        </div>
      </div>

      <div
        data-tour="ranking-results"
        className="container mx-auto px-4 py-8 max-w-4xl"
      >
        {tab === "global" && (
          <>
            {/* 종합 → 라인별 탭. 라인 탭은 그 라인으로 뛴 경기만 따로 줄 세운다 */}
            <div
              role="tablist"
              aria-label="라인별 랭킹"
              className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-bg-secondary p-1"
            >
              {ROLE_TABS.map((item) => {
                const active = role === item.value;
                return (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setRole(item.value);
                      setPage(1);
                    }}
                    className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-accent-primary text-accent-on"
                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* 검색 — 순위 번호는 검색해도 전체 랭킹 기준 그대로 */}
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                maxLength={30}
                placeholder="닉네임 또는 소환사명으로 찾기"
                aria-label="랭킹 검색"
                className="w-full rounded-lg border border-bg-tertiary bg-bg-secondary py-2.5 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  aria-label="검색어 지우기"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-tertiary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 flex items-center gap-4"
                  >
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="flex-grow space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : debouncedSearch && (!data || data.rankings.length === 0) ? (
              <EmptyState
                icon={Search}
                title={`"${debouncedSearch}" 검색 결과가 없습니다`}
                description="내전을 한 판 이상 한 플레이어만 랭킹에 있습니다. 닉네임이나 소환사명을 다시 확인해 주세요."
              />
            ) : role && (!data || data.rankings.length === 0) ? (
              <EmptyState
                icon={Trophy}
                title="이 라인으로 기록된 내전이 아직 없습니다"
                description="라인별 랭킹은 역할 선택에서 이 라인으로 배정돼 끝까지 치른 내전만 셉니다."
              />
            ) : !data || data.rankings.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="아직 랭킹에 오른 플레이어가 없습니다"
                description="내전을 한 판만 해도 랭킹에 등록됩니다. 판수를 반영한 보정 승률 점수 순으로 줄을 세웁니다. 첫 기록을 만들어보세요."
                action={{
                  label: "내전 방 둘러보기",
                  onClick: () => router.push(`${gamePrefix}/tournaments`),
                }}
              />
            ) : (
              <>
                {/* 열 머리 — 넓은 화면에서 지표가 무엇인지 알려준다 */}
                <div className="mb-2 hidden items-center gap-4 px-4 text-[11px] text-text-tertiary sm:flex">
                  <span className="flex-grow pl-[100px]">플레이어</span>
                  <span className="hidden w-[84px] md:block">주력 챔피언</span>
                  <span className="w-[92px] text-center">평균 KDA</span>
                  <span className="w-[52px] text-center">MVP</span>
                  <span className="w-[68px] text-center">칭찬</span>
                  <span className="w-[76px] text-right">승률</span>
                  <span className="w-[64px] text-right">점수</span>
                </div>
                <div className="space-y-2">
                  {data.rankings.map((entry: LolRankingEntry) => (
                    <LolRankingRow
                      key={entry.id}
                      entry={entry}
                      href={`${gamePrefix}/matches/user/${entry.userId}`}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-6">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-text-secondary">
                      {page} / {data.totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= data.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "clan" && (
          <EmptyState
            icon={Users}
            title="클랜별 랭킹은 클랜 페이지에서 확인할 수 있습니다"
            description="활동 중인 클랜을 찾아 가입하고 클랜원들과 내전 기록을 쌓아보세요."
            action={{
              label: "클랜 둘러보기",
              onClick: () => router.push("/clans?game=lol"),
            }}
          />
        )}

        {/* 광고 — 순위표를 다 본 뒤 */}
        <AdSlotCard slotKey="feed" minHeight={90} className="mt-8" />
      </div>
    </div>
  );
}
