"use client";

import { NexusRecordsSection } from "./NexusRecordsSection";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { useDdragonStore } from "@/stores/ddragon-store";
import {
  userApi,
  friendApi,
  statsApi,
  presenceApi,
  reputationApi,
  rankingApi,
} from "@/lib/api-client";
import { ChampionImage } from "@/components/ChampionImage";
import {
  PositionIcon,
  POSITION_LABELS,
} from "@/app/[game]/tournaments/[id]/lobby/_components/icons";

import {
  LoadingSpinner,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { AdSlotCard } from "@/components/ads/AdSlot";
import {
  Trophy,
  Target,
  Calendar,
  User,
  UserPlus,
  UserCheck,
  UserX,
  MessageSquare,
  Loader2,
  Star,
  Gavel,
  ExternalLink,
  ThumbsUp,
} from "lucide-react";
import { commendationTagLabel } from "@/lib/commendation";
import { TierBadge } from "@/components/domain/TierBadge";
import { RoleTierBadges } from "@/components/domain/RoleTierBadges";
import { RoleBalanceScores } from "@/components/domain/RoleBalanceScores";
import { StreamerPlatformBadge } from "@/components/domain/StreamerPlatformBadge";

import { useToast } from "@/components/ui/Toast";
import { getChampionKoreanName } from "@nexus/types";
import { useGamePrefix, useNavigationGame } from "@/hooks/useCurrentGame";
import {
  DEFAULT_GAME,
  GAMES,
  GAME_TITLES,
  gameFromSlug,
  type GameTitle,
} from "@nexus/types";
import { PubgProfileSection } from "@/components/pubg/PubgProfileSection";
import { useProfileTarget } from "@/components/profile/ProfileTargetContext";
import {
  gameAccountSettingsPath,
  myProfilePath,
  userProfilePath,
} from "@/lib/profile-routes";

const ROLE_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

const PROFILE_ACCENT = "#667EEA";

// ─── 헬퍼 함수 ───────────────────────────────────────────────

interface ProfileUser {
  id: string;
  username: string;
  bio: string | null;
  avatar: string | null;
  profileBanner: string | null;
  createdAt: string;
  reputationScore: number | null;
  /** 이 사람이 연동한 게임. 프로필 탭과 `/profile/:id` 폴백이 여기서 갈린다. */
  linkedGames?: Record<GameTitle, boolean>;
  pubgAccounts?: Array<{
    id: string;
    playerName: string;
    lastMatchShard: "STEAM" | "KAKAO" | null;
    isPrimary: boolean;
    pubgTier: string | null;
    nexusTier: string | null;
    nexusScore: number | null;
  }>;
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
    roleTiers: Array<{
      role: string;
      tier: string;
      rank: string;
      lp: number;
    }>;
    balanceScores: Record<string, number> | null;
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
      gameTitle: GameTitle;
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
  streamerProfiles?: {
    platform: "CHZZK" | "SOOP" | "YOUTUBE";
    channelUrl: string;
    channelName: string | null;
    isActive?: boolean;
  }[];
  streamerLinks?: {
    id: string;
    label: string;
    url: string;
    imageUrl: string | null;
    order: number;
    isActive?: boolean;
  }[];
}

type FriendshipStatus =
  "none" | "friends" | "pending_sent" | "pending_received" | "blocked";

export default function UserProfilePage() {
  const params = useParams();
  const profileTarget = useProfileTarget();
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const navigationGame = useNavigationGame();
  const userId = profileTarget?.userId ?? (params.id as string);
  const isOwnProfile = profileTarget?.isOwnProfile ?? false;
  const { user: currentUser, isAuthenticated } = useAuthStore();
  const { championMap, fetchChampions } = useDdragonStore();
  const { addToast } = useToast();

  // 롤 내전 랭킹 순위 — 이름 옆 배지로 띄우고 누르면 랭킹에서 이 사람을 찾아 준다
  const { data: nexusRanking } = useQuery({
    queryKey: ["userRanking", userId],
    queryFn: () => rankingApi.getUserRanking(userId),
    enabled: Boolean(userId),
    staleTime: 2 * 60 * 1000,
  });

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendshipStatus, setFriendshipStatus] =
    useState<FriendshipStatus>("none");
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [auctionStats, setAuctionStats] = useState<any>(null);
  const [onlineStatus, setOnlineStatus] = useState<string | null>(null);
  const [rep, setRep] = useState<any>(null);
  const searchParams = useSearchParams();
  /**
   * 프로필에 띄울 게임 탭.
   *
   * 연동한 게임만 나온다. 아무것도 연동 안 했으면 기본 게임 하나만 둔다 —
   * 탭이 하나면 아예 안 그리므로 화면에는 롤 구획만 보인다.
   */
  const availableGames = useMemo<GameTitle[]>(() => {
    if (isOwnProfile) return [...GAME_TITLES];
    const linked = profile?.linkedGames;
    if (!linked) return [DEFAULT_GAME];
    const games = GAME_TITLES.filter((title) => linked[title]);
    return games.length > 0 ? games : [DEFAULT_GAME];
  }, [isOwnProfile, profile?.linkedGames]);
  const [activeGame, setActiveGame] = useState<GameTitle>(DEFAULT_GAME);
  /**
   * 어느 게임 경로에서 넘어왔는지(`/lol/profile/:id` → `?game=lol`).
   * 그 게임을 연동한 사람이면 그 탭으로 연다.
   */
  const requestedGame =
    gameFromSlug(searchParams.get("game")) ??
    (isOwnProfile ? navigationGame : null);

  // 연동 목록이 확정되면(로딩 완료) 탭을 맞춘다.
  // 롤 미연동·배그만 하는 사람 프로필이 빈 롤 탭으로 열리면 안 된다.
  useEffect(() => {
    const preferred =
      requestedGame && availableGames.includes(requestedGame)
        ? requestedGame
        : availableGames[0];
    setActiveGame((current) =>
      availableGames.includes(current) && !requestedGame ? current : preferred,
    );
  }, [availableGames, requestedGame]);

  // 공개 URL로 자기 프로필에 들어오면 정규 내 프로필 URL로 한 번만 정리한다.
  useEffect(() => {
    if (!isOwnProfile && currentUser && currentUser.id === userId) {
      router.replace(myProfilePath(requestedGame));
    }
  }, [currentUser, isOwnProfile, requestedGame, userId, router]);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await userApi.getProfile(userId);
      setProfile(data);
    } catch {
      // 로그아웃 상태면 화면이 로그인 안내를 띄우므로 오류 알림은 생략
      if (isAuthenticated) addToast("프로필을 불러올 수 없습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [userId, addToast, isAuthenticated]);

  const fetchFriendshipStatus = useCallback(async () => {
    if (!isAuthenticated || isOwnProfile) return;
    try {
      const data = await friendApi.getFriendshipStatus(userId);
      // 백엔드는 ACCEPTED/PENDING/BLOCKED + isRequester를 반환
      // 프론트 상태로 매핑
      if (!data.status) {
        setFriendshipStatus("none");
      } else if (data.status === "ACCEPTED") {
        setFriendshipStatus("friends");
      } else if (data.status === "PENDING") {
        setFriendshipStatus(
          data.isRequester ? "pending_sent" : "pending_received",
        );
      } else if (data.status === "BLOCKED") {
        setFriendshipStatus("blocked");
      } else {
        setFriendshipStatus("none");
      }
      setFriendshipId(data.friendshipId || null);
    } catch {
      // Not critical
    }
  }, [userId, isAuthenticated, isOwnProfile]);

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
    fetchChampions();
    fetchAuctionStats();
    fetchOnlineStatus();
    fetchReputation();
  }, [
    fetchProfile,
    fetchFriendshipStatus,
    fetchChampions,
    fetchAuctionStats,
    fetchOnlineStatus,
    fetchReputation,
  ]);

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

  // 프로필 API(/users/:id)는 로그인한 사람에게만 열려 있다.
  // 로그아웃 상태에서 "찾을 수 없습니다"라고 하면 계정이 없는 것처럼 보여서 로그인 안내로 바꾼다.
  if (!profile && !isAuthenticated) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 mx-auto mb-4 text-text-tertiary" />
          <h2 className="text-xl font-bold text-text-primary mb-2">
            로그인하면 프로필을 볼 수 있습니다
          </h2>
          <p className="text-text-secondary mb-4">
            넥서스 유저의 프로필과 내전 기록은 로그인한 회원에게 보입니다.
          </p>
          <Button onClick={() => router.push("/auth/login")}>로그인</Button>
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
    profile.riotAccounts?.find((a) => a.isPrimary) || profile.riotAccounts?.[0];
  const clan = profile.clanMemberships?.find(
    (membership) => membership.clan.gameTitle === activeGame,
  )?.clan;
  const friendBtn = getFriendButtonConfig();
  const settings = profile.settings;
  const showRiot = settings?.showRiotAccounts !== false;
  const showChampStats = settings?.showChampionStats !== false;
  const highlightChampionId = settings?.highlightChampionId;

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Profile Hero Section
            배경 이미지 칸 — 예전 112/144px 은 띠처럼 얇아 올린 이미지가 거의 안 보였다.
            넓은 화면 기준 약 3:1(360px)로 키웠다. */}
        <Card className="mb-4 overflow-hidden rounded-lg border-bg-tertiary bg-bg-secondary p-0 shadow-sm">
          <div
            className="relative h-52 w-full bg-bg-tertiary sm:h-64 md:h-80 lg:h-[360px]"
            style={
              profile.profileBanner
                ? undefined
                : {
                    background: `linear-gradient(135deg, ${PROFILE_ACCENT}44, ${PROFILE_ACCENT}0d)`,
                  }
            }
          >
            {profile.profileBanner && (
              <Image
                src={profile.profileBanner}
                alt={`${profile.username} 프로필 배경`}
                fill
                className="pointer-events-none object-cover"
                unoptimized
              />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-secondary to-transparent" />
          </div>
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
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
                    <div
                      className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-bg-primary ${
                        onlineStatus === "ONLINE"
                          ? "bg-accent-success"
                          : onlineStatus === "AWAY"
                            ? "bg-yellow-500"
                            : "bg-text-tertiary"
                      }`}
                      title={
                        onlineStatus === "ONLINE"
                          ? "온라인"
                          : onlineStatus === "AWAY"
                            ? "자리 비움"
                            : "오프라인"
                      }
                    />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 pt-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-black leading-tight text-text-primary md:text-2xl">
                      {profile.username}
                    </h1>
                    {clan && (
                      <Badge
                        variant="primary"
                        size="sm"
                        className="cursor-pointer rounded-md border-0 px-2 py-1 text-xs font-black"
                        style={{
                          color: PROFILE_ACCENT,
                          backgroundColor: `${PROFILE_ACCENT}22`,
                        }}
                        onClick={() => router.push(`/clans/${clan.id}`)}
                      >
                        {clan.tag}
                      </Badge>
                    )}
                    {nexusRanking?.globalRank ? (
                      <Link
                        href={`/lol/ranking?q=${encodeURIComponent(profile.username)}`}
                        title={`내전 ${nexusRanking.totalGames}전 ${nexusRanking.wins}승 ${nexusRanking.losses}패 · 랭킹에서 보기`}
                        className="inline-flex items-center gap-1 rounded-md bg-accent-gold/15 px-2 py-1 text-xs font-black text-accent-gold transition-colors hover:bg-accent-gold/25"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        랭킹 #{nexusRanking.globalRank}
                      </Link>
                    ) : null}
                    {(profile.streamerProfiles ?? []).map((streamer) => (
                      <a
                        key={streamer.platform}
                        href={streamer.channelUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={streamer.channelName ?? streamer.channelUrl}
                      >
                        <StreamerPlatformBadge platform={streamer.platform} />
                      </a>
                    ))}
                  </div>

                  {/* Bio */}
                  <p className="mb-3 max-w-2xl text-sm text-text-secondary">
                    {profile.bio || (
                      <span className="text-text-tertiary italic">
                        자기소개가 없습니다.
                      </span>
                    )}
                  </p>
                  {(profile.streamerLinks ?? []).length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {profile.streamerLinks!.slice(0, 4).map((link) => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg border border-bg-elevated bg-bg-tertiary px-2.5 py-2 transition-colors hover:border-accent-primary"
                        >
                          <span className="relative h-8 w-10 flex-shrink-0 overflow-hidden rounded bg-bg-primary">
                            {link.imageUrl ? (
                              <Image
                                src={link.imageUrl}
                                alt={link.label}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center">
                                <ExternalLink className="h-3.5 w-3.5 text-text-tertiary" />
                              </span>
                            )}
                          </span>
                          <span className="truncate text-xs font-bold text-text-primary">
                            {link.label}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Meta info row — 2-column grid with tier/role emphasis */}
                  <div className="space-y-4">
                    {/* 주라인 & 티어 그리드 */}
                    {primary && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 주라인 칩 */}
                          {primary.mainRole && (
                            <div className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-bg-elevated px-2.5 py-1.5">
                              <PositionIcon
                                position={primary.mainRole}
                                className="!h-4 !w-4"
                              />
                              <span className="text-xs font-bold text-text-primary">
                                {POSITION_LABELS[primary.mainRole] ??
                                  ROLE_LABELS[primary.mainRole] ??
                                  primary.mainRole}
                              </span>
                              <span className="rounded bg-bg-elevated px-1 text-[9px] font-black text-text-tertiary">
                                주
                              </span>
                            </div>
                          )}
                          {primary.subRole && (
                            <div className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-bg-elevated px-2.5 py-1.5">
                              <PositionIcon
                                position={primary.subRole}
                                className="!h-4 !w-4"
                                opacity={0.6}
                              />
                              <span className="text-xs font-semibold text-text-secondary">
                                {POSITION_LABELS[primary.subRole] ??
                                  ROLE_LABELS[primary.subRole] ??
                                  primary.subRole}
                              </span>
                              <span className="rounded bg-bg-elevated px-1 text-[9px] font-black text-text-tertiary">
                                부
                              </span>
                            </div>
                          )}

                          {/* 오른쪽: 솔로/자유 랭크 티어 */}
                          {primary.tier && (
                            <div className="flex items-center gap-2">
                              <TierBadge tier={primary.tier} size="md" />
                              <div className="text-sm">
                                {primary.rank && (
                                  <span className="font-medium text-text-primary">
                                    {primary.rank}
                                  </span>
                                )}
                                {primary.lp && (
                                  <span className="ml-1 text-text-secondary">
                                    {primary.lp}LP
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <RoleTierBadges roleTiers={primary.roleTiers} />
                        <RoleBalanceScores scores={primary.balanceScores} />
                      </div>
                    )}

                    {/* 아래: 게임명 · 최고 티어 · 평판 · 가입일 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                      {primary && showRiot && (
                        <>
                          {/* Riot 계정 카드 대신 — 대표 계정을 누르면 소환사 전적으로 */}
                          <Link
                            href={`${gamePrefix}/matches/summoner/${encodeURIComponent(primary.gameName)}/${encodeURIComponent(primary.tagLine)}`}
                            className="inline-flex items-center gap-1 font-medium text-text-secondary transition-colors hover:text-accent-primary"
                            title="소환사 전적 보기"
                          >
                            {primary.gameName}
                            <span className="text-text-tertiary">
                              #{primary.tagLine}
                            </span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          {(profile.riotAccounts?.length ?? 0) > 1 && (
                            <span title="연동한 Riot 계정 수">
                              외 {(profile.riotAccounts?.length ?? 1) - 1}개
                            </span>
                          )}
                          <span>·</span>
                          {primary.peakTier && (
                            <>
                              <span>최고 {primary.peakTier}</span>
                              {primary.peakRank && (
                                <span>{primary.peakRank}</span>
                              )}
                              <span>·</span>
                            </>
                          )}
                        </>
                      )}

                      {/* 평판 — 별점 대신 받은 칭찬 수와 가장 많이 받은 태그 */}
                      {rep?.commendations?.total > 0 && (
                        <>
                          <ThumbsUp className="h-3 w-3 text-accent-primary flex-shrink-0" />
                          <span className="text-accent-primary">
                            칭찬 {rep.commendations.total}
                            {rep.commendations.topTags?.[0] &&
                              ` · ${commendationTagLabel(rep.commendations.topTags[0].tag)}`}
                          </span>
                          <span>·</span>
                        </>
                      )}

                      {/* Join Date */}
                      <Calendar className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                      <span>
                        {new Date(profile.createdAt).toLocaleDateString(
                          "ko-KR",
                        )}{" "}
                        가입
                      </span>

                      {/* Highlight Champion */}
                      {highlightChampionId && (
                        <>
                          <span>·</span>
                          <ChampionImage
                            championKey={getChampionKey(highlightChampionId)}
                            size={14}
                            className="rounded"
                          />
                          <span className="text-accent-gold">
                            {getChampionName(highlightChampionId)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Buttons */}
              {isOwnProfile && (
                <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto lg:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      router.push(gameAccountSettingsPath(activeGame))
                    }
                  >
                    게임 계정 관리
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/settings")}
                  >
                    설정
                  </Button>
                </div>
              )}
              {isAuthenticated && currentUser?.id !== userId && (
                <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto lg:justify-end">
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

        {/*
          게임 탭.

          신원(이름·아바타·평판·클랜)은 공통이고 전적만 게임별이다.
          연동하지 않은 게임의 탭은 아예 띄우지 않는다 — 배그를 안 하는 사람
          프로필에 빈 배그 탭이 뜨면 안 된다.
        */}
        {availableGames.length > 1 && (
          <div className="mb-4 flex items-center gap-1.5">
            {availableGames.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => {
                  setActiveGame(title);
                  router.replace(
                    isOwnProfile
                      ? myProfilePath(title)
                      : userProfilePath(userId, title),
                    { scroll: false },
                  );
                }}
                aria-pressed={activeGame === title}
                className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  activeGame === title
                    ? "bg-accent-primary text-accent-on"
                    : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                {GAMES[title].label}
              </button>
            ))}
          </div>
        )}

        {activeGame === "PUBG" ? (
          <PubgProfileSection
            userId={userId}
            accounts={profile.pubgAccounts ?? []}
          />
        ) : (
          <>
            {/*
              롤 내전 기록 — 2026-11 유저 검색 결과(/lol/matches/user/:id)와 합쳤다.
              통합 전적 칩·챔피언 탭·포지션별 통계·신뢰도·최근 활동·Riot 계정 카드는
              내전 지표·내전 챔피언·내전 기록 목록·머리 영역 링크와 겹쳐 뺐다.
            */}
            <NexusRecordsSection
              userId={userId}
              showChampions={showChampStats}
            />

            {/* Auction Stats */}
            {auctionStats &&
              (auctionStats.captainCount > 0 ||
                auctionStats.totalAuctions > 0) && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gavel className="h-5 w-5 text-accent-warning" />
                      내전 경매 기록
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                      <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-accent-primary">
                          {auctionStats.captainCount}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          팀장 횟수
                        </p>
                      </div>
                      <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-text-primary">
                          {auctionStats.totalAuctions}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          경매 등장
                        </p>
                      </div>
                      <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-accent-success">
                          {auctionStats.avgSoldPrice > 0
                            ? auctionStats.avgSoldPrice
                            : "-"}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          평균 낙찰가
                        </p>
                      </div>
                      <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-accent-warning">
                          {auctionStats.maxSoldPrice > 0
                            ? auctionStats.maxSoldPrice
                            : "-"}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          최고 낙찰가
                        </p>
                      </div>
                    </div>
                    {auctionStats.titles.length > 0 && (
                      <div>
                        <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wide">
                          획득 칭호
                        </p>
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
                      <p className="text-xs text-text-tertiary mt-3">
                        유찰 {auctionStats.yuchalCount}회
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

            {/* 페이지 하단 광고 — 콘텐츠를 다 보고 난 뒤 노출 (UX 침해 최소) */}
            <div className="mt-6">
              <AdSlotCard slotKey="profile" minHeight={100} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
