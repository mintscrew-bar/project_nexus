"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { friendApi } from "@/lib/api-client";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  LoadingSpinner,
  EmptyState,
  Badge,
  StatusIndicator,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { usePresence } from "@/hooks/usePresence";
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  Search,
  MessageCircle,
} from "lucide-react";

interface User {
  id: string;
  username: string;
  avatar: string | null;
}

interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: string;
  user: User;
  friend: User;
}

export default function FriendsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { getFriendStatus } = usePresence();
  const { addToast } = useToast();

  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"friends" | "pending">("friends");

  const fetchFriends = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    setError(null);
    try {
      const [friendsData, pendingData] = await Promise.all([
        friendApi.getFriends(),
        friendApi.getPendingRequests(),
      ]);
      setFriends(friendsData);
      setPendingRequests(pendingData);
    } catch (err: any) {
      setError(err.message || "친구 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleAcceptRequest = async (friendshipId: string) => {
    try {
      await friendApi.acceptRequest(friendshipId);
      addToast("친구 요청을 수락했습니다.", "success");
      fetchFriends();
    } catch (err: any) {
      addToast(err.message || "친구 요청 수락에 실패했습니다.", "error");
    }
  };

  const handleRejectRequest = async (friendshipId: string) => {
    try {
      await friendApi.rejectRequest(friendshipId);
      addToast("친구 요청을 거절했습니다.", "info");
      fetchFriends();
    } catch (err: any) {
      addToast(err.message || "친구 요청 거절에 실패했습니다.", "error");
    }
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    if (!confirm("정말로 친구를 삭제하시겠습니까?")) return;

    try {
      await friendApi.removeFriend(friendshipId);
      addToast("친구를 삭제했습니다.", "info");
      fetchFriends();
    } catch (err: any) {
      addToast(err.message || "친구 삭제에 실패했습니다.", "error");
    }
  };

  const getFriendUser = useCallback((friendship: Friendship): User => {
    return friendship.userId === user?.id ? friendship.friend : friendship.user;
  }, [user?.id]);

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const filteredFriends = useMemo(() => {
    return friends.filter((f) => {
      const friendUser = getFriendUser(f);
      return friendUser.username.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    });
  }, [friends, debouncedSearchQuery, getFriendUser]);

  // Separate incoming and outgoing pending requests
  const incomingRequests = pendingRequests.filter((r) => r.friendId === user?.id);
  const outgoingRequests = pendingRequests.filter((r) => r.userId === user?.id);

  if (authLoading || (isLoading && friends.length === 0)) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">친구 목록 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
              <Users className="h-8 w-8 text-accent-primary" />
              친구
            </h1>
            <p className="text-text-secondary mt-1">
              친구들과 함께 내전을 즐기세요
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab("friends")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "friends"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <UserCheck className="h-4 w-4" />
            친구 ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "pending"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <Clock className="h-4 w-4" />
            대기 중 ({pendingRequests.length})
            {incomingRequests.length > 0 && (
              <span className="bg-accent-danger text-white text-xs px-1.5 py-0.5 rounded-full">
                {incomingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-4 mb-6">
            <p className="text-accent-danger">{error}</p>
          </div>
        )}

        {/* Friends Tab */}
        {activeTab === "friends" && (
          <>
            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
              <Input
                type="text"
                placeholder="친구 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {filteredFriends.length === 0 ? (
              <EmptyState
                icon={Users}
                title={searchQuery ? "검색 결과가 없습니다" : "친구가 없습니다"}
                description={
                  searchQuery
                    ? "다른 검색어로 시도해보세요."
                    : "다른 플레이어에게 친구 요청을 보내보세요!"
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredFriends.map((friendship) => {
                  const friendUser = getFriendUser(friendship);
                  return (
                    <Card key={friendship.id} hoverable>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative w-12 h-12 rounded-full bg-bg-tertiary overflow-hidden">
                              {friendUser.avatar ? (
                                <Image
                                  src={friendUser.avatar}
                                  alt={friendUser.username}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Users className="h-6 w-6 text-text-tertiary" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-text-primary">
                                {friendUser.username}
                              </p>
                              <StatusIndicator
                                status={getFriendStatus(friendUser.id)?.status || "OFFLINE"}
                                size="sm"
                                showLabel
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => router.push(`/profile/${friendUser.id}`)}
                            >
                              프로필
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFriend(friendship.id)}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Pending Tab */}
        {activeTab === "pending" && (
          <div className="space-y-6">
            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  받은 요청 ({incomingRequests.length})
                </h3>
                <div className="space-y-2">
                  {incomingRequests.map((request) => (
                    <Card key={request.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden">
                              {request.user.avatar ? (
                                <Image
                                  src={request.user.avatar}
                                  alt={request.user.username}
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
                            <p className="font-medium text-text-primary">
                              {request.user.username}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAcceptRequest(request.id)}
                            >
                              수락
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRejectRequest(request.id)}
                            >
                              거절
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Outgoing Requests */}
            {outgoingRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  보낸 요청 ({outgoingRequests.length})
                </h3>
                <div className="space-y-2">
                  {outgoingRequests.map((request) => (
                    <Card key={request.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden">
                              {request.friend.avatar ? (
                                <Image
                                  src={request.friend.avatar}
                                  alt={request.friend.username}
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
                              <p className="font-medium text-text-primary">
                                {request.friend.username}
                              </p>
                              <p className="text-xs text-text-tertiary">대기 중</p>
                            </div>
                          </div>
                          <Badge variant="default">대기 중</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {pendingRequests.length === 0 && (
              <EmptyState
                icon={Clock}
                title="대기 중인 요청이 없습니다"
                description="친구 요청을 보내거나 받으면 여기에 표시됩니다."
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
