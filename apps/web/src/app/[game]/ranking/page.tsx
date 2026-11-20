"use client";

import { userProfilePath } from "@/lib/profile-routes";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentGame, useGamePrefix } from "@/hooks/useCurrentGame";
import { PubgRankingPage } from "./_PubgRankingPage";
import { rankingApi } from "@/lib/api-client";
import { Skeleton, Button, EmptyState } from "@/components/ui";
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Users,
  Search,
  X,
  ArrowRight,
  LocateFixed,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { RankingTour } from "@/components/onboarding/PrimaryPageTours";
import { AdSlotCard } from "@/components/ads/AdSlot";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import {
  LolPodium,
  LolRankingRow,
  RANK_GRID,
  type LolRankingEntry,
} from "./_LolRankingRow";

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

/** 한 쪽에 보이는 인원 */
const LIMIT = 50;

/**
 * 롤과 배그는 줄 세우는 기준 자체가 다르다 — 롤은 승률, 배그는 누적 포인트.
 * 같은 표에 올릴 수 없어 화면을 갈랐다.
 */
export default function RankingPage() {
  const game = useCurrentGame();
  if (game === "PUBG") return <PubgRankingPage />;
  return <LolRankingPage />;
}

/** 내 종합 순위 (GET /ranking/user/:id) — 기록이 없으면 globalRank 가 null */
interface MyRanking {
  globalRank: number | null;
  score?: number;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
}

/**
 * 롤 랭킹 (2026-11-20 개편).
 * - 넓은 화면: 왼쪽 순위표(1~3위 시상대 + 4위부터 표), 오른쪽 고정 칸(내 순위·점수 계산법·클랜 랭킹)
 * - 좁은 화면: 오른쪽 칸 대신 아래에 내 순위 줄을 고정한다
 * - 시상대는 첫 쪽·검색 안 할 때만. 검색 중이면 1~3위도 표 줄로 보인다
 */
function LolRankingPage() {
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const me = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<RankingRole | undefined>(undefined);
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
        LIMIT,
        debouncedSearch || undefined,
        role,
      ),
    staleTime: 2 * 60 * 1000,
    // 검색어를 칠 때마다 목록이 스켈레톤으로 깜빡이지 않게 이전 결과를 잠시 보여준다
    placeholderData: (previous) => previous,
  });

  // 내 순위 — 종합 기준
  const myRank = useQuery<MyRanking>({
    queryKey: ["ranking", "me", me?.id],
    queryFn: () => rankingApi.getUserRanking(me!.id),
    enabled: Boolean(me?.id),
    staleTime: 2 * 60 * 1000,
  });
  const mine = myRank.data?.globalRank ? myRank.data : null;

  // 「내 자리로」 — 내 순위가 있는 쪽으로 옮긴 뒤, 목록이 그려지면 내 줄로 스크롤한다
  const jumpTo = useRef<string | null>(null);
  const goToMine = () => {
    if (!mine?.globalRank || !me) return;
    jumpTo.current = me.id;
    setSearch("");
    setRole(undefined);
    setPage(Math.ceil(mine.globalRank / LIMIT));
  };
  useEffect(() => {
    if (!jumpTo.current || !data) return;
    const el = document.getElementById(`rank-row-${jumpTo.current}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      jumpTo.current = null;
    }
  }, [data]);

  const rankings: LolRankingEntry[] = data?.rankings ?? [];
  // 시상대 — 첫 쪽이고 검색하지 않을 때만
  const showPodium = page === 1 && !debouncedSearch && rankings.length > 0;
  const podium = showPodium ? rankings.filter((e) => e.globalRank <= 3) : [];
  const rows = showPodium ? rankings.filter((e) => e.globalRank > 3) : rankings;
  const hrefFor = (e: LolRankingEntry) => userProfilePath(e.userId, "LOL");
  const roleLabel = ROLE_TABS.find((t) => t.value === role)?.label ?? "종합";

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <RankingTour />
      <div className="container mx-auto max-w-7xl px-4 py-6">
        {/* 머리 — 제목 한 줄 + 라인 탭·검색 */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
              <Trophy className="h-6 w-6 text-accent-gold" />
              랭킹
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Nexus 내전 기록으로 매기는 순위 · 1판만 해도 올라가요
            </p>
          </div>
          {data?.total != null && !debouncedSearch && (
            <p className="text-xs text-text-tertiary">
              {roleLabel} {Number(data.total).toLocaleString()}명
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
          {/* 종합 → 라인별 탭. 라인 탭은 그 라인으로 뛴 경기만 따로 줄 세운다 */}
          <div
            data-tour="ranking-tabs"
            role="tablist"
            aria-label="라인별 랭킹"
            className="flex gap-1 overflow-x-auto rounded-lg bg-bg-secondary p-1 md:flex-none"
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
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-semibold transition-colors md:flex-none",
                    active
                      ? "bg-accent-primary text-accent-on"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* 검색 — 순위 번호는 검색해도 전체 랭킹 기준 그대로 */}
          <div className="relative md:ml-auto md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              maxLength={30}
              placeholder="닉네임 또는 소환사명"
              aria-label="랭킹 검색"
              className="w-full rounded-lg bg-bg-secondary py-2 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary"
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
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_288px]">
          {/* ── 순위표 ── */}
          <div data-tour="ranking-results" className="min-w-0">
            {isLoading ? (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-64 rounded-xl" />
                  ))}
                </div>
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : debouncedSearch && rankings.length === 0 ? (
              <EmptyState
                icon={Search}
                title={`"${debouncedSearch}" 검색 결과가 없습니다`}
                description="내전을 한 판 이상 한 플레이어만 랭킹에 있습니다. 닉네임이나 소환사명을 다시 확인해 주세요."
              />
            ) : role && rankings.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="이 라인으로 기록된 내전이 아직 없습니다"
                description="라인별 랭킹은 역할 선택에서 이 라인으로 배정돼 끝까지 치른 내전만 셉니다."
              />
            ) : rankings.length === 0 ? (
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
                {podium.length > 0 && (
                  <div className="mb-5">
                    <LolPodium
                      entries={podium}
                      hrefFor={hrefFor}
                      myUserId={me?.id}
                    />
                  </div>
                )}

                {rows.length > 0 && (
                  <>
                    {/* 열 머리 — 줄과 같은 격자 */}
                    <div
                      className={cn(
                        RANK_GRID,
                        "mb-1.5 px-3 text-[11px] text-text-tertiary sm:px-4",
                      )}
                    >
                      <span className="text-center">#</span>
                      <span>플레이어</span>
                      <span className="hidden lg:block">주력 챔피언</span>
                      <span className="hidden text-center sm:block">KDA</span>
                      <span className="hidden text-center sm:block">MVP</span>
                      <span className="hidden text-center sm:block">칭찬</span>
                      <span className="text-right sm:text-left">승률</span>
                      <span className="text-right">점수</span>
                    </div>
                    <div className="space-y-1">
                      {rows.map((entry) => (
                        <LolRankingRow
                          key={entry.id}
                          entry={entry}
                          href={hrefFor(entry)}
                          mine={entry.userId === me?.id}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* 쪽 넘기기 */}
                {data.totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm tabular-nums text-text-secondary">
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
          </div>

          {/* ── 오른쪽 칸 (넓은 화면) ── */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-3">
              <MyRankCard
                loggedIn={Boolean(me)}
                mine={mine}
                loading={myRank.isLoading}
                onJump={goToMine}
                tournamentsHref={`${gamePrefix}/tournaments`}
              />
              <ScoreHelp />
              <Link
                href="/clans?game=lol"
                className="flex items-center gap-3 rounded-xl bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary/70"
              >
                <Users className="h-5 w-5 text-accent-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    클랜 랭킹
                  </p>
                  <p className="text-xs text-text-tertiary">
                    클랜끼리의 순위는 클랜 페이지에서
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-text-tertiary" />
              </Link>
              <AdSlotCard slotKey="feed" minHeight={90} />
            </div>
          </aside>
        </div>

        {/* 좁은 화면 — 점수 계산법·광고는 목록 아래 */}
        <div className="mt-6 space-y-3 lg:hidden">
          <ScoreHelp />
          <AdSlotCard slotKey="feed" minHeight={90} />
        </div>
      </div>

      {/* 좁은 화면 — 내 순위 줄을 아래에 고정 */}
      {me && mine && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-bg-tertiary bg-bg-primary/95 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={goToMine}
            className="container mx-auto flex items-center gap-3 px-4 py-2.5 text-left"
          >
            <span className="rounded-md bg-accent-primary/15 px-2 py-1 text-sm font-black tabular-nums text-accent-primary">
              #{mine.globalRank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
              내 순위 · {mine.winRate.toFixed(1)}% · {mine.wins}승 {mine.losses}
              패
            </span>
            <span className="text-base font-black tabular-nums text-text-primary">
              {mine.score?.toFixed(1)}
            </span>
            <LocateFixed className="h-4 w-4 text-text-tertiary" />
          </button>
        </div>
      )}
    </div>
  );
}

/** 오른쪽 칸 — 내 순위 */
function MyRankCard({
  loggedIn,
  mine,
  loading,
  onJump,
  tournamentsHref,
}: {
  loggedIn: boolean;
  mine: MyRanking | null;
  loading: boolean;
  onJump: () => void;
  tournamentsHref: string;
}) {
  if (!loggedIn) {
    return (
      <div className="rounded-xl bg-bg-secondary p-4 text-sm text-text-secondary">
        로그인하면 내 순위가 여기 보여요.
      </div>
    );
  }
  if (loading) return <Skeleton className="h-36 rounded-xl" />;
  if (!mine) {
    return (
      <div className="rounded-xl bg-bg-secondary p-4">
        <p className="text-sm font-semibold text-text-primary">
          아직 내 순위가 없어요
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          내전을 한 판만 끝까지 해도 랭킹에 올라가요.
        </p>
        <Link
          href={tournamentsHref}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-primary hover:underline"
        >
          내전 방 둘러보기 <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-accent-primary/[0.08] p-4">
      <p className="text-xs font-semibold text-text-tertiary">내 순위 (종합)</p>
      <div className="mt-1 flex items-end justify-between">
        <p className="text-3xl font-black tabular-nums text-accent-primary">
          #{mine.globalRank}
        </p>
        <div className="text-right">
          <p className="text-xl font-black tabular-nums text-text-primary">
            {mine.score?.toFixed(1)}
          </p>
          <p className="text-[11px] text-text-tertiary">점수</p>
        </div>
      </div>
      <p className="mt-2 text-xs tabular-nums text-text-secondary">
        승률 {mine.winRate.toFixed(1)}% · {mine.wins}승 {mine.losses}패
      </p>
      <button
        type="button"
        onClick={onJump}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-bg-secondary py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-tertiary"
      >
        <LocateFixed className="h-3.5 w-3.5" />내 자리로
      </button>
    </div>
  );
}

/** 점수 계산법 — 접어 두고 궁금할 때 펼친다 */
function ScoreHelp() {
  return (
    <details className="group rounded-xl bg-bg-secondary p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-text-primary">
        점수는 어떻게 매기나요?
        <ChevronDown className="h-4 w-4 text-text-tertiary transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">
        판수를 반영한 보정 승률입니다. 모두에게 5판 분량의 50%를 깔고 계산해서,
        몇 판 안 한 전승보다 많이 뛰고 많이 이긴 사람이 위로 옵니다.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">
        KDA·주력 챔피언은 Riot 기록이 수집된 내전 기준이고, MVP는 Riot 기록으로
        자동으로 정합니다. 라인 탭은 그 라인으로 배정돼 끝까지 치른 내전만
        셉니다.
      </p>
    </details>
  );
}
