"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useRiotStore } from '@/stores/riot-store';
import { userApi, matchApi } from '@/lib/api-client';
import { AddAccountModal } from '@/components/domain/AddAccountModal';
import { LoadingSpinner, Card, CardHeader, CardTitle, CardContent, Badge, Button, Label, Skeleton, EmptyState } from '@/components/ui';
import { Star, Plus, RefreshCw, Shield, Trophy, TrendingUp, Loader2, Gamepad2, Target, History, Clock } from 'lucide-react';
import { TierBadge } from '@/components/domain/TierBadge';
import { useToast } from '@/components/ui/Toast';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    accounts,
    primaryAccount,
    selectedAccount,
    isLoading,
    fetchAccounts,
    setPrimaryAccount,
    syncAccount,
    selectAccount,
  } = useRiotStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const { addToast } = useToast();
  const [stats, setStats] = useState<{
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    participations: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [recentMatches, setRecentMatches] = useState<{
    id: string;
    status: string;
    createdAt: string;
    teamA: { name: string };
    teamB: { name: string };
    winner?: { id: string; name: string };
  }[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await userApi.getStats();
      setStats(data);
    } catch {
      addToast('전적 통계를 불러오지 못했습니다.', 'error');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchRecentMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const data = await matchApi.getUserMatches({ limit: 5 });
      setRecentMatches(data);
    } catch {
      addToast('최근 내전 기록을 불러오지 못했습니다.', 'error');
    } finally {
      setMatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (isAuthenticated) {
      fetchAccounts();
      fetchStats();
      fetchRecentMatches();
    }
  }, [isAuthenticated, authLoading, fetchAccounts, fetchStats, fetchRecentMatches, router]);

  // Remove handleAddAccount as its logic is now in AddAccountModal
  // const handleAddAccount = async (gameName: string, tagLine: string) => {
  //   console.log('Add account:', gameName, tagLine);
  //   setShowAddModal(false);
  // };

  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  const handleSetPrimary = async (accountId: string) => {
    try {
      await setPrimaryAccount(accountId);
      addToast('대표 계정이 변경되었습니다.', 'success');
    } catch {
      addToast('대표 계정 설정에 실패했습니다.', 'error');
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingAccountId(accountId);
    try {
      await syncAccount(accountId);
    } catch {
      addToast('계정 동기화에 실패했습니다.', 'error');
    } finally {
      setSyncingAccountId(null);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-text-primary">마이페이지</h1>
          <p className="text-text-secondary">
            {user.username}님의 프로필
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Riot Accounts Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-accent-primary" />
                  연동된 Riot 계정
                </CardTitle>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  계정 추가
                </Button>
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="h-12 w-12 mx-auto mb-4 text-text-tertiary" />
                    <p className="text-text-secondary mb-4">
                      연동된 Riot 계정이 없습니다
                    </p>
                    <Button
                      variant="primary"
                      onClick={() => setShowAddModal(true)}
                    >
                      첫 계정 연동하기
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          selectedAccount?.id === account.id
                            ? 'border-accent-primary bg-accent-primary/5'
                            : 'border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50'
                        } cursor-pointer`}
                        onClick={() => selectAccount(account)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Primary Star */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!account.isPrimary) {
                                  handleSetPrimary(account.id);
                                }
                              }}
                              className={`p-1 rounded transition-colors ${
                                account.isPrimary
                                  ? 'text-accent-gold'
                                  : 'text-text-tertiary hover:text-accent-gold'
                              }`}
                              title={account.isPrimary ? '대표 계정' : '대표 계정으로 설정'}
                            >
                              <Star
                                className="h-5 w-5"
                                fill={account.isPrimary ? 'currentColor' : 'none'}
                              />
                            </button>

                            {/* Account Info */}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-text-primary">
                                  {account.gameName}
                                </span>
                                <span className="text-text-tertiary">
                                  #{account.tagLine}
                                </span>
                                {account.isPrimary && (
                                  <Badge variant="primary" size="sm">
                                    대표
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <TierBadge tier={account.tier} size="sm" />
                                <span className="text-sm text-text-secondary">
                                  {account.rank} • {account.lp} LP
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Sync Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSync(account.id);
                            }}
                            className="p-2 hover:bg-bg-elevated rounded-lg transition-colors"
                            title="티어 동기화"
                            disabled={syncingAccountId === account.id}
                          >
                            {syncingAccountId === account.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
                            ) : (
                              <RefreshCw className="h-4 w-4 text-text-secondary" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats Section */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>통계</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {accounts.length > 0 && (
                  <div>
                    <Label htmlFor="account-select" className="text-text-primary">
                      계정 선택
                    </Label>
                    <select
                      id="account-select"
                      value={selectedAccount?.id || ''}
                      onChange={(e) => {
                        const accountId = e.target.value;
                        const account = accounts.find(acc => acc.id === accountId);
                        selectAccount(account || null);
                      }}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-bg-tertiary focus:outline-none focus:ring-accent-primary focus:border-accent-primary sm:text-sm rounded-md bg-bg-secondary text-text-primary"
                    >
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.gameName}#{account.tagLine}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedAccount ? (
                  <>
                    <div className="pt-4 border-t border-bg-tertiary">
                      <p className="text-sm text-text-tertiary mb-2">선택된 계정 티어</p>
                      <div className="flex items-center gap-2">
                        <TierBadge tier={selectedAccount.tier} size="lg" />
                        <span className="text-2xl font-bold text-text-primary">
                          {selectedAccount.rank} • {selectedAccount.lp} LP
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-text-secondary">
                    계정을 선택해주세요.
                  </div>
                )}

                {/* Nexus Stats */}
                <div className="pt-4 border-t border-bg-tertiary">
                  <p className="text-sm text-text-tertiary mb-3">내전 통계</p>

                  {statsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : stats ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="h-4 w-4 text-accent-primary" />
                          <span className="text-sm text-text-secondary">총 게임</span>
                        </div>
                        <span className="text-lg font-bold text-text-primary">{stats.gamesPlayed}</span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                        <div className="flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-accent-gold" />
                          <span className="text-sm text-text-secondary">승 / 패</span>
                        </div>
                        <span className="text-lg font-bold">
                          <span className="text-accent-success">{stats.wins}</span>
                          <span className="text-text-tertiary mx-1">/</span>
                          <span className="text-accent-danger">{stats.losses}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-accent-success" />
                          <span className="text-sm text-text-secondary">승률</span>
                        </div>
                        <span className={`text-lg font-bold ${
                          stats.winRate >= 50 ? 'text-accent-success' : 'text-accent-danger'
                        }`}>
                          {stats.gamesPlayed > 0 ? `${stats.winRate.toFixed(1)}%` : '-'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-accent-primary" />
                          <span className="text-sm text-text-secondary">참여 횟수</span>
                        </div>
                        <span className="text-lg font-bold text-text-primary">{stats.participations}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-text-tertiary">
                      통계를 불러올 수 없습니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Activity Section (integrated from Dashboard) */}
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-accent-primary" />
                최근 활동
              </CardTitle>
            </CardHeader>
            <CardContent>
              {matchesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentMatches.length > 0 ? (
                <div className="space-y-3">
                  {recentMatches.map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg hover:bg-bg-elevated transition-colors cursor-pointer"
                      onClick={() => router.push(`/matches`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-sm">
                          <p className="font-medium text-text-primary">
                            {match.teamA?.name ?? 'Team A'} vs {match.teamB?.name ?? 'Team B'}
                          </p>
                          <p className="text-xs text-text-tertiary flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(match.createdAt).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          match.status === 'COMPLETED' ? 'success' :
                          match.status === 'IN_PROGRESS' ? 'primary' : 'default'
                        }
                        size="sm"
                      >
                        {match.status === 'COMPLETED' ? '완료' :
                         match.status === 'IN_PROGRESS' ? '진행 중' : '대기'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={History}
                  title="아직 활동 내역이 없습니다"
                  description="내전에 참여하면 여기에 활동 내역이 표시됩니다"
                  action={{
                    label: "내전 참여하기",
                    onClick: () => router.push("/tournaments"),
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAccountAdded={() => {
          fetchAccounts(); // Refresh accounts after a new one is added
          setShowAddModal(false);
        }}
      />
    </div>
  );
}
