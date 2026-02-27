"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/stores/auth-store';
import { useRiotStore } from '@/stores/riot-store';
import { useDdragonStore } from '@/stores/ddragon-store';
import { userApi, matchApi, statsApi } from '@/lib/api-client';
import { AddAccountModal } from '@/components/domain/AddAccountModal';
import { EditAccountModal } from '@/components/domain/EditAccountModal';
import { ChampionImage } from '@/components/ChampionImage';
import { LoadingSpinner, Card, CardHeader, CardTitle, CardContent, Badge, Button, Skeleton, EmptyState, ConfirmModal } from '@/components/ui';
import { Star, Plus, RefreshCw, Shield, Trophy, TrendingUp, Loader2, Gamepad2, Target, History, Clock, Calendar, Settings, User, BarChart3, Pencil, Trash2, Swords, ChevronUp, Gavel } from 'lucide-react';
import { TierBadge } from '@/components/domain/TierBadge';
import { useToast } from '@/components/ui/Toast';

const ROLE_LABELS: Record<string, string> = {
  TOP: '탑',
  JUNGLE: '정글',
  MID: '미드',
  ADC: '원딜',
  SUPPORT: '서포터',
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    accounts,
    selectedAccount,
    isLoading,
    fetchAccounts,
    setPrimaryAccount,
    syncAccount,
    selectAccount,
    deleteAccount,
  } = useRiotStore();
  const { championMap, fetchChampions } = useDdragonStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const { addToast } = useToast();
  const [profileData, setProfileData] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [positionStats, setPositionStats] = useState<any[]>([]);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [championStats, setChampionStats] = useState<any[]>([]);
  const [rankedChampStats, setRankedChampStats] = useState<any[]>([]);
  const [auctionStats, setAuctionStats] = useState<any>(null);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    try {
      const data = await userApi.getProfile(user.id);
      setProfileData(data);
    } catch {
      // Profile data is supplementary, don't block on error
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  const fetchPositionStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await statsApi.getUserPositionStats(user.id);
      setPositionStats(data || []);
    } catch {
      // Not critical
    }
  }, [user?.id]);

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

  const fetchChampionStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await statsApi.getUserChampionStats(user.id);
      setChampionStats(data.slice(0, 5));
    } catch {
      // Not critical
    }
  }, [user?.id]);

  const fetchRankedChampStats = useCallback(async () => {
    if (!profileData?.riotAccounts) return;
    const primary = profileData.riotAccounts.find((a: any) => a.isPrimary) || profileData.riotAccounts[0];
    if (!primary?.gameName || !primary?.tagLine) return;
    try {
      const data = await statsApi.getRankedChampionStats(primary.gameName, primary.tagLine);
      setRankedChampStats((data || []).slice(0, 5));
    } catch {
      // Not critical
    }
  }, [profileData?.riotAccounts]);

  const fetchAuctionStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await statsApi.getUserAuctionStats(user.id);
      setAuctionStats(data);
    } catch {
      // Not critical
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (isAuthenticated) {
      fetchAccounts();
      fetchProfile();
      fetchPositionStats();
      fetchRecentMatches();
      fetchChampions();
      fetchChampionStats();
      fetchAuctionStats();
    }
  }, [isAuthenticated, authLoading, fetchAccounts, fetchProfile, fetchPositionStats, fetchRecentMatches, fetchChampions, fetchChampionStats, fetchAuctionStats, router]);

  // Fetch data that depends on profileData (riotAccounts)
  useEffect(() => {
    if (profileData?.riotAccounts?.length) {
      fetchRankedChampStats();
    }
  }, [profileData?.riotAccounts, fetchRankedChampStats]);

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

  const handleDelete = async (accountId: string) => {
    setDeletingAccountId(accountId);
    try {
      await deleteAccount(accountId);
      addToast('계정이 삭제되었습니다.', 'success');
      fetchProfile();
    } catch {
      addToast('계정 삭제에 실패했습니다.', 'error');
    } finally {
      setDeletingAccountId(null);
    }
  };

  // Get champion name from championId (key)
  const getChampionName = (championId: string): string => {
    const champ = championMap.get(championId);
    return champ?.name || championId;
  };

  const getChampionKey = (championId: string): string => {
    const champ = championMap.get(championId);
    return champ?.id || championId;
  };

  // Get preferred champions grouped by role from profile data
  const getPreferredChampionsByRole = () => {
    if (!profileData?.riotAccounts) return [];

    const primary = profileData.riotAccounts.find((a: any) => a.isPrimary) || profileData.riotAccounts[0];
    if (!primary?.championPreferences?.length) return [];

    const grouped: Record<string, { championId: string; order: number }[]> = {};
    for (const pref of primary.championPreferences) {
      if (!grouped[pref.role]) grouped[pref.role] = [];
      grouped[pref.role].push({ championId: pref.championId, order: pref.order });
    }

    // Sort each group by order
    for (const role of Object.keys(grouped)) {
      grouped[role].sort((a, b) => a.order - b.order);
    }

    // Order by mainRole first, then subRole, then others
    const roleOrder: string[] = [];
    if (primary.mainRole) roleOrder.push(primary.mainRole);
    if (primary.subRole && primary.subRole !== primary.mainRole) roleOrder.push(primary.subRole);
    for (const role of Object.keys(grouped)) {
      if (!roleOrder.includes(role)) roleOrder.push(role);
    }

    return roleOrder
      .filter(role => grouped[role]?.length)
      .map(role => ({ role, champions: grouped[role] }));
  };

  if (authLoading || isLoading || !user) {
    return (
      <div className="flex-grow p-4 md:p-8 animate-fade-in">
        <div className="container mx-auto max-w-6xl">
          {/* 프로필 히어로 스켈레톤 */}
          <Card className="mb-6">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <Skeleton className="w-24 h-24 md:w-28 md:h-28 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-3 w-full">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-72" />
                  <div className="flex gap-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 내전 통계 + 계정 스켈레톤 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 최근 활동 스켈레톤 */}
          <div className="mt-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-28" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const primary = profileData?.riotAccounts?.find((a: any) => a.isPrimary) || profileData?.riotAccounts?.[0];
  const clan = profileData?.clanMemberships?.[0]?.clan;
  const preferredChampions = getPreferredChampionsByRole();
  const highlightChampionId = profileData?.settings?.highlightChampionId;

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Profile Hero Section */}
        <Card className="mb-6">
          <CardContent className="p-6 md:p-8">
            {profileLoading && !profileData ? (
              <div className="flex flex-col md:flex-row items-start gap-6">
                <Skeleton className="w-24 h-24 md:w-28 md:h-28 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-72" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
            ) : (
            <div className="flex flex-col md:flex-row items-start gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-bg-tertiary flex items-center justify-center overflow-hidden relative">
                  {user.avatar ? (
                    <Image
                      src={user.avatar}
                      alt={user.username}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <User className="h-12 w-12 text-text-tertiary" />
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-text-primary">{user.username}</h1>
                  {clan && (
                    <Badge variant="primary" size="sm" className="cursor-pointer" onClick={() => router.push(`/clans/${clan.id}`)}>
                      [{clan.tag}] {clan.name}
                    </Badge>
                  )}
                </div>

                {/* Bio */}
                <p className="text-text-secondary mb-3 max-w-2xl">
                  {user.bio || profileData?.bio || (
                    <span className="text-text-tertiary italic">자기소개가 없습니다. 설정에서 추가해보세요.</span>
                  )}
                </p>

                {/* Meta info row */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
                  {/* Primary Riot Account */}
                  {primary && (
                    <div className="flex items-center gap-2">
                      <TierBadge tier={primary.tier} size="sm" />
                      <span className="font-medium text-text-primary">{primary.gameName}</span>
                      <span className="text-text-tertiary">#{primary.tagLine}</span>
                      {primary.rank && (
                        <span className="text-text-tertiary">{primary.rank} {primary.lp}LP</span>
                      )}
                    </div>
                  )}

                  {/* Peak Tier */}
                  {primary?.peakTier && (
                    <div className="flex items-center gap-1">
                      <ChevronUp className="h-4 w-4 text-accent-gold" />
                      <span className="text-text-tertiary">최고</span>
                      <TierBadge tier={primary.peakTier} size="sm" />
                      {primary.peakRank && <span className="text-text-tertiary">{primary.peakRank}</span>}
                    </div>
                  )}

                  {/* Main / Sub Role */}
                  {primary?.mainRole && (
                    <div className="flex items-center gap-1">
                      <Gamepad2 className="h-4 w-4 text-accent-primary" />
                      <span>{ROLE_LABELS[primary.mainRole] ?? primary.mainRole}</span>
                      {primary.subRole && (
                        <span className="text-text-tertiary">/ {ROLE_LABELS[primary.subRole] ?? primary.subRole}</span>
                      )}
                    </div>
                  )}

                  {/* Highlight Champion */}
                  {highlightChampionId && (
                    <div className="flex items-center gap-1.5">
                      <ChampionImage championKey={getChampionKey(highlightChampionId)} size={20} className="rounded" />
                      <span className="font-medium text-accent-gold">{getChampionName(highlightChampionId)}</span>
                    </div>
                  )}

                  {/* Join date */}
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-text-tertiary" />
                    <span>{new Date(profileData?.createdAt || user.createdAt).toLocaleDateString('ko-KR')} 가입</span>
                  </div>
                </div>
              </div>

              {/* Settings button */}
              <Button variant="ghost" size="sm" onClick={() => router.push('/settings')} className="flex-shrink-0">
                <Settings className="h-4 w-4 mr-1" />
                설정
              </Button>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Preferred Champions Section */}
        {preferredChampions.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-accent-primary" />
                선호 챔피언
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {preferredChampions.map(({ role, champions: champs }) => (
                  <div key={role}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="default" size="sm">{ROLE_LABELS[role] ?? role}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {champs.map(({ championId }) => (
                        <div key={championId} className="flex items-center gap-2 bg-bg-tertiary rounded-lg px-3 py-2">
                          <ChampionImage
                            championKey={getChampionKey(championId)}
                            size={32}
                            className="rounded-md"
                          />
                          <span className="text-sm font-medium text-text-primary">
                            {getChampionName(championId)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Most Played Champions (auto from match data) */}
        {championStats.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-accent-primary" />
                내전 모스트 챔피언
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {championStats.map((champ: any, idx: number) => {
                  const winRate = champ.games > 0 ? ((champ.wins / champ.games) * 100).toFixed(0) : '0';
                  const kda = champ.deaths > 0
                    ? ((champ.kills + champ.assists) / champ.deaths).toFixed(2)
                    : 'Perfect';
                  return (
                    <div key={champ.championId} className="flex items-center gap-3 bg-bg-tertiary rounded-lg p-3">
                      <div className="relative">
                        <ChampionImage
                          championKey={champ.championName || getChampionKey(String(champ.championId))}
                          size={40}
                          className="rounded-md"
                        />
                        {idx === 0 && (
                          <div className="absolute -top-1 -right-1 bg-accent-gold text-bg-primary text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                            1
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {champ.championName || getChampionName(String(champ.championId))}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-text-tertiary">
                          <span>{champ.games}게임</span>
                          <span className={Number(winRate) >= 50 ? 'text-accent-success' : 'text-accent-danger'}>
                            {winRate}%
                          </span>
                          <span>{kda} KDA</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ranked Most Played Champions */}
        {rankedChampStats.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent-gold" />
                이번 시즌 랭크 모스트
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {rankedChampStats.map((champ: any, idx: number) => {
                  const winRate = champ.games > 0 ? ((champ.wins / champ.games) * 100).toFixed(0) : '0';
                  const kda = champ.deaths > 0
                    ? ((champ.kills + champ.assists) / champ.deaths).toFixed(2)
                    : 'Perfect';
                  return (
                    <div key={champ.championName} className="flex items-center gap-3 bg-bg-tertiary rounded-lg p-3">
                      <div className="relative">
                        <ChampionImage
                          championKey={champ.championName}
                          size={40}
                          className="rounded-md"
                        />
                        {idx === 0 && (
                          <div className="absolute -top-1 -right-1 bg-accent-gold text-bg-primary text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                            1
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {champ.championName}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-text-tertiary">
                          <span>{champ.games}게임</span>
                          <span className={Number(winRate) >= 50 ? 'text-accent-success' : 'text-accent-danger'}>
                            {winRate}%
                          </span>
                          <span>{kda} KDA</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auction Stats */}
        {auctionStats && (auctionStats.captainCount > 0 || auctionStats.totalAuctions > 0) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-accent-warning" />
                내전 경매 기록
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-accent-primary">{auctionStats.captainCount}</p>
                  <p className="text-xs text-text-tertiary mt-1">팀장 횟수</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-text-primary">{auctionStats.totalAuctions}</p>
                  <p className="text-xs text-text-tertiary mt-1">경매 등장</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-accent-success">{auctionStats.avgSoldPrice > 0 ? auctionStats.avgSoldPrice : '-'}</p>
                  <p className="text-xs text-text-tertiary mt-1">평균 낙찰가</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-accent-warning">{auctionStats.maxSoldPrice > 0 ? auctionStats.maxSoldPrice : '-'}</p>
                  <p className="text-xs text-text-tertiary mt-1">최고 낙찰가</p>
                </div>
              </div>
              {auctionStats.titles.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wide">획득 칭호</p>
                  <div className="flex flex-wrap gap-2">
                    {auctionStats.titles.map((t: any) => (
                      <span
                        key={t.key}
                        title={t.description}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-warning/10 text-accent-warning border border-accent-warning/30 cursor-default"
                      >
                        <Star className="h-3 w-3" />
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {auctionStats.yuchalCount > 0 && (
                <p className="text-xs text-text-tertiary mt-3">유찰 {auctionStats.yuchalCount}회</p>
              )}
            </CardContent>
          </Card>
        )}

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
                                {account.peakTier && (
                                  <span className="text-xs text-text-tertiary ml-1">
                                    (최고 <span className="text-accent-gold">{account.peakTier} {account.peakRank || ''}</span>)
                                  </span>
                                )}
                              </div>
                              {account.lastSyncedAt && (
                                <p className="text-[11px] text-text-tertiary mt-1">
                                  마지막 동기화: {new Date(account.lastSyncedAt).toLocaleDateString('ko-KR')}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1">
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAccount(account);
                                setShowEditModal(true);
                              }}
                              className="p-2 hover:bg-bg-elevated rounded-lg transition-colors"
                              title="계정 수정"
                            >
                              <Pencil className="h-4 w-4 text-text-secondary" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(account.id);
                              }}
                              className="p-2 hover:bg-bg-elevated rounded-lg transition-colors"
                              title="계정 삭제"
                              disabled={deletingAccountId === account.id}
                            >
                              {deletingAccountId === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-accent-danger" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-text-secondary hover:text-accent-danger" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats Section */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>내전 통계</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profileLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : profileData?.stats ? (
                  <>
                    <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                      <div className="flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4 text-accent-primary" />
                        <span className="text-sm text-text-secondary">총 게임</span>
                      </div>
                      <span className="text-lg font-bold text-text-primary">{profileData.stats.gamesPlayed}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-accent-gold" />
                        <span className="text-sm text-text-secondary">승 / 패</span>
                      </div>
                      <span className="text-lg font-bold">
                        <span className="text-accent-success">{profileData.stats.wins}</span>
                        <span className="text-text-tertiary mx-1">/</span>
                        <span className="text-accent-danger">{profileData.stats.losses}</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-accent-success" />
                        <span className="text-sm text-text-secondary">승률</span>
                      </div>
                      <span className={`text-lg font-bold ${
                        profileData.stats.winRate >= 50 ? 'text-accent-success' : 'text-accent-danger'
                      }`}>
                        {profileData.stats.gamesPlayed > 0 ? `${profileData.stats.winRate.toFixed(1)}%` : '-'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-accent-primary" />
                        <span className="text-sm text-text-secondary">참여 횟수</span>
                      </div>
                      <span className="text-lg font-bold text-text-primary">{profileData.stats.participations}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-text-tertiary">
                    통계를 불러올 수 없습니다.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Position Stats */}
            {positionStats.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Swords className="h-5 w-5 text-accent-primary" />
                    포지션별 통계
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {positionStats.map((pos: any) => {
                    const wr = pos.games > 0 ? ((pos.wins / pos.games) * 100).toFixed(0) : '0';
                    const kda = pos.deaths > 0
                      ? ((pos.kills + pos.assists) / pos.deaths).toFixed(2)
                      : 'Perfect';
                    return (
                      <div key={pos.position} className="flex items-center justify-between p-2.5 bg-bg-tertiary rounded-lg">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" size="sm">{ROLE_LABELS[pos.position] ?? pos.position}</Badge>
                          <span className="text-xs text-text-tertiary">{pos.games}게임</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={Number(wr) >= 50 ? 'text-accent-success font-medium' : 'text-accent-danger font-medium'}>
                            {wr}%
                          </span>
                          <span className="text-text-secondary">{kda} KDA</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Recent Activity Section */}
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
                  {recentMatches.map((match: any) => {
                    // Determine win/loss for current user
                    const myTeam = match.teamA?.members?.find((m: any) => m.userId === user?.id)
                      ? match.teamA
                      : match.teamB?.members?.find((m: any) => m.userId === user?.id)
                        ? match.teamB
                        : null;
                    const isWin = match.status === 'COMPLETED' && myTeam && match.winner?.id === myTeam.id;
                    const isLoss = match.status === 'COMPLETED' && myTeam && match.winner && match.winner.id !== myTeam.id;

                    return (
                      <div
                        key={match.id}
                        className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg hover:bg-bg-elevated transition-colors cursor-pointer"
                        onClick={() => router.push(`/matches/match/${match.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          {match.status === 'COMPLETED' && (
                            <div className={`w-1 h-10 rounded-full ${isWin ? 'bg-accent-success' : isLoss ? 'bg-accent-danger' : 'bg-text-tertiary'}`} />
                          )}
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
                        <div className="flex items-center gap-2">
                          {match.status === 'COMPLETED' && myTeam && (
                            <Badge variant={isWin ? 'success' : 'danger'} size="sm">
                              {isWin ? '승리' : '패배'}
                            </Badge>
                          )}
                          {match.status !== 'COMPLETED' && (
                            <Badge
                              variant={match.status === 'IN_PROGRESS' ? 'primary' : 'default'}
                              size="sm"
                            >
                              {match.status === 'IN_PROGRESS' ? '진행 중' : '대기'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
          fetchAccounts();
          fetchProfile();
          setShowAddModal(false);
        }}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingAccount(null); }}
        onAccountUpdated={() => {
          fetchAccounts();
          fetchProfile();
        }}
        account={editingAccount}
      />

      {/* Delete Account Confirmation */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (confirmDeleteId) {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            await handleDelete(id);
          }
        }}
        title="계정 삭제"
        message="이 Riot 계정을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다."
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        isLoading={!!deletingAccountId}
      />
    </div>
  );
}
