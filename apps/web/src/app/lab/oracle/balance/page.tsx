"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { statsApi, userApi } from "@/lib/api-client";
import type { BalanceScoreResponse } from "@/lib/lab-queries";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingSpinner,
} from "@/components/ui";
import { OracleSubNav } from "@/components/lab/oracle/OracleSubNav";
import { RecentMatchQuickFill } from "@/components/lab/oracle/RecentMatchQuickFill";
import { UserChip, UserSearchInput } from "@/components/lab/oracle/UserSearchInput";
import type { MatchQuickFillOption, UserSearchResult } from "@/components/lab/oracle/types";

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function hydrateUsers(ids: string[]): Promise<UserSearchResult[]> {
  const profiles = await Promise.all(
    ids.map(async (id) => {
      try {
        const profile = await userApi.getProfile(id);
        return {
          userId: profile?.id ?? id,
          username: profile?.username ?? `유저 ${id.slice(0, 6)}`,
          avatar: profile?.avatar ?? null,
        };
      } catch {
        return {
          userId: id,
          username: `유저 ${id.slice(0, 6)}`,
          avatar: null,
        };
      }
    }),
  );

  return profiles;
}

export default function LabOracleBalancePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [teamA, setTeamA] = useState<UserSearchResult[]>([]);
  const [teamB, setTeamB] = useState<UserSearchResult[]>([]);
  const [result, setResult] = useState<BalanceScoreResponse | null>(null);
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

  const teamAIdsInUrl = useMemo(() => parseIds(searchParams.get("teamA")), [searchParams]);
  const teamBIdsInUrl = useMemo(() => parseIds(searchParams.get("teamB")), [searchParams]);

  useEffect(() => {
    let mounted = true;

    const apply = async () => {
      const [usersA, usersB] = await Promise.all([
        hydrateUsers(teamAIdsInUrl),
        hydrateUsers(teamBIdsInUrl),
      ]);

      if (!mounted) return;

      setTeamA(usersA.slice(0, 5));
      setTeamB(usersB.slice(0, 5));
      setHydratedFromUrl(true);
    };

    apply();

    return () => {
      mounted = false;
    };
  }, [teamAIdsInUrl, teamBIdsInUrl]);

  useEffect(() => {
    if (!hydratedFromUrl) return;

    const params = new URLSearchParams(searchParams.toString());
    const teamAIds = teamA.map((u) => u.userId).join(",");
    const teamBIds = teamB.map((u) => u.userId).join(",");

    if (teamAIds) params.set("teamA", teamAIds);
    else params.delete("teamA");

    if (teamBIds) params.set("teamB", teamBIds);
    else params.delete("teamB");

    router.replace(`${pathname}?${params.toString()}`);
  }, [hydratedFromUrl, pathname, router, searchParams, teamA, teamB]);

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

  function applyRecentMatch(option: MatchQuickFillOption) {
    setTeamA(option.teamA.slice(0, 5));
    setTeamB(option.teamB.slice(0, 5));
    setResult(null);
  }

  const canPredict = teamA.length >= 1 && teamB.length >= 1;

  return (
    <div className="space-y-6">
      <OracleSubNav />

      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent-primary" />
            <CardTitle>팀 밸런스 예측</CardTitle>
          </div>
          <CardDescription>
            팀 A/B를 입력하면 PSS 기반 보정 승률과 핵심 격차를 분석합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RecentMatchQuickFill onPick={applyRecentMatch} />

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
                    <p className={`text-sm font-bold ${team === "A" ? "text-accent-primary" : "text-accent-danger"}`}>
                      팀 {team}
                    </p>
                    {winRate !== null && (
                      <p className="text-lg font-bold text-text-primary">{(winRate * 100).toFixed(1)}%</p>
                    )}
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {members.map((u) => (
                      <UserChip key={u.userId} user={u} onRemove={() => removeFromTeam(team, u.userId)} linkable />
                    ))}
                    {members.length === 0 && <p className="text-xs text-text-tertiary">최대 5명 추가</p>}
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
            <div className="space-y-3 rounded-xl border border-white/10 bg-bg-secondary/60 p-4">
              <div className="flex h-5 overflow-hidden rounded-full bg-bg-primary/50">
                <div className="h-full bg-accent-primary transition-all" style={{ width: `${result.teamA.adjustedWinRate * 100}%` }} />
                <div className="h-full bg-accent-danger transition-all" style={{ width: `${result.teamB.adjustedWinRate * 100}%` }} />
              </div>

              <div className="flex justify-between text-xs text-text-secondary">
                <span className="font-semibold text-accent-primary">팀 A {(result.teamA.adjustedWinRate * 100).toFixed(1)}%</span>
                <span className="font-semibold text-accent-danger">팀 B {(result.teamB.adjustedWinRate * 100).toFixed(1)}%</span>
              </div>

              <div className="grid gap-2 rounded-lg border border-white/10 bg-bg-primary/40 p-3 text-xs md:grid-cols-3">
                <div>
                  <p className="text-text-tertiary">평균 PSS</p>
                  <p className="font-semibold text-text-primary">
                    A {result.teamA.avgPss.toFixed(2)} / B {result.teamB.avgPss.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-text-tertiary">모델 승률</p>
                  <p className="font-semibold text-text-primary">
                    A {(result.teamA.modelWinRate * 100).toFixed(1)}% / B {(result.teamB.modelWinRate * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-text-tertiary">보정 승률</p>
                  <p className="font-semibold text-text-primary">
                    A {(result.teamA.adjustedWinRate * 100).toFixed(1)}% / B {(result.teamB.adjustedWinRate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

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

              {result.similarMatches.count > 0 && (
                <p className="text-xs text-text-tertiary">
                  유사 경기 {result.similarMatches.count}건 · 팀A {result.similarMatches.teamAWins}승 / 팀B {result.similarMatches.teamBWins}승
                </p>
              )}

              {result.players.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["A", "B"] as const).map((team) => (
                    <div key={team} className="space-y-1">
                      <p className={`text-xs font-bold ${team === "A" ? "text-accent-primary" : "text-accent-danger"}`}>
                        팀 {team}
                      </p>
                      {result.players
                        .filter((p) => p.team === team)
                        .map((p) => (
                          <div key={p.userId} className="flex items-center justify-between text-xs">
                            <Link href={`/users/${p.userId}`} className="text-text-secondary hover:text-accent-primary">
                              {p.username}
                            </Link>
                            <span className="text-text-tertiary">PSS {p.pss.toFixed(2)}</span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}

              {result.caveat && <p className="border-t border-white/10 pt-2 text-xs text-text-tertiary">{result.caveat}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
