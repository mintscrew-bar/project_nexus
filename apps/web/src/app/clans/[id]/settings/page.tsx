// Task 17: 멤버 관리 UX - Dropdown 교체, 멤버 검색, 벌크 추방
// Task 18: 초대 & 가입 요청 섹션 (초대 코드, 직접 초대, 가입 요청 목록)
// Task 19: 활동 로그 섹션 (한글 변환, 색상 코딩, 커서 페이지네이션)
"use client";

import { useState, useEffect, useCallback } from "react";
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
  Input,
  Label,
  Badge,
  LoadingSpinner,
} from "@/components/ui";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/Modal";
import {
  ArrowLeft,
  Shield,
  Users,
  Crown,
  Trash2,
  MoreHorizontal,
  Search,
  Copy,
  RefreshCw,
  UserPlus,
  Check,
  X,
  ChevronDown,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  members: ClanMember[];
}

interface JoinRequest {
  id: string;
  userId: string;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  createdAt: string;
}

interface ActivityLog {
  id: string;
  type: string;
  actorId: string | null;
  actorUsername: string | null;
  targetId: string | null;
  targetUsername: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// 헬퍼: 활동 로그 타입 → 한글 변환
// ─────────────────────────────────────────────────────────────
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  MEMBER_JOIN: "가입",
  MEMBER_LEAVE: "탈퇴",
  MEMBER_KICKED: "추방",
  ROLE_CHANGED: "역할변경",
  OWNERSHIP_TRANSFERRED: "오너이전",
  CLAN_CREATED: "클랜생성",
  CLAN_UPDATED: "클랜수정",
  ANNOUNCEMENT_CREATED: "공지작성",
  ANNOUNCEMENT_DELETED: "공지삭제",
};

// 활동 타입별 색상 클래스
function getActivityColor(type: string): string {
  if (type === "MEMBER_JOIN") return "text-accent-success bg-accent-success/10";
  if (type === "MEMBER_LEAVE" || type === "MEMBER_KICKED")
    return "text-accent-danger bg-accent-danger/10";
  if (type === "ROLE_CHANGED" || type === "OWNERSHIP_TRANSFERRED")
    return "text-accent-gold bg-accent-gold/10";
  // 기타
  return "text-accent-primary bg-accent-primary/10";
}

// 활동 로그 설명 문자열 생성
function getActivityDescription(log: ActivityLog): string {
  const actor = log.actorUsername || "알 수 없음";
  const target = log.targetUsername;
  const label = ACTIVITY_TYPE_LABELS[log.type] || log.type;

  switch (log.type) {
    case "MEMBER_JOIN":
      return `${actor}님이 클랜에 가입했습니다.`;
    case "MEMBER_LEAVE":
      return `${actor}님이 클랜을 탈퇴했습니다.`;
    case "MEMBER_KICKED":
      return `${target || actor}님이 추방되었습니다.`;
    case "ROLE_CHANGED":
      return `${target || actor}님의 역할이 변경되었습니다.`;
    case "OWNERSHIP_TRANSFERRED":
      return `${target || actor}님에게 오너 권한이 이전되었습니다.`;
    default:
      return `${actor}님 — ${label}`;
  }
}

// ─────────────────────────────────────────────────────────────
// 메인 설정 페이지
// ─────────────────────────────────────────────────────────────
export default function ClanSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const clanId = params.id as string;
  const { user, isAuthenticated } = useAuthStore();

  const [clan, setClan] = useState<Clan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [myRole, setMyRole] = useState<"OWNER" | "OFFICER" | "MEMBER" | null>(null);

  // ── 정보 수정 폼 상태 ──
  const [description, setDescription] = useState("");
  const [discord, setDiscord] = useState("");
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── 멤버 관리 상태 ──
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── 초대 코드 상태 ──
  const [inviteCode, setInviteCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  // ── 가입 요청 상태 ──
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

  // ── 활동 로그 상태 ──
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);

  // ── 확인 모달 상태 ──
  const [kickTarget, setKickTarget] = useState<ClanMember | null>(null);
  const [bulkKickConfirm, setBulkKickConfirm] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<{
    member: ClanMember;
    newRole: "OFFICER" | "MEMBER";
  } | null>(null);
  const [transferTarget, setTransferTarget] = useState<ClanMember | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { addToast } = useToast();

  // ─────────────────────────────────────────────────────────────
  // 데이터 로딩
  // ─────────────────────────────────────────────────────────────
  const fetchClan = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await clanApi.getClan(clanId);
      setClan(data);

      if (user) {
        const membership = data.members.find(
          (m: ClanMember) => m.userId === user.id
        );
        const role = membership?.role || null;
        setMyRole(role);

        // 관리 권한이 없으면 클랜 페이지로 이동
        if (!role || role === "MEMBER") {
          router.push(`/clans/${clanId}`);
          return;
        }
      }

      // 폼 초기값 세팅
      setDescription(data.description || "");
      setDiscord(data.discord || "");
      setIsRecruiting(data.isRecruiting);
    } catch {
      addToast("클랜 정보를 불러오는데 실패했습니다.", "error");
      router.push(`/clans/${clanId}`);
    } finally {
      setIsLoading(false);
    }
  }, [clanId, user, router, addToast]);

  // 가입 요청 목록 로드
  const fetchJoinRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const data = await clanApi.getPendingJoinRequests(clanId);
      setJoinRequests(data);
    } catch {
      // 조용히 처리
    } finally {
      setIsLoadingRequests(false);
    }
  }, [clanId]);

  // 활동 로그 로드 (커서 페이지네이션)
  const fetchActivityLogs = useCallback(
    async (cursor?: string) => {
      setIsLoadingLogs(true);
      try {
        const result = await clanApi.getActivityLogs(clanId, cursor, 20);
        if (cursor) {
          // "더 보기" 로드 — 기존 로그 뒤에 추가
          setActivityLogs((prev) => [...prev, ...result.logs]);
        } else {
          // 최초 로드
          setActivityLogs(result.logs);
        }
        setLogCursor(result.nextCursor);
        setHasMoreLogs(!!result.nextCursor);
      } catch {
        // 조용히 처리
      } finally {
        setIsLoadingLogs(false);
      }
    },
    [clanId]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    fetchClan();
  }, [isAuthenticated, fetchClan, router]);

  useEffect(() => {
    if (myRole && myRole !== "MEMBER") {
      fetchJoinRequests();
      fetchActivityLogs();
    }
  }, [myRole, fetchJoinRequests, fetchActivityLogs]);

  // ─────────────────────────────────────────────────────────────
  // 클랜 정보 수정
  // ─────────────────────────────────────────────────────────────
  const handleUpdateClan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await clanApi.updateClan(clanId, {
        description: description.trim() || undefined,
        discord: discord.trim() || undefined,
        isRecruiting,
      });
      addToast("클랜 정보가 수정되었습니다.", "success");
      fetchClan();
    } catch (err: any) {
      addToast(err.response?.data?.message || "수정에 실패했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 멤버 관리 핸들러
  // ─────────────────────────────────────────────────────────────

  // 멤버 추방
  const handleKickMember = async () => {
    if (!kickTarget) return;
    setActionLoading(kickTarget.userId);
    try {
      await clanApi.kickMember(clanId, kickTarget.userId);
      addToast(`${kickTarget.user.username}을(를) 추방했습니다.`, "success");
      setKickTarget(null);
      setSelectedMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(kickTarget.userId);
        return next;
      });
      fetchClan();
    } catch (err: any) {
      addToast(err.response?.data?.message || "추방에 실패했습니다.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 벌크 추방
  const handleBulkKick = async () => {
    const ids = Array.from(selectedMemberIds);
    setBulkKickConfirm(false);
    try {
      await Promise.all(ids.map((userId) => clanApi.kickMember(clanId, userId)));
      addToast(`${ids.length}명을 추방했습니다.`, "success");
      setSelectedMemberIds(new Set());
      fetchClan();
    } catch (err: any) {
      addToast(err.response?.data?.message || "벌크 추방에 실패했습니다.", "error");
    }
  };

  // 역할 변경 (승격/강등)
  const handleChangeRole = async () => {
    if (!promoteTarget) return;
    setActionLoading(promoteTarget.member.userId);
    try {
      await clanApi.updateMemberRole(
        clanId,
        promoteTarget.member.userId,
        promoteTarget.newRole
      );
      const action =
        promoteTarget.newRole === "OFFICER" ? "임원으로 승격" : "일반 멤버로 강등";
      addToast(`${promoteTarget.member.user.username}을(를) ${action}했습니다.`, "success");
      setPromoteTarget(null);
      fetchClan();
    } catch (err: any) {
      addToast(err.response?.data?.message || "역할 변경에 실패했습니다.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 소유권 이전
  const handleTransferOwnership = async () => {
    if (!transferTarget) return;
    setActionLoading(transferTarget.userId);
    try {
      await clanApi.transferOwnership(clanId, transferTarget.userId);
      addToast(
        `${transferTarget.user.username}에게 클랜 소유권을 이전했습니다.`,
        "success"
      );
      setTransferTarget(null);
      router.push(`/clans/${clanId}`);
    } catch (err: any) {
      addToast(
        err.response?.data?.message || "소유권 이전에 실패했습니다.",
        "error"
      );
    } finally {
      setActionLoading(null);
    }
  };

  // 클랜 해체
  const handleDeleteClan = async () => {
    try {
      await clanApi.deleteClan(clanId);
      addToast("클랜이 해체되었습니다.", "info");
      router.push("/clans");
    } catch (err: any) {
      addToast(
        err.response?.data?.message || "클랜 해체에 실패했습니다.",
        "error"
      );
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 초대 코드 생성
  // ─────────────────────────────────────────────────────────────
  const handleGenerateInviteCode = async () => {
    setIsGeneratingCode(true);
    try {
      const result = await clanApi.generateInviteCode(clanId);
      setInviteCode(result);
      addToast("초대 코드가 생성되었습니다.", "success");
    } catch (err: any) {
      addToast(
        err.response?.data?.message || "초대 코드 생성에 실패했습니다.",
        "error"
      );
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode.code);
    addToast("초대 코드가 복사되었습니다.", "success");
  };

  // ─────────────────────────────────────────────────────────────
  // 유저 직접 초대
  // ─────────────────────────────────────────────────────────────
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUserId.trim()) return;
    setIsInviting(true);
    try {
      await clanApi.inviteUser(clanId, inviteUserId.trim());
      addToast("초대를 보냈습니다.", "success");
      setInviteUserId("");
      setInviteSearchQuery("");
    } catch (err: any) {
      addToast(
        err.response?.data?.message || "초대에 실패했습니다.",
        "error"
      );
    } finally {
      setIsInviting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 가입 요청 수락/거절
  // ─────────────────────────────────────────────────────────────
  const handleResolveRequest = async (requestId: string, accept: boolean) => {
    setResolvingRequestId(requestId);
    try {
      await clanApi.resolveJoinRequest(clanId, requestId, accept);
      addToast(accept ? "가입 요청을 수락했습니다." : "가입 요청을 거절했습니다.", "success");
      // 목록에서 제거
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (accept) fetchClan(); // 멤버 목록 갱신
    } catch (err: any) {
      addToast(
        err.response?.data?.message || "처리에 실패했습니다.",
        "error"
      );
    } finally {
      setResolvingRequestId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 파생 값 계산
  // ─────────────────────────────────────────────────────────────
  const isOwner = myRole === "OWNER";

  // 멤버 검색 필터 적용
  const filteredMembers = (clan?.members ?? [])
    .slice()
    .sort((a, b) => {
      const order = { OWNER: 0, OFFICER: 1, MEMBER: 2 };
      return order[a.role] - order[b.role];
    })
    .filter((m) =>
      memberSearch
        ? m.user.username.toLowerCase().includes(memberSearch.toLowerCase())
        : true
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!clan) return null;

  return (
    <>
      <div className="flex-grow p-4 md:p-8 animate-fade-in">
        <div className="container mx-auto max-w-3xl">
          {/* 뒤로가기 */}
          <Button
            variant="ghost"
            className="mb-4"
            onClick={() => router.push(`/clans/${clanId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            클랜 페이지로
          </Button>

          <h1 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-2">
            <Shield className="h-6 w-6 text-accent-primary" />
            [{clan.tag}] {clan.name} — 설정
          </h1>

          {/* ── 클랜 정보 수정 ── */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>클랜 정보 수정</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateClan} className="space-y-5">
                {/* 소개 */}
                <div>
                  <Label htmlFor="description">클랜 소개</Label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="클랜을 소개해주세요"
                    rows={4}
                    maxLength={500}
                    className="mt-1 w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    {description.length}/500
                  </p>
                </div>

                {/* 디스코드 링크 */}
                <div>
                  <Label htmlFor="discord">Discord 초대 링크 (선택)</Label>
                  <Input
                    id="discord"
                    value={discord}
                    onChange={(e) => setDiscord(e.target.value)}
                    placeholder="https://discord.gg/..."
                    className="mt-1"
                  />
                </div>

                {/* 모집 여부 */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label>클랜원 모집</Label>
                    <p className="text-xs text-text-tertiary">
                      활성화하면 다른 유저가 클랜에 가입 신청할 수 있습니다
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRecruiting(!isRecruiting)}
                    aria-label={isRecruiting ? "모집 중지" : "모집 시작"}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isRecruiting ? "bg-accent-primary" : "bg-bg-elevated"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isRecruiting ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" isLoading={isSubmitting}>
                    변경 사항 저장
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ── 멤버 관리 (Task 17) ── */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  멤버 관리 ({clan.members.length}/{clan.maxMembers})
                </CardTitle>
                {/* 벌크 추방 버튼 — 선택된 멤버가 있을 때만 활성화 */}
                {selectedMemberIds.size > 0 && isOwner && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setBulkKickConfirm(true)}
                  >
                    선택 추방 ({selectedMemberIds.size})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* 멤버 검색 인풋 */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <Input
                  type="text"
                  placeholder="멤버 이름으로 검색..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>

            {/* 멤버 목록 */}
            <CardContent className="p-0">
              <div className="divide-y divide-bg-tertiary">
                {filteredMembers.map((member) => {
                  const isMe = member.userId === user?.id;
                  const isMemberOwner = member.role === "OWNER";
                  const isMemberOfficer = member.role === "OFFICER";

                  // 추방 가능 여부: 내가 아니고, 대상이 오너가 아니고, (나=오너 or 나=임원이면서 대상이 일반멤버)
                  const canKick =
                    !isMe &&
                    !isMemberOwner &&
                    (isOwner ||
                      (myRole === "OFFICER" && !isMemberOfficer));
                  const canPromote =
                    isOwner && !isMe && !isMemberOwner && !isMemberOfficer;
                  const canDemote = isOwner && !isMe && isMemberOfficer;
                  const canTransfer = isOwner && !isMe && !isMemberOwner;

                  // 벌크 추방용 체크박스 대상 (추방 가능한 일반 멤버만)
                  const canSelect = canKick && !isMemberOfficer;

                  // MoreHorizontal 드롭다운 아이템 구성
                  const dropdownItems: DropdownItem[] = [
                    ...(canPromote
                      ? [
                          {
                            key: "promote",
                            label: "임원으로 승격",
                            icon: <Crown className="h-4 w-4 text-accent-gold" />,
                            onClick: () =>
                              setPromoteTarget({ member, newRole: "OFFICER" }),
                          },
                        ]
                      : []),
                    ...(canDemote
                      ? [
                          {
                            key: "demote",
                            label: "일반 멤버로 강등",
                            icon: <ChevronDown className="h-4 w-4" />,
                            onClick: () =>
                              setPromoteTarget({ member, newRole: "MEMBER" }),
                          },
                        ]
                      : []),
                    ...(canTransfer
                      ? [
                          {
                            key: "transfer",
                            label: "소유권 이전",
                            icon: <RefreshCw className="h-4 w-4 text-accent-gold" />,
                            onClick: () => setTransferTarget(member),
                          },
                        ]
                      : []),
                    ...(canKick
                      ? [
                          {
                            key: "kick",
                            label: "추방",
                            icon: <Trash2 className="h-4 w-4" />,
                            danger: true,
                            onClick: () => setKickTarget(member),
                          },
                        ]
                      : []),
                  ];

                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-bg-tertiary/50 transition-colors"
                    >
                      {/* 체크박스 (벌크 추방) + 아바타 + 이름 */}
                      <div className="flex items-center gap-3">
                        {/* 체크박스: 벌크 추방 대상 멤버에게만 표시 */}
                        {isOwner && canSelect && (
                          <input
                            type="checkbox"
                            checked={selectedMemberIds.has(member.userId)}
                            onChange={(e) => {
                              setSelectedMemberIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) {
                                  next.add(member.userId);
                                } else {
                                  next.delete(member.userId);
                                }
                                return next;
                              });
                            }}
                            className="w-4 h-4 rounded border-bg-elevated accent-accent-primary cursor-pointer"
                          />
                        )}
                        {/* 아바타 */}
                        <div className="relative w-9 h-9 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
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
                              <Users className="h-4 w-4 text-text-tertiary" />
                            </div>
                          )}
                        </div>

                        {/* 이름 + 역할 */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary text-sm">
                              {member.user.username}
                              {isMe && (
                                <span className="text-text-tertiary text-xs ml-1">
                                  (나)
                                </span>
                              )}
                            </span>
                            {isMemberOwner && (
                              <Badge
                                variant="gold"
                                size="sm"
                                className="flex items-center gap-1"
                              >
                                <Crown className="h-3 w-3" />
                                마스터
                              </Badge>
                            )}
                            {isMemberOfficer && (
                              <Badge
                                variant="primary"
                                size="sm"
                                className="flex items-center gap-1"
                              >
                                <Shield className="h-3 w-3" />
                                임원
                              </Badge>
                            )}
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

                      {/* MoreHorizontal 드롭다운 버튼 */}
                      {dropdownItems.length > 0 && (
                        <Dropdown
                          trigger={
                            <button
                              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                              aria-label="멤버 관리 메뉴"
                              disabled={actionLoading === member.userId}
                            >
                              {actionLoading === member.userId ? (
                                <LoadingSpinner size="sm" />
                              ) : (
                                <MoreHorizontal className="h-5 w-5" />
                              )}
                            </button>
                          }
                          items={dropdownItems}
                          align="right"
                        />
                      )}
                    </div>
                  );
                })}

                {filteredMembers.length === 0 && (
                  <p className="text-text-tertiary text-sm text-center py-6">
                    검색 결과가 없습니다.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── 초대 & 가입 요청 (Task 18) ── */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                초대 & 가입 요청
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 초대 코드 생성/복사 */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">
                  초대 코드
                </h3>
                {inviteCode ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-bg-tertiary rounded-lg text-text-primary font-mono text-sm border border-bg-elevated">
                      {inviteCode.code}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyCode}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      복사
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateInviteCode}
                      isLoading={isGeneratingCode}
                      title="새 코드 생성"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateInviteCode}
                    isLoading={isGeneratingCode}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    초대 코드 생성
                  </Button>
                )}
                {inviteCode && (
                  <p className="text-xs text-text-tertiary mt-1">
                    만료:{" "}
                    {new Date(inviteCode.expiresAt).toLocaleString("ko-KR")}
                  </p>
                )}
              </div>

              {/* 유저 직접 초대 (유저 ID 입력) */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">
                  유저 직접 초대
                </h3>
                <form onSubmit={handleInviteUser} className="flex gap-2">
                  <Input
                    placeholder="유저 ID를 입력하세요"
                    value={inviteUserId}
                    onChange={(e) => {
                      setInviteUserId(e.target.value);
                      setInviteSearchQuery(e.target.value);
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={isInviting}
                    disabled={!inviteUserId.trim()}
                  >
                    초대
                  </Button>
                </form>
                <p className="text-xs text-text-tertiary mt-1">
                  초대할 유저의 ID를 정확히 입력해주세요.
                </p>
              </div>

              {/* 가입 요청 목록 */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                  가입 요청
                  {joinRequests.length > 0 && (
                    <span className="bg-accent-primary text-white text-xs px-1.5 py-0.5 rounded-full">
                      {joinRequests.length}
                    </span>
                  )}
                </h3>

                {isLoadingRequests ? (
                  <div className="flex justify-center py-4">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : joinRequests.length === 0 ? (
                  <p className="text-text-tertiary text-sm py-2">
                    대기 중인 가입 요청이 없습니다.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {joinRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
                            {request.user.avatar ? (
                              <Image
                                src={request.user.avatar}
                                alt={request.user.username}
                                width={32}
                                height={32}
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Users className="h-4 w-4 text-text-tertiary" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              {request.user.username}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {new Date(request.createdAt).toLocaleDateString("ko-KR")}
                            </p>
                          </div>
                        </div>

                        {/* 수락/거절 버튼 */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleResolveRequest(request.id, true)}
                            disabled={resolvingRequestId === request.id}
                            className="p-1.5 rounded-lg bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors disabled:opacity-50"
                            aria-label="수락"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleResolveRequest(request.id, false)}
                            disabled={resolvingRequestId === request.id}
                            className="p-1.5 rounded-lg bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20 transition-colors disabled:opacity-50"
                            aria-label="거절"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── 활동 로그 (Task 19) ── */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                활동 로그
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingLogs && activityLogs.length === 0 ? (
                <div className="flex justify-center py-4">
                  <LoadingSpinner size="sm" />
                </div>
              ) : activityLogs.length === 0 ? (
                <p className="text-text-tertiary text-sm text-center py-4">
                  활동 내역이 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {activityLogs.map((log) => {
                    const colorClass = getActivityColor(log.type);
                    const label =
                      ACTIVITY_TYPE_LABELS[log.type] || log.type;
                    const description = getActivityDescription(log);

                    return (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg"
                      >
                        {/* 타입 배지 */}
                        <span
                          className={cn(
                            "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5",
                            colorClass
                          )}
                        >
                          {label}
                        </span>
                        {/* 설명 + 시각 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary">
                            {description}
                          </p>
                          <p className="text-xs text-text-tertiary mt-0.5">
                            {new Date(log.createdAt).toLocaleString("ko-KR")}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* 더 보기 버튼 (커서 페이지네이션) */}
                  {hasMoreLogs && (
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={isLoadingLogs}
                        onClick={() => fetchActivityLogs(logCursor ?? undefined)}
                      >
                        더 보기
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 위험 구역 (오너 전용) ── */}
          {isOwner && (
            <Card className="border-accent-danger/30">
              <CardHeader>
                <CardTitle className="text-accent-danger flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  위험 구역
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary">클랜 해체</p>
                    <p className="text-sm text-text-tertiary mt-1">
                      클랜을 영구적으로 해체합니다. 모든 멤버가 클랜에서
                      제거됩니다.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    클랜 해체
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── 확인 모달들 ── */}

      {/* 단일 멤버 추방 */}
      <ConfirmModal
        isOpen={!!kickTarget}
        onClose={() => setKickTarget(null)}
        onConfirm={handleKickMember}
        title="멤버 추방"
        message={`${kickTarget?.user.username}을(를) 클랜에서 추방하시겠습니까?`}
        confirmText="추방"
        variant="danger"
      />

      {/* 벌크 추방 */}
      <ConfirmModal
        isOpen={bulkKickConfirm}
        onClose={() => setBulkKickConfirm(false)}
        onConfirm={handleBulkKick}
        title="선택 추방"
        message={`선택한 ${selectedMemberIds.size}명의 멤버를 모두 추방하시겠습니까?`}
        confirmText="추방"
        variant="danger"
      />

      {/* 역할 변경 */}
      <ConfirmModal
        isOpen={!!promoteTarget}
        onClose={() => setPromoteTarget(null)}
        onConfirm={handleChangeRole}
        title={promoteTarget?.newRole === "OFFICER" ? "임원 승격" : "멤버 강등"}
        message={
          promoteTarget?.newRole === "OFFICER"
            ? `${promoteTarget?.member.user.username}을(를) 임원으로 승격하시겠습니까?`
            : `${promoteTarget?.member.user.username}을(를) 일반 멤버로 강등하시겠습니까?`
        }
        confirmText={promoteTarget?.newRole === "OFFICER" ? "승격" : "강등"}
        variant={promoteTarget?.newRole === "OFFICER" ? "default" : "danger"}
      />

      {/* 소유권 이전 */}
      <ConfirmModal
        isOpen={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        onConfirm={handleTransferOwnership}
        title="소유권 이전"
        message={`${transferTarget?.user.username}에게 클랜 소유권을 이전하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="이전"
        variant="danger"
      />

      {/* 클랜 해체 */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteClan}
        title="클랜 해체"
        message={`정말로 "${clan?.name}" 클랜을 해체하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="해체"
        variant="danger"
      />
    </>
  );
}
