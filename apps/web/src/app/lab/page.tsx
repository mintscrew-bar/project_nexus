"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getChampionKoreanName } from "@nexus/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { LabPeriod, LabTabKey, useLabStore } from "@/stores/lab-store";
import { adminApi, statsApi } from "@/lib/api-client";
import {
  labQueryOptions,
  type LabOverview,
  type MetaRadarResponse,
  type PatchImpactResponse,
  type BanRatesResponse,
  type ChampionListResponse,
  type SynergyResponse,
  type CounterResponse,
  type CompositionsResponse,
  type AuctionEfficiencyResponse,
  type ChampionDetailResponse,
  type ChampionMasteryResponse,
  type BalanceScoreResponse,
  type BanRecommendResponse,
  type ItemData,
  type PlayPatternsResponse,
  type RankedSnapshotsResponse,
  type HeadToHeadResponse,
} from "@/lib/lab-queries";
import { getChampionIconById, getItemIcon } from "@/components/matches/match-utils";
import { RuneTooltip } from "@/components/RuneTooltip";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingSpinner,
  Modal,
} from "@/components/ui";
import {
  Activity,
  ArrowRight,
  Beaker,
  Brain,
  Crown,
  ChevronRight,
  FlaskConical,
  Medal,
  Info,
  ShieldAlert,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

const LAB_TABS: Array<{ key: LabTabKey; label: string }> = [
  { key: "meta", label: "메타 레이더" },
  { key: "champions", label: "챔피언 분석" },
  { key: "compositions", label: "조합 분석" },
  { key: "oracle", label: "오라클" },
];

const LAB_PERIODS: Array<{ key: LabPeriod; label: string }> = [
  { key: "30d", label: "30일" },
  { key: "90d", label: "90일" },
  { key: "all", label: "전체" },
];

const LAB_TAB_MIN_PHASE: Record<LabTabKey, number> = {
  meta: 0,
  champions: 0,
  compositions: 2, // 30경기 이상
  oracle: 2, // 30경기 이상
};

const LAB_PHASE_MATCH_THRESHOLD: Record<number, number> = {
  0: 0,
  1: 10,
  2: 30,
  3: 100,
  4: 300,
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

function formatRate(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function tierBadgeVariant(tier: string): "secondary" | "diamond" | "platinum" | "emerald" | "master" | "grandmaster" | "challenger" | "tier-gold" | "silver" | "bronze" | "iron" {
  const normalized = tier.toUpperCase();
  if (normalized === "CHALLENGER") return "challenger";
  if (normalized === "GRANDMASTER") return "grandmaster";
  if (normalized === "MASTER") return "master";
  if (normalized === "DIAMOND") return "diamond";
  if (normalized === "EMERALD") return "emerald";
  if (normalized === "PLATINUM") return "platinum";
  if (normalized === "GOLD") return "tier-gold";
  if (normalized === "SILVER") return "silver";
  if (normalized === "BRONZE") return "bronze";
  if (normalized === "IRON") return "iron";
  return "secondary";
}

function tierLabel(tier: string, rank: string) {
  return [tier, rank].filter(Boolean).join(" ");
}

function confidenceLabel(level: "low" | "moderate" | "high" | "insufficient") {
  if (level === "high") return "높음";
  if (level === "moderate") return "보통";
  if (level === "low") return "낮음";
  return "부족";
}

function LabSourceBadge({ source }: { source?: "snapshot" | "realtime" }) {
  if (!source) return null;
  return source === "snapshot" ? (
    <Badge variant="success" size="sm">스냅샷</Badge>
  ) : (
    <Badge variant="warning" size="sm">실시간 집계</Badge>
  );
}

function BanMetaSourceBadge({
  source,
}: {
  source?: "custom" | "hybrid" | "ranked_only" | "none";
}) {
  if (!source || source === "none") return null;
  if (source === "custom") return <Badge variant="success" size="sm">내전 메타</Badge>;
  if (source === "hybrid") return <Badge variant="warning" size="sm">하이브리드 메타</Badge>;
  return <Badge variant="warning" size="sm">외부 랭크 메타</Badge>;
}

const COMPOSITION_EXAMPLE_CHAMPIONS: Record<
  "TEAMFIGHT" | "SPLIT_PUSH" | "POKE" | "EARLY_AGGRO" | "TANK_LINE",
  number[]
> = {
  TEAMFIGHT: [89, 99, 53], // Leona, Lux, Blitzcrank
  SPLIT_PUSH: [157, 92, 114], // Yasuo, Riven, Fiora
  POKE: [81, 115, 74], // Ezreal, Ziggs, Heimerdinger
  EARLY_AGGRO: [64, 121, 91], // LeeSin, Khazix, Talon
  TANK_LINE: [54, 516, 113], // Malphite, Ornn, Sejuani
};

// ─── Task 33: Lab 전용 빈 데이터 상태 컴포넌트 ───────────────────────────────
type LabConfidenceLevel = "insufficient" | "low" | "moderate" | "high";

function LabEmptyState({
  level = "insufficient",
  section,
  className,
}: {
  level?: LabConfidenceLevel;
  section?: string;
  className?: string;
}) {
  const messages: Record<LabConfidenceLevel, { title: string; desc: string }> = {
    insufficient: {
      title: "아직 충분한 게임 데이터가 없어요",
      desc: section
        ? `${section} 분석을 위한 데이터가 부족합니다. 내전이 더 진행되면 자동으로 활성화됩니다.`
        : "내전 데이터가 쌓이면 분석이 시작됩니다.",
    },
    low: {
      title: "데이터가 적어 참고용으로만 활용하세요",
      desc: section
        ? `${section}의 표본이 5~14게임 수준입니다. 결과가 실제와 다를 수 있습니다.`
        : "표본이 적어 통계 신뢰도가 낮습니다.",
    },
    moderate: {
      title: "데이터를 수집 중입니다",
      desc: section ? `${section} 데이터를 불러오는 중입니다.` : "잠시 후 다시 확인해 주세요.",
    },
    high: {
      title: "데이터를 불러오는 중입니다",
      desc: "잠시 후 다시 확인해 주세요.",
    },
  };

  const { title, desc } = messages[level];
  const textColor =
    level === "insufficient"
      ? "text-text-tertiary"
      : level === "low"
        ? "text-amber-400/70"
        : "text-text-secondary";

  return (
    <div className={`flex flex-col items-center justify-center py-10 text-center ${className ?? ""}`}>
      <div className="mb-3 rounded-full bg-bg-tertiary p-4">
        <FlaskConical className={`h-7 w-7 ${textColor}`} />
      </div>
      <p className={`font-semibold ${textColor}`}>{title}</p>
      <p className="mt-1 max-w-xs text-xs text-text-tertiary">{desc}</p>
    </div>
  );
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
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    activeTab,
    period: activePeriod,
    position: activePosition,
    setActiveTab,
    setPeriod,
    setPosition,
  } = useLabStore();
  // ─── UI 전용 로컬 state ───────────────────────────────────────────────────────
  const [championSearch, setChampionSearch] = useState("");
  const [includeLowSample, setIncludeLowSample] = useState(false);
  const [championSort, setChampionSort] = useState<"pickRate" | "winRate" | "banRate">("winRate");
  const [selectedChampionId, setSelectedChampionId] = useState<number | null>(null);
  const [synergyChampionId, setSynergyChampionId] = useState<number | null>(null);
  const [counterChampionId, setCounterChampionId] = useState<number | null>(null);
  const [counterVsChampionId, setCounterVsChampionId] = useState<number | null>(null);
  const [counterPosition, setCounterPosition] = useState<"ALL" | "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT">("ALL");
  const [oracleSearchQuery, setOracleSearchQuery] = useState("");
  const [oracleSearchResults, setOracleSearchResults] = useState<
    Array<{ id: string; username: string; avatar: string | null }>
  >([]);
  const [oracleSearching, setOracleSearching] = useState(false);
  const [oracleTeamA, setOracleTeamA] = useState<Array<{ id: string; username: string; avatar: string | null }>>([]);
  const [oracleTeamB, setOracleTeamB] = useState<Array<{ id: string; username: string; avatar: string | null }>>([]);
  const [balanceResult, setBalanceResult] = useState<BalanceScoreResponse | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [banParticipants, setBanParticipants] = useState<
    Array<{ id: string; username: string; avatar: string | null }>
  >([]);
  const [banRecommendResult, setBanRecommendResult] = useState<BanRecommendResponse | null>(null);
  const [banRecommendLoading, setBanRecommendLoading] = useState(false);
  const [banRecommendError, setBanRecommendError] = useState<string | null>(null);

  // Task 37: head-to-head 상태
  const [h2hUserA, setH2hUserA] = useState<{ id: string; username: string; avatar: string | null } | null>(null);
  const [h2hUserB, setH2hUserB] = useState<{ id: string; username: string; avatar: string | null } | null>(null);
  const [h2hSearchQuery, setH2hSearchQuery] = useState("");
  const [h2hSearchResults, setH2hSearchResults] = useState<Array<{ id: string; username: string; avatar: string | null }>>([]);
  const [h2hSearching, setH2hSearching] = useState(false);
  const [h2hSelectingFor, setH2hSelectingFor] = useState<"A" | "B" | null>(null);

  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";

  // ─── 인증 확인 후 enabled 여부 결정 ──────────────────────────────────────────
  const canFetch = !authLoading && isAuthenticated && isAdmin;

  const { data: labDataPhase } = useQuery({
    queryKey: ["lab", "data-phase"] as const,
    queryFn: () => adminApi.getLabDataPhase(),
    staleTime: 5 * 60 * 1000,
    enabled: canFetch,
  });
  const currentPhase = labDataPhase?.phase ?? 0;
  const isTabUnlocked = useCallback(
    (tab: LabTabKey) => currentPhase >= LAB_TAB_MIN_PHASE[tab],
    [currentPhase],
  );

  // ─── React Query: 초기 메타 데이터 ───────────────────────────────────────────
  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useQuery({
    ...labQueryOptions.overview(),
    enabled: canFetch,
  });

  const { data: itemsResponse } = useQuery<{ data: Record<string, ItemData> }>({
    ...labQueryOptions.items("ko_KR"),
    enabled: canFetch,
  });
  const itemData: Record<string, ItemData> = itemsResponse?.data ?? {};

  const { data: metaRadar, isLoading: metaRadarLoading } = useQuery<MetaRadarResponse>({
    ...labQueryOptions.metaRadar(activePeriod),
    enabled: canFetch && activeTab === "meta",
  });

  const { data: patchImpact } = useQuery<PatchImpactResponse>({
    ...labQueryOptions.patchImpact(),
    enabled: canFetch && activeTab === "meta",
  });

  const { data: banRates } = useQuery<BanRatesResponse>({
    ...labQueryOptions.banRates(activePeriod),
    enabled: canFetch && activeTab === "meta",
  });

  // ─── 메타 레이더 진입 시 prefetch (다음 기간 미리 로드) ──────────────────────
  useEffect(() => {
    if (!canFetch || activeTab !== "meta") return;
    const otherPeriods: LabPeriod[] = (["30d", "90d", "all"] as LabPeriod[]).filter(
      (p) => p !== activePeriod,
    );
    otherPeriods.forEach((p) => {
      void queryClient.prefetchQuery(labQueryOptions.metaRadar(p));
    });
  }, [canFetch, activePeriod, activeTab, queryClient]);

  // ─── React Query: 챔피언 분석 탭 ─────────────────────────────────────────────
  const { data: championList } = useQuery<ChampionListResponse>({
    ...labQueryOptions.champions({
      period: activePeriod,
      position: activePosition === "ALL" ? undefined : activePosition,
      includeLowSample,
    }),
    enabled: canFetch && activeTab === "champions",
  });

  // 챔피언 상세 (모달)
  const { data: championDetail, isLoading: championDetailLoading, isError: championDetailIsError } = useQuery<ChampionDetailResponse>({
    ...labQueryOptions.championDetail(selectedChampionId ?? 0, activePeriod),
    enabled: canFetch && !!selectedChampionId,
  });

  const { data: championMastery } = useQuery<ChampionMasteryResponse>({
    ...labQueryOptions.championMastery(selectedChampionId ?? 0),
    enabled: canFetch && !!selectedChampionId,
  });

  const championDetailError = championDetailIsError ? "챔피언 상세 데이터를 불러오지 못했습니다." : null;

  // 조합 탭용 챔피언 카탈로그 (includeLowSample=true로 전체 목록)
  const { data: catalogResponse } = useQuery<ChampionListResponse>({
    ...labQueryOptions.champions({ period: activePeriod, includeLowSample: true }),
    enabled: canFetch && activeTab === "compositions",
  });
  const championCatalog = useMemo(
    () =>
      (catalogResponse?.champions ?? [])
        .map((row) => ({
          championId: row.championId,
          championNameKorean: row.championNameKorean,
          championName: row.championName,
        }))
        .sort((a, b) => a.championNameKorean.localeCompare(b.championNameKorean, "ko")),
    [catalogResponse],
  );
  const championNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of championCatalog) {
      map.set(row.championId, row.championNameKorean);
    }
    for (const row of metaRadar?.trending ?? []) {
      map.set(row.championId, row.championNameKorean);
    }
    for (const row of overview?.championSignals ?? []) {
      map.set(row.championId, row.championNameKorean);
    }
    for (const row of overview?.masteryLeaders ?? []) {
      map.set(row.championId, row.championNameKorean);
    }
    for (const row of overview?.seededChampionLeaders ?? []) {
      map.set(row.championId, row.championNameKorean);
    }
    for (const row of championList?.champions ?? []) {
      map.set(row.championId, row.championNameKorean);
    }
    return map;
  }, [championCatalog, metaRadar, overview, championList]);
  const championDisplayName = useCallback(
    (championId: number) =>
      championNameById.get(championId) ?? `챔피언 #${championId}`,
    [championNameById],
  );

  // ─── React Query: 조합 분석 탭 ───────────────────────────────────────────────
  const { data: synergyData, isLoading: synergyLoading } = useQuery<SynergyResponse>({
    ...labQueryOptions.synergy({
      period: activePeriod,
      championId: synergyChampionId ?? undefined,
      limit: 30,
    }),
    enabled: canFetch && activeTab === "compositions",
  });

  const { data: counterData, isLoading: counterLoading } = useQuery<CounterResponse>({
    ...labQueryOptions.counter({
      period: activePeriod,
      championId: counterChampionId ?? undefined,
      vsChampionId: counterVsChampionId ?? undefined,
      position: counterPosition === "ALL" ? undefined : counterPosition,
      limit: 30,
    }),
    enabled: canFetch && activeTab === "compositions",
  });

  const { data: compositionsData, isLoading: compositionsLoading } = useQuery<CompositionsResponse>({
    ...labQueryOptions.compositions(activePeriod),
    enabled: canFetch && activeTab === "compositions",
  });

  // ─── React Query: 오라클 탭 ───────────────────────────────────────────────────
  const { data: auctionData, isLoading: auctionLoading } = useQuery<AuctionEfficiencyResponse>({
    ...labQueryOptions.auctionEfficiency(activePeriod),
    enabled: canFetch && activeTab === "oracle",
  });

  // Task 37: 직접 대전 상성
  const { data: h2hData, isLoading: h2hLoading } = useQuery<HeadToHeadResponse>({
    ...labQueryOptions.headToHead(h2hUserA?.id ?? "", h2hUserB?.id ?? ""),
    enabled: canFetch && activeTab === "oracle" && !!h2hUserA && !!h2hUserB,
  });

  // ─── React Query: 메타 탭 추가 데이터 ───────────────────────────────────────
  // Task 38: 활동 패턴
  const { data: playPatterns } = useQuery<PlayPatternsResponse>({
    ...labQueryOptions.playPatterns(activePeriod),
    enabled: canFetch && activeTab === "meta",
  });

  // Task 39: 외부 랭크 메타 스냅샷
  const { data: rankedSnapshots } = useQuery<RankedSnapshotsResponse>({
    ...labQueryOptions.rankedSnapshots({ period: "30d" }),
    enabled: canFetch && activeTab === "meta",
  });

  // 초기 로딩: overview + metaRadar가 준비될 때까지 로딩 표시
  const loading = canFetch && (overviewLoading || (activeTab === "meta" && metaRadarLoading));
  const error = overviewError ? "실험실 데이터를 불러오지 못했습니다." : null;

  const queryTab = useMemo<LabTabKey>(() => {
    const fromQuery = searchParams.get("tab");
    return LAB_TABS.some((tab) => tab.key === fromQuery)
      ? (fromQuery as LabTabKey)
      : "meta";
  }, [searchParams]);
  const safeQueryTab = isTabUnlocked(queryTab) ? queryTab : "meta";
  const queryPeriod = useMemo<LabPeriod>(() => {
    const fromQuery = searchParams.get("period");
    return LAB_PERIODS.some((period) => period.key === fromQuery)
      ? (fromQuery as LabPeriod)
      : "30d";
  }, [searchParams]);

  const updateLabQuery = useCallback(
    (tab: LabTabKey, period: LabPeriod) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      params.set("period", period);
      router.replace(`/lab?${params.toString()}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (!isTabUnlocked(queryTab)) {
      updateLabQuery("meta", queryPeriod);
      if (activeTab !== "meta") setActiveTab("meta");
      return;
    }
    if (activeTab !== safeQueryTab) setActiveTab(safeQueryTab);
    if (activePeriod !== queryPeriod) setPeriod(queryPeriod);
  }, [
    activePeriod,
    activeTab,
    queryPeriod,
    queryTab,
    safeQueryTab,
    setActiveTab,
    setPeriod,
    currentPhase,
    updateLabQuery,
    isTabUnlocked,
  ]);

  useEffect(() => {
    if (activeTab !== "oracle") return;
    const q = oracleSearchQuery.trim();
    if (q.length < 2) {
      setOracleSearchResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setOracleSearching(true);
      statsApi
        .searchUsers(q, 8)
        .then((data) => {
          if (cancelled) return;
          const users = (Array.isArray(data) ? data : data?.users ?? []) as Array<{
            id: string;
            username: string;
            avatar: string | null;
          }>;
          setOracleSearchResults(users);
        })
        .catch(() => {
          if (!cancelled) setOracleSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setOracleSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, oracleSearchQuery]);

  // Task 37: head-to-head 유저 검색
  useEffect(() => {
    if (activeTab !== "oracle") return;
    const q = h2hSearchQuery.trim();
    if (q.length < 2) {
      setH2hSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setH2hSearching(true);
      statsApi
        .searchUsers(q, 8)
        .then((data) => {
          if (cancelled) return;
          const users = (Array.isArray(data) ? data : data?.users ?? []) as Array<{
            id: string;
            username: string;
            avatar: string | null;
          }>;
          setH2hSearchResults(users);
        })
        .catch(() => {
          if (!cancelled) setH2hSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setH2hSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, h2hSearchQuery]);

  const avgParticipantsPerMatch = useMemo(() => {
    if (!overview?.sample.matchesWithStats) return 0;
    return overview.sample.participantRows / overview.sample.matchesWithStats;
  }, [overview]);

  const championRowsWithTier = useMemo(() => {
    const rows = championList?.champions ?? [];
    if (rows.length === 0) return [];

    const wilsonValues = rows.map((row) => row.wilsonLower);
    const pickValues = rows.map((row) => row.pickRate);
    const wMin = Math.min(...wilsonValues);
    const wMax = Math.max(...wilsonValues);
    const pMin = Math.min(...pickValues);
    const pMax = Math.max(...pickValues);
    const wRange = wMax - wMin || 1;
    const pRange = pMax - pMin || 1;

    const scored = rows.map((row) => {
      const wilsonNorm = (row.wilsonLower - wMin) / wRange;
      const pickNorm = (row.pickRate - pMin) / pRange;
      const tierScore = wilsonNorm * 0.6 + pickNorm * 0.4;
      return { ...row, tierScore };
    });
    scored.sort((a, b) => b.tierScore - a.tierScore);

    return scored.map((row, idx) => {
      const percentile = idx / scored.length;
      const tier =
        percentile < 0.1
          ? "S"
          : percentile < 0.3
            ? "A"
            : percentile < 0.6
              ? "B"
              : percentile < 0.85
                ? "C"
                : "D";
      return { ...row, tier };
    });
  }, [championList]);

  const championRowsFiltered = useMemo(() => {
    const keyword = championSearch.trim().toLowerCase();
    const filtered =
      keyword.length === 0
        ? championRowsWithTier
        : championRowsWithTier.filter((row) => {
            const ko = row.championNameKorean.toLowerCase();
            const en = row.championName.toLowerCase();
            return ko.includes(keyword) || en.includes(keyword);
          });

    const sorted = [...filtered].sort((a, b) => {
      if (championSort === "pickRate") return b.pickRate - a.pickRate;
      if (championSort === "banRate") return b.banRate - a.banRate;
      return b.winRate - a.winRate;
    });
    return sorted;
  }, [championRowsWithTier, championSearch, championSort]);

  const selectedChampionRow = useMemo(
    () =>
      championRowsWithTier.find((row) => row.championId === selectedChampionId) ??
      null,
    [championRowsWithTier, selectedChampionId],
  );

  const trendChartData = useMemo(() => {
    const points = championDetail?.winrateTrend ?? [];
    if (points.length === 0) return null;

    const width = 520;
    const height = 220;
    const pad = { left: 34, right: 10, top: 10, bottom: 28 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const xDenom = Math.max(points.length - 1, 1);

    const minRate = Math.min(...points.map((p) => p.winRate));
    const maxRate = Math.max(...points.map((p) => p.winRate));
    const yMin = Math.max(0, minRate - 0.08);
    const yMax = Math.min(1, maxRate + 0.08);
    const yRange = Math.max(yMax - yMin, 0.01);

    const toX = (idx: number) => pad.left + (idx / xDenom) * chartWidth;
    const toY = (rate: number) => pad.top + chartHeight - ((rate - yMin) / yRange) * chartHeight;

    const path = points
      .map((point, idx) => `${idx === 0 ? "M" : "L"}${toX(idx).toFixed(1)},${toY(point.winRate).toFixed(1)}`)
      .join(" ");
    const area = `${path} L${toX(points.length - 1).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} L${toX(0).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} Z`;
    const yTicks = [yMin, (yMin + yMax) / 2, yMax];
    const xTicks = points.map((point, idx) => ({
      x: toX(idx),
      label: new Date(point.weekStart).toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
      }),
    }));

    return { width, height, pad, points, yTicks, xTicks, toY, path, area };
  }, [championDetail]);

  const positionPie = useMemo(() => {
    const rows = championDetail?.positions ?? [];
    const total = rows.reduce((acc, row) => acc + row.games, 0);
    if (rows.length === 0 || total === 0) return [];

    const colors = ["#34d399", "#22d3ee", "#818cf8", "#f59e0b", "#f472b6", "#a3e635"];
    let startAngle = -Math.PI / 2;
    return rows.map((row, idx) => {
      const slice = (row.games / total) * Math.PI * 2;
      const endAngle = startAngle + slice;
      const largeArc = slice > Math.PI ? 1 : 0;
      const radius = 76;
      const cx = 96;
      const cy = 96;
      const x1 = cx + Math.cos(startAngle) * radius;
      const y1 = cy + Math.sin(startAngle) * radius;
      const x2 = cx + Math.cos(endAngle) * radius;
      const y2 = cy + Math.sin(endAngle) * radius;
      const path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
      const data = {
        ...row,
        path,
        color: colors[idx % colors.length],
      };
      startAngle = endAngle;
      return data;
    });
  }, [championDetail]);

  const synergyRows = useMemo(() => {
    const rows = synergyData?.rows ?? [];
    if (!synergyChampionId) return rows;
    return rows.filter(
      (row) => row.champ1Id === synergyChampionId || row.champ2Id === synergyChampionId,
    );
  }, [synergyData, synergyChampionId]);

  const auctionScatterChart = useMemo(() => {
    const points = auctionData?.scatter ?? [];
    if (points.length === 0) return null;

    const width = 700;
    const height = 320;
    const pad = { left: 44, right: 12, top: 12, bottom: 32 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;

    const xMin = Math.min(...points.map((p) => p.soldPrice), 0);
    const xMax = Math.max(...points.map((p) => p.soldPrice), 100);
    const yMin = Math.min(...points.map((p) => p.performance), 0);
    const yMax = Math.max(...points.map((p) => p.performance), 1);
    const xRange = Math.max(xMax - xMin, 1);
    const yRange = Math.max(yMax - yMin, 0.01);

    const toX = (price: number) => pad.left + ((price - xMin) / xRange) * chartWidth;
    const toY = (perf: number) => pad.top + chartHeight - ((perf - yMin) / yRange) * chartHeight;

    const xTicks = 5;
    const yTicks = 4;
    const xTickValues = Array.from({ length: xTicks + 1 }, (_, i) => xMin + (xRange * i) / xTicks);
    const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (yRange * i) / yTicks);

    const b0 = auctionData?.regression.beta0 ?? 0;
    const b1 = auctionData?.regression.beta1 ?? 0;
    const x1 = xMin;
    const x2 = xMax;
    const y1 = b0 + b1 * x1;
    const y2 = b0 + b1 * x2;

    return {
      width,
      height,
      pad,
      points,
      xTickValues,
      yTickValues,
      toX,
      toY,
      line: {
        x1: toX(x1),
        y1: toY(y1),
        x2: toX(x2),
        y2: toY(y2),
      },
    };
  }, [auctionData]);

  const oracleSelectedUserIds = useMemo(
    () => new Set([...oracleTeamA.map((u) => u.id), ...oracleTeamB.map((u) => u.id)]),
    [oracleTeamA, oracleTeamB],
  );

  const addUserToTeam = (
    team: "A" | "B",
    user: { id: string; username: string; avatar: string | null },
  ) => {
    if (oracleSelectedUserIds.has(user.id)) return;
    if (team === "A") setOracleTeamA((prev) => [...prev, user]);
    else setOracleTeamB((prev) => [...prev, user]);
  };

  const removeUserFromTeam = (team: "A" | "B", userId: string) => {
    if (team === "A") setOracleTeamA((prev) => prev.filter((u) => u.id !== userId));
    else setOracleTeamB((prev) => prev.filter((u) => u.id !== userId));
  };

  const runBalancePrediction = async () => {
    if (oracleTeamA.length === 0 || oracleTeamB.length === 0) {
      setBalanceError("팀 A와 팀 B에 최소 1명씩 배치해 주세요.");
      return;
    }
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const response = (await statsApi.getLabBalanceScore({
        teamA: oracleTeamA.map((u) => u.id),
        teamB: oracleTeamB.map((u) => u.id),
      })) as BalanceScoreResponse;
      setBalanceResult(response);
    } catch {
      setBalanceResult(null);
      setBalanceError("팀 밸런스 예측에 실패했습니다.");
    } finally {
      setBalanceLoading(false);
    }
  };

  const addBanParticipant = (user: {
    id: string;
    username: string;
    avatar: string | null;
  }) => {
    if (banParticipants.some((u) => u.id === user.id)) return;
    if (banParticipants.length >= 10) {
      setBanRecommendError("참가자는 최대 10명까지 선택할 수 있습니다.");
      return;
    }
    setBanRecommendError(null);
    setBanParticipants((prev) => [...prev, user]);
  };

  const removeBanParticipant = (userId: string) => {
    setBanParticipants((prev) => prev.filter((u) => u.id !== userId));
  };

  const runBanRecommend = async () => {
    if (banParticipants.length === 0) {
      setBanRecommendError("참가자를 1명 이상 선택해 주세요.");
      return;
    }

    setBanRecommendLoading(true);
    setBanRecommendError(null);
    try {
      const response = (await statsApi.getLabBanRecommend({
        period: activePeriod,
        userIds: banParticipants.map((u) => u.id),
      })) as BanRecommendResponse;
      setBanRecommendResult(response);
    } catch {
      setBanRecommendResult(null);
      setBanRecommendError("밴 추천 생성에 실패했습니다.");
    } finally {
      setBanRecommendLoading(false);
    }
  };

  if (authLoading || (isAuthenticated && isAdmin && loading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex items-start gap-4 p-6">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-300" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-text-primary">Lab 접근 권한 필요</p>
              <p className="text-sm leading-6 text-text-secondary">
                현재 Lab은 관리자 전용 연구 영역입니다. 접근 권한이 필요한 경우 운영진에게 요청해 주세요.
              </p>
              <div className="pt-1">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-lg bg-bg-primary/70 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-elevated"
                >
                  홈으로 이동
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
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

          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-white/10 bg-bg-secondary/60 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" size="sm">
                데이터 단계 {currentPhase}
              </Badge>
              <span className="text-text-tertiary">
                총 {labDataPhase?.totalMatches ?? 0}경기
              </span>
              {typeof labDataPhase?.remainingUntilNextPhase === "number" ? (
                <span className="text-text-tertiary">
                  다음 단계까지 {labDataPhase.remainingUntilNextPhase}경기
                </span>
              ) : null}
            </div>
            {/* 탭 — 모바일에서 가로 스크롤 처리 */}
            <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
              {LAB_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  disabled={!isTabUnlocked(tab.key)}
                  onClick={() => {
                    if (!isTabUnlocked(tab.key)) return;
                    setActiveTab(tab.key);
                    updateLabQuery(tab.key, activePeriod);
                  }}
                  className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    activeTab === tab.key
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
                  } ${
                    !isTabUnlocked(tab.key)
                      ? "cursor-not-allowed opacity-50"
                      : ""
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {tab.label}
                    {!isTabUnlocked(tab.key) ? (
                      <Badge variant="secondary" size="sm">
                        {LAB_TAB_MIN_PHASE[tab.key]}단계 필요
                      </Badge>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            {LAB_TABS.some((tab) => !isTabUnlocked(tab.key)) ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <p className="font-semibold">잠긴 분석 탭이 있습니다</p>
                <div className="mt-1 space-y-0.5 text-amber-100/80">
                  {LAB_TABS.filter((tab) => !isTabUnlocked(tab.key)).map((tab) => {
                    const requiredPhase = LAB_TAB_MIN_PHASE[tab.key];
                    const requiredMatches = LAB_PHASE_MATCH_THRESHOLD[requiredPhase] ?? 0;
                    const currentMatches = labDataPhase?.totalMatches ?? 0;
                    const remaining = Math.max(requiredMatches - currentMatches, 0);
                    return (
                      <p key={`locked-${tab.key}`}>
                        {tab.label}: 최소 {requiredMatches}경기 필요 (현재 {currentMatches}경기, {remaining}경기 부족)
                      </p>
                    );
                  })}
                </div>
                <div className="mt-2">
                  <Link
                    href="/matches"
                    className="inline-flex items-center gap-1 rounded-md bg-bg-primary/60 px-2 py-1 text-[11px] font-semibold text-text-secondary hover:bg-bg-elevated"
                  >
                    내전 전적 보기
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ) : null}
            {/* 기간 필터 */}
            <div className="flex items-center gap-2">
              <p className="shrink-0 text-xs uppercase tracking-[0.18em] text-text-tertiary">기간</p>
              {LAB_PERIODS.map((period) => (
                <button
                  key={period.key}
                  type="button"
                  onClick={() => {
                    setPeriod(period.key);
                    updateLabQuery(activeTab, period.key);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activePeriod === period.key
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
        {activeTab === "oracle" ? (
          <>
          <Card className="border-white/10 bg-bg-secondary/80 mb-6">
            <CardHeader>
              <CardTitle>경매 효율 분석</CardTitle>
              <CardDescription>
                낙찰가 대비 성과(가성비)를 산점도와 회귀선으로 확인하고, 상·하위 유저를 비교합니다.
              </CardDescription>
              <div className="flex items-center gap-2">
                <LabSourceBadge source={auctionData?.source} />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <a href="#oracle-auction-core" className="rounded-md bg-bg-primary/60 px-2 py-1 text-text-secondary hover:bg-bg-elevated">경매 코어</a>
                <a href="#oracle-team-balance" className="rounded-md bg-bg-primary/60 px-2 py-1 text-text-secondary hover:bg-bg-elevated">팀 밸런스</a>
                <a href="#oracle-ban-recommend" className="rounded-md bg-bg-primary/60 px-2 py-1 text-text-secondary hover:bg-bg-elevated">밴 추천</a>
              </div>
            </CardHeader>
            <CardContent>
              {auctionLoading ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : !auctionData || auctionData.scatter.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-4 text-sm text-text-secondary">
                  경매 효율 데이터가 없습니다. (데이터 부족)
                </div>
              ) : (
                <div id="oracle-auction-core" className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                      <p className="text-xs text-text-tertiary">분석 유저</p>
                      <p className="mt-1 text-xl font-bold text-text-primary">{auctionData.sampleSize.users}명</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                      <p className="text-xs text-text-tertiary">분석 경기</p>
                      <p className="mt-1 text-xl font-bold text-text-primary">{auctionData.sampleSize.games}경기</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                      <p className="text-xs text-text-tertiary">회귀 기울기</p>
                      <p className="mt-1 text-xl font-bold text-cyan-300">{auctionData.regression.beta1.toFixed(4)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                      <p className="text-xs text-text-tertiary">미낙찰 표본</p>
                      <p className="mt-1 text-xl font-bold text-text-primary">{auctionData.unsoldSummary.users}명</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                      <p className="text-xs text-text-tertiary">Moneyball 최고</p>
                      <p className="mt-1 text-xl font-bold text-emerald-300">
                        {auctionData.moneyballTop[0]?.moneyballIndex.toFixed(1) ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                      <p className="text-xs text-text-tertiary">폼 급상승 유저</p>
                      <p className="mt-1 text-xl font-bold text-cyan-300">
                        {auctionData.trendingTop[0]?.username ?? "-"}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-text-tertiary">
                    캘리브레이션: {auctionData.moneyball.calibration.quarter} ·{" "}
                    {auctionData.moneyball.calibration.mode === "quarter"
                      ? "분기 재학습 적용"
                      : "표본 부족으로 기본 스케일"} · prior{" "}
                    {auctionData.moneyball.calibration.priorGames}게임 · scale{" "}
                    {auctionData.moneyball.calibration.scale.toFixed(2)}
                  </p>

                  <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                    <Card className="border-white/10 bg-bg-primary/40">
                      <CardHeader>
                        <CardTitle className="text-base">산점도 + 회귀선</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {auctionScatterChart ? (
                          <svg viewBox={`0 0 ${auctionScatterChart.width} ${auctionScatterChart.height}`} className="w-full">
                            {auctionScatterChart.xTickValues.map((tick, idx) => (
                              <g key={`x-${idx}`}>
                                <line
                                  x1={auctionScatterChart.toX(tick)}
                                  x2={auctionScatterChart.toX(tick)}
                                  y1={auctionScatterChart.pad.top}
                                  y2={auctionScatterChart.height - auctionScatterChart.pad.bottom}
                                  stroke="currentColor"
                                  strokeOpacity={0.08}
                                />
                                <text
                                  x={auctionScatterChart.toX(tick)}
                                  y={auctionScatterChart.height - 8}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fill="currentColor"
                                  fillOpacity={0.65}
                                >
                                  {Math.round(tick)}
                                </text>
                              </g>
                            ))}
                            {auctionScatterChart.yTickValues.map((tick, idx) => (
                              <g key={`y-${idx}`}>
                                <line
                                  x1={auctionScatterChart.pad.left}
                                  x2={auctionScatterChart.width - auctionScatterChart.pad.right}
                                  y1={auctionScatterChart.toY(tick)}
                                  y2={auctionScatterChart.toY(tick)}
                                  stroke="currentColor"
                                  strokeOpacity={0.08}
                                />
                                <text
                                  x={auctionScatterChart.pad.left - 5}
                                  y={auctionScatterChart.toY(tick) + 3}
                                  textAnchor="end"
                                  fontSize="10"
                                  fill="currentColor"
                                  fillOpacity={0.65}
                                >
                                  {tick.toFixed(2)}
                                </text>
                              </g>
                            ))}
                            <line
                              x1={auctionScatterChart.line.x1}
                              y1={auctionScatterChart.line.y1}
                              x2={auctionScatterChart.line.x2}
                              y2={auctionScatterChart.line.y2}
                              stroke="#22d3ee"
                              strokeWidth={2}
                              strokeDasharray="6 4"
                            />
                            {auctionScatterChart.points.map((point) => (
                              <circle
                                key={`point-${point.userId}`}
                                cx={auctionScatterChart.toX(point.soldPrice)}
                                cy={auctionScatterChart.toY(point.performance)}
                                r={Math.min(6, Math.max(3, Math.abs(point.efficiency) * 14))}
                                fill={point.efficiency >= 0 ? "#34d399" : "#fb7185"}
                                fillOpacity={0.65}
                              >
                                <title>{`${point.username} | 낙찰가 ${point.soldPrice} | 성과 ${point.performance.toFixed(3)} | 효율 ${point.efficiency >= 0 ? "+" : ""}${point.efficiency.toFixed(3)}`}</title>
                              </circle>
                            ))}
                          </svg>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-bg-primary/40">
                      <CardHeader>
                        <CardTitle className="text-base">낙찰가 구간별 평균 성과</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {auctionData.buckets.map((bucket) => (
                          <div key={`bucket-${bucket.label}`} className="rounded-lg border border-white/10 bg-bg-secondary/40 p-2">
                            <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
                              <span>{bucket.label}</span>
                              <span>{bucket.users}명 · {bucket.games}게임</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                              <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.max(4, bucket.avgPerformance * 100)}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-text-tertiary">
                              평균 성과 {bucket.avgPerformance.toFixed(3)} · 승률 {(bucket.winRate * 100).toFixed(1)}%
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-white/10 bg-emerald-500/10">
                      <CardHeader>
                        <CardTitle className="text-base text-emerald-200">가성비왕 TOP 5</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {auctionData.efficiencyTop.map((row, idx) => (
                          <div key={`eff-top-${row.userId}`} className="flex items-center justify-between rounded-lg border border-emerald-300/20 bg-bg-primary/50 px-3 py-2 text-sm">
                            <span className="text-text-primary">{idx + 1}. {row.username}</span>
                            <div className="text-right">
                              <p className="font-semibold text-emerald-300">+{row.efficiency.toFixed(3)}</p>
                              <p className="text-xs text-text-tertiary">MBI {row.moneyballIndex.toFixed(1)}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    <Card className="border-white/10 bg-rose-500/10">
                      <CardHeader>
                        <CardTitle className="text-base text-rose-200">고평가 TOP 5</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {auctionData.overpricedTop.map((row, idx) => (
                          <div key={`over-top-${row.userId}`} className="flex items-center justify-between rounded-lg border border-rose-300/20 bg-bg-primary/50 px-3 py-2 text-sm">
                            <span className="text-text-primary">{idx + 1}. {row.username}</span>
                            <div className="text-right">
                              <p className="font-semibold text-rose-300">{row.efficiency.toFixed(3)}</p>
                              <p className="text-xs text-text-tertiary">MBI {row.moneyballIndex.toFixed(1)}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    <Card className="border-white/10 bg-cyan-500/10">
                      <CardHeader>
                        <CardTitle className="text-base text-cyan-200">최근 폼 상승 TOP 5</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {auctionData.trendingTop.map((row, idx) => (
                          <div key={`trend-top-${row.userId}`} className="flex items-center justify-between rounded-lg border border-cyan-300/20 bg-bg-primary/50 px-3 py-2 text-sm">
                            <span className="text-text-primary">{idx + 1}. {row.username}</span>
                            <div className="text-right">
                              <p className="font-semibold text-cyan-300">
                                {row.recentTrendDelta >= 0 ? "+" : ""}
                                {(row.recentTrendDelta * 100).toFixed(1)}%p
                              </p>
                              <p className="text-xs text-text-tertiary">
                                {row.trendConfidence === "insufficient"
                                  ? "비교 표본 부족"
                                  : row.recentTrendPercent === null
                                  ? "비교 표본 부족"
                                  : `${row.recentTrendPercent >= 0 ? "+" : ""}${row.recentTrendPercent.toFixed(1)}%`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    <Card className="border-white/10 bg-amber-500/10">
                      <CardHeader>
                        <CardTitle className="text-base text-amber-200">거품 리스크 TOP 5</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {auctionData.bubbleRiskTop.map((row, idx) => (
                          <div key={`bubble-top-${row.userId}`} className="flex items-center justify-between rounded-lg border border-amber-300/20 bg-bg-primary/50 px-3 py-2 text-sm">
                            <span className="text-text-primary">{idx + 1}. {row.username}</span>
                            <div className="text-right">
                              <p className="font-semibold text-amber-300">
                                MBI {row.moneyballIndex.toFixed(1)}
                              </p>
                              <p className="text-xs text-text-tertiary">
                                효율 {row.efficiency >= 0 ? "+" : ""}
                                {row.efficiency.toFixed(3)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-bg-primary/70 text-text-tertiary">
                        <tr>
                          <th className="px-3 py-2 text-left">유저</th>
                          <th className="px-3 py-2 text-right">낙찰가</th>
                          <th className="px-3 py-2 text-right">성과</th>
                          <th className="px-3 py-2 text-right">예상</th>
                          <th className="px-3 py-2 text-right">효율</th>
                          <th className="px-3 py-2 text-right">MBI</th>
                          <th className="px-3 py-2 text-right">최근 추세</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...auctionData.scatter]
                          .sort((a, b) => b.efficiency - a.efficiency)
                          .map((row) => (
                            <tr key={`auction-row-${row.userId}`} className="border-t border-white/10">
                              <td className="px-3 py-2 text-text-primary">{row.username}</td>
                              <td className="px-3 py-2 text-right text-text-secondary">{row.soldPrice}</td>
                              <td className="px-3 py-2 text-right text-text-secondary">{row.performance.toFixed(3)}</td>
                              <td className="px-3 py-2 text-right text-text-secondary">{row.expectedPerformance.toFixed(3)}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${row.efficiency >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                {row.efficiency >= 0 ? "+" : ""}
                                {row.efficiency.toFixed(3)}
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold ${row.moneyballIndex >= 100 ? "text-emerald-300" : "text-amber-300"}`}>
                                {row.moneyballIndex.toFixed(1)}
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold ${row.recentTrendDelta >= 0 ? "text-cyan-300" : "text-rose-300"}`}>
                                {row.trendConfidence === "insufficient"
                                  ? "표본부족"
                                  : `${row.recentTrendDelta >= 0 ? "+" : ""}${(row.recentTrendDelta * 100).toFixed(1)}%p`}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <Card className="border-white/10 bg-bg-primary/40">
                    <CardHeader>
                      <CardTitle className="text-base">포지션별 폼 분석</CardTitle>
                      <CardDescription>
                        주포지션 대비 오프포지션 성과/데스 패널티와 범용성 점수를 제공합니다.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 xl:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-text-secondary">범용성 점수 TOP 5</p>
                        {auctionData.roleForm.versatilityTop.map((row, idx) => (
                          <div key={`vers-top-${row.userId}`} className="rounded-lg border border-white/10 bg-bg-secondary/40 px-3 py-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-text-primary">{idx + 1}. {row.username}</span>
                              <span className="font-semibold text-cyan-300">{row.versatilityScore}점</span>
                            </div>
                            <p className="mt-1 text-xs text-text-tertiary">
                              주포지션 {row.primaryPosition ? formatPosition(row.primaryPosition) : "-"} ({row.primaryGames}게임) ·
                              커버 {row.activeRoles}라인 · 신뢰도 {confidenceLabel(row.confidence)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-text-secondary">오프포지션 리스크 TOP 5</p>
                        {auctionData.roleForm.offRoleRiskTop.map((row, idx) => (
                          <div key={`off-risk-${row.userId}`} className="rounded-lg border border-white/10 bg-bg-secondary/40 px-3 py-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-text-primary">{idx + 1}. {row.username}</span>
                              <span className="font-semibold text-rose-300">
                                {((row.offRolePenalty?.performanceDelta ?? 0) * 100).toFixed(1)}%p 하락
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-text-tertiary">
                              승률 하락 {((row.offRolePenalty?.winRateDelta ?? 0) * 100).toFixed(1)}%p ·
                              데스 증가 {((row.offRolePenalty?.deathRateDelta ?? 0) * 100).toFixed(1)}%
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="my-2 border-t border-white/10" />

                  <div id="oracle-team-balance">
                    <h3 className="text-base font-semibold text-text-primary">팀 밸런스 예측기</h3>
                    <p className="text-xs text-text-secondary">
                      유저를 팀 A/B에 배치한 뒤 예측 버튼으로 승률과 신뢰도를 확인합니다.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-bg-primary/40 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        value={oracleSearchQuery}
                        onChange={(e) => setOracleSearchQuery(e.target.value)}
                        placeholder="유저명 검색 (2글자 이상)"
                        className="w-full rounded-lg border border-white/10 bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
                      />
                    </div>
                    {oracleSearching ? (
                      <p className="text-xs text-text-secondary">검색 중...</p>
                    ) : oracleSearchResults.length === 0 ? (
                      <p className="text-xs text-text-tertiary">검색 결과가 없습니다.</p>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {oracleSearchResults.map((user) => {
                          const selected = oracleSelectedUserIds.has(user.id);
                          const selectedBan = banParticipants.some((u) => u.id === user.id);
                          return (
                            <div key={`oracle-user-${user.id}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-secondary/40 px-2 py-1.5">
                              <span className={`text-sm ${selected ? "text-text-tertiary" : "text-text-primary"}`}>
                                {user.username}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  disabled={selected}
                                  onClick={() => addUserToTeam("A", user)}
                                  className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 disabled:opacity-40"
                                >
                                  팀 A
                                </button>
                                <button
                                  type="button"
                                  disabled={selected}
                                  onClick={() => addUserToTeam("B", user)}
                                  className="rounded bg-cyan-500/20 px-2 py-1 text-xs text-cyan-300 disabled:opacity-40"
                                >
                                  팀 B
                                </button>
                                <button
                                  type="button"
                                  disabled={selectedBan || banParticipants.length >= 10}
                                  onClick={() => addBanParticipant(user)}
                                  className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-300 disabled:opacity-40"
                                >
                                  밴 풀
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-emerald-400/25 bg-emerald-500/10">
                      <CardHeader>
                        <CardTitle className="text-base text-emerald-200">팀 A</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {oracleTeamA.length === 0 ? (
                          <p className="text-sm text-text-secondary">아직 배치된 유저가 없습니다.</p>
                        ) : (
                          oracleTeamA.map((user) => (
                            <div key={`team-a-${user.id}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-primary/50 px-3 py-2">
                              <span className="text-sm text-text-primary">{user.username}</span>
                              <button
                                type="button"
                                onClick={() => removeUserFromTeam("A", user.id)}
                                className="text-xs text-rose-300 hover:text-rose-200"
                              >
                                제거
                              </button>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                    <Card className="border-cyan-400/25 bg-cyan-500/10">
                      <CardHeader>
                        <CardTitle className="text-base text-cyan-200">팀 B</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {oracleTeamB.length === 0 ? (
                          <p className="text-sm text-text-secondary">아직 배치된 유저가 없습니다.</p>
                        ) : (
                          oracleTeamB.map((user) => (
                            <div key={`team-b-${user.id}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-primary/50 px-3 py-2">
                              <span className="text-sm text-text-primary">{user.username}</span>
                              <button
                                type="button"
                                onClick={() => removeUserFromTeam("B", user.id)}
                                className="text-xs text-rose-300 hover:text-rose-200"
                              >
                                제거
                              </button>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={runBalancePrediction}
                      disabled={balanceLoading}
                      className="rounded-lg bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-300 hover:bg-violet-500/30 disabled:opacity-50"
                    >
                      {balanceLoading ? "예측 중..." : "예측"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOracleTeamA([]);
                        setOracleTeamB([]);
                        setBalanceResult(null);
                        setBalanceError(null);
                      }}
                      className="rounded-lg bg-bg-primary/60 px-4 py-2 text-sm text-text-secondary hover:bg-bg-elevated"
                    >
                      팀 초기화
                    </button>
                  </div>

                  {balanceError ? (
                    <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {balanceError}
                    </div>
                  ) : null}

                  {balanceResult ? (
                    <div className="space-y-3 rounded-xl border border-white/10 bg-bg-primary/40 p-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-white/10 bg-bg-secondary/40 p-3">
                          <p className="text-xs text-text-tertiary">팀 A 예상 승률</p>
                          <p className="mt-1 text-xl font-bold text-emerald-300">
                            {(balanceResult.teamA.adjustedWinRate * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-bg-secondary/40 p-3">
                          <p className="text-xs text-text-tertiary">팀 B 예상 승률</p>
                          <p className="mt-1 text-xl font-bold text-cyan-300">
                            {(balanceResult.teamB.adjustedWinRate * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-bg-secondary/40 p-3">
                          <p className="text-xs text-text-tertiary">신뢰도</p>
                          <p className="mt-1 text-xl font-bold text-text-primary">
                            {balanceResult.confidence.level === "high"
                              ? "높음"
                              : balanceResult.confidence.level === "moderate"
                                ? "보통"
                                : "낮음"}
                          </p>
                        </div>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-bg-tertiary">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${Math.max(2, Math.min(98, balanceResult.teamA.adjustedWinRate * 100))}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-secondary">
                        팀 A 승률 {(balanceResult.teamA.adjustedWinRate * 100).toFixed(1)}% · 신뢰도{" "}
                        {balanceResult.confidence.level === "high"
                          ? "높음"
                          : balanceResult.confidence.level === "moderate"
                            ? "보통"
                            : "낮음"}{" "}
                        · 샘플 {balanceResult.similarMatches.count}게임
                      </p>
                      <p className="text-xs text-amber-200">
                        참고용 예측입니다. 실제 결과는 밴픽/조합/컨디션에 따라 달라질 수 있습니다.
                      </p>
                    </div>
                  ) : null}

                  <div className="my-2 border-t border-white/10" />

                  <div id="oracle-ban-recommend">
                    <h3 className="text-base font-semibold text-text-primary">밴픽 추천기</h3>
                    <p className="text-xs text-text-secondary">
                      참가자를 최대 10명 선택하면 추천 밴 챔피언과 포지션별 OP 픽을 제공합니다.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <BanMetaSourceBadge source={banRecommendResult?.meta.source} />
                      {banRecommendResult?.meta.source === "hybrid" ? (
                        <span className="text-xs text-text-tertiary">
                          내전 메타에 외부 랭크 메타 {banRecommendResult.meta.externalSupplementedCount}개 보강
                        </span>
                      ) : null}
                      {banRecommendResult?.meta.source === "ranked_only" ? (
                        <span className="text-xs text-text-tertiary">
                          내전 메타 부족으로 외부 랭크 메타 기준 사용
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-bg-primary/40 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {banParticipants.map((user) => (
                        <span
                          key={`ban-participant-${user.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-200"
                        >
                          {user.username}
                          <button
                            type="button"
                            onClick={() => removeBanParticipant(user.id)}
                            className="text-rose-300"
                          >
                            x
                          </button>
                        </span>
                      ))}
                      {banParticipants.length === 0 ? (
                        <p className="text-xs text-text-tertiary">
                          상단 검색 결과의 `밴 풀` 버튼으로 참가자를 추가하세요.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={runBanRecommend}
                        disabled={banRecommendLoading}
                        className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        {banRecommendLoading ? "추천 생성 중..." : "밴 추천 생성"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBanParticipants([]);
                          setBanRecommendResult(null);
                          setBanRecommendError(null);
                        }}
                        className="rounded-lg bg-bg-primary/60 px-4 py-2 text-sm text-text-secondary hover:bg-bg-elevated"
                      >
                        밴 풀 초기화
                      </button>
                      <span className="text-xs text-text-tertiary">
                        {banParticipants.length}/10
                      </span>
                    </div>
                  </div>

                  {banRecommendError ? (
                    <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {banRecommendError}
                    </div>
                  ) : null}

                  {banRecommendResult?.recommendations?.length ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {banRecommendResult.recommendations.map((row) => (
                        <div key={`ban-rec-${row.championId}`} className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-3">
                          <div className="flex items-center gap-2">
                            <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-white/10">
                              <Image
                                src={getChampionIconById(row.championId)}
                                alt={row.championNameKorean}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <div>
                              <p className="font-semibold text-text-primary">{row.championNameKorean}</p>
                              <p className="text-xs text-amber-200">banScore {row.banScore.toFixed(2)}</p>
                            </div>
                          </div>
                          <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                            {row.reasons.map((reason, idx) => (
                              <li key={`ban-reason-${row.championId}-${idx}`}>- {reason}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <Card className="border-white/10 bg-bg-primary/40">
                    <CardHeader>
                      <CardTitle className="text-base">포지션별 픽 추천 (현재 OP 기준)</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      {(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const).map((position) => {
                        const picks = (metaRadar?.tiers?.[position] ?? []).slice(0, 3);
                        return (
                          <div key={`pick-rec-${position}`} className="rounded-lg border border-white/10 bg-bg-secondary/40 p-2">
                            <p className="mb-2 text-xs font-semibold text-text-primary">{formatPosition(position)}</p>
                            <div className="space-y-1.5">
                              {picks.length === 0 ? (
                                <p className="text-xs text-text-tertiary">데이터 없음</p>
                              ) : (
                                picks.map((pick) => (
                                  <div key={`pick-${position}-${pick.championId}`} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <div className="relative h-6 w-6 overflow-hidden rounded border border-white/10">
                                        <Image
                                          src={getChampionIconById(pick.championId)}
                                          alt={`pick-${pick.championId}`}
                                          fill
                                          className="object-cover"
                                          unoptimized
                                        />
                                      </div>
                                      <span className="text-xs text-text-secondary">{championDisplayName(pick.championId)}</span>
                                    </div>
                                    <Badge variant={pick.tier === "S" ? "success" : "secondary"} size="sm">
                                      {pick.tier}
                                    </Badge>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Task 37: 유저 간 직접 대전 상성 */}
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Swords className="h-4 w-4 text-rose-400" />
                직접 대전 상성
              </CardTitle>
              <CardDescription>
                두 유저를 선택해 내전에서의 직접 대전 전적을 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-4 md:grid-cols-2">
                {/* 유저 A 선택 */}
                {(["A", "B"] as const).map((side) => {
                  const selected = side === "A" ? h2hUserA : h2hUserB;
                  return (
                    <div key={side} className="rounded-xl border border-white/10 bg-bg-primary/40 p-3">
                      <p className="mb-2 text-xs font-semibold text-text-secondary">유저 {side}</p>
                      {selected ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10">
                              {selected.avatar ? (
                                <Image src={selected.avatar} alt={selected.username} fill className="object-cover" unoptimized />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-bg-secondary text-xs font-bold text-text-secondary">
                                  {selected.username[0]}
                                </div>
                              )}
                            </div>
                            <span className="text-sm font-medium text-text-primary">{selected.username}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => side === "A" ? setH2hUserA(null) : setH2hUserB(null)}
                            className="rounded px-2 py-0.5 text-xs text-text-tertiary hover:text-text-primary"
                          >
                            변경
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setH2hSelectingFor(side);
                            setH2hSearchQuery("");
                            setH2hSearchResults([]);
                          }}
                          className="w-full rounded-lg border border-dashed border-white/20 py-2 text-xs text-text-tertiary hover:border-white/40 hover:text-text-secondary"
                        >
                          + 유저 선택
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 유저 검색 드롭다운 */}
              {h2hSelectingFor && (
                <div className="mb-4 rounded-xl border border-white/10 bg-bg-primary/60 p-3">
                  <p className="mb-2 text-xs text-text-secondary">유저 {h2hSelectingFor} 검색</p>
                  <input
                    type="text"
                    value={h2hSearchQuery}
                    onChange={(e) => setH2hSearchQuery(e.target.value)}
                    placeholder="닉네임 입력..."
                    className="w-full rounded-lg bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                    autoFocus
                  />
                  {h2hSearching && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
                      <LoadingSpinner />
                      검색 중...
                    </div>
                  )}
                  {h2hSearchResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {h2hSearchResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            if (h2hSelectingFor === "A") setH2hUserA(u);
                            else setH2hUserB(u);
                            setH2hSelectingFor(null);
                            setH2hSearchQuery("");
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-secondary/60"
                        >
                          <div className="relative h-6 w-6 overflow-hidden rounded-full border border-white/10">
                            {u.avatar ? (
                              <Image src={u.avatar} alt={u.username} fill className="object-cover" unoptimized />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-bg-secondary text-xs font-bold text-text-secondary">
                                {u.username[0]}
                              </div>
                            )}
                          </div>
                          <span className="text-text-primary">{u.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setH2hSelectingFor(null)}
                    className="mt-2 text-xs text-text-tertiary hover:text-text-secondary"
                  >
                    취소
                  </button>
                </div>
              )}

              {/* 결과 */}
              {h2hLoading ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : h2hUserA && h2hUserB && h2hData ? (
                <div className="space-y-4">
                  {h2hData.totalGames === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-bg-primary/40 p-4 text-center text-sm text-text-secondary">
                      두 유저의 직접 대전 기록이 없습니다.
                    </div>
                  ) : (
                    <>
                      {/* 전체 전적 */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-white/10 bg-bg-primary/40 p-3 text-center">
                          <p className="text-xs text-text-tertiary">{h2hUserA.username}</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-400">{h2hData.userAWins}</p>
                          <p className="text-xs text-text-secondary">{formatRate(h2hData.userAWinRate)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3 text-center">
                          <p className="text-xs text-text-tertiary">총 대전</p>
                          <p className="mt-1 text-2xl font-bold text-text-primary">{h2hData.totalGames}</p>
                          <Badge variant={
                            h2hData.confidence === "high" ? "success" :
                            h2hData.confidence === "moderate" ? "default" : "warning"
                          } className="mt-1 text-[10px]">
                            {h2hData.confidence === "high" ? "신뢰도 높음" :
                             h2hData.confidence === "moderate" ? "보통" :
                             h2hData.confidence === "low" ? "낮음" : "부족"}
                          </Badge>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-bg-primary/40 p-3 text-center">
                          <p className="text-xs text-text-tertiary">{h2hUserB.username}</p>
                          <p className="mt-1 text-2xl font-bold text-rose-400">{h2hData.userBWins}</p>
                          <p className="text-xs text-text-secondary">{formatRate(h2hData.userBWinRate)}</p>
                        </div>
                      </div>

                      {/* 최근 5경기 */}
                      {h2hData.recentMatches.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-text-secondary">최근 {h2hData.recentMatches.length}경기</p>
                          <div className="space-y-1.5">
                            {h2hData.recentMatches.map((m, idx) => (
                              <div key={`${m.matchId}-${idx}`} className="flex items-center gap-2 rounded-lg bg-bg-primary/40 px-3 py-2 text-xs">
                                <div className="flex flex-1 items-center gap-1.5">
                                  <div className="relative h-6 w-6 overflow-hidden rounded border border-white/10">
                                    <Image src={getChampionIconById(m.userAChampionId)} alt={m.userAChampionName} fill className="object-cover" unoptimized />
                                  </div>
                                  <span className={m.userAWin ? "font-medium text-emerald-400" : "text-text-tertiary"}>
                                    {m.userAKills}/{m.userADeaths}/{m.userAAssists}
                                  </span>
                                  <span className="text-text-tertiary">{formatPosition(m.userAPosition)}</span>
                                </div>
                                <Badge variant={m.userAWin ? "success" : "danger"} className="shrink-0 text-[10px]">
                                  {m.userAWin ? `${h2hUserA.username} 승` : `${h2hUserB.username} 승`}
                                </Badge>
                                <div className="flex flex-1 items-center justify-end gap-1.5">
                                  <span className="text-text-tertiary">{formatPosition(m.userBPosition)}</span>
                                  <span className={m.userBWin ? "font-medium text-emerald-400" : "text-text-tertiary"}>
                                    {m.userBKills}/{m.userBDeaths}/{m.userBAssists}
                                  </span>
                                  <div className="relative h-6 w-6 overflow-hidden rounded border border-white/10">
                                    <Image src={getChampionIconById(m.userBChampionId)} alt={m.userBChampionName} fill className="object-cover" unoptimized />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : !h2hUserA || !h2hUserB ? (
                <div className="rounded-xl border border-dashed border-white/15 bg-bg-primary/40 p-4 text-center text-xs text-text-tertiary">
                  두 유저를 선택하면 직접 대전 전적이 표시됩니다.
                </div>
              ) : null}
            </CardContent>
          </Card>
          </>
        ) : null}

        {activeTab === "compositions" ? (
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>시너지 조합 분석</CardTitle>
              <CardDescription>
                챔피언을 선택해 시너지 파트너 승률 순위를 확인합니다.
              </CardDescription>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-tertiary">시너지</span>
                <LabSourceBadge source={synergyData?.source} />
                <span className="text-xs text-text-tertiary">카운터</span>
                <LabSourceBadge source={counterData?.source} />
                <span className="text-xs text-text-tertiary">조합 유형</span>
                <LabSourceBadge source={compositionsData?.source} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSynergyChampionId(null)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    synergyChampionId === null
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-bg-primary/60 text-text-secondary"
                  }`}
                >
                  전체 조합
                </button>
                <select
                  value={synergyChampionId ?? ""}
                  onChange={(e) =>
                    setSynergyChampionId(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="min-w-[240px] rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="">챔피언 선택</option>
                  {championCatalog.map((champion) => (
                    <option key={`synergy-option-${champion.championId}`} value={champion.championId}>
                      {champion.championNameKorean}
                    </option>
                  ))}
                </select>
              </div>

              {synergyLoading ? (
                <div className="flex min-h-[220px] items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : synergyRows.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-4 text-sm text-text-secondary">
                  조건에 맞는 시너지 조합이 없습니다. (데이터 부족)
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {synergyRows.map((row) => {
                    const isFiltered = synergyChampionId !== null;
                    const partnerId =
                      isFiltered && row.champ1Id === synergyChampionId
                        ? row.champ2Id
                        : row.champ1Id;
                    const partnerName =
                      isFiltered && row.champ1Id === synergyChampionId
                        ? row.champ2NameKorean
                        : row.champ1NameKorean;
                    return (
                      <div key={`${row.champ1Id}-${row.champ2Id}`} className={`rounded-xl border border-white/10 bg-bg-primary/50 p-3 ${row.confidenceLevel === "low" ? "opacity-80" : ""}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-white/10">
                              <Image src={getChampionIconById(row.champ1Id)} alt={row.champ1NameKorean} fill className="object-cover" unoptimized />
                            </div>
                            <span className="text-xs text-text-tertiary">+</span>
                            <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-white/10">
                              <Image src={getChampionIconById(row.champ2Id)} alt={row.champ2NameKorean} fill className="object-cover" unoptimized />
                            </div>
                          </div>
                          <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"} size="sm">
                            {confidenceLabel(row.confidenceLevel)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-text-primary">
                          {isFiltered ? `파트너: ${partnerName}` : `${row.champ1NameKorean} + ${row.champ2NameKorean}`}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {row.games}게임 · 승률 {formatRate(row.winRate)}
                        </p>
                        <p className="mt-1 text-xs text-text-tertiary">
                          기대 대비 {row.deltaWinRate >= 0 ? "+" : ""}
                          {(row.deltaWinRate * 100).toFixed(1)}%p
                        </p>
                        {row.badges.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {row.badges.map((badge) => (
                              <Badge key={`${row.champ1Id}-${row.champ2Id}-${badge}`} variant="success" size="sm">
                                {badge}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {isFiltered ? (
                          <button
                            type="button"
                            onClick={() => setSynergyChampionId(partnerId)}
                            className="mt-3 text-xs text-cyan-300 hover:text-cyan-200"
                          >
                            {partnerName} 중심으로 보기
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="my-6 border-t border-white/10" />

              <div className="mb-3">
                <h3 className="text-base font-semibold text-text-primary">카운터 상성</h3>
                <p className="text-xs text-text-secondary">
                  챔피언 기준 상성 데이터를 포지션별로 확인합니다.
                </p>
              </div>

              <div className="mb-4 grid gap-2 md:grid-cols-4">
                <select
                  value={counterChampionId ?? ""}
                  onChange={(e) =>
                    setCounterChampionId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="">기준 챔피언 (전체)</option>
                  {championCatalog.map((champion) => (
                    <option key={`counter-champion-${champion.championId}`} value={champion.championId}>
                      {champion.championNameKorean}
                    </option>
                  ))}
                </select>
                <select
                  value={counterVsChampionId ?? ""}
                  onChange={(e) =>
                    setCounterVsChampionId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="">상대 챔피언 (전체)</option>
                  {championCatalog.map((champion) => (
                    <option key={`counter-vs-${champion.championId}`} value={champion.championId}>
                      {champion.championNameKorean}
                    </option>
                  ))}
                </select>
                <select
                  value={counterPosition}
                  onChange={(e) =>
                    setCounterPosition(
                      (e.target.value || "ALL") as
                        | "ALL"
                        | "TOP"
                        | "JUNGLE"
                        | "MID"
                        | "ADC"
                        | "SUPPORT",
                    )
                  }
                  className="rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
                >
                  <option value="ALL">전체 포지션</option>
                  <option value="TOP">탑</option>
                  <option value="JUNGLE">정글</option>
                  <option value="MID">미드</option>
                  <option value="ADC">원딜</option>
                  <option value="SUPPORT">서포터</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setCounterChampionId(null);
                    setCounterVsChampionId(null);
                    setCounterPosition("ALL");
                  }}
                  className="rounded-lg bg-bg-primary/60 px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated"
                >
                  필터 초기화
                </button>
              </div>

              {counterLoading ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : (counterData?.rows ?? []).length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-4 text-sm text-text-secondary">
                  조건에 맞는 카운터 데이터가 없습니다. (데이터 부족)
                </div>
              ) : (
                <div className="space-y-2">
                  {(counterData?.rows ?? []).map((row) => (
                    <div
                      key={`${row.champId}-${row.vsChampId}-${row.position ?? "ALL"}`}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                        row.verdict === "favorable"
                          ? "border-emerald-400/25 bg-emerald-500/10"
                          : row.verdict === "unfavorable"
                            ? "border-rose-400/25 bg-rose-500/10"
                            : "border-white/10 bg-bg-primary/50"
                      } ${row.confidenceLevel === "low" ? "opacity-80" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10">
                          <Image src={getChampionIconById(row.champId)} alt={row.champNameKorean} fill className="object-cover" unoptimized />
                        </div>
                        <span className="text-xs text-text-tertiary">vs</span>
                        <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10">
                          <Image src={getChampionIconById(row.vsChampId)} alt={row.vsChampNameKorean} fill className="object-cover" unoptimized />
                        </div>
                        <p className="text-sm text-text-primary">
                          {row.champNameKorean} vs {row.vsChampNameKorean}
                          {row.position ? ` (${formatPosition(row.position)})` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span>{row.games}게임</span>
                        <span>승률 {formatRate(row.winRate)}</span>
                        <Badge
                          variant={
                            row.verdict === "favorable"
                              ? "success"
                              : row.verdict === "unfavorable"
                                ? "danger"
                                : "secondary"
                          }
                          size="sm"
                        >
                          {row.verdict === "favorable"
                            ? "유리"
                            : row.verdict === "unfavorable"
                              ? "불리"
                              : "비등"}
                        </Badge>
                        <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"} size="sm">
                          {confidenceLabel(row.confidenceLevel)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="my-6 border-t border-white/10" />

              <div className="mb-3">
                <h3 className="text-base font-semibold text-text-primary">팀 구성 유형 분석</h3>
                <p className="text-xs text-text-secondary">
                  한타/스플릿/포킹/속공/탱커라인 유형별 승률과 픽률입니다.
                </p>
              </div>

              {compositionsLoading ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : (compositionsData?.rows ?? []).length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-4 text-sm text-text-secondary">
                  조합 유형 데이터가 없습니다. (데이터 부족)
                </div>
              ) : (
                <div className="space-y-3">
                  {(compositionsData?.rows ?? []).map((row) => {
                    const barWidth = Math.max(4, row.winRate * 100);
                    return (
                      <div
                        key={`composition-${row.type}`}
                        className={`rounded-xl border border-white/10 bg-bg-primary/50 p-3 ${row.confidenceLevel === "low" ? "opacity-80" : ""}`}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-text-primary">{row.label}</p>
                            <div className="flex items-center gap-1">
                              {(COMPOSITION_EXAMPLE_CHAMPIONS[row.type] ?? []).map((championId) => (
                                <div key={`${row.type}-${championId}`} className="relative h-6 w-6 overflow-hidden rounded border border-white/10">
                                  <Image
                                    src={getChampionIconById(championId)}
                                    alt={`${row.label}-example-${championId}`}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"} size="sm">
                              {confidenceLabel(row.confidenceLevel)}
                            </Badge>
                            <Badge variant="secondary" size="sm">
                              참고용
                            </Badge>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${barWidth}%` }} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                          <span>{row.games}팀</span>
                          <span>승률 {(row.winRate * 100).toFixed(1)}%</span>
                          <span>픽률 {(row.pickRate * 100).toFixed(1)}%</span>
                          <span>평균 길이 {Math.round(row.avgGameDurationSec / 60)}분</span>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-text-tertiary">{compositionsData?.caveat}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "champions" ? (
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>챔피언 분석 목록</CardTitle>
              <CardDescription>
                검색/정렬/포지션 필터 기반으로 챔피언 픽률·승률·밴률을 탐색합니다.
              </CardDescription>
              <div className="flex items-center gap-2">
                <LabSourceBadge source={championList?.source} />
                {championList?.source === "realtime" ? (
                  <span className="text-xs text-text-tertiary">스냅샷 미스 시 원본 집계</span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <input
                  value={championSearch}
                  onChange={(e) => setChampionSearch(e.target.value)}
                  placeholder="챔피언 검색 (한글/영문)"
                  className="w-full rounded-xl border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary md:max-w-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChampionSort("pickRate")}
                    className={`rounded-lg px-3 py-1.5 text-xs ${championSort === "pickRate" ? "bg-emerald-500/20 text-emerald-300" : "bg-bg-primary/60 text-text-secondary"}`}
                  >
                    픽률순
                  </button>
                  <button
                    type="button"
                    onClick={() => setChampionSort("winRate")}
                    className={`rounded-lg px-3 py-1.5 text-xs ${championSort === "winRate" ? "bg-emerald-500/20 text-emerald-300" : "bg-bg-primary/60 text-text-secondary"}`}
                  >
                    승률순
                  </button>
                  <button
                    type="button"
                    onClick={() => setChampionSort("banRate")}
                    className={`rounded-lg px-3 py-1.5 text-xs ${championSort === "banRate" ? "bg-emerald-500/20 text-emerald-300" : "bg-bg-primary/60 text-text-secondary"}`}
                  >
                    밴률순
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncludeLowSample((prev) => !prev)}
                    className={`rounded-lg px-3 py-1.5 text-xs ${includeLowSample ? "bg-cyan-500/20 text-cyan-300" : "bg-bg-primary/60 text-text-secondary"}`}
                  >
                    5게임 미만 포함
                  </button>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                {(["ALL", "TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const).map((position) => (
                  <button
                    key={position}
                    type="button"
                    onClick={() => setPosition(position)}
                    className={`rounded-lg px-3 py-1.5 text-xs ${activePosition === position ? "bg-violet-500/20 text-violet-300" : "bg-bg-primary/60 text-text-secondary"}`}
                  >
                    {position === "ALL" ? "전체" : formatPosition(position)}
                  </button>
                ))}
              </div>

              {/* 챔피언 목록 — md 이상: 테이블, 미만: 카드 그리드 */}
              <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-bg-primary/70 text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2 text-left">챔피언</th>
                      <th className="px-3 py-2 text-right">티어</th>
                      <th className="px-3 py-2 text-right">게임</th>
                      <th className="px-3 py-2 text-right">승률</th>
                      <th className="px-3 py-2 text-right">픽률</th>
                      <th className="px-3 py-2 text-right">밴률</th>
                      <th className="px-3 py-2 text-right">신뢰도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {championRowsFiltered.map((row) => (
                      <tr
                        key={row.championId}
                        className={`border-t border-white/10 bg-bg-secondary/40 transition-colors hover:bg-bg-elevated/60 ${
                          row.confidenceLevel === "low" ? "opacity-80" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setSelectedChampionId(row.championId)}
                            className="flex items-center gap-2 text-left"
                          >
                            <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-white/10">
                              <Image
                                src={getChampionIconById(row.championId)}
                                alt={row.championNameKorean}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <span className="text-text-primary">{row.championNameKorean}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant={row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"}>
                            {row.tier}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right text-text-secondary">{row.games}</td>
                        <td className="px-3 py-2 text-right text-text-secondary">{(row.winRate * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right text-text-secondary">{row.pickRate.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right text-text-secondary">{row.banRate.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"}>
                            {confidenceLabel(row.confidenceLevel)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 모바일: 카드 그리드 */}
              <div className="grid grid-cols-2 gap-3 md:hidden">
                {championRowsFiltered.map((row) => (
                  <button
                    key={row.championId}
                    type="button"
                    onClick={() => setSelectedChampionId(row.championId)}
                    className={`rounded-xl border border-white/10 bg-bg-secondary/40 p-3 text-left transition-colors hover:bg-bg-elevated/60 ${
                      row.confidenceLevel === "low" ? "opacity-80" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10">
                        <Image
                          src={getChampionIconById(row.championId)}
                          alt={row.championNameKorean}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">{row.championNameKorean}</p>
                        <Badge variant={row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"} className="mt-0.5 text-xs">
                          {row.tier}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-text-tertiary">
                      <div>
                        <p>승률</p>
                        <p className="font-semibold text-text-secondary">{(row.winRate * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p>픽률</p>
                        <p className="font-semibold text-text-secondary">{row.pickRate.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p>게임</p>
                        <p className="font-semibold text-text-secondary">{row.games}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {championRowsFiltered.length === 0 ? (
                <LabEmptyState level="insufficient" section="챔피언 목록" className="mt-4" />
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Modal
          isOpen={selectedChampionId !== null}
          onClose={() => setSelectedChampionId(null)}
          size="full"
          title={
            selectedChampionRow
              ? `${selectedChampionRow.championNameKorean} 상세 분석`
              : "챔피언 상세 분석"
          }
        >
          {championDetailLoading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : championDetailError ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
              {championDetailError}
            </div>
          ) : championDetail && championMastery ? (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                  <p className="text-xs text-text-tertiary">누적 게임</p>
                  <p className="mt-1 text-xl font-bold text-text-primary">{championDetail.totals.games}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                  <p className="text-xs text-text-tertiary">승률</p>
                  <p className="mt-1 text-xl font-bold text-emerald-300">{formatRate(championDetail.totals.winRate)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                  <p className="text-xs text-text-tertiary">장인 자격 통과</p>
                  <p className="mt-1 text-xl font-bold text-cyan-300">{championMastery.qualifiedCount}명</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                  <p className="text-xs text-text-tertiary">기간</p>
                  <p className="mt-1 text-xl font-bold text-text-primary">{championDetail.period}</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <Card className="border-white/10 bg-bg-primary/40">
                  <CardHeader>
                    <CardTitle className="text-base">기간별 승률 추이</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {championDetail.trendInsufficient || !trendChartData ? (
                      <p className="text-sm text-text-secondary">주간 데이터가 3포인트 미만이라 추이를 표시하지 않습니다.</p>
                    ) : (
                      <svg viewBox={`0 0 ${trendChartData.width} ${trendChartData.height}`} className="w-full">
                        {trendChartData.yTicks.map((tick, idx) => (
                          <g key={idx}>
                            <line
                              x1={trendChartData.pad.left}
                              x2={trendChartData.width - trendChartData.pad.right}
                              y1={trendChartData.toY(tick)}
                              y2={trendChartData.toY(tick)}
                              stroke="currentColor"
                              strokeOpacity={0.12}
                            />
                            <text
                              x={trendChartData.pad.left - 4}
                              y={trendChartData.toY(tick) + 4}
                              textAnchor="end"
                              fontSize="10"
                              fill="currentColor"
                              fillOpacity={0.6}
                            >
                              {(tick * 100).toFixed(1)}%
                            </text>
                          </g>
                        ))}
                        <path d={trendChartData.area} fill="#10b981" fillOpacity={0.12} />
                        <path d={trendChartData.path} stroke="#34d399" strokeWidth="2.5" fill="none" />
                        {trendChartData.points.map((point, idx) => (
                          <circle
                            key={point.weekStart}
                            cx={trendChartData.xTicks[idx].x}
                            cy={trendChartData.toY(point.winRate)}
                            r="3.5"
                            fill="#34d399"
                          />
                        ))}
                        {trendChartData.xTicks.map((tick, idx) => (
                          <text
                            key={`${tick.label}-${idx}`}
                            x={tick.x}
                            y={trendChartData.height - 8}
                            textAnchor="middle"
                            fontSize="10"
                            fill="currentColor"
                            fillOpacity={0.6}
                          >
                            {tick.label}
                          </text>
                        ))}
                      </svg>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-bg-primary/40">
                  <CardHeader>
                    <CardTitle className="text-base">포지션 분포</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {positionPie.length === 0 ? (
                      <p className="text-sm text-text-secondary">포지션 분포 데이터가 없습니다.</p>
                    ) : (
                      <div className="flex flex-col gap-4 md:flex-row md:items-center">
                        <svg viewBox="0 0 192 192" className="h-44 w-44 shrink-0">
                          {positionPie.map((slice) => (
                            <path key={slice.position} d={slice.path} fill={slice.color} opacity={slice.confidenceLevel === "low" ? 0.7 : 1} />
                          ))}
                          <circle cx="96" cy="96" r="36" fill="rgba(15,23,42,0.9)" />
                        </svg>
                        <div className="w-full space-y-2">
                          {positionPie.map((slice) => (
                            <div key={`legend-${slice.position}`} className={`rounded-lg border border-white/10 bg-bg-secondary/40 px-3 py-2 text-xs ${slice.confidenceLevel === "low" ? "opacity-75" : ""}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-text-primary">{formatPosition(slice.position)}</span>
                                <Badge variant={slice.confidenceLevel === "high" ? "success" : "warning"} size="sm">
                                  {confidenceLabel(slice.confidenceLevel)}
                                </Badge>
                              </div>
                              <p className="mt-1 text-text-secondary">
                                {slice.games}게임 · 점유율 {(slice.pickRateWithinChampion * 100).toFixed(1)}% · 승률 {formatRate(slice.winRate)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="border-white/10 bg-bg-primary/40">
                  <CardHeader>
                    <CardTitle className="text-base">최고 성과 빌드 TOP 5</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {championDetail.topItemCombos.length === 0 ? (
                      <p className="text-sm text-text-secondary">조건을 만족하는 빌드 조합이 없습니다.</p>
                    ) : championDetail.topItemCombos.map((combo) => (
                      <div key={`${combo.itemIds[0]}-${combo.itemIds[1]}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-secondary/50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10">
                            <Image src={getItemIcon(combo.itemIds[0])} alt={`item-${combo.itemIds[0]}`} fill className="object-cover" unoptimized />
                          </div>
                          <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10">
                            <Image src={getItemIcon(combo.itemIds[1])} alt={`item-${combo.itemIds[1]}`} fill className="object-cover" unoptimized />
                          </div>
                        </div>
                        <p className="text-xs text-text-secondary">{combo.games}게임</p>
                        <p className="text-sm font-semibold text-emerald-300">{formatRate(combo.winRate)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-bg-primary/40">
                  <CardHeader>
                    <CardTitle className="text-base">최고 성과 룬 TOP 3</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {championDetail.topRuneCombos.length === 0 ? (
                      <p className="text-sm text-text-secondary">조건을 만족하는 룬 조합이 없습니다.</p>
                    ) : championDetail.topRuneCombos.map((combo) => (
                      <div key={`${combo.primaryStyle}-${combo.subStyle}-${combo.keystonePerk}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-secondary/50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          {[combo.keystonePerk, combo.primaryStyle, combo.subStyle].map((runeId) => (
                            <RuneTooltip runeId={runeId} key={`${combo.primaryStyle}-${runeId}`}>
                              <div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-slate-950/50">
                                <Image
                                  src={`/icons/perks/${runeId}.png`}
                                  alt={`rune-${runeId}`}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            </RuneTooltip>
                          ))}
                        </div>
                        <p className="text-xs text-text-secondary">{combo.games}게임</p>
                        <p className="text-sm font-semibold text-cyan-300">{formatRate(combo.winRate)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {championMastery.appliedCriteria.isRelaxed ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  현재 완화 기준 적용 중: {championMastery.appliedCriteria.minTier} {championMastery.appliedCriteria.minRank} 이상 · {championMastery.appliedCriteria.minGames}게임 · 승률 {(championMastery.appliedCriteria.minWinRate * 100).toFixed(0)}%+
                </div>
              ) : null}

              {championMastery.insufficient ? (
                <div className="rounded-lg border border-white/10 bg-bg-primary/50 px-3 py-4 text-sm text-text-secondary">
                  자격 통과자가 3명 미만이라 장인 데이터가 부족합니다.
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-text-primary">장인 목록 (최대 50위)</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    {championMastery.masteries.slice(0, 3).map((entry) => (
                      <div key={`podium-${entry.userId}`} className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-text-primary">
                            {entry.rank === 1 ? <Crown className="h-4 w-4 text-amber-300" /> : <Medal className={`h-4 w-4 ${entry.rank === 2 ? "text-slate-300" : "text-amber-600"}`} />}
                            <span className="font-semibold">{entry.rank}위</span>
                          </div>
                          <Badge variant={tierBadgeVariant(entry.riotTier)} size="sm">
                            {tierLabel(entry.riotTier, entry.riotRank)}
                          </Badge>
                        </div>
                        <p className="mt-2 font-semibold text-text-primary">{entry.username}</p>
                        <p className="text-xs text-text-secondary">
                          {entry.champGames}게임 · 챔프승률 {formatRate(entry.champWinRate)} · 내전승률 {(entry.nexusWinRate * 100).toFixed(1)}%
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.badges.map((badge) => (
                            <Badge key={`${entry.userId}-${badge}`} variant={badge === "커뮤니티 인증" ? "success" : badge === "고평가" ? "warning" : "secondary"} size="sm">
                              {badge}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-bg-primary/70 text-text-tertiary">
                        <tr>
                          <th className="px-3 py-2 text-left">순위</th>
                          <th className="px-3 py-2 text-left">이름</th>
                          <th className="px-3 py-2 text-left">티어</th>
                          <th className="px-3 py-2 text-right">게임</th>
                          <th className="px-3 py-2 text-right">승률</th>
                          <th className="px-3 py-2 text-right">점수</th>
                          <th className="px-3 py-2 text-right">masteryScore</th>
                        </tr>
                      </thead>
                      <tbody>
                        {championMastery.masteries.map((entry) => (
                          <tr key={`mastery-${entry.userId}`} className="border-t border-white/10">
                            <td className="px-3 py-2 text-text-secondary">{entry.rank}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-text-primary">{entry.username}</span>
                                {entry.badges.map((badge) => (
                                  <Badge key={`${entry.userId}-${badge}-row`} variant={badge === "커뮤니티 인증" ? "success" : badge === "고평가" ? "warning" : "secondary"} size="sm">
                                    {badge}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={tierBadgeVariant(entry.riotTier)} size="sm">
                                {tierLabel(entry.riotTier, entry.riotRank)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right text-text-secondary">{entry.champGames}</td>
                            <td className="px-3 py-2 text-right text-text-secondary">{formatRate(entry.champWinRate)}</td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className="inline-flex items-center gap-1 text-text-secondary"
                                title={`볼륨 ${entry.scoreBreakdown.volume.toFixed(1)} / 실력 ${entry.scoreBreakdown.skill.toFixed(1)} / 임팩트 ${entry.scoreBreakdown.impact.toFixed(1)} / 최근성 ${entry.scoreBreakdown.recency.toFixed(1)}`}
                              >
                                <Info className="h-3.5 w-3.5" />
                                분해
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-2 w-28 overflow-hidden rounded-full bg-bg-tertiary">
                                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min((entry.masteryScore / 100) * 100, 100)}%` }} />
                                </div>
                                <span className="w-10 text-right text-text-primary">{entry.masteryScore.toFixed(1)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">챔피언을 선택하면 상세 데이터를 불러옵니다.</p>
          )}
        </Modal>

        {activeTab === "meta" ? (
          <>
        <Card className="mb-6 border-amber-300/20 bg-amber-500/10">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-200">
              <Beaker className="h-4 w-4" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em]">Patch Impact Briefing</span>
            </div>
            <CardTitle>패치 임팩트 핵심 브리핑</CardTitle>
            <CardDescription>
              {patchImpact?.currentPatch && patchImpact?.previousPatch
                ? `${patchImpact.previousPatch} → ${patchImpact.currentPatch} 기준 내전 양상 변화`
                : "패치 비교 데이터 준비 중"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                <p className="mb-2 text-xs font-semibold text-emerald-300">수혜 챔피언</p>
                <div className="space-y-1.5">
                  {(patchImpact?.buffed ?? []).slice(0, 5).map((row) => (
                    <p key={`patch-brief-buff-${row.championId}`} className="text-xs text-text-secondary">
                      {row.championNameKorean} · +{row.deltaWinRate.toFixed(1)}%p
                    </p>
                  ))}
                  {(patchImpact?.buffed ?? []).length === 0 ? (
                    <p className="text-xs text-text-tertiary">데이터 없음</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                <p className="mb-2 text-xs font-semibold text-rose-300">피해 챔피언</p>
                <div className="space-y-1.5">
                  {(patchImpact?.nerfed ?? []).slice(0, 5).map((row) => (
                    <p key={`patch-brief-nerf-${row.championId}`} className="text-xs text-text-secondary">
                      {row.championNameKorean} · {row.deltaWinRate.toFixed(1)}%p
                    </p>
                  ))}
                  {(patchImpact?.nerfed ?? []).length === 0 ? (
                    <p className="text-xs text-text-tertiary">데이터 없음</p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                <p className="mb-2 text-xs font-semibold text-cyan-300">포지션 변화 TOP 3</p>
                <div className="space-y-1.5">
                  {(patchImpact?.positionShifts ?? []).slice(0, 3).map((row) => (
                    <p key={`patch-brief-pos-${row.position}`} className="text-xs text-text-secondary">
                      {formatPosition(row.position)} · 승률 {row.deltaWinRate >= 0 ? "+" : ""}
                      {row.deltaWinRate.toFixed(1)}%p · 픽률 {row.deltaPickRate >= 0 ? "+" : ""}
                      {row.deltaPickRate.toFixed(2)}%p
                    </p>
                  ))}
                  {(patchImpact?.positionShifts ?? []).length === 0 ? (
                    <p className="text-xs text-text-tertiary">데이터 없음</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
                <p className="mb-2 text-xs font-semibold text-violet-300">조합 변화 TOP 3</p>
                <div className="space-y-1.5">
                  {(patchImpact?.compositionShifts ?? []).slice(0, 3).map((row) => (
                    <p key={`patch-brief-comp-${row.type}`} className="text-xs text-text-secondary">
                      {row.label} · 픽률 {row.deltaPickRate >= 0 ? "+" : ""}
                      {row.deltaPickRate.toFixed(2)}%p · 승률 {row.deltaWinRate >= 0 ? "+" : ""}
                      {row.deltaWinRate.toFixed(1)}%p
                    </p>
                  ))}
                  {(patchImpact?.compositionShifts ?? []).length === 0 ? (
                    <p className="text-xs text-text-tertiary">데이터 없음</p>
                  ) : null}
                </div>
              </div>
            </div>
            <p className="text-xs text-text-tertiary">
              표본: 현재 {patchImpact?.sample.currentGames ?? 0}경기 / 이전 {patchImpact?.sample.previousGames ?? 0}경기
            </p>
          </CardContent>
        </Card>

        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>트렌딩 챔피언</CardTitle>
              <CardDescription>최근 픽률 상승폭 기준 TOP 5</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(metaRadar?.trending ?? []).slice(0, 5).map((champion) => (
                <div key={champion.championId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-primary/60 p-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                    <Image
                      src={getChampionIconById(champion.championId)}
                      alt={champion.championNameKorean}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">{champion.championNameKorean}</p>
                    <p className="text-xs text-text-tertiary">
                      승률 {champion.recentWinRate.toFixed(1)}% · 최근 {champion.recentGames}게임
                    </p>
                  </div>
                  <Badge variant="success">+{champion.pickRateDelta.toFixed(2)}%p</Badge>
                </div>
              ))}
              {(metaRadar?.trending ?? []).length === 0 ? (
                <p className="text-sm text-text-secondary">트렌딩 데이터가 아직 부족합니다.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>내전 vs 랭크 메타 비교</CardTitle>
              <CardDescription>
                고티어(챌린저+그마) 랭크 메타와 내전 메타의 챔피언 승률 차이를 비교합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!rankedSnapshots || rankedSnapshots.champions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-bg-primary/60 p-4 text-sm text-text-secondary">
                  랭크 메타 스냅샷 수집 중입니다. 고티어 시딩 유저 배치가 완료되면 데이터가 표시됩니다.
                </div>
              ) : (() => {
                // 내전 스냅샷 맵 (championId → winRate/games)
                const customMap = new Map(
                  (metaRadar?.tiers ? Object.values(metaRadar.tiers).flat() : []).map((c) => [
                    c.championId,
                    { winRate: c.winRate, games: c.games },
                  ]),
                );
                // 랭크 스냅샷 상위 20개 (wilsonLower 기준)
                const rankedTop = rankedSnapshots.champions
                  .filter((r) => r.position === null && r.games >= 5)
                  .slice(0, 20);

                // 내전 대비 격차 계산
                const compared = rankedTop
                  .map((r) => ({
                    ...r,
                    customWinRate: (customMap.get(r.championId)?.winRate ?? null) as number | null,
                    customGames: (customMap.get(r.championId)?.games ?? null) as number | null,
                    delta:
                      customMap.get(r.championId) !== undefined
                        ? r.winRate - (customMap.get(r.championId)?.winRate as number)
                        : null,
                  }))
                  .filter((r) => r.customWinRate !== null)
                  .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

                return (
                  <div className="space-y-2">
                    <div className="mb-3 flex gap-4 text-xs text-text-tertiary">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                        랭크 우세 (랭크 승률 더 높음)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                        내전 우세 (내전 승률 더 높음)
                      </span>
                    </div>
                    {compared.slice(0, 10).map((row) => {
                      const isRankedBetter = (row.delta ?? 0) > 0;
                      return (
                        <div
                          key={row.championId}
                          className="flex items-center gap-2 rounded-lg bg-bg-primary/40 px-3 py-2"
                        >
                          <Image
                            src={getChampionIconById(row.championId)}
                            alt={championDisplayName(row.championId)}
                            width={24}
                            height={24}
                            className="rounded-full"
                          />
                          <span className="w-20 truncate text-xs text-text-secondary">
                            {championDisplayName(row.championId)}
                          </span>
                          <div className="flex flex-1 items-center gap-2 text-xs">
                            <span className="text-text-tertiary">
                              내전 {formatRate(row.customWinRate ?? 0)} ({row.customGames ?? 0}게임)
                            </span>
                            <ArrowRight className="h-3 w-3 text-text-tertiary" />
                            <span className="font-medium text-text-primary">
                              랭크 {formatRate(row.winRate)} ({row.games}게임)
                            </span>
                          </div>
                          <Badge
                            variant={isRankedBetter ? "success" : "danger"}
                            className="shrink-0 text-xs"
                          >
                            {isRankedBetter ? "+" : ""}
                            {((row.delta ?? 0) * 100).toFixed(1)}%p
                          </Badge>
                        </div>
                      );
                    })}
                    {compared.length === 0 && (
                      <p className="text-sm text-text-secondary">
                        내전과 랭크 데이터가 겹치는 챔피언이 없습니다.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-text-tertiary">
                      * 랭크 기준: KR 챌린저+그마 30일 데이터 (최소 5경기)
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle>포지션별 티어 그리드</CardTitle>
            <CardDescription>Wilson + Pick 가중 점수 기반 (S/A/B/C/D)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].map((position) => {
              const rows = (metaRadar?.tiers?.[position] ?? []).slice(0, 5);
              return (
                <div key={position} className="rounded-xl border border-white/10 bg-bg-primary/60 p-3">
                  <p className="mb-2 text-sm font-semibold text-text-primary">{formatPosition(position)}</p>
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div key={`${position}-${row.championId}`} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded border border-white/10">
                            <Image
                              src={getChampionIconById(row.championId)}
                              alt={championDisplayName(row.championId)}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <span className="truncate text-text-secondary">
                            {championDisplayName(row.championId)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant={row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"}>
                            {row.tier}
                          </Badge>
                          <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"}>
                            {confidenceLabel(row.confidenceLevel)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {rows.length === 0 ? (
                      <p className="text-xs text-text-tertiary">데이터 부족</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Task 38: 활동 패턴 히트맵 */}
        {playPatterns && playPatterns.totalGames > 0 && (
          <Card className="mb-6 border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                내전 활동 패턴
              </CardTitle>
              <CardDescription>
                KST 기준 요일·시간대별 내전 빈도 분석 (총 {playPatterns.totalGames}경기 / {playPatterns.periodDays}일)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* 요일별 막대 */}
                <div>
                  <p className="mb-3 text-xs font-semibold text-text-secondary">요일별 빈도</p>
                  <div className="space-y-1.5">
                    {playPatterns.byDayOfWeek.map((d) => {
                      const maxGames = Math.max(...playPatterns.byDayOfWeek.map((x) => x.games), 1);
                      const pct = d.games / maxGames;
                      return (
                        <div key={d.dayOfWeek} className="flex items-center gap-2">
                          <span className={`w-4 text-xs font-medium ${d.dayOfWeek === playPatterns.peakDayOfWeek ? "text-cyan-400" : "text-text-tertiary"}`}>
                            {d.dayLabel}
                          </span>
                          <div className="flex-1 rounded-full bg-bg-primary/60">
                            <div
                              className={`h-4 rounded-full ${d.dayOfWeek === playPatterns.peakDayOfWeek ? "bg-cyan-500" : "bg-white/20"}`}
                              style={{ width: `${Math.max(pct * 100, 2)}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-xs text-text-secondary">{d.games}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 시간대별 막대 */}
                <div>
                  <p className="mb-3 text-xs font-semibold text-text-secondary">시간대별 빈도 (KST)</p>
                  <div className="flex h-32 items-end gap-0.5">
                    {playPatterns.byHour.map((h) => {
                      const maxGames = Math.max(...playPatterns.byHour.map((x) => x.games), 1);
                      const pct = h.games / maxGames;
                      return (
                        <div key={h.hour} className="group relative flex flex-1 flex-col items-center">
                          <div
                            className={`w-full rounded-t transition-colors ${h.hour === playPatterns.peakHour ? "bg-cyan-500" : "bg-white/20 group-hover:bg-white/30"}`}
                            style={{ height: `${Math.max(pct * 100, 2)}%` }}
                          />
                          {h.hour % 6 === 0 && (
                            <span className="absolute -bottom-5 text-[9px] text-text-tertiary">{h.hour}시</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex gap-4 text-xs text-text-tertiary">
                    <span>피크 요일: <span className="text-cyan-400 font-medium">{["일", "월", "화", "수", "목", "금", "토"][playPatterns.peakDayOfWeek]}요일</span></span>
                    <span>피크 시간: <span className="text-cyan-400 font-medium">{playPatterns.peakHour}시</span></span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>패치 임팩트 상세</CardTitle>
              <CardDescription>
                {patchImpact?.currentPatch && patchImpact?.previousPatch
                  ? `${patchImpact.previousPatch} → ${patchImpact.currentPatch}`
                  : "패치 비교 데이터 준비 중"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-emerald-300">수혜 TOP 3</p>
                <div className="space-y-2">
                  {(patchImpact?.buffed ?? []).slice(0, 3).map((row) => (
                    <div key={`buff-${row.championId}`} className="rounded-lg border border-white/10 bg-bg-primary/60 px-3 py-2 text-xs text-text-secondary">
                      {row.championNameKorean} · +{row.deltaWinRate.toFixed(1)}%p
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-rose-300">피해 TOP 3</p>
                <div className="space-y-2">
                  {(patchImpact?.nerfed ?? []).slice(0, 3).map((row) => (
                    <div key={`nerf-${row.championId}`} className="rounded-lg border border-white/10 bg-bg-primary/60 px-3 py-2 text-xs text-text-secondary">
                      {row.championNameKorean} · {row.deltaWinRate.toFixed(1)}%p
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>밴률 통계</CardTitle>
              <CardDescription>밴률 상위 챔피언과 밴팀 승률 연관성</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(banRates?.banStats ?? []).slice(0, 8).map((row) => (
                <div key={`ban-${row.championId}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-primary/60 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="relative h-6 w-6 overflow-hidden rounded border border-white/10">
                      <Image
                        src={getChampionIconById(row.championId)}
                        alt={championDisplayName(row.championId)}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <span className="text-text-secondary">{championDisplayName(row.championId)}</span>
                  </div>
                  <span className="text-text-secondary">밴률 {row.banRate.toFixed(2)}%</span>
                  <span className="text-text-secondary">밴팀승률 {row.banTeamWinRate.toFixed(1)}%</span>
                  <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"}>
                    {confidenceLabel(row.confidenceLevel)}
                  </Badge>
                </div>
              ))}
              {(banRates?.banStats ?? []).length === 0 ? (
                <p className="text-sm text-text-secondary">밴 통계 데이터가 부족합니다.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>포지션 변화 상세</CardTitle>
              <CardDescription>패치 전후 포지션별 승률/픽률 변화</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(patchImpact?.positionShifts ?? []).slice(0, 5).map((row) => (
                <div key={`patch-pos-detail-${row.position}`} className="rounded-lg border border-white/10 bg-bg-primary/60 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary">{formatPosition(row.position)}</span>
                    <Badge variant={row.deltaWinRate >= 0 ? "success" : "warning"}>
                      승률 {row.deltaWinRate >= 0 ? "+" : ""}
                      {row.deltaWinRate.toFixed(1)}%p
                    </Badge>
                  </div>
                  <p className="mt-1 text-text-tertiary">
                    픽률 {row.prevPickRate.toFixed(2)}% → {row.currentPickRate.toFixed(2)}% (
                    {row.deltaPickRate >= 0 ? "+" : ""}
                    {row.deltaPickRate.toFixed(2)}%p) · 표본 {row.prevGames}/{row.currentGames}
                  </p>
                </div>
              ))}
              {(patchImpact?.positionShifts ?? []).length === 0 ? (
                <p className="text-sm text-text-secondary">포지션 변화 데이터가 부족합니다.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-bg-secondary/80">
            <CardHeader>
              <CardTitle>조합 변화 상세</CardTitle>
              <CardDescription>패치 전후 조합 타입 분포/승률 변화</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(patchImpact?.compositionShifts ?? []).slice(0, 5).map((row) => (
                <div key={`patch-comp-detail-${row.type}`} className="rounded-lg border border-white/10 bg-bg-primary/60 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary">{row.label}</span>
                    <Badge variant={row.deltaPickRate >= 0 ? "success" : "warning"}>
                      픽률 {row.deltaPickRate >= 0 ? "+" : ""}
                      {row.deltaPickRate.toFixed(2)}%p
                    </Badge>
                  </div>
                  <p className="mt-1 text-text-tertiary">
                    승률 {row.prevWinRate.toFixed(1)}% → {row.currentWinRate.toFixed(1)}% (
                    {row.deltaWinRate >= 0 ? "+" : ""}
                    {row.deltaWinRate.toFixed(1)}%p) · 팀표본 {row.prevGames}/{row.currentGames}
                  </p>
                </div>
              ))}
              {(patchImpact?.compositionShifts ?? []).length === 0 ? (
                <p className="text-sm text-text-secondary">조합 변화 데이터가 부족합니다.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

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

        <Card className="mt-6 border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <div className="flex items-center gap-2 text-cyan-300">
              <Trophy className="h-4 w-4" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em]">Seeded Ranked Leaders</span>
            </div>
            <CardTitle>고티어 시딩 기반 장인 후보</CardTitle>
            <CardDescription>
              KnownPuuid(priority=7) + RiotMatchCache(랭크 90일) 기준으로 PUUID별 대표 챔피언을 추립니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.seededChampionLeaders.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-bg-primary/60 p-4 text-sm text-text-secondary">
                아직 조건을 만족하는 시딩 장인 후보 데이터가 없습니다.
              </p>
            ) : overview.seededChampionLeaders.map((entry, index) => {
              const hasRiotId = Boolean(entry.gameName && entry.tagLine);
              const href = hasRiotId
                ? `/matches/summoner/${encodeURIComponent(entry.gameName!)}/${encodeURIComponent(entry.tagLine!)}`
                : undefined;

              const content = (
                <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-bg-primary/60 p-4 transition-colors hover:bg-bg-elevated">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-bold text-cyan-300">
                    {index + 1}
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
                    <p className="truncate font-semibold text-text-primary">
                      {entry.championNameKorean || getChampionKoreanName(entry.championName)}
                    </p>
                    <p className="truncate text-xs text-text-tertiary">
                      {entry.gameName && entry.tagLine
                        ? `${entry.gameName}#${entry.tagLine}`
                        : `${entry.puuid.slice(0, 8)}...`}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {entry.games}게임 · {entry.winRate.toFixed(1)}% · 평균 KDA {entry.avgKda.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-tertiary">
                      최근 {new Date(entry.lastGameAt).toLocaleDateString("ko-KR")}
                    </p>
                    {hasRiotId ? <ChevronRight className="ml-auto mt-1 h-4 w-4 text-text-tertiary" /> : null}
                  </div>
                </div>
              );

              if (!href) {
                return <div key={`${entry.puuid}-${entry.championId}`}>{content}</div>;
              }

              return (
                <Link key={`${entry.puuid}-${entry.championId}`} href={href}>
                  {content}
                </Link>
              );
            })}
          </CardContent>
        </Card>

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
          </>
        ) : null}
      </section>
    </div>
  );
}
