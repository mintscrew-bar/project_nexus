"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { adminApi } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import { Shield, Users, Home, Activity, Search, ChevronLeft, ChevronRight } from "lucide-react";

type UserRole = "USER" | "MODERATOR" | "ADMIN";

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  createdAt: string;
  authProviders: { provider: string }[];
}

interface AdminStats {
  totalUsers: number;
  totalRooms: number;
  activeRooms: number;
  totalMatches: number;
}

const ROLE_LABELS: Record<UserRole, string> = {
  USER: "일반",
  MODERATOR: "모더레이터",
  ADMIN: "관리자",
};

const ROLE_VARIANTS: Record<UserRole, "default" | "secondary" | "danger"> = {
  USER: "default",
  MODERATOR: "secondary",
  ADMIN: "danger",
};

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { addToast } = useToast();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  // Auth guard
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.push("/login");
      } else if (user?.role !== "ADMIN") {
        router.push("/");
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch {
      // silent
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await adminApi.getUsers({ page, limit, search: search || undefined });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      addToast("유저 목록 로드에 실패했습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [page, search, addToast]);

  useEffect(() => {
    if (isAuthenticated && user?.role === "ADMIN") {
      fetchStats();
      fetchUsers();
    }
  }, [isAuthenticated, user, fetchStats, fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleRoleChange = async (targetUser: AdminUser, newRole: UserRole) => {
    if (newRole === targetUser.role) return;
    setUpdatingUserId(targetUser.id);
    try {
      await adminApi.updateUserRole(targetUser.id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      );
      addToast(
        `${targetUser.username}의 권한을 ${ROLE_LABELS[newRole]}(으)로 변경했습니다.`,
        "success"
      );
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "권한 변경에 실패했습니다.",
        "error"
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (authLoading || (!isAuthenticated && !authLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (user?.role !== "ADMIN") return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-accent-primary" />
        <h1 className="text-2xl font-bold text-text-primary">관리자 패널</h1>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users className="h-5 w-5" />} label="전체 유저" value={stats.totalUsers} />
          <StatCard icon={<Home className="h-5 w-5" />} label="전체 방" value={stats.totalRooms} />
          <StatCard icon={<Activity className="h-5 w-5" />} label="활성 방" value={stats.activeRooms} />
          <StatCard icon={<Shield className="h-5 w-5" />} label="전체 매치" value={stats.totalMatches} />
        </div>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle>유저 목록 ({total}명)</CardTitle>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="이름 또는 이메일 검색..."
                className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-bg-tertiary text-text-primary text-sm w-52 focus:outline-none focus:border-accent-primary"
              />
              <Button type="submit" size="sm" variant="outline">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-text-muted py-12">유저가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">유저명</th>
                    <th className="text-left px-4 py-3 font-medium">이메일</th>
                    <th className="text-left px-4 py-3 font-medium">로그인 방식</th>
                    <th className="text-left px-4 py-3 font-medium">가입일</th>
                    <th className="text-left px-4 py-3 font-medium">권한</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {u.username}
                        {u.id === user?.id && (
                          <span className="ml-1.5 text-[10px] text-accent-primary">(나)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{u.email ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {u.authProviders.map((p) => (
                            <Badge key={p.provider} variant="default" className="text-[10px]">
                              {p.provider}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        {u.id === user?.id ? (
                          <Badge variant={ROLE_VARIANTS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            {updatingUserId === u.id ? (
                              <LoadingSpinner />
                            ) : (
                              <select
                                value={u.role}
                                onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                                className="px-2 py-1 rounded bg-bg-tertiary border border-bg-tertiary text-text-primary text-xs focus:outline-none focus:border-accent-primary cursor-pointer"
                              >
                                <option value="USER">일반</option>
                                <option value="MODERATOR">모더레이터</option>
                                <option value="ADMIN">관리자</option>
                              </select>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-text-secondary">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="text-accent-primary">{icon}</div>
        <div>
          <p className="text-text-muted text-xs">{label}</p>
          <p className="text-xl font-bold text-text-primary">{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}
