"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { usePresenceStore } from "@/stores/presence-store";
import { clanApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  LoadingSpinner,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  StatusIndicator,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/Modal";
import {
  ClanEmblem,
  ClanTag,
  DEFAULT_CLAN_ACCENT,
} from "@/components/domain/ClanEmblem";
import {
  PositionIcon,
  POSITION_LABELS,
} from "@/app/tournaments/[id]/lobby/_components/icons";
import { TierBadge } from "@/components/domain/TierBadge";
import { cn } from "@/lib/utils";

const RECRUIT_ROLE_OPTIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

/** 가입일 표기 (YYYY.MM.DD) */
function formatJoinedDate(value: string): string {
  return new Date(value)
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\.$/, "");
}
import {
  Shield,
  Crown,
  Users,
  Settings,
  LogOut,
  UserPlus,
  MessageCircle,
  ExternalLink,
  BarChart2,
  Info,
  Bell,
  Plus,
  Trash2,
  KeyRound,
} from "lucide-react";

const ClanChat = dynamic(
  () => import("@/components/domain/ClanChat").then((mod) => mod.ClanChat),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="sm" />
      </div>
    ),
  }
);

const ClanStats = dynamic(
  () => import("@/components/domain/ClanStats").then((mod) => mod.ClanStats),
  {
    loading: () => (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="sm" />
      </div>
    ),
  }
);

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

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
  banner: string | null;
  accentColor: string | null;
  recruitRoles: string[];
  ownerId: string;
  isRecruiting: boolean;
  maxMembers: number;
  minTier: string | null;
  discord: string | null;
  officerCanManageSettings: boolean;
  officerCanManageMembers: boolean;
  officerCanManageAnnouncements: boolean;
  officerCanManageInvitations: boolean;
  createdAt: string;
  members: ClanMember[];
  owner: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

interface Announcement {
  id: string;
  content: string;
  authorId: string;
  author: {
    id: string;
    username: string;
  };
  createdAt: string;
  isPinned: boolean;
}

// ─────────────────────────────────────────────────────────────
// 컴포넌트: 역할 배지
// ─────────────────────────────────────────────────────────────
function getRoleBadge(role: string) {
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
        <Badge variant="primary" size="sm" className="flex items-center gap-1">
          <Shield className="h-3 w-3" />
          임원
        </Badge>
      );
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 컴포넌트: 모집 공고 섹션 (모집 포지션 인라인 편집)
// ─────────────────────────────────────────────────────────────
interface RecruitmentSectionProps {
  clanId: string;
  isRecruiting: boolean;
  minTier: string | null;
  recruitRoles: string[];
  canManageSettings: boolean;
  onUpdated: () => void;
}

function RecruitmentSection({
  clanId,
  isRecruiting,
  minTier,
  recruitRoles,
  canManageSettings,
  onUpdated,
}: RecruitmentSectionProps) {
  const { addToast } = useToast();
  const [roles, setRoles] = useState<string[]>(recruitRoles);
  const [isSaving, setIsSaving] = useState(false);

  // 원본과 비교해 변경 여부 판단
  const dirty =
    roles.length !== recruitRoles.length ||
    roles.some((r) => !recruitRoles.includes(r));

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await clanApi.updateClan(clanId, { recruitRoles: roles });
      addToast("모집 포지션이 저장되었습니다.", "success");
      onUpdated();
    } catch (err: any) {
      addToast(err.response?.data?.message || "저장에 실패했습니다.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          모집 공고
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* 모집 상태 + 최소 티어 */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isRecruiting ? "success" : "default"} size="sm">
            {isRecruiting ? "모집 중" : "모집 안 함"}
          </Badge>
          {minTier && (
            <Badge variant="default" size="sm">
              최소 {minTier}
            </Badge>
          )}
        </div>

        {/* 모집 포지션 */}
        <div>
          <p className="mb-2 text-xs font-semibold text-text-tertiary">
            모집 포지션
          </p>
          {canManageSettings ? (
            <div className="flex flex-wrap items-center gap-2">
              {RECRUIT_ROLE_OPTIONS.map((role) => {
                const active = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-bg-elevated bg-bg-tertiary text-text-tertiary hover:text-text-secondary",
                    )}
                  >
                    <PositionIcon position={role} className="!h-3.5 !w-3.5" />
                    {POSITION_LABELS[role] || role}
                  </button>
                );
              })}
            </div>
          ) : roles.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {roles.map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bg-tertiary px-2.5 py-1.5 text-xs font-medium text-text-secondary"
                >
                  <PositionIcon position={role} className="!h-3.5 !w-3.5" />
                  {POSITION_LABELS[role] || role}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-text-tertiary">
              지정된 모집 포지션이 없습니다.
            </p>
          )}
        </div>

        {canManageSettings && dirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} isLoading={isSaving}>
              모집 포지션 저장
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// 컴포넌트: 공지사항 섹션
// ─────────────────────────────────────────────────────────────
interface AnnouncementSectionProps {
  clanId: string;
  canPost: boolean; // OWNER 또는 OFFICER 여부
}

function AnnouncementSection({ clanId, canPost }: AnnouncementSectionProps) {
  const [newContent, setNewContent] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["clanAnnouncements", clanId],
    queryFn: () => clanApi.getAnnouncements(clanId),
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setIsPosting(true);
    try {
      await clanApi.createAnnouncement(clanId, newContent.trim());
      addToast("공지사항이 작성되었습니다.", "success");
      setNewContent("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["clanAnnouncements", clanId] });
    } catch (err: any) {
      addToast(err.response?.data?.message || "공지 작성에 실패했습니다.", "error");
    } finally {
      setIsPosting(false);
    }
  };

  const handleDelete = async (announcementId: string) => {
    try {
      await clanApi.deleteAnnouncement(clanId, announcementId);
      addToast("공지사항이 삭제되었습니다.", "info");
      queryClient.invalidateQueries({ queryKey: ["clanAnnouncements", clanId] });
    } catch {
      addToast("공지 삭제에 실패했습니다.", "error");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            공지사항
          </CardTitle>
          {/* OWNER/OFFICER만 공지 작성 버튼 노출 */}
          {canPost && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(!showForm)}
            >
              <Plus className="h-4 w-4 mr-1" />
              공지 작성
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* 공지 작성 인라인 폼 */}
        {canPost && showForm && (
          <form
            onSubmit={handlePost}
            className="mb-4 p-3 bg-bg-tertiary rounded-lg space-y-2"
          >
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="공지 내용을 입력하세요..."
              rows={3}
              maxLength={1000}
              className="w-full px-3 py-2 bg-bg-elevated border border-bg-elevated rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">
                {newContent.length}/1000
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setNewContent("");
                  }}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isPosting}
                  disabled={!newContent.trim()}
                >
                  등록
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* 공지사항 목록 */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="sm" />
          </div>
        ) : announcements.length === 0 ? (
          <p className="text-text-tertiary text-sm text-center py-4">
            등록된 공지사항이 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="p-3 bg-bg-tertiary rounded-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-text-primary whitespace-pre-wrap flex-1">
                    {announcement.content}
                  </p>
                  {/* OWNER/OFFICER는 공지 삭제 가능 */}
                  {canPost && (
                    <button
                      onClick={() => handleDelete(announcement.id)}
                      className="text-text-tertiary hover:text-accent-danger transition-colors flex-shrink-0"
                      aria-label="공지 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-text-tertiary mt-1.5">
                  {announcement.author.username} ·{" "}
                  {new Date(announcement.createdAt).toLocaleDateString("ko-KR")}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// 컴포넌트: 초대 코드로 가입 모달
// ─────────────────────────────────────────────────────────────
interface JoinByCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function JoinByCodeModal({ isOpen, onClose, onSuccess }: JoinByCodeModalProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsLoading(true);
    try {
      await clanApi.joinByCode(code.trim());
      addToast("초대 코드로 클랜에 가입되었습니다!", "success");
      setCode("");
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast(
        err.response?.data?.message || "초대 코드가 유효하지 않습니다.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="초대 코드로 가입" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            초대 코드 입력
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="초대 코드를 입력하세요"
            className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={!code.trim()}>
            가입하기
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 페이지 컴포넌트
// ─────────────────────────────────────────────────────────────
export default function ClanDetailClient() {
  const params = useParams();
  const router = useRouter();
  const clanId = params.id as string;
  const user = useAuthStore(state => state.user);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  // presence-store에서 온라인 상태 조회
  const getFriendStatus = usePresenceStore(state => state.getFriendStatus);

  const [clan, setClan] = useState<Clan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [myRole, setMyRole] = useState<"OWNER" | "OFFICER" | "MEMBER" | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showJoinByCodeModal, setShowJoinByCodeModal] = useState(false);
  const { addToast } = useToast();

  const fetchClan = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clanApi.getClan(clanId);
      setClan(data);

      if (user) {
        const membership = data.members.find(
          (m: ClanMember) => m.userId === user.id
        );
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

  // 가입하기 (모집 중인 클랜)
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

  // 가입 요청 (비모집 클랜)
  const handleRequestJoin = async () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    try {
      await clanApi.requestToJoin(clanId);
      addToast("가입 요청을 보냈습니다.", "success");
    } catch (err: any) {
      addToast(err.message || "가입 요청에 실패했습니다.", "error");
    }
  };

  // 탈퇴
  const handleLeaveClan = async () => {
    try {
      await clanApi.leaveClan(clanId);
      addToast("클랜을 탈퇴했습니다.", "info");
      router.push("/clans");
    } catch (err: any) {
      addToast(err.message || "클랜 탈퇴에 실패했습니다.", "error");
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
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => router.push("/clans")}
        >
          클랜 목록으로
        </Button>
      </div>
    );
  }

  const isOwner = user?.id === clan.ownerId;
  const isOfficer = myRole === "OFFICER";
  const canManage =
    isOwner ||
    (isOfficer &&
      (clan.officerCanManageSettings ||
        clan.officerCanManageMembers ||
        clan.officerCanManageAnnouncements ||
        clan.officerCanManageInvitations));
  const canPost =
    isMember &&
    (isOwner || (isOfficer && clan.officerCanManageAnnouncements));
  const canManageSettings =
    isOwner || (isOfficer && clan.officerCanManageSettings);

  // 멤버를 역할 순서로 정렬 (OWNER → OFFICER → MEMBER)
  const sortedMembers = clan.members.slice().sort((a, b) => {
    const roleOrder = { OWNER: 0, OFFICER: 1, MEMBER: 2 };
    return roleOrder[a.role] - roleOrder[b.role];
  });

  return (
    <>
      <div className="flex-grow p-4 md:p-8 animate-fade-in">
        <div className="container mx-auto max-w-4xl">
          {/* ── 클랜 헤더 카드 (배너 + 엠블럼 + 대표색) ── */}
          <Card className="mb-6 overflow-hidden">
            {/* 배너: 이미지 또는 대표색 그라디언트 */}
            <div
              className="relative h-32 w-full bg-bg-tertiary md:h-40"
              style={
                clan.banner
                  ? undefined
                  : {
                      background: `linear-gradient(135deg, ${
                        clan.accentColor || DEFAULT_CLAN_ACCENT
                      }44, ${clan.accentColor || DEFAULT_CLAN_ACCENT}0d)`,
                    }
              }
            >
              {clan.banner && (
                <Image
                  src={clan.banner}
                  alt={`${clan.name} 배너`}
                  fill
                  className="pointer-events-none object-cover"
                  unoptimized
                />
              )}
              {/* 하단 가독성 그라디언트 */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-secondary to-transparent" />
            </div>

            <CardContent className="relative z-10 p-6 pt-0">
              <div className="-mt-12 flex flex-col gap-6 md:flex-row md:items-end">
                {/* 엠블럼 */}
                <ClanEmblem
                  tag={clan.tag}
                  logo={clan.logo}
                  accentColor={clan.accentColor}
                  size={96}
                  rounded="rounded-2xl"
                  className="ring-4 ring-bg-secondary"
                />

                {/* 클랜 정보 */}
                <div className="flex-grow md:pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ClanTag
                      tag={clan.tag}
                      accentColor={clan.accentColor}
                      size="md"
                    />
                    <h1 className="text-2xl font-bold text-text-primary">
                      {clan.name}
                    </h1>
                    {clan.isRecruiting && (
                      <Badge variant="success">모집 중</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-text-secondary">
                    {clan.description || "클랜 소개가 없습니다."}
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-sm text-text-tertiary">
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

                {/* 액션 버튼 영역 */}
                <div className="relative z-20 flex w-full flex-col gap-2 md:w-auto md:pb-1">
                  {isMember ? (
                    <>
                      {canManage && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            router.push(`/clans/${clanId}/settings`)
                          }
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          설정
                        </Button>
                      )}
                      {!isOwner && (
                        <Button
                          variant="ghost"
                          onClick={() => setShowLeaveConfirm(true)}
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          탈퇴
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {/* 모집 중이고 자리가 있으면 바로 가입, 아니면 가입 요청 */}
                      {clan.isRecruiting &&
                      clan.members.length < clan.maxMembers ? (
                        <Button onClick={handleJoinClan}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          가입하기
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={handleRequestJoin}
                          disabled={
                            !clan.isRecruiting &&
                            clan.members.length >= clan.maxMembers
                          }
                          title={
                            !clan.isRecruiting
                              ? "현재 모집 중이 아닙니다"
                              : undefined
                          }
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          가입 요청
                        </Button>
                      )}
                      {/* 초대 코드로 가입 버튼 (비회원도 가능) */}
                      {isAuthenticated && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowJoinByCodeModal(true)}
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          초대 코드로 가입
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 탭 구조 ── */}
          <Tabs defaultValue="info">
            <TabsList className="mb-6 w-full">
              <TabsTrigger value="info" className="flex items-center gap-1.5">
                <Info className="h-4 w-4" />
                정보
              </TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                멤버 ({clan.members.length})
              </TabsTrigger>
              {/* 채팅/통계 탭은 멤버에게만 활성화 */}
              <TabsTrigger
                value="chat"
                disabled={!isMember}
                className="flex items-center gap-1.5"
              >
                <MessageCircle className="h-4 w-4" />
                채팅
              </TabsTrigger>
              <TabsTrigger
                value="stats"
                disabled={!isMember}
                className="flex items-center gap-1.5"
              >
                <BarChart2 className="h-4 w-4" />
                통계
              </TabsTrigger>
            </TabsList>

            {/* ── 정보 탭 ── */}
            <TabsContent value="info" className="space-y-4">
              {/* 기본 클랜 정보 카드 */}
              <Card>
                <CardHeader>
                  <CardTitle>클랜 정보</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-text-tertiary mb-0.5">클랜 태그</p>
                      <p className="text-text-primary font-medium">[{clan.tag}]</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary mb-0.5">설립일</p>
                      <p className="text-text-primary font-medium">
                        {new Date(clan.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-tertiary mb-0.5">클랜장</p>
                      <p className="text-text-primary font-medium">
                        {clan.owner.username}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-tertiary mb-0.5">모집 상태</p>
                      <p
                        className={
                          clan.isRecruiting
                            ? "text-accent-success font-medium"
                            : "text-text-tertiary font-medium"
                        }
                      >
                        {clan.isRecruiting ? "모집 중" : "모집 안 함"}
                      </p>
                    </div>
                    {clan.minTier && (
                      <div>
                        <p className="text-text-tertiary mb-0.5">최소 티어</p>
                        <p className="text-text-primary font-medium">
                          {clan.minTier}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 모집 공고 — 모집 포지션·최소 티어, OWNER/OFFICER 인라인 편집 */}
              <RecruitmentSection
                clanId={clanId}
                isRecruiting={clan.isRecruiting}
                minTier={clan.minTier}
                recruitRoles={clan.recruitRoles ?? []}
                canManageSettings={canManageSettings}
                onUpdated={fetchClan}
              />

              {/* 공지사항 — 멤버에게만 표시 */}
              {isMember && (
                <AnnouncementSection clanId={clanId} canPost={canPost} />
              )}
            </TabsContent>

            {/* ── 멤버 탭 ── */}
            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    멤버 목록
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-bg-tertiary">
                    {sortedMembers.map((member, index) => {
                      // presence-store에서 온라인 상태 조회 (친구 관계인 경우에만 반환됨)
                      const presenceStatus = getFriendStatus(member.userId);
                      const onlineStatus =
                        presenceStatus?.status ?? "OFFLINE";

                      // OWNER: 골드 ring, OFFICER: 블루 ring
                      const ringClass =
                        member.role === "OWNER"
                          ? "ring-2 ring-accent-gold"
                          : member.role === "OFFICER"
                          ? "ring-2 ring-accent-primary"
                          : "";

                      // 역할 그룹 헤더 (운영진 / 멤버) — 카테고리 전환 시 노출
                      const category =
                        member.role === "MEMBER" ? "member" : "leader";
                      const prevCategory =
                        index === 0
                          ? null
                          : sortedMembers[index - 1].role === "MEMBER"
                          ? "member"
                          : "leader";
                      const showHeader = category !== prevCategory;
                      const groupCount =
                        category === "leader"
                          ? sortedMembers.filter((m) => m.role !== "MEMBER")
                              .length
                          : sortedMembers.filter((m) => m.role === "MEMBER")
                              .length;

                      const riot = member.user.riotAccounts?.[0];

                      return (
                        <div key={member.id}>
                          {showHeader && (
                            <div className="flex items-center gap-2 bg-bg-tertiary/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
                              {category === "leader" ? "운영진" : "멤버"}
                              <span className="text-text-muted">
                                {groupCount}
                              </span>
                            </div>
                          )}
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index, 12) * 0.02 }}
                            className="flex items-center justify-between gap-3 p-4 hover:bg-bg-tertiary/50 transition-colors"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {/* 아바타 + 온라인 상태 인디케이터 */}
                              <div className="relative flex-shrink-0">
                                <div
                                  className={`w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden ${ringClass}`}
                                >
                                  {member.user.avatar ? (
                                    <Image
                                      src={member.user.avatar}
                                      alt={member.user.username}
                                      width={40}
                                      height={40}
                                      className="object-cover"
                                      unoptimized
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Users className="h-5 w-5 text-text-tertiary" />
                                    </div>
                                  )}
                                </div>
                                {/* 온라인 상태 인디케이터 (친구인 경우) */}
                                {presenceStatus && (
                                  <span className="absolute bottom-0 right-0">
                                    <StatusIndicator
                                      status={onlineStatus}
                                      size="sm"
                                    />
                                  </span>
                                )}
                              </div>

                              {/* 유저명 + 역할 + 라이엇 정보 */}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {riot?.mainRole && (
                                    <PositionIcon
                                      position={riot.mainRole}
                                      className="!h-4 !w-4 flex-shrink-0"
                                    />
                                  )}
                                  <p className="truncate font-medium text-text-primary">
                                    {member.user.username}
                                  </p>
                                  {getRoleBadge(member.role)}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-tertiary">
                                  {riot && (
                                    <span className="truncate">
                                      {riot.gameName}#{riot.tagLine}
                                    </span>
                                  )}
                                  {riot?.tier && (
                                    <TierBadge tier={riot.tier} size="sm" />
                                  )}
                                  <span className="text-text-muted">
                                    {formatJoinedDate(member.joinedAt)} 가입
                                  </span>
                                </div>
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-shrink-0"
                              onClick={() =>
                                router.push(`/users/${member.user.id}`)
                              }
                            >
                              프로필
                            </Button>
                          </motion.div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── 채팅 탭 (멤버 전용) ── */}
            <TabsContent value="chat">
              {isMember && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageCircle className="h-5 w-5" />
                      클랜 채팅
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 h-[480px]">
                    <ClanChat clanId={clanId} myRole={myRole} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── 통계 탭 (멤버 전용) ── */}
            <TabsContent value="stats">
              {isMember && <ClanStats clanId={clanId} />}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* 탈퇴 확인 모달 */}
      <ConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeaveClan}
        title="클랜 탈퇴"
        message={`정말로 "${clan?.name}" 클랜을 탈퇴하시겠습니까?`}
        confirmText="탈퇴"
        variant="danger"
      />

      {/* 초대 코드로 가입 모달 */}
      <JoinByCodeModal
        isOpen={showJoinByCodeModal}
        onClose={() => setShowJoinByCodeModal(false)}
        onSuccess={fetchClan}
      />
    </>
  );
}
