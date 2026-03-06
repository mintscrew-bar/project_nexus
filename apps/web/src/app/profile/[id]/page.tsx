"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { userApi, friendApi } from "@/lib/api-client";
import {
  LoadingSpinner,
  Card,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { TierBadge } from "@/components/domain/TierBadge";
import { useToast } from "@/components/ui/Toast";
import {
  User,
  Shield,
  Trophy,
  UserPlus,
  UserCheck,
  Clock,
  Calendar,
  Swords,
} from "lucide-react";

// 티어 이미지 경로 헬퍼 (profile/page.tsx 와 동일 패턴)
const getTierImagePath = (tier: string | null) => {
  if (!tier) return null;
  const tierName = tier.toUpperCase();
  const tierMap: Record<string, string> = {
    IRON: "iron",
    BRONZE: "bronze",
    SILVER: "silver",
    GOLD: "gold",
    PLATINUM: "platinum",
    EMERALD: "emerald",
    DIAMOND: "diamond",
    MASTER: "master",
    GRANDMASTER: "grandmaster",
    CHALLENGER: "challenger",
  };
  const key = Object.keys(tierMap).find((k) => tierName.includes(k));
  return key ? `/tiers/${tierMap[key]}.webp` : null;
};

// 날짜 포맷
const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
};

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: me, isAuthenticated } = useAuthStore();
  const { addToast } = useToast();

  const targetId = params.id as string;

  const [profile, setProfile] = useState<any>(null);
  const [friendStatus, setFriendStatus] = useState<{
    status: string | null;
    isRequester?: boolean;
    friendshipId?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // 본인 프로필이면 /profile 로 리다이렉트
  useEffect(() => {
    if (me && me.id === targetId) {
      router.replace("/profile");
    }
  }, [me, targetId, router]);

  // 프로필 + 친구 상태 불러오기
  useEffect(() => {
    if (!targetId) return;

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const data = await userApi.getProfile(targetId);
        setProfile(data);
      } catch {
        addToast("프로필을 불러오는데 실패했습니다.", "error");
      } finally {
        setIsLoading(false);
      }
    };

    const loadFriendStatus = async () => {
      if (!isAuthenticated) return;
      try {
        const data = await friendApi.getFriendshipStatus(targetId);
        setFriendStatus(data);
      } catch {
        // 친구 상태 조회 실패는 무시
      }
    };

    loadProfile();
    loadFriendStatus();
  }, [targetId, isAuthenticated]);

  // 친구 요청 보내기
  const handleSendFriendRequest = async () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    setIsSendingRequest(true);
    try {
      await friendApi.sendRequest(targetId);
      setFriendStatus({ status: "PENDING", isRequester: true });
      addToast("친구 요청을 보냈습니다.", "success");
    } catch (err: any) {
      addToast(
        err.response?.data?.message || "친구 요청에 실패했습니다.",
        "error"
      );
    } finally {
      setIsSendingRequest(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <User className="h-12 w-12 mx-auto mb-4 text-text-tertiary" />
          <p className="text-text-secondary">유저를 찾을 수 없습니다.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => router.back()}
          >
            뒤로 가기
          </Button>
        </div>
      </div>
    );
  }

  // 대표 클랜 (첫 번째 클랜멤버십)
  const mainClan = profile.clanMemberships?.[0]?.clan ?? null;

  // 대표 라이엇 계정
  const primaryAccount =
    profile.riotAccounts?.find((a: any) => a.isPrimary) ??
    profile.riotAccounts?.[0] ??
    null;

  // 친구 상태 텍스트 & 버튼
  const renderFriendButton = () => {
    if (!isAuthenticated || me?.id === targetId) return null;

    if (friendStatus?.status === "ACCEPTED") {
      return (
        <Button variant="secondary" size="sm" disabled>
          <UserCheck className="h-4 w-4 mr-1.5" />
          친구
        </Button>
      );
    }

    if (friendStatus?.status === "PENDING") {
      return (
        <Button variant="secondary" size="sm" disabled>
          <Clock className="h-4 w-4 mr-1.5" />
          {friendStatus.isRequester ? "요청 전송됨" : "요청 수신됨"}
        </Button>
      );
    }

    return (
      <Button
        variant="primary"
        size="sm"
        isLoading={isSendingRequest}
        onClick={handleSendFriendRequest}
      >
        <UserPlus className="h-4 w-4 mr-1.5" />
        친구 요청
      </Button>
    );
  };

  return (
    <div className="flex-grow p-4 md:p-6 animate-fade-in">
      <div className="container mx-auto max-w-2xl space-y-4">
        {/* 프로필 헤더 */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {/* 아바타 */}
              <div className="w-20 h-20 rounded-full bg-bg-tertiary flex-shrink-0 overflow-hidden relative">
                {profile.avatar ? (
                  <Image
                    src={profile.avatar}
                    alt={profile.username}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="h-10 w-10 text-text-tertiary" />
                  </div>
                )}
              </div>

              {/* 유저 정보 */}
              <div className="flex-grow min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <h1 className="text-xl font-bold text-text-primary">
                      {profile.username}
                    </h1>
                    {/* 클랜 뱃지 */}
                    {mainClan && (
                      <button
                        onClick={() => router.push(`/clans/${mainClan.id}`)}
                        className="text-sm text-accent-primary hover:underline mt-0.5"
                      >
                        [{mainClan.tag}] {mainClan.name}
                      </button>
                    )}
                  </div>
                  {/* 친구 버튼 */}
                  {renderFriendButton()}
                </div>

                {/* 바이오 */}
                {profile.bio && (
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                    {profile.bio}
                  </p>
                )}

                {/* 가입일 */}
                <div className="flex items-center gap-1 mt-3 text-xs text-text-tertiary">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDate(profile.createdAt)} 가입</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 내전 통계 */}
        {profile.stats && (
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Swords className="h-4 w-4" />
                내전 통계
              </h2>
              {profile.stats.gamesPlayed === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-2">
                  아직 내전 기록이 없거나 비공개입니다.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-bg-tertiary rounded-lg p-3">
                    <p className="text-2xl font-bold text-text-primary">
                      {profile.stats.gamesPlayed ?? 0}
                    </p>
                    <p className="text-xs text-text-tertiary mt-0.5">총 게임</p>
                  </div>
                  <div className="bg-bg-tertiary rounded-lg p-3">
                    <p className="text-2xl font-bold text-accent-success">
                      {profile.stats.wins ?? 0}W{" "}
                      <span className="text-accent-danger">
                        {profile.stats.losses ?? 0}L
                      </span>
                    </p>
                    <p className="text-xs text-text-tertiary mt-0.5">전적</p>
                  </div>
                  <div className="bg-bg-tertiary rounded-lg p-3">
                    <p className="text-2xl font-bold text-accent-primary">
                      {profile.stats.winRate != null
                        ? `${Math.round(profile.stats.winRate)}%`
                        : "-"}
                    </p>
                    <p className="text-xs text-text-tertiary mt-0.5">승률</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 라이엇 계정 */}
        {profile.riotAccounts && profile.riotAccounts.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                라이엇 계정
              </h2>
              <div className="space-y-3">
                {profile.riotAccounts.map((account: any) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg"
                  >
                    {/* 티어 이미지 */}
                    <div className="w-10 h-10 flex-shrink-0">
                      {getTierImagePath(account.tier) ? (
                        <Image
                          src={getTierImagePath(account.tier)!}
                          alt={account.tier ?? ""}
                          width={40}
                          height={40}
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="w-10 h-10 bg-bg-elevated rounded-full flex items-center justify-center">
                          <Shield className="h-5 w-5 text-text-tertiary" />
                        </div>
                      )}
                    </div>

                    {/* 계정 정보 */}
                    <div className="flex-grow min-w-0">
                      <button
                        className="font-medium text-sm text-text-primary hover:text-accent-primary transition-colors truncate block"
                        onClick={() =>
                          router.push(
                            `/matches/summoner/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`
                          )
                        }
                      >
                        {account.gameName}#{account.tagLine}
                      </button>
                      <p className="text-xs text-text-tertiary">
                        {account.tier
                          ? `${account.tier} ${account.rank ?? ""} · ${account.lp ?? 0} LP`
                          : "언랭크"}
                      </p>
                    </div>

                    {/* 대표 계정 뱃지 */}
                    {account.isPrimary && (
                      <Badge variant="gold" size="sm">
                        대표
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 라이엇 계정 비공개일 때 */}
        {profile.riotAccounts?.length === 0 && (
          <Card>
            <CardContent className="p-5 text-center text-sm text-text-tertiary py-8">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
              라이엇 계정이 비공개입니다.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
