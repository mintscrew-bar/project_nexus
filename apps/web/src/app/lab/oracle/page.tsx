"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import {
  labQueryOptions,
  type AuctionEfficiencyResponse,
  type BalanceScoreResponse,
  type BanRecommendResponse,
  type HeadToHeadResponse,
} from "@/lib/lab-queries";
import { statsApi } from "@/lib/api-client";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate, formatDelta, formatKda, formatPosition } from "@/lib/lab-format";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingSpinner,
} from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { TrendingUp, TrendingDown, Minus, Users, ShieldAlert, Swords } from "lucide-react";

// ─── 유저 검색 결과 타입 ──────────────────────────────────────────────────────
type UserSearchResult = {
  userId: string;
  username: string;
  avatar: string | null;
};

// ─── 유저 검색 인풋 컴포넌트 ─────────────────────────────────────────────────
function UserSearchInput({
  placeholder,
  onSelect,
  disabled,
}: {
  placeholder: string;
  onSelect: (user: UserSearchResult) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (val.trim().length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      setSearching(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const data = await statsApi.searchUsers(val.trim(), 8);
          setResults(data?.users ?? data ?? []);
          setIsOpen(true);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [],
  );

  function handleSelect(user: UserSearchResult) {
    onSelect(user);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-50"
      />
      {searching && (
        <div className="absolute right-2 top-2.5">
          <LoadingSpinner className="h-4 w-4" />
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-bg-secondary shadow-lg">
          {results.map((u) => (
            <button
              key={u.userId}
              type="button"
              onClick={() => handleSelect(u)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-elevated"
            >
              {u.avatar ? (
                <Image
                  src={u.avatar}
                  alt={u.username}
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-bg-tertiary" />
              )}
              {u.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 유저 태그 칩 ─────────────────────────────────────────────────────────────
function UserChip({
  user,
  onRemove,
  linkable,
}: {
  user: UserSearchResult;
  onRemove: () => void;
  linkable?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-bg-primary/60 px-2 py-1">
      {user.avatar ? (
        <Image
          src={user.avatar}
          alt={user.username}
          width={20}
          height={20}
          className="h-5 w-5 rounded-full object-cover"
          unoptimized
        />
      ) : (
        <div className="h-5 w-5 rounded-full bg-bg-tertiary" />
      )}
      {linkable ? (
        <Link
          href={`/users/${user.userId}`}
          className="text-xs font-semibold text-accent-primary hover:underline"
        >
          {user.username}
        </Link>
      ) : (
        <span className="text-xs font-semibold text-text-primary">{user.username}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-text-tertiary hover:text-accent-danger"
        aria-label="제거"
      >
        ×
      </button>
    </div>
  );
}

// ─── 트렌드 아이콘 ────────────────────────────────────────────────────────────
function TrendIcon({ delta }: { delta: number }) {
  if (delta > 0.02) return <TrendingUp className="h-3.5 w-3.5 text-accent-success" />;
  if (delta < -0.02) return <TrendingDown className="h-3.5 w-3.5 text-accent-danger" />;
  return <Minus className="h-3.5 w-3.5 text-text-tertiary" />;
}

// ─── 경매 효율 섹션 ───────────────────────────────────────────────────────────
function AuctionEfficiencySection({ data }: { data: AuctionEfficiencyResponse }) {
  const { scatter, efficiencyTop, overpricedTop, buckets } = data;

  // 간단한 회귀선 SVG 스캐터차트
  const chartW = 480;
  const chartH = 200;
  const prices = scatter.map((d) => d.soldPrice);
  const perfs = scatter.map((d) => d.performance);
  const xMin = Math.min(...prices, 0);
  const xMax = Math.max(...prices, 100);
  const yMin = Math.min(...perfs, 0);
  const yMax = Math.max(...perfs, 1);
  const toX = (v: number) => ((v - xMin) / (xMax - xMin || 1)) * chartW;
  const toY = (v: number) => chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH;

  const { beta0, beta1 } = data.regression;
  const regX1 = xMin;
  const regX2 = xMax;
  const regY1 = beta0 + beta1 * regX1;
  const regY2 = beta0 + beta1 * regX2;

  return (
    <div className="space-y-6">
      {/* 스캐터 + 회귀선 */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text-secondary">
          경매가 vs 퍼포먼스 산점도
        </p>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-bg-primary/50 p-3">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="h-48 w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* 회귀선 */}
            <line
              x1={toX(regX1)}
              y1={toY(regY1)}
              x2={toX(regX2)}
              y2={toY(regY2)}
              stroke="#667EEA"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.7}
            />
            {/* 데이터 포인트 */}
            {scatter.map((d) => (
              <circle
                key={d.userId}
                cx={toX(d.soldPrice)}
                cy={toY(d.performance)}
                r={3.5}
                fill={d.efficiency > 0 ? "#00c853" : "#ff1744"}
                opacity={0.7}
              >
                <title>
                  {d.username}: 경매가 {d.soldPrice} / 퍼포먼스 {d.performance.toFixed(2)}
                </title>
              </circle>
            ))}
          </svg>
          <p className="mt-1 text-center text-xs text-text-tertiary">
            초록 = 효율 양호 · 빨강 = 고평가 · 파선 = 회귀선
          </p>
        </div>
      </div>

      {/* 구간 테이블 */}
      {buckets.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-text-secondary">경매가 구간별 지표</p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-bg-primary/70 text-text-tertiary">
                <tr>
                  <th className="px-3 py-2 text-left">구간</th>
                  <th className="px-3 py-2 text-right">유저</th>
                  <th className="px-3 py-2 text-right">승률</th>
                  <th className="px-3 py-2 text-right">평균 KDA</th>
                  <th className="px-3 py-2 text-right">딜 점유율</th>
                  <th className="px-3 py-2 text-right">평균 퍼포먼스</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr
                    key={b.label}
                    className="border-t border-white/10 bg-bg-secondary/40 hover:bg-bg-elevated/60"
                  >
                    <td className="px-3 py-2 text-text-primary">{b.label}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{b.users}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {formatRate(b.winRate)}
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {b.avgKda.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {(b.avgDamageShare * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {b.avgPerformance.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 효율 Top / 고평가 Top */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 효율 우수 */}
        <div>
          <p className="mb-2 text-sm font-semibold text-accent-success">효율 우수 TOP 5</p>
          <div className="space-y-2">
            {efficiencyTop.slice(0, 5).map((u) => (
              <div
                key={u.userId}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2"
              >
                <Link
                  href={`/users/${u.userId}`}
                  className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-accent-primary"
                >
                  {u.username}
                </Link>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span>{formatRate(u.winRate)}</span>
                  <span className="font-semibold text-accent-success">
                    {u.efficiency > 0 ? "+" : ""}
                    {u.efficiency.toFixed(3)}
                  </span>
                  <TrendIcon delta={u.recentTrendDelta} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 고평가 Top */}
        <div>
          <p className="mb-2 text-sm font-semibold text-accent-danger">고평가 TOP 5</p>
          <div className="space-y-2">
            {overpricedTop.slice(0, 5).map((u) => (
              <div
                key={u.userId}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2"
              >
                <Link
                  href={`/users/${u.userId}`}
                  className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-accent-primary"
                >
                  {u.username}
                </Link>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span>{formatRate(u.winRate)}</span>
                  <span className="font-semibold text-accent-danger">
                    {u.efficiency.toFixed(3)}
                  </span>
                  <TrendIcon delta={u.recentTrendDelta} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 팀 밸런스 섹션 ───────────────────────────────────────────────────────────
function TeamBalanceSection({ period }: { period: string }) {
  const [teamA, setTeamA] = useState<UserSearchResult[]>([]);
  const [teamB, setTeamB] = useState<UserSearchResult[]>([]);
  const [result, setResult] = useState<BalanceScoreResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      statsApi.getLabBalanceScore({
        teamA: teamA.map((u) => u.userId),
        teamB: teamB.map((u) => u.userId),
      }) as Promise<BalanceScoreResponse>,
    onSuccess: (data) => setResult(data),
  });

  function addToTeam(team: "A" | "B", user: UserSearchResult) {
    const setter = team === "A" ? setTeamA : setTeamB;
    setter((prev) => {
      if (prev.some((u) => u.userId === user.userId)) return prev;
      if (prev.length >= 5) return prev;
      return [...prev, user];
    });
    setResult(null);
  }

  function removeFromTeam(team: "A" | "B", userId: string) {
    const setter = team === "A" ? setTeamA : setTeamB;
    setter((prev) => prev.filter((u) => u.userId !== userId));
    setResult(null);
  }

  const canPredict = teamA.length >= 1 && teamB.length >= 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {(["A", "B"] as const).map((team) => {
          const members = team === "A" ? teamA : teamB;
          const winRate = result
            ? team === "A"
              ? result.teamA.adjustedWinRate
              : result.teamB.adjustedWinRate
            : null;
          return (
            <div
              key={team}
              className={`rounded-xl border p-4 ${
                team === "A"
                  ? "border-accent-primary/30 bg-accent-primary/5"
                  : "border-accent-danger/30 bg-accent-danger/5"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <p
                  className={`text-sm font-bold ${
                    team === "A" ? "text-accent-primary" : "text-accent-danger"
                  }`}
                >
                  팀 {team}
                </p>
                {winRate !== null && (
                  <p className="text-lg font-bold text-text-primary">
                    {(winRate * 100).toFixed(1)}%
                  </p>
                )}
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {members.map((u) => (
                  <UserChip
                    key={u.userId}
                    user={u}
                    onRemove={() => removeFromTeam(team, u.userId)}
                    linkable
                  />
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-text-tertiary">최대 5명 추가</p>
                )}
              </div>
              <UserSearchInput
                placeholder={`팀 ${team}에 유저 추가`}
                onSelect={(u) => addToTeam(team, u)}
                disabled={members.length >= 5}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={!canPredict || mutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-primary/20 px-4 py-2.5 text-sm font-semibold text-accent-primary transition-colors hover:bg-accent-primary/30 disabled:opacity-40"
      >
        {mutation.isPending ? <LoadingSpinner className="h-4 w-4" /> : null}
        밸런스 예측
      </button>

      {mutation.isError && (
        <p className="text-center text-sm text-accent-danger">예측 실패. 다시 시도해 주세요.</p>
      )}

      {result && (
        <div className="rounded-xl border border-white/10 bg-bg-secondary/60 p-4 space-y-3">
          {/* 승률 게이지 */}
          <div className="overflow-hidden rounded-full h-5 bg-bg-primary/50 flex">
            <div
              className="h-full bg-accent-primary transition-all"
              style={{ width: `${result.teamA.adjustedWinRate * 100}%` }}
            />
            <div
              className="h-full bg-accent-danger transition-all"
              style={{ width: `${result.teamB.adjustedWinRate * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-secondary">
            <span className="text-accent-primary font-semibold">
              팀 A {(result.teamA.adjustedWinRate * 100).toFixed(1)}%
            </span>
            <span className="text-accent-danger font-semibold">
              팀 B {(result.teamB.adjustedWinRate * 100).toFixed(1)}%
            </span>
          </div>

          {/* 신뢰도 */}
          <div className="flex items-center gap-2">
            <Badge
              variant={
                result.confidence.level === "high"
                  ? "success"
                  : result.confidence.level === "moderate"
                    ? "warning"
                    : "secondary"
              }
              size="sm"
            >
              {result.confidence.level === "high"
                ? "높음"
                : result.confidence.level === "moderate"
                  ? "보통"
                  : "낮음"}
            </Badge>
            <span className="text-xs text-text-tertiary">{result.confidence.message}</span>
          </div>

          {/* 유사 경기 */}
          {result.similarMatches.count > 0 && (
            <p className="text-xs text-text-tertiary">
              유사 경기 {result.similarMatches.count}건 — 팀A{" "}
              {result.similarMatches.teamAWins}승 /{" "}
              팀B {result.similarMatches.count - result.similarMatches.teamAWins}승
            </p>
          )}

          {/* 개인 PSS */}
          {result.players.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(["A", "B"] as const).map((team) => (
                <div key={team} className="space-y-1">
                  <p
                    className={`text-xs font-bold ${team === "A" ? "text-accent-primary" : "text-accent-danger"}`}
                  >
                    팀 {team}
                  </p>
                  {result.players
                    .filter((p) => p.team === team)
                    .map((p) => (
                      <div key={p.userId} className="flex items-center justify-between text-xs">
                        <Link
                          href={`/users/${p.userId}`}
                          className="text-text-secondary hover:text-accent-primary"
                        >
                          {p.username}
                        </Link>
                        <span className="text-text-tertiary">PSS {p.pss.toFixed(2)}</span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}

          {result.caveat && (
            <p className="text-xs text-text-tertiary border-t border-white/10 pt-2">{result.caveat}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 밴 추천 섹션 ─────────────────────────────────────────────────────────────
function BanRecommendSection({ period }: { period: string }) {
  const [poolUsers, setPoolUsers] = useState<UserSearchResult[]>([]);
  const [teamAUsers, setTeamAUsers] = useState<UserSearchResult[]>([]);
  const [teamBUsers, setTeamBUsers] = useState<UserSearchResult[]>([]);
  const [mode, setMode] = useState<"global" | "byTeam">("global");
  const [result, setResult] = useState<BanRecommendResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      statsApi.getLabBanRecommend({
        period: period as "30d" | "90d" | "all",
        ...(mode === "global"
          ? { userIds: poolUsers.map((u) => u.userId) }
          : {
              teamAUserIds: teamAUsers.map((u) => u.userId),
              teamBUserIds: teamBUsers.map((u) => u.userId),
            }),
      }) as Promise<BanRecommendResponse>,
    onSuccess: (data) => setResult(data),
  });

  function addUser(
    setter: React.Dispatch<React.SetStateAction<UserSearchResult[]>>,
    user: UserSearchResult,
  ) {
    setter((prev) => {
      if (prev.some((u) => u.userId === user.userId)) return prev;
      return [...prev, user];
    });
    setResult(null);
  }

  function removeUser(
    setter: React.Dispatch<React.SetStateAction<UserSearchResult[]>>,
    userId: string,
  ) {
    setter((prev) => prev.filter((u) => u.userId !== userId));
    setResult(null);
  }

  const canGenerate =
    mode === "global" ? poolUsers.length >= 1 : teamAUsers.length >= 1 || teamBUsers.length >= 1;

  return (
    <div className="space-y-4">
      {/* 모드 선택 */}
      <div className="flex items-center gap-2">
        {(["global", "byTeam"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setResult(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === m
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            {m === "global" ? "전체 풀" : "팀별"}
          </button>
        ))}
      </div>

      {mode === "global" ? (
        <div className="space-y-2">
          <p className="text-xs text-text-tertiary">분석할 유저를 추가하세요</p>
          <div className="flex flex-wrap gap-2">
            {poolUsers.map((u) => (
              <UserChip
                key={u.userId}
                user={u}
                onRemove={() => removeUser(setPoolUsers, u.userId)}
                linkable
              />
            ))}
          </div>
          <UserSearchInput
            placeholder="유저 추가"
            onSelect={(u) => addUser(setPoolUsers, u)}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              { label: "팀 A", users: teamAUsers, setter: setTeamAUsers },
              { label: "팀 B", users: teamBUsers, setter: setTeamBUsers },
            ] as const
          ).map(({ label, users, setter }) => (
            <div key={label} className="space-y-2 rounded-xl border border-white/10 p-3">
              <p className="text-xs font-semibold text-text-secondary">{label}</p>
              <div className="flex flex-wrap gap-2">
                {users.map((u) => (
                  <UserChip
                    key={u.userId}
                    user={u}
                    onRemove={() => removeUser(setter, u.userId)}
                    linkable
                  />
                ))}
              </div>
              <UserSearchInput
                placeholder={`${label} 유저 추가`}
                onSelect={(u) => addUser(setter, u)}
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={!canGenerate || mutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-purple/20 px-4 py-2.5 text-sm font-semibold text-accent-purple transition-colors hover:bg-accent-purple/30 disabled:opacity-40"
      >
        {mutation.isPending ? <LoadingSpinner className="h-4 w-4" /> : null}
        밴 추천 생성
      </button>

      {mutation.isError && (
        <p className="text-center text-sm text-accent-danger">생성 실패. 다시 시도해 주세요.</p>
      )}

      {result && (
        <div className="space-y-4">
          {/* 전체 풀 결과 */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-text-secondary">추천 밴 목록</p>
              <div className="space-y-2">
                {result.recommendations.map((rec, idx) => (
                  <div
                    key={rec.championId}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2"
                  >
                    <span className="w-5 text-center text-xs font-bold text-text-tertiary">
                      {idx + 1}
                    </span>
                    <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-white/10">
                      <Image
                        src={getChampionIconById(rec.championId)}
                        alt={rec.championNameKorean}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary">
                        {rec.championNameKorean}
                      </p>
                      {rec.reasons.length > 0 && (
                        <p className="truncate text-xs text-text-tertiary">
                          {rec.reasons.join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-accent-purple">
                        {rec.banScore.toFixed(1)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 팀별 결과 */}
          {result.byTeam && (
            <div className="grid gap-4 md:grid-cols-2">
              {(["teamA", "teamB"] as const).map((teamKey) => {
                const recs = result.byTeam![teamKey];
                const label = teamKey === "teamA" ? "팀 A 밴 추천" : "팀 B 밴 추천";
                const color = teamKey === "teamA" ? "text-accent-primary" : "text-accent-danger";
                return (
                  <div key={teamKey}>
                    <p className={`mb-2 text-sm font-semibold ${color}`}>{label}</p>
                    <div className="space-y-2">
                      {recs.map((rec, idx) => (
                        <div
                          key={rec.championId}
                          className="flex items-center gap-2 rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2"
                        >
                          <span className="w-4 text-center text-xs text-text-tertiary">
                            {idx + 1}
                          </span>
                          <div className="relative h-7 w-7 overflow-hidden rounded-lg border border-white/10">
                            <Image
                              src={getChampionIconById(rec.championId)}
                              alt={rec.championNameKorean}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-text-primary truncate">
                              {rec.championNameKorean}
                            </p>
                          </div>
                          <span className="text-xs text-accent-purple">
                            {rec.banScore.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 1:1 상성 섹션 ────────────────────────────────────────────────────────────
function HeadToHeadSection() {
  const [userA, setUserA] = useState<UserSearchResult | null>(null);
  const [userB, setUserB] = useState<UserSearchResult | null>(null);

  const { data, isLoading, isError } = useQuery<HeadToHeadResponse>({
    ...labQueryOptions.headToHead(userA?.userId ?? "", userB?.userId ?? ""),
    enabled: Boolean(userA) && Boolean(userB) && userA?.userId !== userB?.userId,
  });

  const hasResult = Boolean(data);

  return (
    <div className="space-y-4">
      {/* 유저 선택 */}
      <div className="grid gap-4 md:grid-cols-2">
        {(["A", "B"] as const).map((side) => {
          const user = side === "A" ? userA : userB;
          const setUser = side === "A" ? setUserA : setUserB;
          const color = side === "A" ? "text-accent-primary" : "text-accent-danger";
          const borderColor =
            side === "A" ? "border-accent-primary/30" : "border-accent-danger/30";
          const bgColor = side === "A" ? "bg-accent-primary/5" : "bg-accent-danger/5";

          return (
            <div
              key={side}
              className={`rounded-xl border p-4 space-y-3 ${borderColor} ${bgColor}`}
            >
              <p className={`text-sm font-bold ${color}`}>유저 {side}</p>
              {user ? (
                <div className="flex items-center gap-2">
                  <UserChip user={user} onRemove={() => setUser(null)} linkable />
                </div>
              ) : (
                <UserSearchInput
                  placeholder={`유저 ${side} 선택`}
                  onSelect={(u) => {
                    setUser(u);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      )}

      {/* 에러 */}
      {isError && (
        <p className="text-center text-sm text-accent-danger">데이터를 불러오지 못했습니다.</p>
      )}

      {/* 결과 */}
      {data && (
        <div className="space-y-4">
          {/* 전적 요약 */}
          {data.totalGames === 0 ? (
            <LabEmptyState level="insufficient" section="1:1 대전" />
          ) : (
            <>
              {/* 게이지 */}
              <div className="space-y-2">
                <div className="overflow-hidden rounded-full h-6 bg-bg-primary/50 flex">
                  <div
                    className="h-full bg-accent-primary flex items-center justify-center text-xs font-bold text-white transition-all"
                    style={{ width: `${data.userAWinRate * 100}%` }}
                  >
                    {data.userAWins}승
                  </div>
                  <div
                    className="h-full bg-accent-danger flex items-center justify-center text-xs font-bold text-white transition-all"
                    style={{ width: `${data.userBWinRate * 100}%` }}
                  >
                    {data.userBWins}승
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <Link href={`/users/${data.userAId}`} className="text-accent-primary hover:underline font-semibold">
                    {userA?.username} {(data.userAWinRate * 100).toFixed(1)}%
                  </Link>
                  <span className="text-text-tertiary">총 {data.totalGames}경기</span>
                  <Link href={`/users/${data.userBId}`} className="text-accent-danger hover:underline font-semibold">
                    {(data.userBWinRate * 100).toFixed(1)}% {userB?.username}
                  </Link>
                </div>
              </div>

              {/* 신뢰도 */}
              <div>
                <Badge
                  variant={
                    data.confidence === "high"
                      ? "success"
                      : data.confidence === "moderate"
                        ? "warning"
                        : "secondary"
                  }
                  size="sm"
                >
                  신뢰도:{" "}
                  {data.confidence === "high"
                    ? "높음"
                    : data.confidence === "moderate"
                      ? "보통"
                      : data.confidence === "low"
                        ? "낮음"
                        : "부족"}
                </Badge>
              </div>

              {/* 포지션 매칭 */}
              {data.positionBreakdown.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-text-secondary">
                    포지션별 매칭
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-xs">
                      <thead className="bg-bg-primary/70 text-text-tertiary">
                        <tr>
                          <th className="px-3 py-1.5 text-left">A 포지션</th>
                          <th className="px-3 py-1.5 text-left">B 포지션</th>
                          <th className="px-3 py-1.5 text-right">경기</th>
                          <th className="px-3 py-1.5 text-right">A 승률</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.positionBreakdown.map((row, i) => (
                          <tr
                            key={i}
                            className="border-t border-white/10 bg-bg-secondary/40 hover:bg-bg-elevated/60"
                          >
                            <td className="px-3 py-1.5 text-text-secondary">
                              {formatPosition(row.userAPosition)}
                            </td>
                            <td className="px-3 py-1.5 text-text-secondary">
                              {formatPosition(row.userBPosition)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-text-secondary">
                              {row.games}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold">
                              <span
                                className={
                                  row.userAWinRate >= 0.5
                                    ? "text-accent-success"
                                    : "text-accent-danger"
                                }
                              >
                                {(row.userAWinRate * 100).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 최근 경기 */}
              {data.recentMatches.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-text-secondary">최근 대전 기록</p>
                  <div className="space-y-2">
                    {data.recentMatches.map((m) => (
                      <Link
                        key={m.matchId}
                        href={`/matches/${m.matchId}`}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2 text-xs hover:bg-bg-elevated/60 transition-colors"
                      >
                        {/* A 챔피언 */}
                        <div className="flex items-center gap-1.5">
                          <div className="relative h-7 w-7 overflow-hidden rounded-md border border-white/10">
                            <Image
                              src={getChampionIconById(m.userAChampionId)}
                              alt={m.userAChampionName}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <div>
                            <p
                              className={m.userAWin ? "text-accent-success" : "text-accent-danger"}
                            >
                              {m.userAWin ? "승" : "패"}
                            </p>
                            <p className="text-text-tertiary">
                              {formatKda(m.userAKills, m.userADeaths, m.userAAssists)}
                            </p>
                          </div>
                        </div>

                        <div className="flex-1 text-center">
                          <Swords className="mx-auto h-3.5 w-3.5 text-text-tertiary" />
                          {m.completedAt && (
                            <p className="text-text-tertiary">
                              {new Date(m.completedAt).toLocaleDateString("ko-KR", {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>

                        {/* B 챔피언 */}
                        <div className="flex items-center gap-1.5 flex-row-reverse">
                          <div className="relative h-7 w-7 overflow-hidden rounded-md border border-white/10">
                            <Image
                              src={getChampionIconById(m.userBChampionId)}
                              alt={m.userBChampionName}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <div className="text-right">
                            <p
                              className={m.userBWin ? "text-accent-success" : "text-accent-danger"}
                            >
                              {m.userBWin ? "승" : "패"}
                            </p>
                            <p className="text-text-tertiary">
                              {formatKda(m.userBKills, m.userBDeaths, m.userBAssists)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 초기 안내 */}
      {!hasResult && !isLoading && (!userA || !userB) && (
        <p className="text-center text-sm text-text-tertiary py-4">
          두 유저를 선택하면 1:1 직접 대전 상성을 분석합니다.
        </p>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function LabOraclePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod } = useLabStore();
  const isAdmin = user?.role === "ADMIN";
  const canFetch = !authLoading && isAuthenticated && isAdmin;

  const { data: auctionData, isLoading: auctionLoading } = useQuery<AuctionEfficiencyResponse>({
    ...labQueryOptions.auctionEfficiency(activePeriod),
    enabled: canFetch,
  });

  if (auctionLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 경매 효율 */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle>경매 효율 분석</CardTitle>
          <CardDescription>
            경매가 대비 퍼포먼스를 산점도와 회귀선으로 시각화합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auctionData ? (
            auctionData.scatter.length === 0 ? (
              <LabEmptyState level="insufficient" section="경매 효율" />
            ) : (
              <AuctionEfficiencySection data={auctionData} />
            )
          ) : (
            <LabEmptyState level="insufficient" section="경매 효율" />
          )}
        </CardContent>
      </Card>

      {/* 팀 밸런스 예측 */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent-primary" />
            <CardTitle>팀 밸런스 예측</CardTitle>
          </div>
          <CardDescription>
            팀 A와 팀 B 구성원을 입력하면 PSS 기반 승률을 예측합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamBalanceSection period={activePeriod} />
        </CardContent>
      </Card>

      {/* 밴 추천 */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-accent-purple" />
            <CardTitle>밴 추천</CardTitle>
          </div>
          <CardDescription>
            참여 유저 풀 또는 팀 구성 기반으로 위협 챔피언 밴 순위를 산출합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BanRecommendSection period={activePeriod} />
        </CardContent>
      </Card>

      {/* 1:1 상성 */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-accent-gold" />
            <CardTitle>1:1 직접 대전 상성</CardTitle>
          </div>
          <CardDescription>
            두 유저가 같은 경기에 출전한 기록에서 직접 대전 승률을 분석합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HeadToHeadSection />
        </CardContent>
      </Card>
    </div>
  );
}
