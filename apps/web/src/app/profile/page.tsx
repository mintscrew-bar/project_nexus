"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useRiotStore } from '@/stores/riot-store';
import { AddAccountModal } from '@/components/domain/AddAccountModal'; // Updated import
import { LoadingSpinner, Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Star, Plus, RefreshCw, Shield, Trophy, TrendingUp } from 'lucide-react';
import { TierBadge } from '@/components/domain/TierBadge';

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

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (isAuthenticated) {
      fetchAccounts();
    }
  }, [isAuthenticated, authLoading, fetchAccounts, router]);

  // Remove handleAddAccount as its logic is now in AddAccountModal
  // const handleAddAccount = async (gameName: string, tagLine: string) => {
  //   console.log('Add account:', gameName, tagLine);
  //   setShowAddModal(false);
  // };

  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  const handleSetPrimary = async (accountId: string) => {
    try {
      await setPrimaryAccount(accountId);
    } catch (error) {
      console.error('Failed to set primary account:', error);
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingAccountId(accountId);
    try {
      await syncAccount(accountId);
    } catch (error) {
      console.error('Failed to sync account:', error);
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
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-accent-primary focus:border-accent-primary sm:text-sm rounded-md bg-bg-secondary text-text-primary"
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
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-text-secondary">총 게임 수</span>
                        <Trophy className="h-4 w-4 text-text-tertiary" />
                      </div>
                      <p className="text-2xl font-bold text-text-primary">0</p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-text-secondary">승률</span>
                        <TrendingUp className="h-4 w-4 text-text-tertiary" />
                      </div>
                      <p className="text-2xl font-bold text-text-primary">-</p>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-text-secondary">
                    계정을 선택해주세요.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
