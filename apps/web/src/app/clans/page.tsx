"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { clanApi } from "@/lib/api-client";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Card,
  CardContent,
  Button,
  Input,
  EmptyState,
  Badge,
  Skeleton,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import {
  Users,
  Search,
  Shield,
  UserCheck,
  ChevronDown,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PositionIcon,
  POSITION_LABELS,
} from "@/app/tournaments/[id]/lobby/_components/icons";
import { ClanEmblem, ClanTag } from "@/components/domain/ClanEmblem";

interface Clan {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  accentColor: string | null;
  recruitRoles: string[];
  lastActiveAt: string | null;
  isRecruiting: boolean;
  maxMembers: number;
  minTier: string | null;
  discord: string | null;
  owner: {
    id: string;
    username: string;
    avatar: string | null;
  };
  _count: {
    members: number;
  };
}

// 정렬 옵션
type SortOption = "latest" | "members" | "active";
const SORT_LABELS: Record<SortOption, string> = {
  latest: "최신순",
  members: "멤버 수순",
  active: "활동순",
};

// 최소 티어 필터 옵션
const TIER_FILTER_OPTIONS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];

// 모집 포지션 필터 옵션
const RECRUIT_ROLE_OPTIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

// 활동성 상대 시간 (카드 표시용)
function formatActiveAgo(value: string | null): string | null {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return "방금 활동";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 활동`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전 활동`;
  return null;
}

// ─────────────────────────────────────────────────────────────
// 클랜 카드 스켈레톤
// ─────────────────────────────────────────────────────────────
function ClanCardSkeleton() {
  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-4">
        <Skeleton className="w-14 h-14 rounded-lg flex-shrink-0" />
        <div className="flex-grow space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-8 w-full rounded-lg" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 초대 코드로 가입 모달
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
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsLoading(true);
    try {
      const result = await clanApi.joinByCode(code.trim());
      addToast("초대 코드로 클랜에 가입되었습니다!", "success");
      setCode("");
      onSuccess();
      onClose();
      // 가입된 클랜 상세 페이지로 이동 (응답에 clanId 포함 시)
      if (result?.clanId) {
        router.push(`/clans/${result.clanId}`);
      }
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
        <p className="text-sm text-text-secondary">
          클랜 관리자에게 받은 초대 코드를 입력하면 바로 가입됩니다.
        </p>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            초대 코드
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="초대 코드를 입력하세요"
            autoFocus
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
export default function ClansPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [clans, setClans] = useState<Clan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecruitingOnly, setShowRecruitingOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("latest");
  const [minTierFilter, setMinTierFilter] = useState("");
  const [recruitRoleFilter, setRecruitRoleFilter] = useState<string[]>([]);
  // 가입/요청 중인 클랜 ID (버튼 로딩 상태 관리)
  const [joiningClanId, setJoiningClanId] = useState<string | null>(null);
  // 초대 코드로 가입 모달 표시 여부
  const [showJoinByCodeModal, setShowJoinByCodeModal] = useState(false);
  // 내 클랜 가입 여부 — 가입돼 있으면 만들기 버튼 숨김
  const [hasMyClan, setHasMyClan] = useState<boolean | null>(null);
  const { addToast } = useToast();

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const fetchClans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clanApi.getClans({
        search: debouncedSearchQuery || undefined,
        isRecruiting: showRecruitingOnly || undefined,
        minTier: minTierFilter || undefined,
        recruitRoles: recruitRoleFilter.length
          ? recruitRoleFilter.join(",")
          : undefined,
        sort: sortOption,
      });
      setClans(data);
    } catch (err: any) {
      setError(err.message || "클랜 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [
    debouncedSearchQuery,
    showRecruitingOnly,
    minTierFilter,
    recruitRoleFilter,
    sortOption,
  ]);

  // 모집 포지션 토글
  const toggleRecruitRole = (role: string) => {
    setRecruitRoleFilter((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  useEffect(() => {
    fetchClans();
  }, [fetchClans]);

  // 내 클랜 가입 여부 조회 (만들기 버튼 노출 조건)
  useEffect(() => {
    if (!isAuthenticated) {
      setHasMyClan(false);
      return;
    }
    clanApi
      .getMyClan()
      .then((c) => setHasMyClan(!!c))
      .catch(() => setHasMyClan(false));
  }, [isAuthenticated]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchClans();
  };

  // 가입하기 (즉시 가입 가능 클랜)
  const handleJoinClan = async (clanId: string) => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    setJoiningClanId(clanId);
    try {
      await clanApi.joinClan(clanId);
      addToast("클랜에 가입되었습니다.", "success");
      fetchClans();
    } catch (err: any) {
      addToast(
        err.response?.data?.message || err.message || "클랜 가입에 실패했습니다.",
        "error"
      );
    } finally {
      setJoiningClanId(null);
    }
  };

  // 가입 요청 (비모집 클랜)
  const handleRequestJoin = async (clanId: string) => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    setJoiningClanId(clanId);
    try {
      await clanApi.requestToJoin(clanId);
      addToast("가입 요청을 보냈습니다.", "success");
    } catch (err: any) {
      addToast(
        err.response?.data?.message || err.message || "가입 요청에 실패했습니다.",
        "error"
      );
    } finally {
      setJoiningClanId(null);
    }
  };

  const getTierBadgeColor = (tier: string | null) => {
    if (!tier) return "default";
    const t = tier.toUpperCase();
    if (t.includes("CHALLENGER") || t.includes("GRANDMASTER")) return "gold";
    if (t.includes("MASTER") || t.includes("DIAMOND")) return "primary";
    if (t.includes("PLATINUM") || t.includes("EMERALD")) return "success";
    return "default";
  };

  const sortItems: DropdownItem[] = (
    Object.keys(SORT_LABELS) as SortOption[]
  ).map((key) => ({
    key,
    label: SORT_LABELS[key],
    onClick: () => setSortOption(key),
  }));

  // 최소 티어 필터 드롭다운 ("제한 없음" + 티어 목록)
  const tierItems: DropdownItem[] = [
    { key: "all", label: "전체 티어", onClick: () => setMinTierFilter("") },
    ...TIER_FILTER_OPTIONS.map((tier) => ({
      key: tier,
      label: `${tier}+`,
      onClick: () => setMinTierFilter(tier),
    })),
  ];

  return (
    <>
      <div className="flex-grow p-4 md:p-6 animate-fade-in">
        <div className="container mx-auto max-w-5xl">
          <h1 className="sr-only">클랜 브라우저</h1>
          {/* 검색 & 필터 */}
          <div className="flex flex-col gap-3 mb-6">
            <form onSubmit={handleSearch} className="flex-grow flex gap-2">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <Input
                  type="text"
                  placeholder="클랜 이름 또는 태그로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" variant="secondary">
                검색
              </Button>
            </form>

            {/* 모바일: 2열 균등 그리드 / 데스크톱: 인라인 */}
            <div className="grid grid-cols-2 sm:flex sm:flex-row sm:flex-wrap gap-2">
              {/* 정렬 드롭다운 */}
              <Dropdown
                className="w-full sm:w-auto"
                trigger={
                  <Button variant="secondary" className="gap-1 w-full sm:w-auto justify-between sm:justify-center">
                    {SORT_LABELS[sortOption]}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                }
                items={sortItems}
                align="right"
              />

              {/* 최소 티어 필터 드롭다운 */}
              <Dropdown
                className="w-full sm:w-auto"
                trigger={
                  <Button
                    variant={minTierFilter ? "primary" : "secondary"}
                    className="gap-1 w-full sm:w-auto justify-between sm:justify-center"
                  >
                    {minTierFilter ? `${minTierFilter}+` : "티어"}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                }
                items={tierItems}
                align="right"
              />

              <Button
                variant={showRecruitingOnly ? "primary" : "secondary"}
                onClick={() => setShowRecruitingOnly(!showRecruitingOnly)}
                className="w-full sm:w-auto"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                모집 중만
              </Button>

              {/* 초대 코드로 가입 버튼 (로그인 사용자에게만 표시) */}
              {isAuthenticated && (
                <Button
                  variant="secondary"
                  onClick={() => setShowJoinByCodeModal(true)}
                  className="w-full sm:w-auto"
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  초대 코드
                </Button>
              )}

              {/* 클랜 만들기 — 가입한 클랜 없을 때만 노출 */}
              {isAuthenticated && hasMyClan === false && (
                <Button
                  variant="primary"
                  onClick={() => router.push("/clans/create")}
                  className="w-full sm:w-auto"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  클랜 만들기
                </Button>
              )}
            </div>
          </div>

          {/* 모집 포지션 필터 토글 */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-text-tertiary">
              모집 포지션
            </span>
            {RECRUIT_ROLE_OPTIONS.map((role) => {
              const active = recruitRoleFilter.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRecruitRole(role)}
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
            {recruitRoleFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setRecruitRoleFilter([])}
                className="text-xs text-text-tertiary underline hover:text-text-secondary"
              >
                초기화
              </button>
            )}
          </div>

          {/* 에러 */}
          {error && (
            <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-4 mb-6">
              <p className="text-accent-danger">{error}</p>
            </div>
          )}

          {/* 스켈레톤 로딩 */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <ClanCardSkeleton key={i} />
              ))}
            </div>
          ) : clans.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="클랜이 없습니다"
              description={
                searchQuery
                  ? "검색 조건에 맞는 클랜이 없습니다."
                  : isAuthenticated
                  ? "첫 번째 클랜을 만들어보세요!"
                  : "로그인하면 클랜을 만들거나 가입할 수 있어요."
              }
              action={
                searchQuery
                  ? { label: "검색 초기화", onClick: () => setSearchQuery("") }
                  : isAuthenticated
                  ? { label: "클랜 만들기", onClick: () => router.push("/clans/create") }
                  : { label: "로그인하기", onClick: () => router.push("/auth/login") }
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 stagger-children">
              {clans.map((clan) => {
                const memberCount = clan._count.members;
                const isFull = memberCount >= clan.maxMembers;
                const fillPercent = Math.min(
                  (memberCount / clan.maxMembers) * 100,
                  100
                );

                const activeAgo = formatActiveAgo(clan.lastActiveAt);

                return (
                  <Card
                    key={clan.id}
                    hoverable
                    onClick={() => router.push(`/clans/${clan.id}`)}
                    className="cursor-pointer relative overflow-hidden hover:scale-[1.02] hover:shadow-lg transition-all duration-200"
                  >
                    {/* 정체성 띠: 배너 이미지 또는 대표색 그라디언트 */}
                    <div
                      className="relative h-24 w-full bg-bg-tertiary"
                      style={
                        clan.banner
                          ? undefined
                          : {
                              background: `linear-gradient(135deg, ${
                                clan.accentColor || "#667EEA"
                              }44, ${clan.accentColor || "#667EEA"}0d)`,
                            }
                      }
                    >
                      {clan.banner && (
                        <Image
                          src={clan.banner}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      )}
                      {/* 모집 상태 리본 배지 */}
                      <div
                        className={cn(
                          "absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full",
                          clan.isRecruiting && !isFull
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                        )}
                      >
                        {clan.isRecruiting && !isFull ? "모집 중" : "정원 마감"}
                      </div>
                    </div>

                    <CardContent className="p-4">
                      <div className="-mt-9 flex items-start gap-3">
                        <ClanEmblem
                          tag={clan.tag}
                          logo={clan.logo}
                          accentColor={clan.accentColor}
                          size={56}
                          rounded="rounded-xl"
                          className="ring-2 ring-bg-secondary"
                        />
                        <div className="min-w-0 flex-grow pt-9">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ClanTag tag={clan.tag} accentColor={clan.accentColor} />
                            <p className="font-semibold text-text-primary truncate">
                              {clan.name}
                            </p>
                          </div>
                          <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                            {clan.description || "클랜 소개가 없습니다."}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-text-tertiary">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {memberCount}/{clan.maxMembers}
                            </span>
                            {clan.minTier && (
                              <Badge
                                variant={
                                  getTierBadgeColor(clan.minTier) as any
                                }
                                size="sm"
                              >
                                {clan.minTier}+
                              </Badge>
                            )}
                            {activeAgo && (
                              <span className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-accent-success" />
                                {activeAgo}
                              </span>
                            )}
                          </div>
                          {/* 모집 포지션 */}
                          {clan.isRecruiting && clan.recruitRoles?.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {clan.recruitRoles.map((role) => (
                                <span
                                  key={role}
                                  title={POSITION_LABELS[role] || role}
                                  className="inline-flex items-center gap-1 rounded-md bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
                                >
                                  <PositionIcon
                                    position={role}
                                    className="!h-3 !w-3"
                                  />
                                  {POSITION_LABELS[role] || role}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 멤버 수 프로그레스 바 */}
                      <div className="mt-3">
                        <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              isFull ? "bg-red-500" : "bg-accent-primary"
                            )}
                            style={{ width: `${fillPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* 가입 버튼 */}
                      {isAuthenticated && (
                        <div className="mt-3">
                          {clan.isRecruiting && !isFull ? (
                            <Button
                              variant="primary"
                              size="sm"
                              className="w-full"
                              isLoading={joiningClanId === clan.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJoinClan(clan.id);
                              }}
                            >
                              가입하기
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full"
                              isLoading={joiningClanId === clan.id}
                              // 비모집 상태(isRecruiting=false)면 disabled
                              disabled={!clan.isRecruiting}
                              title={
                                !clan.isRecruiting
                                  ? "현재 모집 중이 아닙니다"
                                  : isFull
                                  ? "정원이 가득 찼습니다"
                                  : undefined
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                if (clan.isRecruiting) {
                                  handleRequestJoin(clan.id);
                                }
                              }}
                            >
                              가입 요청
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 초대 코드로 가입 모달 */}
      <JoinByCodeModal
        isOpen={showJoinByCodeModal}
        onClose={() => setShowJoinByCodeModal(false)}
        onSuccess={fetchClans}
      />
    </>
  );
}
