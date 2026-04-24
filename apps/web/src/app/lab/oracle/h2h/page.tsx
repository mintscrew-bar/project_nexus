"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import { userApi } from "@/lib/api-client";
import { labQueryOptions, type HeadToHeadResponse } from "@/lib/lab-queries";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatKda, formatPosition } from "@/lib/lab-format";
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
import { OracleSubNav } from "@/components/lab/oracle/OracleSubNav";
import { UserChip, UserSearchInput } from "@/components/lab/oracle/UserSearchInput";
import type { UserSearchResult } from "@/components/lab/oracle/types";

async function hydrateUser(id: string | null): Promise<UserSearchResult | null> {
  if (!id) return null;

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
}

export default function LabOracleHeadToHeadPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const userAIdInUrl = useMemo(() => searchParams.get("userA"), [searchParams]);
  const userBIdInUrl = useMemo(() => searchParams.get("userB"), [searchParams]);

  const [userA, setUserA] = useState<UserSearchResult | null>(null);
  const [userB, setUserB] = useState<UserSearchResult | null>(null);
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

  useEffect(() => {
    let mounted = true;

    const apply = async () => {
      const [a, b] = await Promise.all([hydrateUser(userAIdInUrl), hydrateUser(userBIdInUrl)]);
      if (!mounted) return;
      setUserA(a);
      setUserB(b);
      setHydratedFromUrl(true);
    };

    apply();

    return () => {
      mounted = false;
    };
  }, [userAIdInUrl, userBIdInUrl]);

  useEffect(() => {
    if (!hydratedFromUrl) return;

    const params = new URLSearchParams(searchParams.toString());

    if (userA?.userId) params.set("userA", userA.userId);
    else params.delete("userA");

    if (userB?.userId) params.set("userB", userB.userId);
    else params.delete("userB");

    router.replace(`${pathname}?${params.toString()}`);
  }, [hydratedFromUrl, pathname, router, searchParams, userA, userB]);

  const { data, isLoading, isError } = useQuery<HeadToHeadResponse>({
    ...labQueryOptions.headToHead(userA?.userId ?? "", userB?.userId ?? ""),
    enabled: Boolean(userA) && Boolean(userB) && userA?.userId !== userB?.userId,
  });

  const hasResult = Boolean(data);

  return (
    <div className="space-y-6">
      <OracleSubNav />

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
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["A", "B"] as const).map((side) => {
              const user = side === "A" ? userA : userB;
              const setUser = side === "A" ? setUserA : setUserB;
              const color = side === "A" ? "text-accent-primary" : "text-accent-danger";
              const borderColor = side === "A" ? "border-accent-primary/30" : "border-accent-danger/30";
              const bgColor = side === "A" ? "bg-accent-primary/5" : "bg-accent-danger/5";

              return (
                <div key={side} className={`space-y-3 rounded-xl border p-4 ${borderColor} ${bgColor}`}>
                  <p className={`text-sm font-bold ${color}`}>유저 {side}</p>
                  {user ? (
                    <div className="flex items-center gap-2">
                      <UserChip user={user} onRemove={() => setUser(null)} linkable />
                    </div>
                  ) : (
                    <UserSearchInput placeholder={`유저 ${side} 선택`} onSelect={(u) => setUser(u)} />
                  )}
                </div>
              );
            })}
          </div>

          {isLoading && (
            <div className="flex justify-center py-6">
              <LoadingSpinner />
            </div>
          )}

          {isError && <p className="text-center text-sm text-accent-danger">데이터를 불러오지 못했습니다.</p>}

          {data && (
            <div className="space-y-4">
              {data.totalGames === 0 ? (
                <LabEmptyState level="insufficient" section="1:1 대전" />
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex h-6 overflow-hidden rounded-full bg-bg-primary/50">
                      <div className="flex h-full items-center justify-center bg-accent-primary text-xs font-bold text-white transition-all" style={{ width: `${data.userAWinRate * 100}%` }}>
                        {data.userAWins}승
                      </div>
                      <div className="flex h-full items-center justify-center bg-accent-danger text-xs font-bold text-white transition-all" style={{ width: `${data.userBWinRate * 100}%` }}>
                        {data.userBWins}승
                      </div>
                    </div>
                    <div className="flex justify-between text-xs">
                      <Link href={`/users/${data.userAId}`} className="font-semibold text-accent-primary hover:underline">
                        {userA?.username} {(data.userAWinRate * 100).toFixed(1)}%
                      </Link>
                      <span className="text-text-tertiary">총 {data.totalGames}경기</span>
                      <Link href={`/users/${data.userBId}`} className="font-semibold text-accent-danger hover:underline">
                        {(data.userBWinRate * 100).toFixed(1)}% {userB?.username}
                      </Link>
                    </div>
                  </div>

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
                      신뢰도: {data.confidence === "high" ? "높음" : data.confidence === "moderate" ? "보통" : data.confidence === "low" ? "낮음" : "부족"}
                    </Badge>
                  </div>

                  {data.positionBreakdown.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-text-secondary">포지션별 매칭</p>
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
                              <tr key={i} className="border-t border-white/10 bg-bg-secondary/40 hover:bg-bg-elevated/60">
                                <td className="px-3 py-1.5 text-text-secondary">{formatPosition(row.userAPosition)}</td>
                                <td className="px-3 py-1.5 text-text-secondary">{formatPosition(row.userBPosition)}</td>
                                <td className="px-3 py-1.5 text-right text-text-secondary">{row.games}</td>
                                <td className="px-3 py-1.5 text-right font-semibold">
                                  <span className={row.userAWinRate >= 0.5 ? "text-accent-success" : "text-accent-danger"}>
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

                  {data.recentMatches.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-text-secondary">최근 대전 기록</p>
                      <div className="space-y-2">
                        {data.recentMatches.map((m) => (
                          <Link key={m.matchId} href={`/matches/${m.matchId}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2 text-xs transition-colors hover:bg-bg-elevated/60">
                            <div className="flex items-center gap-1.5">
                              <div className="relative h-7 w-7 overflow-hidden rounded-md border border-white/10">
                                <Image src={getChampionIconById(m.userAChampionId)} alt={m.userAChampionName} fill className="object-cover" unoptimized />
                              </div>
                              <div>
                                <p className={m.userAWin ? "text-accent-success" : "text-accent-danger"}>{m.userAWin ? "승" : "패"}</p>
                                <p className="text-text-tertiary">{formatKda(m.userAKills, m.userADeaths, m.userAAssists)}</p>
                              </div>
                            </div>

                            <div className="flex-1 text-center">
                              <Swords className="mx-auto h-3.5 w-3.5 text-text-tertiary" />
                              {m.completedAt && (
                                <p className="text-text-tertiary">
                                  {new Date(m.completedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-row-reverse items-center gap-1.5">
                              <div className="relative h-7 w-7 overflow-hidden rounded-md border border-white/10">
                                <Image src={getChampionIconById(m.userBChampionId)} alt={m.userBChampionName} fill className="object-cover" unoptimized />
                              </div>
                              <div className="text-right">
                                <p className={m.userBWin ? "text-accent-success" : "text-accent-danger"}>{m.userBWin ? "승" : "패"}</p>
                                <p className="text-text-tertiary">{formatKda(m.userBKills, m.userBDeaths, m.userBAssists)}</p>
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

          {!hasResult && !isLoading && (!userA || !userB) && (
            <p className="py-4 text-center text-sm text-text-tertiary">두 유저를 선택하면 1:1 직접 대전 상성을 분석합니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
