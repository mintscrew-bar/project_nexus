"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { statsApi, userApi } from "@/lib/api-client";
import { useLabStore } from "@/stores/lab-store";
import { getChampionIconById } from "@/components/matches/match-utils";
import type { BanRecommendResponse } from "@/lib/lab-queries";
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

export default function LabOracleBanPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { period: activePeriod } = useLabStore();

  const [poolUsers, setPoolUsers] = useState<UserSearchResult[]>([]);
  const [teamAUsers, setTeamAUsers] = useState<UserSearchResult[]>([]);
  const [teamBUsers, setTeamBUsers] = useState<UserSearchResult[]>([]);
  const [mode, setMode] = useState<"global" | "byTeam">("global");
  const [result, setResult] = useState<BanRecommendResponse | null>(null);
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

  const modeInUrl = (searchParams.get("mode") as "global" | "byTeam" | null) ?? "global";
  const usersInUrl = useMemo(() => parseIds(searchParams.get("users")), [searchParams]);
  const teamAInUrl = useMemo(() => parseIds(searchParams.get("teamA")), [searchParams]);
  const teamBInUrl = useMemo(() => parseIds(searchParams.get("teamB")), [searchParams]);

  useEffect(() => {
    let mounted = true;

    const apply = async () => {
      const [users, teamA, teamB] = await Promise.all([
        hydrateUsers(usersInUrl),
        hydrateUsers(teamAInUrl),
        hydrateUsers(teamBInUrl),
      ]);

      if (!mounted) return;

      setMode(modeInUrl);
      setPoolUsers(users.slice(0, 10));
      setTeamAUsers(teamA.slice(0, 5));
      setTeamBUsers(teamB.slice(0, 5));
      setHydratedFromUrl(true);
    };

    apply();

    return () => {
      mounted = false;
    };
  }, [modeInUrl, usersInUrl, teamAInUrl, teamBInUrl]);

  useEffect(() => {
    if (!hydratedFromUrl) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", mode);

    const users = poolUsers.map((u) => u.userId).join(",");
    const teamA = teamAUsers.map((u) => u.userId).join(",");
    const teamB = teamBUsers.map((u) => u.userId).join(",");

    if (users) params.set("users", users);
    else params.delete("users");

    if (teamA) params.set("teamA", teamA);
    else params.delete("teamA");

    if (teamB) params.set("teamB", teamB);
    else params.delete("teamB");

    router.replace(`${pathname}?${params.toString()}`);
  }, [hydratedFromUrl, mode, pathname, poolUsers, router, searchParams, teamAUsers, teamBUsers]);

  const mutation = useMutation({
    mutationFn: () =>
      statsApi.getLabBanRecommend({
        period: activePeriod,
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
    max = 10,
  ) {
    setter((prev) => {
      if (prev.some((u) => u.userId === user.userId)) return prev;
      if (prev.length >= max) return prev;
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

  function applyRecentMatch(option: MatchQuickFillOption) {
    setTeamAUsers(option.teamA.slice(0, 5));
    setTeamBUsers(option.teamB.slice(0, 5));
    setPoolUsers([...option.teamA, ...option.teamB].slice(0, 10));
    setResult(null);
  }

  const canGenerate =
    mode === "global" ? poolUsers.length >= 1 : teamAUsers.length >= 1 || teamBUsers.length >= 1;

  return (
    <div className="space-y-6">
      <OracleSubNav />

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
        <CardContent className="space-y-4">
          <RecentMatchQuickFill onPick={applyRecentMatch} />

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
              <p className="text-xs text-text-tertiary">분석할 유저를 추가하세요 (최대 10명)</p>
              <div className="flex flex-wrap gap-2">
                {poolUsers.map((u) => (
                  <UserChip key={u.userId} user={u} onRemove={() => removeUser(setPoolUsers, u.userId)} linkable />
                ))}
              </div>
              <UserSearchInput placeholder="유저 추가" onSelect={(u) => addUser(setPoolUsers, u, 10)} />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {([
                { label: "팀 A", users: teamAUsers, setter: setTeamAUsers },
                { label: "팀 B", users: teamBUsers, setter: setTeamBUsers },
              ] as const).map(({ label, users, setter }) => (
                <div key={label} className="space-y-2 rounded-xl border border-white/10 p-3">
                  <p className="text-xs font-semibold text-text-secondary">{label}</p>
                  <div className="flex flex-wrap gap-2">
                    {users.map((u) => (
                      <UserChip key={u.userId} user={u} onRemove={() => removeUser(setter, u.userId)} linkable />
                    ))}
                  </div>
                  <UserSearchInput placeholder={`${label} 유저 추가`} onSelect={(u) => addUser(setter, u, 5)} />
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

          {mutation.isError && <p className="text-center text-sm text-accent-danger">생성 실패. 다시 시도해 주세요.</p>}

          {result && (
            <div className="space-y-4">
              {result.recommendations && result.recommendations.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-text-secondary">추천 밴 목록</p>
                  <div className="space-y-2">
                    {result.recommendations.map((rec, idx) => (
                      <div key={rec.championId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2">
                        <span className="w-5 text-center text-xs font-bold text-text-tertiary">{idx + 1}</span>
                        <Link href={`/lab/champions/${rec.championId}?period=${activePeriod}`} className="relative h-8 w-8 overflow-hidden rounded-lg border border-white/10">
                          <Image src={getChampionIconById(rec.championId)} alt={rec.championNameKorean} fill className="object-cover" unoptimized />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text-primary">{rec.championNameKorean}</p>
                          {rec.reasons.length > 0 && <p className="truncate text-xs text-text-tertiary">{rec.reasons.join(" · ")}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-accent-purple">{rec.banScore.toFixed(1)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                            <div key={rec.championId} className="flex items-center gap-2 rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2">
                              <span className="w-4 text-center text-xs text-text-tertiary">{idx + 1}</span>
                              <Link href={`/lab/champions/${rec.championId}?period=${activePeriod}`} className="relative h-7 w-7 overflow-hidden rounded-lg border border-white/10">
                                <Image src={getChampionIconById(rec.championId)} alt={rec.championNameKorean} fill className="object-cover" unoptimized />
                              </Link>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-text-primary">{rec.championNameKorean}</p>
                              </div>
                              <span className="text-xs text-accent-purple">{rec.banScore.toFixed(1)}</span>
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
        </CardContent>
      </Card>
    </div>
  );
}
