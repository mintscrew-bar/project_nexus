"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { clanApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  LoadingSpinner,
  Badge,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/Modal";
import {
  Shield,
  Crown,
  Users,
  Settings,
  LogOut,
  UserPlus,
  MessageCircle,
  ExternalLink,
} from "lucide-react";

interface ClanMember {
  id: string;
  userId: string;
  role: "OWNER" | "OFFICER" | "MEMBER";
  joinedAt: string;
  user: {
    id: string;
    username: string;
    avatar: string | null;
    riotAccounts?: Array<{
      gameName: string;
      tagLine: string;
      tier: string | null;
      rank: string | null;
      mainRole: string | null;
    }>;
  };
}

interface Clan {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  logo: string | null;
  ownerId: string;
  isRecruiting: boolean;
  maxMembers: number;
  minTier: string | null;
  discord: string | null;
  createdAt: string;
  members: ClanMember[];
  owner: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export default function ClanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clanId = params.id as string;
  const { user, isAuthenticated } = useAuthStore();

  const [clan, setClan] = useState<Clan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [myRole, setMyRole] = useState<"OWNER" | "OFFICER" | "MEMBER" | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const { addToast } = useToast();

  const fetchClan = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clanApi.getClan(clanId);
      setClan(data);

      if (user) {
        const membership = data.members.find((m: ClanMember) => m.userId === user.id);
        setIsMember(!!membership);
        setMyRole(membership?.role || null);
      }
    } catch (err: any) {
      setError(err.message || "클랜 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [clanId, user]);

  useEffect(() => {
    fetchClan();
  }, [fetchClan]);

  const handleJoinClan = async () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }

    try {
      await clanApi.joinClan(clanId);
      addToast("클랜에 가입되었습니다.", "success");
      fetchClan();
    } catch (err: any) {
      addToast(err.message || "클랜 가입에 실패했습니다.", "error");
    }
  };

  const handleLeaveClan = async () => {
    try {
      await clanApi.leaveClan(clanId);
      addToast("클랜을 탈퇴했습니다.", "info");
      router.push("/clans");
    } catch (err: any) {
      addToast(err.message || "클랜 탈퇴에 실패했습니다.", "error");
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return (
          <Badge variant="gold" size="sm" className="flex items-center gap-1">
            <Crown className="h-3 w-3" />
            마스터
          </Badge>
        );
      case "OFFICER":
        return (
          <Badge variant="primary" size="sm">
            임원
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">클랜 정보 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !clan) {
    return (
      <div className="flex-grow p-8 text-center">
        <p className="text-accent-danger">{error || "클랜을 찾을 수 없습니다."}</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push("/clans")}>
          클랜 목록으로
        </Button>
      </div>
    );
  }

  const isOwner = user?.id === clan.ownerId;
  const isOfficer = myRole === "OFFICER";
  const canManage = isOwner || isOfficer;

  return (
    <>
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="w-24 h-24 rounded-xl bg-bg-tertiary flex items-center justify-center overflow-hidden relative flex-shrink-0">
                {clan.logo ? (
                  <Image
                    src={clan.logo}
                    alt={clan.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <Shield className="h-12 w-12 text-text-tertiary" />
                )}
              </div>
              <div className="flex-grow">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-text-primary">
                    [{clan.tag}] {clan.name}
                  </h1>
                  {clan.isRecruiting && <Badge variant="success">모집 중</Badge>}
                </div>
                <p className="text-text-secondary mt-2">
                  {clan.description || "클랜 소개가 없습니다."}
                </p>
                <div className="flex items-center gap-4 mt-3 text-sm text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {clan.members.length}/{clan.maxMembers} 멤버
                  </span>
                  {clan.minTier && (
                    <Badge variant="default" size="sm">
                      {clan.minTier}+
                    </Badge>
                  )}
                  {clan.discord && (
                    <a
                      href={clan.discord}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Discord
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full md:w-auto">
                {isMember ? (
                  <>
                    {canManage && (
                      <Button
                        variant="secondary"
                        onClick={() => router.push(`/clans/${clanId}/settings`)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        설정
                      </Button>
                    )}
                    {!isOwner && (
                      <Button variant="ghost" onClick={() => setShowLeaveConfirm(true)}>
                        <LogOut className="h-4 w-4 mr-2" />
                        탈퇴
                      </Button>
                    )}
                  </>
                ) : (
                  clan.isRecruiting &&
                  clan.members.length < clan.maxMembers && (
                    <Button onClick={handleJoinClan}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      가입하기
                    </Button>
                  )
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              멤버 ({clan.members.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-bg-tertiary">
              {clan.members
                .sort((a, b) => {
                  const roleOrder = { OWNER: 0, OFFICER: 1, MEMBER: 2 };
                  return roleOrder[a.role] - roleOrder[b.role];
                })
                .map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 hover:bg-bg-tertiary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden">
                        {member.user.avatar ? (
                          <Image
                            src={member.user.avatar}
                            alt={member.user.username}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-text-tertiary" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-text-primary">
                            {member.user.username}
                          </p>
                          {getRoleBadge(member.role)}
                        </div>
                        {member.user.riotAccounts?.[0] && (
                          <p className="text-xs text-text-tertiary">
                            {member.user.riotAccounts[0].gameName}#
                            {member.user.riotAccounts[0].tagLine}
                            {member.user.riotAccounts[0].tier &&
                              ` · ${member.user.riotAccounts[0].tier}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/profile/${member.user.id}`)}
                    >
                      프로필
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <ConfirmModal
      isOpen={showLeaveConfirm}
      onClose={() => setShowLeaveConfirm(false)}
      onConfirm={handleLeaveClan}
      title="클랜 탈퇴"
      message={`정말로 "${clan?.name}" 클랜을 탈퇴하시겠습니까?`}
      confirmText="탈퇴"
      variant="danger"
    />
    </>
  );
}
