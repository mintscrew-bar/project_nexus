// TODO(Task 17): 멤버 관리 UX - Dropdown 교체 (MoreHorizontal), 멤버 검색 Input, 벌크 추방 체크박스
// TODO(Task 18): 초대 & 가입 요청 Card 섹션 (초대 코드 생성/복사, 유저 직접 초대, 가입 요청 목록)
// TODO(Task 19): 활동 로그 Card 섹션 (한글 변환, 색상 코딩, 커서 페이지네이션 "더 보기")
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
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/Modal";
import {
  ArrowLeft,
  Shield,
  Users,
  Crown,
  Trash2,
  UserMinus,
  ChevronUp,
  ChevronDown,
  RefreshCw,
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

export default function ClanSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const clanId = params.id as string;
  const { user, isAuthenticated } = useAuthStore();

  const [clan, setClan] = useState<Clan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [myRole, setMyRole] = useState<"OWNER" | "OFFICER" | "MEMBER" | null>(null);

  // 정보 수정 폼 상태
  const [description, setDescription] = useState("");
  const [discord, setDiscord] = useState("");
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 액션 로딩 상태 (멤버 ID별)
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 확인 모달
  const [kickTarget, setKickTarget] = useState<ClanMember | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<{ member: ClanMember; newRole: "OFFICER" | "MEMBER" } | null>(null);
  const [transferTarget, setTransferTarget] = useState<ClanMember | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { addToast } = useToast();

  const fetchClan = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await clanApi.getClan(clanId);
      setClan(data);

      if (user) {
        const membership = data.members.find((m: ClanMember) => m.userId === user.id);
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

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    fetchClan();
  }, [isAuthenticated, fetchClan, router]);

  // 클랜 정보 수정
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

  // 멤버 추방
  const handleKickMember = async () => {
    if (!kickTarget) return;
    setActionLoading(kickTarget.userId);
    try {
      await clanApi.kickMember(clanId, kickTarget.userId);
      addToast(`${kickTarget.user.username}을(를) 추방했습니다.`, "success");
      setKickTarget(null);
      fetchClan();
    } catch (err: any) {
      addToast(err.response?.data?.message || "추방에 실패했습니다.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 역할 변경 (승격/강등)
  const handleChangeRole = async () => {
    if (!promoteTarget) return;
    setActionLoading(promoteTarget.member.userId);
    try {
      await clanApi.updateMemberRole(clanId, promoteTarget.member.userId, promoteTarget.newRole);
      const action = promoteTarget.newRole === "OFFICER" ? "임원으로 승격" : "일반 멤버로 강등";
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
      addToast(`${transferTarget.user.username}에게 클랜 소유권을 이전했습니다.`, "success");
      setTransferTarget(null);
      router.push(`/clans/${clanId}`);
    } catch (err: any) {
      addToast(err.response?.data?.message || "소유권 이전에 실패했습니다.", "error");
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
      addToast(err.response?.data?.message || "클랜 해체에 실패했습니다.", "error");
    }
  };

  const isOwner = myRole === "OWNER";

  // 멤버 역할 순서 정렬
  const sortedMembers = clan?.members.slice().sort((a, b) => {
    const order = { OWNER: 0, OFFICER: 1, MEMBER: 2 };
    return order[a.role] - order[b.role];
  }) ?? [];

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
                  <p className="text-xs text-text-tertiary mt-1">{description.length}/500</p>
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

          {/* ── 멤버 관리 ── */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                멤버 관리 ({clan.members.length}/{clan.maxMembers})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-bg-tertiary">
                {sortedMembers.map((member) => {
                  const isMe = member.userId === user?.id;
                  const isMemberOwner = member.role === "OWNER";
                  const isMemberOfficer = member.role === "OFFICER";
                  // 내가 오너인 경우 임원/멤버 모두 관리 가능, 임원인 경우 일반 멤버만 관리
                  const canKick = !isMe && !isMemberOwner && (isOwner || (myRole === "OFFICER" && !isMemberOfficer));
                  const canPromote = isOwner && !isMe && !isMemberOwner && !isMemberOfficer;
                  const canDemote = isOwner && !isMe && isMemberOfficer;
                  const canTransfer = isOwner && !isMe && !isMemberOwner;

                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-bg-tertiary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
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
                                <span className="text-text-tertiary text-xs ml-1">(나)</span>
                              )}
                            </span>
                            {isMemberOwner && (
                              <Badge variant="gold" size="sm" className="flex items-center gap-1">
                                <Crown className="h-3 w-3" />
                                마스터
                              </Badge>
                            )}
                            {isMemberOfficer && (
                              <Badge variant="primary" size="sm">임원</Badge>
                            )}
                          </div>
                          {member.user.riotAccounts?.[0] && (
                            <p className="text-xs text-text-tertiary">
                              {member.user.riotAccounts[0].gameName}#{member.user.riotAccounts[0].tagLine}
                              {member.user.riotAccounts[0].tier && ` · ${member.user.riotAccounts[0].tier}`}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 관리 버튼 */}
                      {!isMe && !isMemberOwner && (
                        <div className="flex items-center gap-1">
                          {canPromote && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="임원으로 승격"
                              isLoading={actionLoading === member.userId}
                              onClick={() => setPromoteTarget({ member, newRole: "OFFICER" })}
                            >
                              <ChevronUp className="h-4 w-4 text-accent-primary" />
                            </Button>
                          )}
                          {canDemote && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="일반 멤버로 강등"
                              isLoading={actionLoading === member.userId}
                              onClick={() => setPromoteTarget({ member, newRole: "MEMBER" })}
                            >
                              <ChevronDown className="h-4 w-4 text-text-secondary" />
                            </Button>
                          )}
                          {canTransfer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="소유권 이전"
                              isLoading={actionLoading === member.userId}
                              onClick={() => setTransferTarget(member)}
                            >
                              <RefreshCw className="h-4 w-4 text-accent-gold" />
                            </Button>
                          )}
                          {canKick && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="추방"
                              isLoading={actionLoading === member.userId}
                              onClick={() => setKickTarget(member)}
                            >
                              <UserMinus className="h-4 w-4 text-accent-danger" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                      클랜을 영구적으로 해체합니다. 모든 멤버가 클랜에서 제거됩니다.
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

      {/* 추방 확인 모달 */}
      <ConfirmModal
        isOpen={!!kickTarget}
        onClose={() => setKickTarget(null)}
        onConfirm={handleKickMember}
        title="멤버 추방"
        message={`${kickTarget?.user.username}을(를) 클랜에서 추방하시겠습니까?`}
        confirmText="추방"
        variant="danger"
      />

      {/* 역할 변경 확인 모달 */}
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

      {/* 소유권 이전 확인 모달 */}
      <ConfirmModal
        isOpen={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        onConfirm={handleTransferOwnership}
        title="소유권 이전"
        message={`${transferTarget?.user.username}에게 클랜 소유권을 이전하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="이전"
        variant="danger"
      />

      {/* 클랜 해체 확인 모달 */}
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
