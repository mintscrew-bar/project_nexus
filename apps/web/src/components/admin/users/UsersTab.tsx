"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  Badge,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import {
  Search,
  MessageSquare,
  Ban,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Bot,
} from "lucide-react";
import { BAN_REASONS, Pagination, Modal, type AddToast } from "../shared";

type UserRole = "USER" | "MODERATOR" | "ADMIN";
type UserPresence = "ONLINE" | "OFFLINE" | "AWAY";
type UserKindFilter = "users" | "bots" | "all";
type UserRoleFilter = "all" | UserRole;
type UserStatusFilter =
  | "all"
  | "normal"
  | "banned"
  | "restricted"
  | "reported"
  | "streamer"
  | "no-riot";
type UserPresenceFilter = "all" | "online" | "offline" | "away";
type StreamerProfileSummary = {
  platform: "CHZZK" | "SOOP" | "YOUTUBE";
  channelUrl: string;
  channelName: string | null;
  isActive: boolean;
};
interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  isBot?: boolean;
  role: UserRole;
  status: UserPresence;
  lastSeenAt: string | null;
  isBanned: boolean;
  banReason: string | null;
  banUntil: string | null;
  isRestricted: boolean;
  restrictedUntil: string | null;
  createdAt: string;
  authProviders: { provider: string }[];
  riotAccounts: {
    id: string;
    gameName: string;
    tagLine: string;
    puuid?: string;
    tier: string;
    rank: string;
    isPrimary: boolean;
  }[];
  streamerProfiles?: StreamerProfileSummary[];
  _count: { reportsReceived: number };
}

const ROLE_LABELS: Record<UserRole, string> = {
  USER: "일반",
  MODERATOR: "매니저",
  ADMIN: "관리자",
};
const ROLE_VARIANTS: Record<
  UserRole,
  "default" | "primary" | "secondary" | "danger" | "gold"
> = {
  USER: "default",
  MODERATOR: "secondary",
  ADMIN: "danger",
};
const USER_KIND_FILTERS: Array<{ value: UserKindFilter; label: string }> = [
  { value: "users", label: "일반 유저" },
  { value: "bots", label: "테스트 봇" },
  { value: "all", label: "전체" },
];
const USER_ROLE_FILTERS: Array<{ value: UserRoleFilter; label: string }> = [
  { value: "all", label: "전체 권한" },
  { value: "USER", label: "일반" },
  { value: "MODERATOR", label: "매니저" },
  { value: "ADMIN", label: "관리자" },
];
const USER_STATUS_FILTERS: Array<{ value: UserStatusFilter; label: string }> = [
  { value: "all", label: "전체 상태" },
  { value: "normal", label: "정상" },
  { value: "banned", label: "밴" },
  { value: "restricted", label: "제재 중" },
  { value: "reported", label: "신고 있음" },
  { value: "streamer", label: "스트리머" },
  { value: "no-riot", label: "라이엇 미연동" },
];
const USER_PRESENCE_FILTERS: Array<{
  value: UserPresenceFilter;
  label: string;
}> = [
  { value: "all", label: "전체 접속" },
  { value: "online", label: "온라인" },
  { value: "away", label: "자리비움" },
  { value: "offline", label: "오프라인" },
];
const PRESENCE_LABELS: Record<UserPresence, string> = {
  ONLINE: "온라인",
  OFFLINE: "오프라인",
  AWAY: "자리비움",
};
const PRESENCE_VARIANTS: Record<
  UserPresence,
  "default" | "primary" | "secondary" | "danger" | "gold"
> = {
  ONLINE: "primary",
  OFFLINE: "default",
  AWAY: "secondary",
};

// 등록된 라이엇 계정 표시 — 주 계정만 노출, 추가 계정은 드롭다운으로 펼침
function RiotAccountsCell({
  accounts,
}: {
  accounts: AdminUser["riotAccounts"];
}) {
  const [open, setOpen] = useState(false);

  if (!accounts || accounts.length === 0) {
    return <span className="text-xs text-text-muted">-</span>;
  }

  // 주 계정 우선, 없으면 첫 번째
  const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
  const others = accounts.filter((a) => a.id !== primary.id);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => others.length > 0 && setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-xs ${
          others.length > 0
            ? "hover:text-accent-primary cursor-pointer"
            : "cursor-default"
        } text-text-primary`}
      >
        <span className="font-medium">
          {primary.gameName}#{primary.tagLine}
        </span>
        {others.length > 0 && (
          <span className="flex items-center gap-0.5 text-text-muted">
            <span className="text-[10px]">+{others.length}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
        )}
      </button>
      {open && others.length > 0 && (
        <>
          {/* 바깥 클릭 시 닫힘 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-bg-tertiary bg-bg-secondary shadow-lg py-1">
            {others.map((acc) => (
              <div
                key={acc.id}
                className="px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary/50"
              >
                <span className="font-medium">
                  {acc.gameName}#{acc.tagLine}
                </span>
                <span className="ml-2 text-text-muted">
                  {acc.tier}
                  {acc.rank ? ` ${acc.rank}` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UserDetailContent({ user }: { user: AdminUser }) {
  const primaryRiot = user.riotAccounts.find((account) => account.isPrimary);
  const activeStreams = (user.streamerProfiles ?? []).filter(
    (profile) => profile.isActive,
  );
  const providers =
    user.authProviders.map((provider) => provider.provider).join(", ") || "-";

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">닉네임</p>
          <p className="mt-1 font-semibold text-text-primary">
            {user.username}
          </p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">권한</p>
          <div className="mt-1">
            <Badge variant={ROLE_VARIANTS[user.role]}>
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">이메일</p>
          <p className="mt-1 break-all text-text-primary">
            {user.email ?? "-"}
          </p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">가입일</p>
          <p className="mt-1 text-text-primary">
            {new Date(user.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">로그인 제공자</p>
          <p className="mt-1 text-text-primary">{providers}</p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">접속 상태</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={PRESENCE_VARIANTS[user.status]}>
              {PRESENCE_LABELS[user.status]}
            </Badge>
            {user.lastSeenAt && (
              <span className="text-xs text-text-muted">
                최근 {new Date(user.lastSeenAt).toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">신고 받은 수</p>
          <p className="mt-1 font-semibold text-text-primary">
            {user._count.reportsReceived.toLocaleString()}건
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-bg-tertiary p-3">
        <p className="mb-2 text-xs font-semibold text-text-muted">상태</p>
        <div className="flex flex-wrap gap-2">
          {user.isBanned ? (
            <Badge variant="danger">밴</Badge>
          ) : (
            <Badge variant="default">밴 아님</Badge>
          )}
          {user.isRestricted ? (
            <Badge variant="secondary">제재 중</Badge>
          ) : (
            <Badge variant="default">제재 없음</Badge>
          )}
          {user.isBot && <Badge variant="secondary">테스트 봇</Badge>}
        </div>
        {user.banReason && (
          <p className="mt-2 text-xs text-text-secondary">
            밴 사유: {user.banReason}
          </p>
        )}
        {user.restrictedUntil && (
          <p className="mt-1 text-xs text-text-secondary">
            제재 종료: {new Date(user.restrictedUntil).toLocaleString("ko-KR")}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-bg-tertiary p-3">
        <p className="mb-2 text-xs font-semibold text-text-muted">
          라이엇 계정
        </p>
        {user.riotAccounts.length === 0 ? (
          <p className="text-xs text-text-muted">연동된 계정 없음</p>
        ) : (
          <div className="space-y-2">
            {user.riotAccounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg-tertiary/50 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {account.gameName}#{account.tagLine}
                    {account.isPrimary && (
                      <span className="ml-2 text-xs text-accent-primary">
                        주 계정
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">
                    {account.tier}
                    {account.rank ? ` ${account.rank}` : ""}
                  </p>
                </div>
                {account.puuid && (
                  <span className="max-w-[180px] truncate text-[10px] text-text-muted">
                    {account.puuid}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-bg-tertiary p-3">
        <p className="mb-2 text-xs font-semibold text-text-muted">
          방송/프로필
        </p>
        <p className="text-xs text-text-secondary">
          주 라이엇:{" "}
          {primaryRiot ? `${primaryRiot.gameName}#${primaryRiot.tagLine}` : "-"}
        </p>
        {activeStreams.length > 0 ? (
          <div className="mt-2 space-y-1">
            {activeStreams.map((profile) => (
              <a
                key={`${profile.platform}-${profile.channelUrl}`}
                href={profile.channelUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-xs text-accent-primary underline"
              >
                {profile.platform} · {profile.channelName ?? profile.channelUrl}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-text-muted">활성 방송 프로필 없음</p>
        )}
      </div>

      <div className="rounded-lg bg-bg-tertiary/60 p-3">
        <p className="text-xs text-text-muted">User ID</p>
        <p className="mt-1 break-all font-mono text-xs text-text-secondary">
          {user.id}
        </p>
      </div>
    </div>
  );
}

export function UsersTab({
  addToast,
  currentUserId,
  isAdmin,
}: {
  addToast: (msg: string, type: "success" | "error") => void;
  currentUserId?: string;
  isAdmin: boolean;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<UserKindFilter>("users");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [presenceFilter, setPresenceFilter] =
    useState<UserPresenceFilter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"ban" | "restrict" | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [banModal, setBanModal] = useState<AdminUser | null>(null);
  const [banReasonSelect, setBanReasonSelect] = useState("");
  const [banReasonCustom, setBanReasonCustom] = useState("");
  const [restrictModal, setRestrictModal] = useState<AdminUser | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [restrictUntil, setRestrictUntil] = useState("");
  // 개인 메시지/공지 발송 모달
  const [messageOpen, setMessageOpen] = useState(false);
  const [msgMode, setMsgMode] = useState<"dm" | "notification">("dm");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgContent, setMsgContent] = useState("");
  const [msgLink, setMsgLink] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers({
        page,
        limit,
        search: search || undefined,
        kind,
        role: roleFilter === "all" ? undefined : roleFilter,
        statusFilter: statusFilter === "all" ? undefined : statusFilter,
        presence: presenceFilter === "all" ? undefined : presenceFilter,
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      addToast("유저 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, kind, roleFilter, statusFilter, presenceFilter, addToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visibleIds = new Set(users.map((u) => u.id));
      return new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
    });
  }, [users]);

  const canModerateUser = useCallback(
    (u: AdminUser) => u.id !== currentUserId && (isAdmin || u.role === "USER"),
    [currentUserId, isAdmin],
  );

  const selectableUsers = users.filter(canModerateUser);
  const selectedUsers = users.filter(
    (u) => selectedIds.has(u.id) && canModerateUser(u),
  );
  const allVisibleSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((u) => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        selectableUsers.forEach((u) => next.delete(u.id));
      } else {
        selectableUsers.forEach((u) => next.add(u.id));
      }
      return next;
    });
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleRoleChange = async (u: AdminUser, role: UserRole) => {
    if (role === u.role) return;
    setUpdatingId(u.id);
    try {
      await adminApi.updateUserRole(u.id, role);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      addToast(`${u.username} 권한 변경 완료`, "success");
    } catch {
      addToast("권한 변경 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const resetBanForm = () => {
    setBanModal(null);
    setBanReasonSelect("");
    setBanReasonCustom("");
  };

  const banReasonFinal =
    banReasonSelect === "OTHER" ? banReasonCustom : banReasonSelect;

  const handleBan = async () => {
    if (!banModal) return;
    setUpdatingId(banModal.id);
    try {
      await adminApi.banUser(banModal.id, banReasonFinal, undefined);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === banModal.id
            ? {
                ...x,
                isBanned: true,
                banReason: banReasonFinal,
                banUntil: null,
              }
            : x,
        ),
      );
      addToast(`${banModal.username} 영구 밴 완료`, "success");
      resetBanForm();
    } catch {
      addToast("밴 처리 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUnban = async (u: AdminUser) => {
    setUpdatingId(u.id);
    try {
      await adminApi.unbanUser(u.id);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? { ...x, isBanned: false, banReason: null, banUntil: null }
            : x,
        ),
      );
      addToast(`${u.username} 밴 해제 완료`, "success");
    } catch {
      addToast("밴 해제 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRestrict = async () => {
    if (!restrictModal || !restrictUntil) return;
    setUpdatingId(restrictModal.id);
    try {
      await adminApi.restrictUser(restrictModal.id, restrictUntil);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === restrictModal.id
            ? { ...x, isRestricted: true, restrictedUntil: restrictUntil }
            : x,
        ),
      );
      addToast(`${restrictModal.username} 제재 완료`, "success");
      setRestrictModal(null);
      setRestrictUntil("");
    } catch {
      addToast("제재 처리 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUnrestrict = async (u: AdminUser) => {
    setUpdatingId(u.id);
    try {
      await adminApi.unrestrictUser(u.id);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? { ...x, isRestricted: false, restrictedUntil: null }
            : x,
        ),
      );
      addToast(`${u.username} 제재 해제 완료`, "success");
    } catch {
      addToast("제재 해제 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const finishBulk = (message: string, failed: number) => {
    addToast(
      failed > 0 ? `${message} · 실패 ${failed}건` : message,
      failed > 0 ? "error" : "success",
    );
    clearSelection();
  };

  const runBulkBan = async () => {
    const reason = banReasonFinal.trim();
    if (!isAdmin || !reason) return;
    const targets = selectedUsers.filter((u) => !u.isBanned);
    if (targets.length === 0) return;

    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((u) => adminApi.banUser(u.id, reason, undefined)),
      );
      const successIds = new Set(
        targets
          .filter((_, index) => results[index].status === "fulfilled")
          .map((u) => u.id),
      );
      setUsers((prev) =>
        prev.map((u) =>
          successIds.has(u.id)
            ? { ...u, isBanned: true, banReason: reason, banUntil: null }
            : u,
        ),
      );
      finishBulk(
        `${successIds.size}명 밴 처리 완료`,
        targets.length - successIds.size,
      );
      setBulkAction(null);
      setBanReasonSelect("");
      setBanReasonCustom("");
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkUnban = async () => {
    if (!isAdmin) return;
    const targets = selectedUsers.filter((u) => u.isBanned);
    if (targets.length === 0) return;

    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((u) => adminApi.unbanUser(u.id)),
      );
      const successIds = new Set(
        targets
          .filter((_, index) => results[index].status === "fulfilled")
          .map((u) => u.id),
      );
      setUsers((prev) =>
        prev.map((u) =>
          successIds.has(u.id)
            ? { ...u, isBanned: false, banReason: null, banUntil: null }
            : u,
        ),
      );
      finishBulk(
        `${successIds.size}명 밴 해제 완료`,
        targets.length - successIds.size,
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkRestrict = async () => {
    if (!restrictUntil) return;
    const targets = selectedUsers.filter((u) => !u.isRestricted);
    if (targets.length === 0) return;

    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((u) => adminApi.restrictUser(u.id, restrictUntil)),
      );
      const successIds = new Set(
        targets
          .filter((_, index) => results[index].status === "fulfilled")
          .map((u) => u.id),
      );
      setUsers((prev) =>
        prev.map((u) =>
          successIds.has(u.id)
            ? { ...u, isRestricted: true, restrictedUntil: restrictUntil }
            : u,
        ),
      );
      finishBulk(
        `${successIds.size}명 제재 완료`,
        targets.length - successIds.size,
      );
      setBulkAction(null);
      setRestrictUntil("");
    } finally {
      setBulkBusy(false);
    }
  };

  const openMessageModal = () => {
    setMsgMode("dm");
    setMsgTitle("");
    setMsgContent("");
    setMsgLink("");
    setMessageOpen(true);
  };

  const runSendMessage = async () => {
    const targets = selectedUsers;
    if (targets.length === 0 || !msgContent.trim()) return;
    if (msgMode === "notification" && !msgTitle.trim()) return;

    setMsgBusy(true);
    try {
      const { sent } = await adminApi.sendUserMessage({
        userIds: targets.map((u) => u.id),
        mode: msgMode,
        title: msgMode === "notification" ? msgTitle.trim() : undefined,
        content: msgContent.trim(),
        link:
          msgMode === "notification" ? msgLink.trim() || undefined : undefined,
      });
      addToast(
        msgMode === "dm"
          ? `${sent}명에게 쪽지를 보냈습니다.`
          : `${sent}명에게 개인 공지를 보냈습니다.`,
        "success",
      );
      setMessageOpen(false);
    } catch {
      addToast("메시지 발송에 실패했습니다.", "error");
    } finally {
      setMsgBusy(false);
    }
  };

  const runBulkUnrestrict = async () => {
    const targets = selectedUsers.filter((u) => u.isRestricted);
    if (targets.length === 0) return;

    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((u) => adminApi.unrestrictUser(u.id)),
      );
      const successIds = new Set(
        targets
          .filter((_, index) => results[index].status === "fulfilled")
          .map((u) => u.id),
      );
      setUsers((prev) =>
        prev.map((u) =>
          successIds.has(u.id)
            ? { ...u, isRestricted: false, restrictedUntil: null }
            : u,
        ),
      );
      finishBulk(
        `${successIds.size}명 제재 해제 완료`,
        targets.length - successIds.size,
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">유저 관리</h2>
          <p className="mt-1 text-xs text-text-muted">
            테스트용 봇과 실제 가입 유저를 분리해서 확인합니다.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름/이메일 검색..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-bg-tertiary text-text-primary text-sm w-48 focus:outline-none focus:border-accent-primary"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex w-fit rounded-lg border border-bg-tertiary bg-bg-secondary p-1">
            {USER_KIND_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setKind(filter.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  kind === filter.value
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="inline-flex w-fit rounded-lg border border-bg-tertiary bg-bg-secondary p-1">
            {USER_ROLE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setRoleFilter(filter.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  roleFilter === filter.value
                    ? "bg-bg-tertiary text-text-primary"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="inline-flex w-fit flex-wrap rounded-lg border border-bg-tertiary bg-bg-secondary p-1">
            {USER_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setStatusFilter(filter.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  statusFilter === filter.value
                    ? "bg-bg-tertiary text-text-primary"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="inline-flex w-fit rounded-lg border border-bg-tertiary bg-bg-secondary p-1">
            {USER_PRESENCE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setPresenceFilter(filter.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  presenceFilter === filter.value
                    ? "bg-bg-tertiary text-text-primary"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-muted">
          {USER_KIND_FILTERS.find((filter) => filter.value === kind)?.label}
          {" · "}
          {
            USER_ROLE_FILTERS.find((filter) => filter.value === roleFilter)
              ?.label
          }
          {" · "}
          {
            USER_STATUS_FILTERS.find((filter) => filter.value === statusFilter)
              ?.label
          }
          {" · "}
          {
            USER_PRESENCE_FILTERS.find(
              (filter) => filter.value === presenceFilter,
            )?.label
          }{" "}
          {total.toLocaleString()}명
        </p>
      </div>

      {selectedUsers.length > 0 && (
        <Card className="p-0">
          <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {selectedUsers.length}명 선택됨
              </p>
              <p className="text-xs text-text-muted">
                현재 페이지에서 권한상 조작 가능한 유저만 선택됩니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setBulkAction("ban")}
                    disabled={
                      bulkBusy || selectedUsers.every((u) => u.isBanned)
                    }
                  >
                    <Ban className="mr-1 h-3.5 w-3.5" />
                    선택 밴
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runBulkUnban}
                    disabled={
                      bulkBusy || selectedUsers.every((u) => !u.isBanned)
                    }
                  >
                    밴 해제
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkAction("restrict")}
                disabled={
                  bulkBusy || selectedUsers.every((u) => u.isRestricted)
                }
              >
                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                선택 제재
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={runBulkUnrestrict}
                disabled={
                  bulkBusy || selectedUsers.every((u) => !u.isRestricted)
                }
              >
                제재 해제
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openMessageModal}
                  disabled={bulkBusy}
                >
                  <MessageSquare className="mr-1 h-3.5 w-3.5" />
                  메시지 보내기
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                disabled={bulkBusy}
              >
                선택 해제
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="w-10 px-4 py-3 text-left font-medium">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        disabled={selectableUsers.length === 0}
                        aria-label="현재 페이지 조작 가능 유저 전체 선택"
                        className="h-4 w-4 rounded border-bg-tertiary bg-bg-secondary"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-medium">유저</th>
                    <th className="text-left px-4 py-3 font-medium">롤 닉</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">신고</th>
                    <th className="text-left px-4 py-3 font-medium">권한</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-text-muted"
                      >
                        조건에 맞는 {kind === "bots" ? "테스트 봇" : "유저"}가
                        없습니다.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const rowCanModerate = canModerateUser(u);

                      return (
                        <tr
                          key={u.id}
                          className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(u.id)}
                              onChange={() => toggleSelectUser(u.id)}
                              disabled={!rowCanModerate}
                              aria-label={`${u.username} 선택`}
                              className="h-4 w-4 rounded border-bg-tertiary bg-bg-secondary"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-text-primary">
                                  {u.username}
                                </span>
                                {u.isBot && (
                                  <Badge
                                    variant="secondary"
                                    className="inline-flex items-center gap-1 text-[10px]"
                                  >
                                    <Bot className="h-3 w-3" />봇
                                  </Badge>
                                )}
                                {(u.streamerProfiles ?? []).some(
                                  (p) => p.isActive,
                                ) && (
                                  <Badge variant="gold" className="text-[10px]">
                                    streamer
                                  </Badge>
                                )}
                                {u.id === currentUserId && (
                                  <span className="text-[10px] text-accent-primary">
                                    (나)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-text-muted">
                                {u.email ?? "-"}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <RiotAccountsCell accounts={u.riotAccounts} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap gap-1">
                                {u.isBanned ? (
                                  <Badge
                                    variant="danger"
                                    className="text-[10px]"
                                  >
                                    밴
                                  </Badge>
                                ) : u.isRestricted ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    제재
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="default"
                                    className="text-[10px]"
                                  >
                                    정상
                                  </Badge>
                                )}
                                <Badge
                                  variant={PRESENCE_VARIANTS[u.status]}
                                  className="text-[10px]"
                                >
                                  {PRESENCE_LABELS[u.status]}
                                </Badge>
                              </div>
                              {u.status !== "ONLINE" && u.lastSeenAt && (
                                <span className="text-[10px] text-text-muted">
                                  최근{" "}
                                  {new Date(u.lastSeenAt).toLocaleDateString(
                                    "ko-KR",
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-text-muted text-xs">
                            {u._count.reportsReceived > 0 ? (
                              <span className="text-red-400 font-medium">
                                {u._count.reportsReceived}건
                              </span>
                            ) : (
                              "없음"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {/* 권한 변경은 ADMIN만 가능. 매니저에게는 배지로만 표시 */}
                            {!isAdmin || u.id === currentUserId ? (
                              <Badge variant={ROLE_VARIANTS[u.role]}>
                                {ROLE_LABELS[u.role]}
                              </Badge>
                            ) : updatingId === u.id ? (
                              <LoadingSpinner />
                            ) : (
                              <select
                                value={u.role}
                                onChange={(e) =>
                                  handleRoleChange(
                                    u,
                                    e.target.value as UserRole,
                                  )
                                }
                                className="px-2 py-1 rounded bg-bg-tertiary text-text-primary text-xs focus:outline-none cursor-pointer"
                              >
                                <option value="USER">일반</option>
                                <option value="MODERATOR">매니저</option>
                                <option value="ADMIN">관리자</option>
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {rowCanModerate && (
                              <div className="flex gap-1">
                                {/* 밴/밴해제는 ADMIN 전용. 매니저는 제재만 가능 */}
                                {isAdmin &&
                                  (u.isBanned ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleUnban(u)}
                                      disabled={updatingId === u.id}
                                    >
                                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                      밴해제
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      onClick={() => setBanModal(u)}
                                    >
                                      <Ban className="h-3.5 w-3.5 mr-1" />밴
                                    </Button>
                                  ))}
                                {u.isRestricted ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleUnrestrict(u)}
                                    disabled={updatingId === u.id}
                                  >
                                    해제
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRestrictModal(u)}
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                    제재
                                  </Button>
                                )}
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailUser(u)}
                              className="mt-1"
                            >
                              상세
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>

      {bulkAction === "ban" && (
        <Modal
          title={`선택 유저 ${selectedUsers.length}명 밴`}
          onClose={() => setBulkAction(null)}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                사유 *
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BAN_REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setBanReasonSelect(r.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      banReasonSelect === r.value
                        ? "bg-red-500/20 text-red-400 border border-red-500/50"
                        : "bg-bg-tertiary text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {banReasonSelect === "OTHER" && (
                <input
                  value={banReasonCustom}
                  onChange={(e) => setBanReasonCustom(e.target.value)}
                  placeholder="사유 입력"
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none"
                />
              )}
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              이미 밴된 유저는 건너뛰고, 선택된 조작 가능 유저만 영구 밴합니다.
            </div>
            <Button
              variant="danger"
              onClick={runBulkBan}
              disabled={!banReasonFinal.trim() || bulkBusy}
              className="w-full"
            >
              {bulkBusy ? <LoadingSpinner /> : "선택 유저 밴"}
            </Button>
          </div>
        </Modal>
      )}

      {bulkAction === "restrict" && (
        <Modal
          title={`선택 유저 ${selectedUsers.length}명 제재`}
          onClose={() => setBulkAction(null)}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                제재 종료일 *
              </label>
              <input
                type="datetime-local"
                value={restrictUntil}
                onChange={(e) => setRestrictUntil(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none"
              />
            </div>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300">
              이미 제재 중인 유저는 건너뛰고, 선택된 조작 가능 유저만
              제재합니다.
            </div>
            <Button
              variant="primary"
              onClick={runBulkRestrict}
              disabled={!restrictUntil || bulkBusy}
              className="w-full"
            >
              {bulkBusy ? <LoadingSpinner /> : "선택 유저 제재"}
            </Button>
          </div>
        </Modal>
      )}

      {messageOpen && (
        <Modal
          title={`선택 유저 ${selectedUsers.length}명에게 발송`}
          onClose={() => !msgBusy && setMessageOpen(false)}
        >
          <div className="space-y-3">
            {/* 발송 모드: 쪽지(DM) vs 개인 공지(알림) */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMsgMode("dm")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  msgMode === "dm"
                    ? "border-accent-primary bg-accent-primary/15 text-text-primary"
                    : "border-bg-elevated bg-bg-tertiary text-text-muted hover:text-text-primary"
                }`}
              >
                쪽지(DM)
              </button>
              <button
                type="button"
                onClick={() => setMsgMode("notification")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  msgMode === "notification"
                    ? "border-accent-primary bg-accent-primary/15 text-text-primary"
                    : "border-bg-elevated bg-bg-tertiary text-text-muted hover:text-text-primary"
                }`}
              >
                개인 공지(알림)
              </button>
            </div>

            {msgMode === "notification" && (
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  제목 *
                </label>
                <input
                  value={msgTitle}
                  onChange={(e) => setMsgTitle(e.target.value)}
                  maxLength={100}
                  placeholder="공지 제목"
                  className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-text-muted mb-1">
                내용 *
              </label>
              <textarea
                value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder={msgMode === "dm" ? "쪽지 내용" : "공지 내용"}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>

            {msgMode === "notification" && (
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  링크 (선택)
                </label>
                <input
                  value={msgLink}
                  onChange={(e) => setMsgLink(e.target.value)}
                  maxLength={300}
                  placeholder="/community/123 또는 https://..."
                  className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
              </div>
            )}

            <div className="rounded-lg border border-bg-elevated bg-bg-tertiary p-3 text-xs text-text-muted">
              {msgMode === "dm"
                ? "운영자 계정에서 선택 유저에게 1:1 쪽지로 전송됩니다. DM 받은편지함에 실시간으로 도착합니다."
                : "선택 유저에게 SYSTEM 알림(🔔)으로 전송됩니다. 알림 벨에 실시간으로 표시됩니다."}
            </div>

            <Button
              variant="primary"
              onClick={runSendMessage}
              disabled={
                msgBusy ||
                !msgContent.trim() ||
                (msgMode === "notification" && !msgTitle.trim())
              }
              className="w-full"
            >
              {msgBusy ? (
                <LoadingSpinner />
              ) : (
                <>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {selectedUsers.length}명에게 발송
                </>
              )}
            </Button>
          </div>
        </Modal>
      )}

      {detailUser && (
        <Modal
          title={`${detailUser.username} 상세`}
          onClose={() => setDetailUser(null)}
          size="lg"
        >
          <UserDetailContent user={detailUser} />
        </Modal>
      )}

      {/* 밴 모달 */}
      {banModal && (
        <Modal title={`${banModal.username} 밴`} onClose={resetBanForm}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                사유 *
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BAN_REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setBanReasonSelect(r.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      banReasonSelect === r.value
                        ? "bg-red-500/20 text-red-400 border border-red-500/50"
                        : "bg-bg-tertiary text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {banReasonSelect === "OTHER" && (
                <input
                  type="text"
                  value={banReasonCustom}
                  onChange={(e) => setBanReasonCustom(e.target.value)}
                  placeholder="사유를 직접 입력하세요"
                  className="w-full mt-2 px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
              )}
            </div>
            <p className="text-xs text-red-400">영구 밴이 적용됩니다.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetBanForm}>
                취소
              </Button>
              <Button
                variant="danger"
                onClick={handleBan}
                disabled={!banReasonFinal.trim()}
              >
                영구 밴 적용
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 제재 모달 */}
      {restrictModal && (
        <Modal
          title={`${restrictModal.username} 제재`}
          onClose={() => {
            setRestrictModal(null);
            setRestrictUntil("");
          }}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                제재 만료일 *
              </label>
              <input
                type="datetime-local"
                value={restrictUntil}
                onChange={(e) => setRestrictUntil(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRestrictModal(null);
                  setRestrictUntil("");
                }}
              >
                취소
              </Button>
              <Button
                variant="danger"
                onClick={handleRestrict}
                disabled={!restrictUntil}
              >
                제재 적용
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
