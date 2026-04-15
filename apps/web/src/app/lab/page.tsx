"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getChampionKoreanName } from "@nexus/types";
import { useAuthStore } from "@/stores/auth-store";
import { riotApi, statsApi } from "@/lib/api-client";
import { getChampionIconById, getItemIcon } from "@/components/matches/match-utils";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingSpinner,
} from "@/components/ui";
import {
  Activity,
  ArrowRight,
  Beaker,
  Brain,
  ChevronRight,
  FlaskConical,
  ShieldAlert,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

type LabOverview = {
  sample: {
    matchesWithStats: number;
    participantRows: number;
    playersInDataset: number;
    championsInDataset: number;
    itemSelections: number;
    recentMatches30d: number;
  };
  laneProfiles: Array<{
    position: string;
    games: number;
    winRate: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgDamage: number;
    avgGold: number;
  }>;
  championSignals: Array<{
    championId: number;
    championName: string;
    championNameKorean: string;
    games: number;
    winRate: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
  }>;
  itemTrends: Array<{
    itemId: number;
    picks: number;
    uniqueUsers: number;
  }>;
  masteryLeaders: Array<{
    userId: string;
    username: string;
    avatar: string | null;
    championId: number;
    championName: string;
    championNameKorean: string;
    games: number;
    winRate: number;
    avgKda: number;
    masteryScore: number;
  }>;
};

type ItemData = {
  name: string;
  image?: { full?: string };
};

const POSITION_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

function formatPosition(position: string) {
  return POSITION_LABELS[position] ?? position;
}

function StatMetric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-text-secondary">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-text-primary">{value}</p>
          <p className="mt-2 text-xs leading-5 text-text-tertiary">{hint}</p>
        </div>
        <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LabPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [overview, setOverview] = useState<LabOverview | null>(null);
  const [itemData, setItemData] = useState<Record<string, ItemData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, isAdmin, router]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !isAdmin) return;

    let cancelled = false;

    Promise.all([statsApi.getLabOverview(), riotApi.getItems("ko_KR")])
      .then(([labOverview, itemsResponse]) => {
        if (cancelled) return;
        setOverview(labOverview);
        setItemData(itemsResponse?.data ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setError("실험실 데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, isAdmin]);

  const avgParticipantsPerMatch = useMemo(() => {
    if (!overview?.sample.matchesWithStats) return 0;
    return overview.sample.participantRows / overview.sample.matchesWithStats;
  }, [overview]);

  if (authLoading || (isAuthenticated && isAdmin && loading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  if (error || !overview) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="flex items-start gap-4 p-6">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-300" />
            <div>
              <p className="text-lg font-semibold text-text-primary">실험실 로드 실패</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {error ?? "관리자용 실험실 데이터를 아직 사용할 수 없습니다."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-bg-primary">
      <section className="border-b border-bg-tertiary bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_32%),linear-gradient(180deg,_rgba(15,23,42,0.12),_transparent)]">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <Badge variant="success" className="mb-4">
                비공개 프리뷰
              </Badge>
              <h1 className="text-4xl font-black tracking-tight text-text-primary md:text-6xl">
                실험실 연구 대시보드
              </h1>
              <p className="mt-4 text-base leading-7 text-text-secondary md:text-lg">
                유저, 라인, 챔피언, 아이템, 장인 후보 데이터를 관리자 전용으로 먼저 연구합니다. 기능이
                충분히 다듬어지면 그때 공개 탭으로 전환합니다.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Dataset Pulse</p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  최근 30일 {overview.sample.recentMatches30d.toLocaleString()}경기
                </p>
              </div>
              <Link
                href="/matches"
                className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-bg-secondary/80 px-4 py-3 text-text-primary transition-colors hover:bg-bg-elevated"
              >
                <span>
                  <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Source</p>
                  <p className="mt-2 font-semibold">내전 전적 데이터 보기</p>
                </span>
                <ArrowRight className="h-4 w-4 text-text-secondary" />
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatMetric
              label="분석된 경기"
              value={overview.sample.matchesWithStats.toLocaleString()}
              hint={`참가자 행 ${overview.sample.participantRows.toLocaleString()}개`}
              icon={Swords}
            />
            <StatMetric
              label="플레이어 표본"
              value={overview.sample.playersInDataset.toLocaleString()}
              hint={`경기당 평균 ${avgParticipantsPerMatch.toFixed(1)}명`}
              icon={Users}
            />
            <StatMetric
              label="챔피언 풀"
              value={overview.sample.championsInDataset.toLocaleString()}
              hint="내전 데이터에서 실제로 사용된 챔피언 수"
              icon={Target}
            />
            <StatMetric
              label="아이템 선택"
              value={overview.sample.itemSelections.toLocaleString()}
              hint="빌드 슬롯 기준 누적 선택 횟수"
              icon={FlaskConical}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-emerald-300">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-semibold uppercase tracking-[0.18em]">Lane Laboratory</span>
              </div>
              <CardTitle>라인별 실제 퍼포먼스</CardTitle>
              <CardDescription>승률만 보지 않고 KDA, 평균 딜량, 평균 골드까지 같이 봅니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.laneProfiles.map((lane) => (
                <div key={lane.position} className="rounded-2xl border border-white/10 bg-bg-primary/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-text-primary">{formatPosition(lane.position)}</p>
                      <p className="text-xs text-text-tertiary">{lane.games.toLocaleString()}게임 표본</p>
                    </div>
                    <Badge variant={lane.winRate >= 50 ? "success" : "warning"}>{lane.winRate.toFixed(1)}% 승률</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-text-tertiary">KDA</p>
                      <p className="mt-1 font-semibold text-text-primary">
                        {lane.avgKills.toFixed(1)} / {lane.avgDeaths.toFixed(1)} / {lane.avgAssists.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">평균 딜량</p>
                      <p className="mt-1 font-semibold text-text-primary">{Math.round(lane.avgDamage).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">평균 골드</p>
                      <p className="mt-1 font-semibold text-text-primary">{Math.round(lane.avgGold).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">연구 메모</p>
                      <p className="mt-1 font-semibold text-text-primary">
                        {lane.winRate >= 52 ? "안정적 우세" : lane.winRate <= 48 ? "재검증 필요" : "중립 구간"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-amber-300">
                <Trophy className="h-4 w-4" />
                <span className="text-sm font-semibold uppercase tracking-[0.18em]">Mastery Candidates</span>
              </div>
              <CardTitle>유저별 대표 장인 후보</CardTitle>
              <CardDescription>판수, 승률, KDA를 조합한 임시 점수로 정렬한 관리자용 지표입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.masteryLeaders.map((entry, index) => (
                <Link
                  key={`${entry.userId}-${entry.championId}`}
                  href={`/users/${entry.userId}`}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-bg-primary/60 p-4 transition-colors hover:bg-bg-elevated"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-sm font-bold text-amber-300">
                    {index + 1}
                  </div>
                  <div className="relative h-11 w-11 overflow-hidden rounded-full border border-white/10 bg-bg-tertiary">
                    {entry.avatar ? (
                      <Image src={entry.avatar} alt={entry.username} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-text-tertiary">
                        <Users className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
                    <Image
                      src={getChampionIconById(entry.championId)}
                      alt={entry.championName}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">{entry.username}</p>
                    <p className="truncate text-sm text-text-secondary">
                      {entry.championNameKorean || getChampionKoreanName(entry.championName)}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {entry.games}게임 · {entry.winRate.toFixed(1)}% · 평균 KDA {entry.avgKda.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Score</p>
                    <p className="mt-1 text-xl font-bold text-amber-300">{entry.masteryScore.toFixed(1)}</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-sky-300">
                <Brain className="h-4 w-4" />
                <span className="text-sm font-semibold uppercase tracking-[0.18em]">Champion Signals</span>
              </div>
              <CardTitle>연구 우선순위 챔피언</CardTitle>
              <CardDescription>표본이 쌓인 챔피언부터 내전 특화 지표 후보로 분류합니다.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {overview.championSignals.map((champion) => (
                <div key={champion.championId} className="rounded-2xl border border-white/10 bg-bg-primary/60 p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
                      <Image
                        src={getChampionIconById(champion.championId)}
                        alt={champion.championName}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">{champion.championNameKorean}</p>
                      <p className="text-xs text-text-tertiary">{champion.games.toLocaleString()}게임 표본</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-text-tertiary">승률</p>
                      <p className="mt-1 font-semibold text-text-primary">{champion.winRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">평균 KDA</p>
                      <p className="mt-1 font-semibold text-text-primary">
                        {champion.avgKills.toFixed(1)} / {champion.avgDeaths.toFixed(1)} / {champion.avgAssists.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-violet-300">
                <Beaker className="h-4 w-4" />
                <span className="text-sm font-semibold uppercase tracking-[0.18em]">Item Trends</span>
              </div>
              <CardTitle>자주 선택되는 아이템</CardTitle>
              <CardDescription>아이템 메타 연구의 출발점으로 쓰는 누적 선택 통계입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.itemTrends.map((item) => {
                const itemInfo = itemData[String(item.itemId)];
                return (
                  <div key={item.itemId} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-bg-primary/60 p-4">
                    <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
                      <Image
                        src={getItemIcon(item.itemId)}
                        alt={itemInfo?.name ?? `Item ${item.itemId}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-text-primary">{itemInfo?.name ?? `아이템 #${item.itemId}`}</p>
                      <p className="text-xs text-text-tertiary">고유 사용자 {item.uniqueUsers.toLocaleString()}명</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Picks</p>
                      <p className="mt-1 text-lg font-bold text-violet-300">{item.picks.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="space-y-3 p-6">
              <div className="flex items-center gap-2 text-emerald-300">
                <Activity className="h-5 w-5" />
                <p className="font-semibold text-text-primary">다음 단계</p>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                유저-라인, 유저-챔피언, 유저-아이템 조합을 별도 테이블로 물리화하면 조회 지연 없이 실험실
                지표를 확장할 수 있습니다.
              </p>
            </CardContent>
          </Card>

          <Card className="border-sky-500/20 bg-sky-500/5">
            <CardContent className="space-y-3 p-6">
              <div className="flex items-center gap-2 text-sky-300">
                <Target className="h-5 w-5" />
                <p className="font-semibold text-text-primary">연구 질문</p>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                내전에서만 강한 챔피언이 따로 있는지, 역할 전환 시 승률이 어떻게 바뀌는지, 장인 기준이 실제
                결과와 상관관계를 가지는지 검증해야 합니다.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="space-y-3 p-6">
              <div className="flex items-center gap-2 text-amber-300">
                <ChevronRight className="h-5 w-5" />
                <p className="font-semibold text-text-primary">공개 조건</p>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                지표 정의가 고정되고 설명 문구와 검증 기준이 붙으면, 그때 일반 사용자용 `실험실` 탭으로
                올리는 게 맞습니다.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
