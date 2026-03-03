"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { userApi, statsApi } from "@/lib/api-client";
import { useDdragonStore } from "@/stores/ddragon-store";
import { ChampionImage } from "@/components/ChampionImage";
import { Card, CardHeader, CardTitle, CardContent, Button, Label, LoadingSpinner, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Bell, Shield, Palette, LogOut, Check, Info, Search, X, Link as LinkIcon, AlertCircle, ExternalLink } from "lucide-react";

type SettingsTab = "accounts" | "notifications" | "privacy" | "appearance" | "about";

interface UserSettings {
  notifyFriendRequest: boolean;
  notifyFriendAccepted: boolean;
  notifyMatchStart: boolean;
  notifyMatchResult: boolean;
  notifyTeamInvite: boolean;
  notifyMention: boolean;
  notifyComment: boolean;
  notifyClanActivity: boolean;
  notifySystem: boolean;
  showOnlineStatus: boolean;
  showMatchHistory: boolean;
  showRiotAccounts: boolean;
  showChampionStats: boolean;
  allowFriendRequests: boolean;
  highlightChampionId: string | null;
  highlightStatType: string | null;
  theme: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout, deleteAccount } = useAuthStore();
  const { champions, championMap, fetchChampions } = useDdragonStore();
  const { setTheme: setNextTheme } = useTheme();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("notifications");
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // 회원 탈퇴 모달 상태
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [championSearch, setChampionSearch] = useState("");
  const [showChampionPicker, setShowChampionPicker] = useState(false);

  // Settings state
  const [settings, setSettings] = useState<UserSettings>({
    notifyFriendRequest: true,
    notifyFriendAccepted: true,
    notifyMatchStart: true,
    notifyMatchResult: true,
    notifyTeamInvite: true,
    notifyMention: true,
    notifyComment: true,
    notifyClanActivity: true,
    notifySystem: true,
    showOnlineStatus: true,
    showMatchHistory: true,
    showRiotAccounts: true,
    showChampionStats: true,
    allowFriendRequests: true,
    highlightChampionId: null,
    highlightStatType: null,
    theme: "dark",
  });
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Fetch champions for highlight picker
  useEffect(() => {
    if (isAuthenticated) {
      fetchChampions();
    }
  }, [isAuthenticated, fetchChampions]);

  // Fetch settings
  useEffect(() => {
    if (isAuthenticated) {
      userApi.getSettings()
        .then((data) => {
          const savedTheme = data.theme ?? "dark";
          setSettings({
            notifyFriendRequest: data.notifyFriendRequest ?? true,
            notifyFriendAccepted: data.notifyFriendAccepted ?? true,
            notifyMatchStart: data.notifyMatchStart ?? true,
            notifyMatchResult: data.notifyMatchResult ?? true,
            notifyTeamInvite: data.notifyTeamInvite ?? true,
            notifyMention: data.notifyMention ?? true,
            notifyComment: data.notifyComment ?? true,
            notifyClanActivity: data.notifyClanActivity ?? true,
            notifySystem: data.notifySystem ?? true,
            showOnlineStatus: data.showOnlineStatus ?? true,
            showMatchHistory: data.showMatchHistory ?? true,
            showRiotAccounts: data.showRiotAccounts ?? true,
            showChampionStats: data.showChampionStats ?? true,
            allowFriendRequests: data.allowFriendRequests ?? true,
            highlightChampionId: data.highlightChampionId ?? null,
            highlightStatType: data.highlightStatType ?? null,
            theme: savedTheme,
          });
          // 백엔드에 저장된 테마를 next-themes에 동기화
          setNextTheme(savedTheme);
        })
        .catch((err) => {
          console.error("Failed to fetch settings:", err);
        })
        .finally(() => {
          setSettingsLoading(false);
        });
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleSettingChange = async (key: keyof UserSettings, value: boolean | string | null) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // 테마 변경 시 next-themes에 즉시 반영
    if (key === "theme" && typeof value === "string") {
      setNextTheme(value);
    }

    try {
      await userApi.updateSettings({ [key]: value });
    } catch (error) {
      console.error("Settings update error:", error);
      // Revert on error
      setSettings(settings);
      if (key === "theme") {
        setNextTheme(settings.theme);
      }
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      setIsLogoutModalOpen(false);
    }
  };

  /**
   * 회원 탈퇴 확인 후 처리
   * - deleteAccount() 호출 시 서버 삭제 → 로컬 상태 초기화 → 홈 리다이렉트
   */
  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
    } catch (error) {
      console.error("회원 탈퇴 오류:", error);
      addToast("회원 탈퇴 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", "error");
    } finally {
      setIsDeletingAccount(false);
      setIsDeleteAccountModalOpen(false);
    }
  };

  const tabs = [
    { id: "accounts" as const, label: "연결된 계정", icon: LinkIcon },
    { id: "notifications" as const, label: "알림", icon: Bell },
    { id: "privacy" as const, label: "개인정보", icon: Shield },
    { id: "appearance" as const, label: "화면 설정", icon: Palette },
    { id: "about" as const, label: "서비스 정보", icon: Info },
  ];

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold mb-8 text-text-primary">설정</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <Card>
              <CardContent className="p-2">
                <nav className="space-y-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? "bg-accent-primary/10 text-accent-primary"
                          : "text-text-secondary hover:bg-bg-tertiary"
                      }`}
                    >
                      <tab.icon className="h-5 w-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  ))}
                  <hr className="my-2 border-bg-tertiary" />
                  <button
                    onClick={() => setIsLogoutModalOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-accent-danger hover:bg-accent-danger/10 transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="font-medium">로그아웃</span>
                  </button>
                  {/* 회원 탈퇴 버튼 — 작고 위험 색상으로 표시 */}
                  <button
                    onClick={() => setIsDeleteAccountModalOpen(true)}
                    className="w-full flex items-center justify-center px-4 py-2 rounded-lg text-xs text-text-tertiary hover:text-accent-danger hover:bg-accent-danger/10 transition-colors"
                  >
                    회원 탈퇴
                  </button>
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Content */}
          <div className="md:col-span-3">
            {activeTab === "accounts" && (
              <Card>
                <CardHeader>
                  <CardTitle>연결된 계정</CardTitle>
                  <p className="text-sm text-text-secondary mt-1">
                    내전 참여를 위해 Discord와 Riot 계정 연동이 필수입니다
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Discord */}
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-[#5865F2] flex items-center justify-center">
                        <svg className="w-7 h-7 fill-white" viewBox="0 0 71 55">
                          <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-text-primary flex items-center gap-2">
                          Discord
                          {user?.authProviders?.some((p: any) => p.provider === "DISCORD") && (
                            <Check className="h-4 w-4 text-accent-success" />
                          )}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {user?.authProviders?.some((p: any) => p.provider === "DISCORD")
                            ? "연동됨 - 음성 채널 자동 이동 가능"
                            : "음성 채널 자동 이동을 위해 필수"}
                        </p>
                      </div>
                    </div>
                    {!user?.authProviders?.some((p: any) => p.provider === "DISCORD") && (
                      <Button
                        onClick={() => {
                          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
                          window.location.href = `${apiUrl}/auth/link/discord`;
                        }}
                        size="sm"
                      >
                        연동하기
                      </Button>
                    )}
                  </div>

                  {/* Google */}
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                        <svg className="w-6 h-6" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-text-primary flex items-center gap-2">
                          Google
                          {user?.authProviders?.some((p: any) => p.provider === "GOOGLE") && (
                            <Check className="h-4 w-4 text-accent-success" />
                          )}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {user?.authProviders?.some((p: any) => p.provider === "GOOGLE")
                            ? "연동됨"
                            : "선택 사항"}
                        </p>
                      </div>
                    </div>
                    {!user?.authProviders?.some((p: any) => p.provider === "GOOGLE") && (
                      <Button
                        onClick={() => {
                          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
                          window.location.href = `${apiUrl}/auth/link/google`;
                        }}
                        size="sm"
                        variant="outline"
                      >
                        연동하기
                      </Button>
                    )}
                  </div>

                  {/* Riot Account */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D13639] to-[#A32D2F] flex items-center justify-center">
                        <span className="text-white font-bold text-lg">R</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-text-primary flex items-center gap-2">
                          Riot Games
                          {user?.riotAccounts && user.riotAccounts.length > 0 && (
                            <Check className="h-4 w-4 text-accent-success" />
                          )}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {user?.riotAccounts && user.riotAccounts.length > 0
                            ? `연동됨 - ${user.riotAccounts[0].gameName}#${user.riotAccounts[0].tagLine}`
                            : "내전 참여를 위해 필수"}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => router.push("/profile")}
                      size="sm"
                      variant={user?.riotAccounts && user.riotAccounts.length > 0 ? "outline" : "primary"}
                    >
                      {user?.riotAccounts && user.riotAccounts.length > 0 ? "관리" : "연동하기"}
                    </Button>
                  </div>

                  {/* Warning if not linked */}
                  {(!user?.authProviders?.some((p: any) => p.provider === "DISCORD") ||
                    !user?.riotAccounts ||
                    user.riotAccounts.length === 0) && (
                    <div className="mt-4 p-4 bg-accent-warning/10 border border-accent-warning/30 rounded-lg flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-accent-warning flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-accent-warning">계정 연동 필요</p>
                        <p className="text-sm text-text-secondary mt-1">
                          내전에 참여하려면 Discord와 Riot 계정 연동이 필수입니다.
                          위 버튼을 클릭하여 계정을 연동해주세요.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === "notifications" && (
              <Card>
                <CardHeader>
                  <CardTitle>알림 설정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settingsLoading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-text-secondary mb-3">소셜 알림</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">친구 요청</p>
                              <p className="text-sm text-text-secondary">새로운 친구 요청을 받았을 때 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyFriendRequest}
                              onChange={(e) => handleSettingChange("notifyFriendRequest", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">친구 요청 수락</p>
                              <p className="text-sm text-text-secondary">친구 요청이 수락되었을 때 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyFriendAccepted}
                              onChange={(e) => handleSettingChange("notifyFriendAccepted", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">팀 초대</p>
                              <p className="text-sm text-text-secondary">팀에 초대되었을 때 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyTeamInvite}
                              onChange={(e) => handleSettingChange("notifyTeamInvite", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-text-secondary mb-3">경기 알림</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">경기 시작</p>
                              <p className="text-sm text-text-secondary">경기가 시작될 때 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyMatchStart}
                              onChange={(e) => handleSettingChange("notifyMatchStart", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">경기 결과</p>
                              <p className="text-sm text-text-secondary">경기 결과가 등록되었을 때 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyMatchResult}
                              onChange={(e) => handleSettingChange("notifyMatchResult", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-text-secondary mb-3">커뮤니티 알림</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">멘션</p>
                              <p className="text-sm text-text-secondary">다른 사용자가 나를 멘션했을 때 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyMention}
                              onChange={(e) => handleSettingChange("notifyMention", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">댓글</p>
                              <p className="text-sm text-text-secondary">내 게시글에 댓글이 달렸을 때 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyComment}
                              onChange={(e) => handleSettingChange("notifyComment", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                            <div>
                              <p className="font-medium text-text-primary">클랜 활동</p>
                              <p className="text-sm text-text-secondary">클랜 관련 활동 알림</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.notifyClanActivity}
                              onChange={(e) => handleSettingChange("notifyClanActivity", e.target.checked)}
                              className="w-5 h-5 accent-accent-primary cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-text-secondary mb-3">기타</h3>
                        <div className="flex items-center justify-between py-3">
                          <div>
                            <p className="font-medium text-text-primary">시스템 알림</p>
                            <p className="text-sm text-text-secondary">중요한 시스템 공지사항 알림</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={settings.notifySystem}
                            onChange={(e) => handleSettingChange("notifySystem", e.target.checked)}
                            className="w-5 h-5 accent-accent-primary cursor-pointer"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === "privacy" && (
              <Card>
                <CardHeader>
                  <CardTitle>개인정보 설정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settingsLoading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                        <div>
                          <p className="font-medium text-text-primary">온라인 상태 표시</p>
                          <p className="text-sm text-text-secondary">접속 중일 때 온라인 상태를 표시합니다</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.showOnlineStatus}
                          onChange={(e) => handleSettingChange("showOnlineStatus", e.target.checked)}
                          className="w-5 h-5 accent-accent-primary cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                        <div>
                          <p className="font-medium text-text-primary">전적 공개</p>
                          <p className="text-sm text-text-secondary">내전 전적 및 최근 활동을 공개합니다</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.showMatchHistory}
                          onChange={(e) => handleSettingChange("showMatchHistory", e.target.checked)}
                          className="w-5 h-5 accent-accent-primary cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                        <div>
                          <p className="font-medium text-text-primary">Riot 계정 공개</p>
                          <p className="text-sm text-text-secondary">연동된 Riot 계정 정보를 다른 사용자에게 공개합니다</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.showRiotAccounts}
                          onChange={(e) => handleSettingChange("showRiotAccounts", e.target.checked)}
                          className="w-5 h-5 accent-accent-primary cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                        <div>
                          <p className="font-medium text-text-primary">챔피언 통계 공개</p>
                          <p className="text-sm text-text-secondary">선호 챔피언 및 내전 모스트 챔피언을 공개합니다</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.showChampionStats}
                          onChange={(e) => handleSettingChange("showChampionStats", e.target.checked)}
                          className="w-5 h-5 accent-accent-primary cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <div>
                          <p className="font-medium text-text-primary">친구 요청 허용</p>
                          <p className="text-sm text-text-secondary">다른 사용자가 친구 요청을 보낼 수 있습니다</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.allowFriendRequests}
                          onChange={(e) => handleSettingChange("allowFriendRequests", e.target.checked)}
                          className="w-5 h-5 accent-accent-primary cursor-pointer"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === "appearance" && (
              <Card>
                <CardHeader>
                  <CardTitle>화면 설정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>테마</Label>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <button
                        onClick={() => handleSettingChange("theme", "dark")}
                        className={`p-4 rounded-lg border-2 transition-colors ${
                          settings.theme === "dark"
                            ? "border-accent-primary bg-bg-tertiary"
                            : "border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50"
                        }`}
                      >
                        <div className="h-8 bg-[#0f0f0f] rounded mb-2" />
                        <p className="text-sm text-text-primary">다크</p>
                      </button>
                      <button
                        onClick={() => handleSettingChange("theme", "light")}
                        className={`p-4 rounded-lg border-2 transition-colors ${
                          settings.theme === "light"
                            ? "border-accent-primary bg-bg-tertiary"
                            : "border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50"
                        }`}
                      >
                        <div className="h-8 bg-[#f0f0f0] rounded mb-2" />
                        <p className="text-sm text-text-primary">라이트</p>
                      </button>
                      <button
                        onClick={() => handleSettingChange("theme", "system")}
                        className={`p-4 rounded-lg border-2 transition-colors ${
                          settings.theme === "system"
                            ? "border-accent-primary bg-bg-tertiary"
                            : "border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50"
                        }`}
                      >
                        <div className="h-8 bg-gradient-to-r from-[#0f0f0f] to-[#f0f0f0] rounded mb-2" />
                        <p className="text-sm text-text-primary">시스템</p>
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "about" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>서비스 정보</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0">
                    <InfoRow label="서비스 이름" value="NEXUS" />
                    <InfoRow label="버전" value="1.0.0" mono />
                    <InfoRow label="제작" value="Harumaroon" />
                    <InfoRow label="문의" value="nexuscshelper@gmail.com" accent href="mailto:nexuscshelper@gmail.com" />
                    <div className="pt-4 mt-3 border-t border-bg-tertiary">
                      <p className="text-xs text-text-tertiary leading-relaxed">
                        &copy; {new Date().getFullYear()} Harumaroon. All rights reserved.
                      </p>
                      <p className="text-xs text-text-tertiary leading-relaxed mt-1">
                        NEXUS isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views
                        or opinions of Riot Games or anyone officially involved in producing or
                        managing Riot Games properties. Riot Games, and all associated properties
                        are trademarks or registered trademarks of Riot Games, Inc.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* 약관은 전용 페이지로 연결 — 내용 이중 관리 방지 */}
                <LegalLink href="/terms" label="서비스 이용약관" />
                <LegalLink href="/privacy" label="개인정보 처리방침" />
                <LegalSection
                  title="오픈소스 라이선스"
                  content={OPEN_SOURCE_NOTICE}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogout}
        title="로그아웃"
        message="로그아웃 하시겠습니까?"
        confirmText="로그아웃"
        cancelText="취소"
        variant="danger"
        isLoading={isLoggingOut}
      />

      {/* 회원 탈퇴 확인 모달 — 되돌릴 수 없음을 명확히 안내 */}
      <ConfirmModal
        isOpen={isDeleteAccountModalOpen}
        onClose={() => setIsDeleteAccountModalOpen(false)}
        onConfirm={handleDeleteAccount}
        title="회원 탈퇴"
        message="정말로 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        confirmText="탈퇴하기"
        cancelText="취소"
        variant="danger"
        isLoading={isDeletingAccount}
      />
    </div>
  );
}

/* ─── Info row ─── */
function InfoRow({ label, value, mono, accent, href }: { label: string; value: string; mono?: boolean; accent?: boolean; href?: string }) {
  const textClass = `text-sm font-medium ${mono ? 'font-mono' : ''} ${accent ? 'text-accent-primary' : 'text-text-primary'}`;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-bg-tertiary last:border-b-0">
      <span className="text-text-secondary text-sm">{label}</span>
      {href ? (
        <a href={href} className={`${textClass} hover:underline`}>{value}</a>
      ) : (
        <span className={textClass}>{value}</span>
      )}
    </div>
  );
}

/* ─── 외부 약관 페이지 링크 버튼 ─── */
function LegalLink({ href, label }: { href: string; label: string }) {
  return (
    <Card>
      <Link
        href={href}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-bg-tertiary/50 transition-colors rounded-xl"
      >
        <span className="font-semibold text-text-primary">{label}</span>
        <ExternalLink className="h-4 w-4 text-text-tertiary" />
      </Link>
    </Card>
  );
}

/* ─── Collapsible legal section (오픈소스 라이선스용) ─── */
function LegalSection({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="font-semibold text-text-primary">{title}</span>
        <ExternalLink className={`h-4 w-4 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <CardContent className="pt-0 px-6 pb-6">
          <div className="max-w-none text-text-secondary text-sm leading-relaxed whitespace-pre-line">
            {content}
          </div>
        </CardContent>
      )}
    </Card>
  );
}


/* ─── 오픈소스 라이선스 고지 ─── */
const OPEN_SOURCE_NOTICE = `NEXUS는 다음의 오픈소스 소프트웨어를 사용하여 제작되었습니다.

프론트엔드
• Next.js (MIT License) – Vercel
• React (MIT License) – Meta Platforms
• Tailwind CSS (MIT License) – Tailwind Labs
• Zustand (MIT License) – Poimandres
• Lucide React (ISC License) – Lucide Contributors
• Socket.IO Client (MIT License) – Socket.IO

백엔드
• NestJS (MIT License) – Kamil Myśliwiec
• Prisma (Apache 2.0 License) – Prisma Data
• Socket.IO (MIT License) – Socket.IO
• Passport (MIT License) – Jared Hanson
• bcrypt (MIT License)

인프라 및 기타
• PostgreSQL (PostgreSQL License)
• Redis (BSD 3-Clause License)
• TypeScript (Apache 2.0 License) – Microsoft
• Turborepo (MIT License) – Vercel

게임 데이터
• Riot Games API – Riot Games 이용 약관에 따름
• Data Dragon – Riot Games, Inc.

각 오픈소스 소프트웨어의 라이선스 전문은 해당 프로젝트의 공식 저장소에서 확인할 수 있습니다.`;
