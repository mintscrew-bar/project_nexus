"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { useDdragonStore } from "@/stores/ddragon-store";
import { userApi, matchApi, friendApi, statsApi, presenceApi } from "@/lib/api-client";
import { ChampionImage } from "@/components/ChampionImage";
import {
  LoadingSpinner,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Skeleton,
  EmptyState,
} from "@/components/ui";
import {
  Shield,
  Trophy,
  TrendingUp,
  Gamepad2,
  Target,
  History,
  Clock,
  Calendar,
  User,
  UserPlus,
  UserCheck,
  UserX,
  MessageSquare,
  Loader2,
  BarChart3,
  Swords,
  ChevronUp,
  Star,
  Gavel,
} from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { useToast } from "@/components/ui/Toast";

const ROLE_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

interface ProfileUser {
  id: string;
  username: string;
  bio: string | null;
  avatar: string | null;
  createdAt: string;
  reputationScore: number | null;
  riotAccounts: Array<{
    id: string;
    gameName: string;
    tagLine: string;
    tier: string;
    rank: string;
    lp: number;
    peakTier: string | null;
    peakRank: string | null;
    lastSyncedAt: string | null;
    mainRole: string | null;
    subRole: string | null;
    isPrimary: boolean;
    championPreferences: Array<{
      id: string;
      role: string;
      championId: string;
      order: number;
    }>;
  }>;
  clanMemberships: Array<{
    clan: {
      id: string;
      name: string;
      tag: string;
    };
  }>;
  stats: {
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    participations: number;
  };
  settings?: {
    showMatchHistory: boolean;
    showRiotAccounts: boolean;
    showChampionStats: boolean;
    highlightChampionId: string | null;
    highlightStatType: string | null;
  } | null;
}

type FriendshipStatus =
  | "none"
  | "friends"
  | "pending_sent"
  | "pending_received"
  | "blocked";

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { user: currentUser, isAuthenticated } = useAuthStore();
  const { championMap, fetchChampions } = useDdragonStore();
  const { addToast } = useToast();

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendshipStatus, setFriendshipStatus] =
    useState<FriendshipStatus>("none");
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [championStats, setChampionStats] = useState<any[]>([]);
  const [rankedChampStats, setRankedChampStats] = useState<any[]>([]);
  const [positionStats, setPositionStats] = useState<any[]>([]);
  const [seasonTiers, setSeasonTiers] = useState<any[]>([]);
  const [auctionStats, setAuctionStats] = useState<any>(null);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);

  // Redirect to own profile if viewing self
  useEffect(() => {
    if (currentUser && currentUser.id === userId) {
      router.replace("/profile");
    }
  }, [currentUser, userId, router]);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await userApi.getProfile(userId);
      setProfile(data);
    } catch {
      addToast("프로필을 불러올 수 없습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchFriendshipStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await friendApi.getFriendshipStatus(userId);
      // 백엔드는 ACCEPTED/PENDING/BLOCKED + isRequester를 반환
      // 프론트 상태로 매핑
      if (!data.status) {
        setFriendshipStatus("none");
      } else if (data.status === "ACCEPTED") {
        setFriendshipStatus("friends");
      } else if (data.status === "PENDING") {
        setFriendshipStatus(data.isRequester ? "pending_sent" : "pending_received");
      } else if (data.status === "BLOCKED") {
        setFriendshipStatus("blocked");
      } else {
        setFriendshipStatus("none");
      }
      setFriendshipId(data.friendshipId || null);
    } catch {
      // Not critical
    }
  }, [userId, isAuthenticated]);

  const fetchMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const data = await matchApi.getUserMatchHistory(userId, 5, 0);
      const flattened = (data || []).map((item: any) => ({
        id: item.matchId || item.match?.id,
        status: item.match?.status,
        createdAt: item.match?.createdAt,
        teamA: item.match?.teamA,
        teamB: item.match?.teamB,
        winner: item.match?.winner,
        myTeamId: item.team?.id,
        participant: item.participant,
      }));
      setRecentMatches(flattened);
    } catch {
      // Not critical
    } finally {
      setMatchesLoading(false);
    }
  }, [userId]);

  const fetchChampionStats = useCallback(async () => {
    try {
      const data = await statsApi.getUserChampionStats(userId);
      setChampionStats(data.slice(0, 5));
    } catch {
      // Not critical
    }
  }, [userId]);

  const fetchRankedChampStats = useCallback(async () => {
    if (!profile?.riotAccounts) return;
    // Respect privacy setting
    if (profile.settings?.showChampionStats === false) return;
    const primary = profile.riotAccounts.find((a) => a.isPrimary) || profile.riotAccounts[0];
    if (!primary?.gameName || !primary?.tagLine) return;
    try {
      const data = await statsApi.getRankedChampionStats(primary.gameName, primary.tagLine);
      setRankedChampStats((data || []).slice(0, 5));
    } catch {
      // Not critical
    }
  }, [profile?.riotAccounts, profile?.settings?.showChampionStats]);

  const fetchPositionStats = useCallback(async () => {
    try {
      const data = await statsApi.getUserPositionStats(userId);
      setPositionStats(data || []);
    } catch {
      // Not critical
    }
  }, [userId]);

  const fetchSeasonTiers = useCallback(async () => {
    if (!profile?.riotAccounts) return;
    const primary = profile.riotAccounts.find((a) => a.isPrimary) || profile.riotAccounts[0];
    if (!primary?.gameName || !primary?.tagLine) return;
    try {
      const data = await statsApi.getSeasonTiers(primary.gameName, primary.tagLine);
      setSeasonTiers(data || []);
    } catch {
      // Not critical
    }
  }, [profile?.riotAccounts]);

  const fetchAuctionStats = useCallback(async () => {
    try {
      const data = await statsApi.getUserAuctionStats(userId);
      setAuctionStats(data);
    } catch {
      // Not critical
    }
  }, [userId]);

  const fetchOnlineStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await presenceApi.getUserStatus(userId);
      setOnlineStatus(data?.status || null);
    } catch {
      // Not critical
    }
  }, [userId, isAuthenticated]);

  useEffect(() => {
    fetchProfile();
    fetchFriendshipStatus();
    fetchMatches();
    fetchChampions();
    fetchChampionStats();
    fetchPositionStats();
    fetchAuctionStats();
    fetchOnlineStatus();
  }, [fetchProfile, fetchFriendshipStatus, fetchMatches, fetchChampions, fetchChampionStats, fetchPositionStats, fetchAuctionStats, fetchOnlineStatus]);

  // Fetch data that depends on profile (riotAccounts)
  useEffect(() => {
    if (profile?.riotAccounts?.length) {
      fetchRankedChampStats();
      fetchSeasonTiers();
    }
  }, [profile?.riotAccounts, fetchRankedChampStats, fetchSeasonTiers]);

  const handleFriendAction = async () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }

    setFriendActionLoading(true);
    try {
      switch (friendshipStatus) {
        case "none":
          await friendApi.sendRequest(userId);
          setFriendshipStatus("pending_sent");
          addToast("친구 요청을 보냈습니다.", "success");
          break;
        case "pending_sent":
          if (friendshipId) {
            await friendApi.cancelRequest(friendshipId);
            setFriendshipStatus("none");
            setFriendshipId(null);
            addToast("친구 요청을 취소했습니다.", "info");
          }
          break;
        case "pending_received":
          if (friendshipId) {
            await friendApi.acceptRequest(friendshipId);
            setFriendshipStatus("friends");
            addToast("친구 요청을 수락했습니다.", "success");
          }
          break;
        case "friends":
          router.push(`/dm/${userId}`);
          return;
      }
    } catch {
      addToast("요청 처리에 실패했습니다.", "error");
    } finally {
      setFriendActionLoading(false);
    }
  };

  const getChampionName = (championId: string): string => {
    const champ = championMap.get(championId);
    return champ?.name || championId;
  };

  const getChampionKey = (championId: string): string => {
    const champ = championMap.get(championId);
    return champ?.id || championId;
  };

  const getPreferredChampionsByRole = () => {
    if (!profile?.riotAccounts) return [];

    const primary =
      profile.riotAccounts.find((a) => a.isPrimary) ||
      profile.riotAccounts[0];
    if (!primary?.championPreferences?.length) return [];

    const grouped: Record<
      string,
      { championId: string; order: number }[]
    > = {};
    for (const pref of primary.championPreferences) {
      if (!grouped[pref.role]) grouped[pref.role] = [];
      grouped[pref.role].push({
        championId: pref.championId,
        order: pref.order,
      });
    }

    for (const role of Object.keys(grouped)) {
      grouped[role].sort((a, b) => a.order - b.order);
    }

    const roleOrder: string[] = [];
    if (primary.mainRole) roleOrder.push(primary.mainRole);
    if (primary.subRole && primary.subRole !== primary.mainRole)
      roleOrder.push(primary.subRole);
    for (const role of Object.keys(grouped)) {
      if (!roleOrder.includes(role)) roleOrder.push(role);
    }

    return roleOrder
      .filter((role) => grouped[role]?.length)
      .map((role) => ({ role, champions: grouped[role] }));
  };

  const getFriendButtonConfig = () => {
    switch (friendshipStatus) {
      case "none":
        return {
          label: "친구 요청",
          icon: UserPlus,
          variant: "primary" as const,
        };
      case "pending_sent":
        return {
          label: "요청 취소",
          icon: UserX,
          variant: "ghost" as const,
        };
      case "pending_received":
        return {
          label: "요청 수락",
          icon: UserCheck,
          variant: "primary" as const,
        };
      case "friends":
        return {
          label: "DM 보내기",
          icon: MessageSquare,
          variant: "ghost" as const,
        };
      default:
        return {
          label: "친구 요청",
          icon: UserPlus,
          variant: "primary" as const,
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">프로필 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 mx-auto mb-4 text-text-tertiary" />
          <h2 className="text-xl font-bold text-text-primary mb-2">
            프로필을 찾을 수 없습니다
          </h2>
          <p className="text-text-secondary mb-4">
            존재하지 않는 사용자이거나 삭제된 계정입니다.
          </p>
          <Button onClick={() => router.back()}>뒤로 가기</Button>
        </div>
      </div>
    );
  }

  const primary =
    profile.riotAccounts?.find((a) => a.isPrimary) ||
    profile.riotAccounts?.[0];
  const clan = profile.clanMemberships?.[0]?.clan;
  const preferredChampions = getPreferredChampionsByRole();
  const friendBtn = getFriendButtonConfig();
  const settings = profile.settings;
  const showRiot = settings?.showRiotAccounts !== false;
  const showChampStats = settings?.showChampionStats !== false;
  const showMatchHist = settings?.showMatchHistory !== false;
  const highlightChampionId = settings?.highlightChampionId;

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Profile Hero Section */}
        <Card className="mb-6">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0 relative">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-bg-tertiary flex items-center justify-center overflow-hidden relative">
                  {profile.avatar ? (
                    <Image
                      src={profile.avatar}
                      alt={profile.username}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <User className="h-12 w-12 text-text-tertiary" />
                  )}
                </div>
                {/* Online Status */}
                {onlineStatus && (
                  <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-bg-primary ${
                    onlineStatus === 'ONLINE' ? 'bg-accent-success' :
                    onlineStatus === 'AWAY' ? 'bg-yellow-500' : 'bg-text-tertiary'
                  }`} title={onlineStatus === 'ONLINE' ? '온라인' : onlineStatus === 'AWAY' ? '자리 비움' : '오프라인'} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
                    {profile.username}
                  </h1>
                  {clan && (
                    <Badge
                      variant="primary"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => router.push(`/clans/${clan.id}`)}
                    >
                      [{clan.tag}] {clan.name}
                    </Badge>
                  )}
                </div>

                {/* Bio */}
                <p className="text-text-secondary mb-3 max-w-2xl">
                  {profile.bio || (
                    <span className="text-text-tertiary italic">
                      자기소개가 없습니다.
                    </span>
                  )}
                </p>

                {/* Meta info row */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
                  {primary && (
                    <div className="flex items-center gap-2">
                      <TierBadge tier={primary.tier} size="sm" />
                      <span className="font-medium text-text-primary">
                        {primary.gameName}
                      </span>
                      <span className="text-text-tertiary">
                        #{primary.tagLine}
                      </span>
                      {primary.rank && (
                        <span className="text-text-tertiary">
                          {primary.rank} {primary.lp}LP
                        </span>
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

                  {primary?.mainRole && (
                    <div className="flex items-center gap-1">
                      <Gamepad2 className="h-4 w-4 text-accent-primary" />
                      <span>
                        {ROLE_LABELS[primary.mainRole] ?? primary.mainRole}
                      </span>
                      {primary.subRole && (
                        <span className="text-text-tertiary">
                          /{" "}
                          {ROLE_LABELS[primary.subRole] ?? primary.subRole}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Reputation */}
                  {profile.reputationScore != null && (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-accent-gold" fill="currentColor" />
                      <span className="font-medium text-text-primary">{profile.reputationScore.toFixed(1)}</span>
                      <span className="text-text-tertiary">/ 5.0</span>
                    </div>
                  )}

                  {/* Highlight Champion */}
                  {highlightChampionId && (
                    <div className="flex items-center gap-1.5">
                      <ChampionImage championKey={getChampionKey(highlightChampionId)} size={20} className="rounded" />
                      <span className="font-medium text-accent-gold">{getChampionName(highlightChampionId)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-text-tertiary" />
                    <span>
                      {new Date(profile.createdAt).toLocaleDateString(
                        "ko-KR"
                      )}{" "}
                      가입
                    </span>
                  </div>
                </div>
              </div>

              {/* Social Buttons */}
              {isAuthenticated && currentUser?.id !== userId && (
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant={friendBtn.variant}
                    size="sm"
                    onClick={handleFriendAction}
                    disabled={
                      friendActionLoading || friendshipStatus === "blocked"
                    }
                  >
                    {friendActionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <friendBtn.icon className="h-4 w-4 mr-1" />
                    )}
                    {friendBtn.label}
                  </Button>
                  {friendshipStatus === "friends" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/dm/${userId}`)}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      DM
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preferred Champions Section */}
        {showChampStats && preferredChampions.length > 0 && (
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
                      <Badge variant="default" size="sm">
                        {ROLE_LABELS[role] ?? role}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {champs.map(({ championId }) => (
                        <div
                          key={championId}
                          className="flex items-center gap-2 bg-bg-tertiary rounded-lg px-3 py-2"
                        >
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
        {showChampStats && championStats.length > 0 && (
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
        {showChampStats && rankedChampStats.length > 0 && (
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

        {/* Season Tier History */}
        {seasonTiers.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent-primary" />
                시즌 기록
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {seasonTiers.map((st: any) => (
                  <div key={st.season} className="bg-bg-tertiary rounded-lg p-3 text-center">
                    <p className="text-xs text-text-tertiary mb-1">{st.season}</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <TierBadge tier={st.tier} size="sm" />
                      <span className="text-sm font-medium text-text-primary">{st.rank}</span>
                    </div>
                    <p className="text-xs text-text-tertiary mt-1">{st.lp} LP</p>
                    <p className="text-xs mt-0.5">
                      <span className="text-accent-success">{st.wins}W</span>
                      <span className="text-text-tertiary mx-0.5">/</span>
                      <span className="text-accent-danger">{st.losses}L</span>
                    </p>
                  </div>
                ))}
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
          {/* Riot Accounts (view only) */}
          {showRiot && profile.riotAccounts?.length > 0 && (
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-accent-primary" />
                    Riot 계정
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {profile.riotAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="p-4 rounded-lg border-2 border-bg-tertiary bg-bg-tertiary"
                      >
                        <div className="flex items-center gap-3">
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
                              {account.mainRole && (
                                <span className="text-sm text-text-tertiary ml-2">
                                  {ROLE_LABELS[account.mainRole] ??
                                    account.mainRole}
                                  {account.subRole &&
                                    ` / ${ROLE_LABELS[account.subRole] ?? account.subRole}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Stats Section */}
          <div className={`${showRiot && profile.riotAccounts?.length > 0 ? "lg:col-span-1" : "lg:col-span-3"} space-y-6`}>
            <Card>
              <CardHeader>
                <CardTitle>내전 통계</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                  <div className="flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4 text-accent-primary" />
                    <span className="text-sm text-text-secondary">
                      총 게임
                    </span>
                  </div>
                  <span className="text-lg font-bold text-text-primary">
                    {profile.stats.gamesPlayed}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-accent-gold" />
                    <span className="text-sm text-text-secondary">
                      승 / 패
                    </span>
                  </div>
                  <span className="text-lg font-bold">
                    <span className="text-accent-success">
                      {profile.stats.wins}
                    </span>
                    <span className="text-text-tertiary mx-1">/</span>
                    <span className="text-accent-danger">
                      {profile.stats.losses}
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-accent-success" />
                    <span className="text-sm text-text-secondary">
                      승률
                    </span>
                  </div>
                  <span
                    className={`text-lg font-bold ${
                      profile.stats.winRate >= 50
                        ? "text-accent-success"
                        : "text-accent-danger"
                    }`}
                  >
                    {profile.stats.gamesPlayed > 0
                      ? `${profile.stats.winRate.toFixed(1)}%`
                      : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-accent-primary" />
                    <span className="text-sm text-text-secondary">
                      참여 횟수
                    </span>
                  </div>
                  <span className="text-lg font-bold text-text-primary">
                    {profile.stats.participations}
                  </span>
                </div>
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
        {showMatchHist && (
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
                      const isWin = match.status === 'COMPLETED' && match.myTeamId && match.winner?.id === match.myTeamId;
                      const isLoss = match.status === 'COMPLETED' && match.myTeamId && match.winner && match.winner.id !== match.myTeamId;

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
                                {match.teamA?.name ?? "Team A"} vs{" "}
                                {match.teamB?.name ?? "Team B"}
                              </p>
                              <p className="text-xs text-text-tertiary flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(match.createdAt).toLocaleDateString("ko-KR")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {match.status === 'COMPLETED' && match.myTeamId && (
                              <Badge variant={isWin ? 'success' : 'danger'} size="sm">
                                {isWin ? '승리' : '패배'}
                              </Badge>
                            )}
                            {match.status !== 'COMPLETED' && (
                              <Badge
                                variant={match.status === "IN_PROGRESS" ? "primary" : "default"}
                                size="sm"
                              >
                                {match.status === "IN_PROGRESS" ? "진행 중" : "대기"}
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
                    title="활동 내역이 없습니다"
                    description="아직 내전에 참여한 기록이 없습니다."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
