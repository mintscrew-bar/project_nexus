"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { clanApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";
import { BarChart2, Trophy, Swords, TrendingUp, Users } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

interface MemberStat {
  userId: string;
  username: string;
  avatar: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

interface ClanStatsData {
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  memberStats: MemberStat[];
}

// ─────────────────────────────────────────────────────────────
// 스켈레톤 로딩 컴포넌트
// ─────────────────────────────────────────────────────────────
function StatsSkeleton() {
  return (
    <div className="space-y-6">
      {/* 집계 카드 그리드 스켈레톤 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>

      {/* 멤버 랭킹 테이블 스켈레톤 */}
      <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
        <div className="p-4 border-b border-bg-tertiary">
          <Skeleton className="h-5 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-bg-tertiary last:border-0">
            <Skeleton className="h-4 w-6 flex-shrink-0" />
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <Skeleton className="h-4 w-24 flex-grow" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 집계 카드 컴포넌트
// ─────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight
          ? "bg-accent-primary/10 border-accent-primary/30"
          : "bg-bg-secondary border-bg-tertiary"
      }`}
    >
      <div className="flex items-center gap-2 text-text-tertiary text-xs mb-1">
        {icon}
        {label}
      </div>
      <p
        className={`text-2xl font-bold ${
          highlight ? "text-accent-primary" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 승률 바 컴포넌트
// ─────────────────────────────────────────────────────────────
function WinRateBar({ winRate }: { winRate: number }) {
  const clampedRate = Math.min(Math.max(winRate, 0), 100);
  const color =
    clampedRate >= 60
      ? "bg-accent-success"
      : clampedRate >= 50
      ? "bg-accent-primary"
      : clampedRate >= 40
      ? "bg-accent-gold"
      : "bg-accent-danger";

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${clampedRate}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary w-10 text-right">
        {clampedRate.toFixed(1)}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ClanStats 메인 컴포넌트
// ─────────────────────────────────────────────────────────────

interface ClanStatsProps {
  clanId: string;
}

export function ClanStats({ clanId }: ClanStatsProps) {
  const [stats, setStats] = useState<ClanStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clanApi.getClanStats(clanId);
      setStats(data);
    } catch {
      setError("통계를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [clanId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return <StatsSkeleton />;
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-accent-danger">{error || "통계 데이터가 없습니다."}</p>
        </CardContent>
      </Card>
    );
  }

  // 승률 기준 내림차순 정렬 (승률 같으면 승 수 기준)
  const sortedMemberStats = stats.memberStats.slice().sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.wins - a.wins;
  });

  return (
    <div className="space-y-6">
      {/* ── 집계 카드 그리드 ── */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        {[
          {
            label: "총 경기수",
            value: stats.totalGames,
            icon: <Swords className="h-3.5 w-3.5" />,
          },
          {
            label: "승률",
            value: `${stats.winRate.toFixed(1)}%`,
            icon: <TrendingUp className="h-3.5 w-3.5" />,
            highlight: true,
          },
          {
            label: "총 승",
            value: stats.totalWins,
            icon: <Trophy className="h-3.5 w-3.5" />,
          },
          {
            label: "총 패",
            value: stats.totalLosses,
            icon: <BarChart2 className="h-3.5 w-3.5" />,
          },
        ].map((card) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <StatCard
              label={card.label}
              value={card.value}
              icon={card.icon}
              highlight={card.highlight}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* ── 멤버 랭킹 테이블 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            멤버 랭킹
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedMemberStats.length === 0 ? (
            <p className="text-text-tertiary text-sm text-center py-8">
              아직 경기 데이터가 없습니다.
            </p>
          ) : (
            <>
              {/* 테이블 헤더 */}
              <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem_6rem] gap-2 px-4 py-2 text-xs text-text-tertiary border-b border-bg-tertiary">
                <span className="text-center">#</span>
                <span>유저</span>
                <span className="text-center">경기</span>
                <span className="text-center">승</span>
                <span className="text-center">패</span>
                <span className="text-right">승률</span>
              </div>

              {/* 멤버 랭킹 행 */}
              <div className="divide-y divide-bg-tertiary">
                {sortedMemberStats.map((memberStat, index) => (
                  <motion.div
                    key={memberStat.userId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem_6rem] gap-2 px-4 py-3 items-center hover:bg-bg-tertiary/50 transition-colors"
                  >
                    {/* 순위 */}
                    <span
                      className={`text-center text-sm font-bold ${
                        index === 0
                          ? "text-accent-gold"
                          : index === 1
                          ? "text-text-secondary"
                          : index === 2
                          ? "text-amber-600"
                          : "text-text-tertiary"
                      }`}
                    >
                      {index + 1}
                    </span>

                    {/* 아바타 + 유저명 */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
                        {memberStat.avatar ? (
                          <Image
                            src={memberStat.avatar}
                            alt={memberStat.username}
                            width={28}
                            height={28}
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Users className="h-3.5 w-3.5 text-text-tertiary" />
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-text-primary font-medium truncate">
                        {memberStat.username}
                      </span>
                    </div>

                    {/* 경기수 */}
                    <span className="text-center text-sm text-text-secondary">
                      {memberStat.totalGames}
                    </span>

                    {/* 승 */}
                    <span className="text-center text-sm text-accent-success font-medium">
                      {memberStat.wins}
                    </span>

                    {/* 패 */}
                    <span className="text-center text-sm text-accent-danger font-medium">
                      {memberStat.losses}
                    </span>

                    {/* 승률 바 */}
                    <div className="flex justify-end">
                      <WinRateBar winRate={memberStat.winRate} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
