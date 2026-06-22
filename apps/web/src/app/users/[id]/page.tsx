"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { useDdragonStore } from "@/stores/ddragon-store";
import { userApi, matchApi, friendApi, statsApi, presenceApi, reputationApi } from "@/lib/api-client";
import { ChampionImage } from "@/components/ChampionImage";
import { PositionIcon, POSITION_LABELS } from "@/app/tournaments/[id]/lobby/_components/icons";
import { getChampionIcon } from "@/components/matches/match-utils";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import { AdSlotCard } from "@/components/ads/AdSlot";
import {
  Shield,
  Trophy,
  TrendingUp,
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
  Star,
  Gavel,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { useToast } from "@/components/ui/Toast";
import { getChampionKoreanName, searchChampionsByQuery } from "@nexus/types";

const ROLE_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

const PROFILE_ACCENT = "#667EEA";

// ─── 헬퍼 함수 ───────────────────────────────────────────────

function getRecentMetrics(matches: any[]) {
  const games = matches.length;
  const wins = matches.filter((m) => m.participant?.win).length;
  const kills = matches.reduce((s, m) => s + (m.participant?.kills ?? 0), 0);
  const deaths = matches.reduce((s, m) => s + (m.participant?.deaths ?? 0), 0);
  const assists = matches.reduce((s, m) => s + (m.participant?.assists ?? 0), 0);
  return {
    games,
    winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    avgKda: games > 0 ? (deaths === 0 ? kills + assists : (kills + assists) / deaths) : 0,
    avgKills: games > 0 ? kills / games : 0,
    avgDeaths: games > 0 ? deaths / games : 0,
    avgAssists: games > 0 ? assists / games : 0,
  };
}

function formatTimeAgo(value?: string) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

// ─── 서브 컴포넌트 ──────────────────────────────────────────

function WinRateSparkline({ matches }: { matches: any[] }) {
  const outcomes = matches.slice(0, 6).reverse().map((m) => Boolean(m.participant?.win));
  if (outcomes.length === 0) return <div className="h-5 w-10" />;
  const width = 40; const height = 20; const xStart = 4; const innerWidth = 32;
  const points = outcomes.map((won, i) => ({
    x: outcomes.length === 1 ? width / 2 : xStart + (i * innerWidth) / (outcomes.length - 1),
    y: won ? 5 : 15,
    won,
  }));
  return (
    <div className="h-5 w-10 opacity-70">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="rgb(125,211,252)"
          strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"
        />
      </svg>
    </div>
  );
}

function SummaryChip({
  icon: Icon, label, value, detail, side, valueClassName = "text-text-primary",
}: {
  icon: LucideIcon; label: string; value: string;
  detail?: string; side?: React.ReactNode; valueClassName?: string;
}) {
  return (
    <div className="flex min-h-[96px] flex-col justify-between rounded-xl bg-bg-tertiary border border-bg-elevated p-4">
      <div className="flex h-5 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="pt-2">
        <div className="flex items-end justify-between gap-2">
          <p className={`text-[22px] font-black leading-none tracking-tight ${valueClassName}`}>{value}</p>
          {side && <div className="shrink-0 translate-y-0.5">{side}</div>}
        </div>
        {detail && <p className="mt-1.5 truncate text-xs font-semibold text-text-tertiary">{detail}</p>}
      </div>
    </div>
  );
}

function RepBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(5, value || 0));
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 text-xs font-semibold text-text-tertiary">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        <div className="h-full rounded-full bg-accent-primary" style={{ width: `${(v / 5) * 100}%` }} />
      </div>
      <span className="w-7 text-right text-xs font-bold text-text-primary">{v.toFixed(1)}</span>
    </div>
  );
}

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
    showRiotAccounts: boolean;
    showChampionStats: boolean;
    highlightChampionId: string | null;
    highlightStatType: string | null;
  } | null;
  streamerProfile?: {
    platform: "CHZZK" | "SOOP" | "YOUTUBE";
    channelUrl: string;
    channelName: string | null;
    isActive?: boolean;
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
  // 챔피언 검색 필터 (한글/영문 모두 지원)
  const [championFilter, setChampionFilter] = useState('');
  const [auctionStats, setAuctionStats] = useState<any>(null);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);
  const [rep, setRep] = useState<any>(null);

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
  }, [userId, addToast]);

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

  const fetchReputation = useCallback(async () => {
    try {
      const data = await reputationApi.getUserStats(userId);
      setRep(data);
    } catch {
      // Not critical
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
    fetchFriendshipStatus();
    fetchMatches();
    fetchChampions();
    fetchChampionStats();
    fetchPositionStats();
    fetchAuctionStats();
    fetchOnlineStatus();
    fetchReputation();
  }, [fetchProfile, fetchFriendshipStatus, fetchMatches, fetchChampions, fetchChampionStats, fetchPositionStats, fetchAuctionStats, fetchOnlineStatus, fetchReputation]);

  // Fetch data that depends on profile (riotAccounts)
  useEffect(() => {
    if (profile?.riotAccounts?.length) {
      fetchRankedChampStats();
    }
  }, [profile?.riotAccounts, fetchRankedChampStats]);

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
    if (!champ?.name) return championId;
    // 영문 이름을 한글로 변환
    const koreanName = getChampionKoreanName(champ.name);
    return koreanName || champ.name;
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
  const highlightChampionId = settings?.highlightChampionId;
  const recent = getRecentMetrics(recentMatches);

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Profile Hero Section */}
        <Card className="mb-6 overflow-hidden rounded-[18px] border-accent-primary/30 bg-bg-secondary shadow-lg">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              {/* Avatar */}
              <div className="flex-shrink-0 relative">
                <div
                  className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary md:h-24 md:w-24"
                  style={{ border: `2px solid ${PROFILE_ACCENT}88` }}
                >
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
              <div className="min-w-0 flex-1 pt-1">
                <div className="mb-2 flex items-center gap-2">
                  <h1 className="text-xl font-black leading-tight text-text-primary md:text-2xl">
                    {profile.username}
                  </h1>
                  {clan && (
                    <Badge
                      variant="primary"
                      size="sm"
                      className="cursor-pointer rounded-md border-0 px-2 py-1 text-xs font-black"
                      style={{ color: PROFILE_ACCENT, backgroundColor: `${PROFILE_ACCENT}22` }}
                      onClick={() => router.push(`/clans/${clan.id}`)}
                    >
                      {clan.tag}
                    </Badge>
                  )}
                  {profile.streamerProfile && (
                    <a href={profile.streamerProfile.channelUrl} target="_blank" rel="noreferrer">
                      <Badge variant="gold" size="sm" className="rounded-md px-2 py-1 text-xs font-black">
                        streamer
                      </Badge>
                    </a>
                  )}
                </div>

                {/* Bio */}
                <p className="mb-3 max-w-2xl text-sm text-text-secondary">
                  {profile.bio || (
                    <span className="text-text-tertiary italic">
                      자기소개가 없습니다.
                    </span>
                  )}
                </p>

                {/* Meta info row — 2-column grid with tier/role emphasis */}
                <div className="space-y-4">
                  {/* 주라인 & 티어 그리드 */}
                  {primary && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 주라인 칩 */}
                        {primary.mainRole && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-bg-elevated px-2.5 py-1.5">
                            <PositionIcon position={primary.mainRole} className="!h-4 !w-4" />
                            <span className="text-xs font-bold text-text-primary">{POSITION_LABELS[primary.mainRole] ?? ROLE_LABELS[primary.mainRole] ?? primary.mainRole}</span>
                            <span className="rounded bg-bg-elevated px-1 text-[9px] font-black text-text-tertiary">주</span>
                          </div>
                        )}
                        {primary.subRole && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-bg-elevated px-2.5 py-1.5">
                            <PositionIcon position={primary.subRole} className="!h-4 !w-4" opacity={0.6} />
                            <span className="text-xs font-semibold text-text-secondary">{POSITION_LABELS[primary.subRole] ?? ROLE_LABELS[primary.subRole] ?? primary.subRole}</span>
                            <span className="rounded bg-bg-elevated px-1 text-[9px] font-black text-text-tertiary">부</span>
                          </div>
                        )}

                      {/* 오른쪽: 솔로/자유 랭크 티어 */}
                        {primary.tier && (
                          <div className="flex items-center gap-2">
                            <TierBadge tier={primary.tier} size="md" />
                            <div className="text-sm">
                              {primary.rank && <span className="font-medium text-text-primary">{primary.rank}</span>}
                              {primary.lp && <span className="ml-1 text-text-secondary">{primary.lp}LP</span>}
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                  {/* 아래: 게임명 · 최고 티어 · 평판 · 가입일 */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    {primary && (
                      <>
                        <span className="font-medium text-text-secondary">{primary.gameName}</span>
                        <span>#{primary.tagLine}</span>
                        <span>·</span>
                        {primary.peakTier && (
                          <>
                            <span>최고 {primary.peakTier}</span>
                            {primary.peakRank && <span>{primary.peakRank}</span>}
                            <span>·</span>
                          </>
                        )}
                      </>
                    )}

                    {/* Reputation */}
                    {profile.reputationScore != null && (
                      <>
                        <Star className="h-3 w-3 text-accent-gold flex-shrink-0" fill="currentColor" />
                        <span className="text-accent-gold">{profile.reputationScore.toFixed(1)} / 5.0</span>
                        <span>·</span>
                      </>
                    )}

                    {/* Join Date */}
                    <Calendar className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                    <span>
                      {new Date(profile.createdAt).toLocaleDateString("ko-KR")} 가입
                    </span>

                    {/* Highlight Champion */}
                    {highlightChampionId && (
                      <>
                        <span>·</span>
                        <ChampionImage championKey={getChampionKey(highlightChampionId)} size={14} className="rounded" />
                        <span className="text-accent-gold">{getChampionName(highlightChampionId)}</span>
                      </>
                    )}
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

        {/* ── 요약 스탯 칩 (전적/승률/KDA) ── */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <SummaryChip
            icon={Swords}
            label="전적"
            value={`${profile.stats.wins}승 ${profile.stats.losses}패`}
            detail={`${profile.stats.gamesPlayed}게임 · 참여 ${profile.stats.participations}회`}
          />
          <SummaryChip
            icon={TrendingUp}
            label="승률"
            value={profile.stats.gamesPlayed > 0 ? `${profile.stats.winRate.toFixed(0)}%` : "-"}
            detail={profile.stats.gamesPlayed > 0 ? `${profile.stats.wins}승 ${profile.stats.losses}패` : "전적 없음"}
            side={recentMatches.length > 0 ? <WinRateSparkline matches={recentMatches} /> : undefined}
            valueClassName={profile.stats.winRate >= 50 ? "text-accent-success" : "text-accent-danger"}
          />
          <SummaryChip
            icon={Activity}
            label="최근 KDA"
            value={recent.games > 0 ? recent.avgKda.toFixed(2) : "-"}
            detail={
              recent.games > 0
                ? `${recent.avgKills.toFixed(1)} / ${recent.avgDeaths.toFixed(1)} / ${recent.avgAssists.toFixed(1)}`
                : "최근 기록 없음"
            }
          />
        </div>

        {/* Champions Tabbed Section */}
        {showChampStats && (preferredChampions.length > 0 || championStats.length > 0 || rankedChampStats.length > 0) && (
          <Card className="mb-6">
            <CardContent className="p-6 md:p-8">
              <Tabs defaultValue="auto-stats">
                <TabsList className="mb-6">
                  {championStats.length > 0 && (
                    <TabsTrigger value="auto-stats">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      내전 모스트
                    </TabsTrigger>
                  )}
                  {preferredChampions.length > 0 && (
                    <TabsTrigger value="preferred">
                      <Target className="h-4 w-4 mr-2" />
                      선호 포지션
                    </TabsTrigger>
                  )}
                  {rankedChampStats.length > 0 && (
                    <TabsTrigger value="ranked">
                      <Trophy className="h-4 w-4 mr-2" />
                      랭크 모스트
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* 내전 모스트 탭 */}
                {championStats.length > 0 && (
                  <TabsContent value="auto-stats" className="space-y-4">
                    {/* 챔피언 검색 필터 입력창 */}
                    <input
                      type="text"
                      placeholder="챔피언 검색 (한글/영문)"
                      value={championFilter}
                      onChange={e => setChampionFilter(e.target.value)}
                      className="w-full max-w-xs px-3 py-1.5 text-sm rounded-md bg-bg-secondary border border-border-default text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                    />
                    {/* 필터 결과가 없을 경우 안내 메시지 */}
                    {championFilter.trim() && searchChampionsByQuery(championFilter).length === 0 && (
                      <p className="text-sm text-text-tertiary">검색 결과가 없습니다.</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {(championFilter.trim()
                        ? championStats.filter(s =>
                            searchChampionsByQuery(championFilter).includes(s.championName)
                          )
                        : championStats
                      ).map((champ: any, idx: number) => {
                        const winRate = champ.games > 0 ? ((champ.wins / champ.games) * 100).toFixed(0) : '0';
                        const kda = champ.deaths > 0
                          ? ((champ.kills + champ.assists) / champ.deaths).toFixed(2)
                          : 'Perfect';
                        return (
                          <div key={champ.championId} className="flex items-center gap-3 bg-bg-tertiary border border-bg-elevated rounded-lg p-3">
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
                                {getChampionKoreanName(champ.championName || getChampionName(String(champ.championId)))}
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
                  </TabsContent>
                )}

                {/* 선호 포지션 탭 */}
                {preferredChampions.length > 0 && (
                  <TabsContent value="preferred" className="space-y-4">
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
                              className="flex items-center gap-2 bg-bg-tertiary border border-bg-elevated rounded-lg px-3 py-2"
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
                  </TabsContent>
                )}

                {/* 랭크 모스트 탭 */}
                {rankedChampStats.length > 0 && (
                  <TabsContent value="ranked" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {rankedChampStats.map((champ: any, idx: number) => {
                        const winRate = champ.games > 0 ? ((champ.wins / champ.games) * 100).toFixed(0) : '0';
                        const kda = champ.deaths > 0
                          ? ((champ.kills + champ.assists) / champ.deaths).toFixed(2)
                          : 'Perfect';
                        return (
                          <div key={champ.championName} className="flex items-center gap-3 bg-bg-tertiary border border-bg-elevated rounded-lg p-3">
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
                                {getChampionKoreanName(champ.championName)}
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
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Season Tier History */}
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

          {/* Stats Section — 포지션별 통계 + 신뢰도 */}
          <div className={`${showRiot && profile.riotAccounts?.length > 0 ? "lg:col-span-1" : "lg:col-span-3"} space-y-6`}>
            {/* 포지션별 통계 */}
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
                      <div key={pos.position} className="flex items-center justify-between p-2.5 bg-bg-tertiary border border-bg-elevated rounded-lg">
                        <div className="flex items-center gap-2">
                          <PositionIcon position={pos.position} className="!h-4 !w-4" />
                          <span className="text-xs font-semibold text-text-primary">{POSITION_LABELS[pos.position] ?? ROLE_LABELS[pos.position] ?? pos.position}</span>
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

            {/* 신뢰도 */}
            {rep && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-accent-gold" fill="currentColor" />
                      신뢰도
                    </CardTitle>
                    <span className="text-xs text-text-tertiary">{rep.totalRatings ?? 0}개 평가</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-bg-tertiary border border-bg-elevated p-3">
                    <div>
                      <p className="text-xs text-text-tertiary">종합 평가</p>
                      <p className="mt-1 text-2xl font-black text-text-primary">{(rep.overallAverage ?? 0).toFixed(1)}</p>
                    </div>
                    <span className="text-xl text-accent-gold">
                      {"★".repeat(Math.round(Math.max(0, Math.min(5, rep.overallAverage ?? 0))))}
                      <span className="text-text-muted">{"★".repeat(5 - Math.round(Math.max(0, Math.min(5, rep.overallAverage ?? 0))))}</span>
                    </span>
                  </div>
                  <div className="space-y-3">
                    <RepBar label="실력" value={rep.averageSkill ?? 0} />
                    <RepBar label="태도" value={rep.averageAttitude ?? 0} />
                    <RepBar label="소통" value={rep.averageCommunication ?? 0} />
                  </div>
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
                <div className="grid gap-2 md:grid-cols-2">
                  {recentMatches.map((match: any) => {
                    const isWin = match.status === 'COMPLETED' && match.myTeamId && match.winner?.id === match.myTeamId;
                    const isLoss = match.status === 'COMPLETED' && match.myTeamId && match.winner && match.winner.id !== match.myTeamId;
                    const p = match.participant || {};
                    const hasParticipant = p.kills != null || p.championName;

                    return (
                      <div
                        key={match.id}
                        className="rounded-xl bg-bg-tertiary border border-bg-elevated p-3 hover:bg-bg-elevated transition-colors cursor-pointer"
                        onClick={() => router.push(`/matches/match/${match.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          {/* 챔피언 아이콘 or 색상 바 */}
                          {hasParticipant && p.championName ? (
                            <Image
                              src={getChampionIcon(p.championName)}
                              alt={p.championName}
                              width={36} height={36}
                              className="h-9 w-9 rounded-full flex-shrink-0"
                              unoptimized
                            />
                          ) : (
                            <div className={`w-1 h-10 rounded-full flex-shrink-0 ${isWin ? 'bg-accent-success' : isLoss ? 'bg-accent-danger' : 'bg-text-tertiary'}`} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-text-primary">
                              {hasParticipant && p.kills != null
                                ? `${p.kills}/${p.deaths ?? 0}/${p.assists ?? 0} · ${p.championNameKorean || p.championName || "챔피언"}`
                                : `${match.teamA?.name ?? "Team A"} vs ${match.teamB?.name ?? "Team B"}`}
                            </p>
                            <p className="text-xs text-text-tertiary flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3 flex-shrink-0" />
                              {formatTimeAgo(match.completedAt || match.createdAt)}
                              {p.position && (
                                <span className="flex items-center gap-0.5 ml-1">
                                  · <PositionIcon position={p.position} className="!h-3 !w-3" />
                                </span>
                              )}
                            </p>
                          </div>
                          {match.status === 'COMPLETED' && match.myTeamId && (
                            <span className={`flex-shrink-0 rounded-md px-2 py-1 text-xs font-black ${isWin ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-danger/10 text-accent-danger'}`}>
                              {isWin ? '승' : '패'}
                            </span>
                          )}
                          {match.status !== 'COMPLETED' && (
                            <Badge variant={match.status === "IN_PROGRESS" ? "primary" : "default"} size="sm">
                              {match.status === "IN_PROGRESS" ? "진행 중" : "대기"}
                            </Badge>
                          )}
                        </div>
                        {/* K/D/A 서브 그리드 */}
                        {hasParticipant && p.kills != null && (
                          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                            {[
                              { label: "KDA", value: p.deaths > 0 ? ((p.kills + p.assists) / p.deaths).toFixed(2) : "Perfect" },
                              { label: "피해량", value: p.damage ? (p.damage >= 1000 ? `${Math.round(p.damage / 100) / 10}k` : `${p.damage}`) : "-" },
                              { label: "상대", value: match.match?.teamA?.id === match.myTeamId ? (match.match?.teamB?.name ?? "-") : (match.match?.teamA?.name ?? "-") },
                            ].map(({ label, value }) => (
                              <div key={label} className="rounded-lg bg-bg-secondary border border-bg-elevated px-2 py-1.5">
                                <p className="text-[10px] text-text-tertiary">{label}</p>
                                <p className="truncate text-xs font-black text-text-primary">{value}</p>
                              </div>
                            ))}
                          </div>
                        )}
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

          {/* 페이지 하단 광고 — 콘텐츠를 다 보고 난 뒤 노출 (UX 침해 최소) */}
          <div className="mt-6">
            <AdSlotCard slotKey="profileBottom" minHeight={120} />
          </div>
        </div>
      </div>
    </div>
  );
}
