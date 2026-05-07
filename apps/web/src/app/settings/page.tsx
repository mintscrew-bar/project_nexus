"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { userApi, statsApi, appealApi } from "@/lib/api-client";
import { useDdragonStore } from "@/stores/ddragon-store";
import { ChampionImage } from "@/components/ChampionImage";
import { Card, CardHeader, CardTitle, CardContent, Button, Label, LoadingSpinner, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Bell, Shield, Palette, LogOut, Check, Info, Search, X, Link as LinkIcon, AlertCircle, ExternalLink, ChevronRight, RefreshCw, Loader2 } from "lucide-react";
import { AddAccountModal } from "@/components/domain/AddAccountModal";
import { useRiotStore } from "@/stores/riot-store";

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
  const { user, isAuthenticated, isLoading, logout, deleteAccount, fetchUser } = useAuthStore();
  const { champions, championMap, fetchChampions } = useDdragonStore();
  const { setTheme: setNextTheme } = useTheme();
  const { fetchAccounts, isIconVerified } = useRiotStore();
  const [showRiotModal, setShowRiotModal] = useState(false);
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("notifications");
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // 회원 탈퇴 모달 상태
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  // 이의신청 모달 상태
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [latestAppeal, setLatestAppeal] = useState<{ status: string; adminNote?: string; createdAt: string } | null>(null);
  const [championSearch, setChampionSearch] = useState("");
  const [showChampionPicker, setShowChampionPicker] = useState(false);
  // Discord 아바타 동기화 상태
  const [isSyncingAvatar, setIsSyncingAvatar] = useState(false);

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

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;

    const shouldOpenOnboarding =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("onboarding") === "riot";
    const hasRiot = Array.isArray(user.riotAccounts) && user.riotAccounts.length > 0;

    if (shouldOpenOnboarding && !hasRiot) {
      setActiveTab("accounts");
      setShowRiotModal(true);
      router.replace("/settings");
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Fetch champions for highlight picker
  useEffect(() => {
    if (isAuthenticated) {
      fetchChampions();
    }
  }, [isAuthenticated, fetchChampions]);

  // 밴/제재 상태일 때 최근 이의신청 조회
  useEffect(() => {
    if (isAuthenticated && user && (user.isBanned || user.isRestricted)) {
      appealApi.getLatest()
        .then((data) => {
          if (data) setLatestAppeal(data);
        })
        .catch(() => {}); // 이의신청 없어도 에러 무시
    }
  }, [isAuthenticated, user]);

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
  }, [isAuthenticated, setNextTheme]);

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

  const handleSyncDiscordAvatar = async () => {
    setIsSyncingAvatar(true);
    try {
      await userApi.syncDiscordAvatar();
      await fetchUser();
      addToast("Discord 프로필 사진으로 동기화되었습니다.", "success");
    } catch (err: any) {
      const msg = err?.response?.data?.message || "동기화에 실패했습니다.";
      addToast(msg, "error");
    } finally {
      setIsSyncingAvatar(false);
    }
  };

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

  /** 이의신청 제출 처리 */
  const handleSubmitAppeal = async () => {
    if (!appealReason.trim()) {
      addToast("이의신청 사유를 입력해주세요.", "error");
      return;
    }
    setIsSubmittingAppeal(true);
    try {
      const result = await appealApi.submit(appealReason.trim());
      setLatestAppeal(result);
      setIsAppealModalOpen(false);
      setAppealReason("");
      addToast("이의신청이 접수되었습니다. 관리자 심사 후 처리됩니다.", "success");
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? "이의신청 제출 중 오류가 발생했습니다.";
      addToast(msg, "error");
    } finally {
      setIsSubmittingAppeal(false);
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
              <div className="space-y-4">
                {/* 밴/제재 상태 배너 + 이의신청 UI */}
                {(user?.isBanned || user?.isRestricted) && (
                  <div className="p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-accent-danger flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-accent-danger">
                          {user.isBanned ? "계정이 정지되었습니다" : "계정이 임시 제재되었습니다"}
                        </p>
                        {user.isBanned && user.banReason && (
                          <p className="text-sm text-text-secondary mt-1">사유: {user.banReason}</p>
                        )}
                        {user.isRestricted && user.restrictedUntil && (
                          <p className="text-sm text-text-secondary mt-1">
                            제재 해제 예정: {new Date(user.restrictedUntil).toLocaleDateString("ko-KR")}
                          </p>
                        )}

                        {/* 이의신청 상태 표시 */}
                        {latestAppeal ? (
                          <div className="mt-3 p-3 bg-bg-secondary rounded-lg">
                            {latestAppeal.status === "PENDING" && (
                              <p className="text-sm text-accent-warning font-medium">⏳ 이의신청 심사 중입니다.</p>
                            )}
                            {latestAppeal.status === "APPROVED" && (
                              <p className="text-sm text-accent-success font-medium">✅ 이의신청이 승인되었습니다. 페이지를 새로고침해주세요.</p>
                            )}
                            {latestAppeal.status === "REJECTED" && (
                              <div>
                                <p className="text-sm text-accent-danger font-medium">❌ 이의신청이 거절되었습니다.</p>
                                {latestAppeal.adminNote && (
                                  <p className="text-sm text-text-secondary mt-1">관리자 메모: {latestAppeal.adminNote}</p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            onClick={() => setIsAppealModalOpen(true)}
                          >
                            이의신청하기
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              <Card>
                <CardHeader>
                  <CardTitle>내전 참여 준비</CardTitle>
                  <p className="text-sm text-text-secondary mt-1">
                    아래 단계를 완료해야 내전에 참여할 수 있습니다
                  </p>
                </CardHeader>
                <CardContent>
                  {/* 스텝 위저드 */}
                  {(() => {
                    const hasDiscord = user?.authProviders?.some((p: any) => p.provider === "DISCORD");
                    const hasRiot = user?.riotAccounts && user.riotAccounts.length > 0;
                    const primaryRiot = user?.riotAccounts?.[0];
                    const hasRoles = primaryRiot?.mainRole;
                    const allDone = hasDiscord && hasRiot && hasRoles;

                    const steps = [
                      {
                        num: 1,
                        title: "Discord 연동",
                        desc: hasDiscord ? "연동 완료" : "로그인에 사용한 Discord 계정",
                        done: !!hasDiscord,
                        action: hasDiscord ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSyncDiscordAvatar}
                            disabled={isSyncingAvatar}
                            className="flex items-center gap-1.5"
                          >
                            {isSyncingAvatar
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />}
                            사진 동기화
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => {
                            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
                            window.location.href = `${apiUrl}/auth/link/discord`;
                          }}>연동하기</Button>
                        ),
                      },
                      {
                        num: 2,
                        title: "Riot 계정 연동",
                        desc: hasRiot
                          ? `${primaryRiot.gameName}#${primaryRiot.tagLine}`
                          : isIconVerified
                            ? "아이콘 인증 완료 · 역할/챔피언 선택 남음"
                            : "소환사명으로 계정 인증",
                        done: !!hasRiot,
                        inProgress: !hasRiot && isIconVerified,
                        action: (
                          <Button
                            size="sm"
                            variant={hasRiot ? "outline" : "primary"}
                            onClick={() => {
                              if (hasRiot) {
                                router.push("/profile");
                                return;
                              }
                              setShowRiotModal(true);
                            }}
                          >
                            {hasRiot ? "계정 관리" : isIconVerified ? "계속하기" : "연동하기"}
                          </Button>
                        ),
                      },
                      {
                        num: 3,
                        title: "역할 및 챔피언 설정",
                        desc: hasRoles
                          ? `주 역할: ${primaryRiot?.mainRole} / 부 역할: ${primaryRiot?.subRole}`
                          : "주/부 역할과 선호 챔피언 선택",
                        done: !!hasRoles,
                        action: !hasRiot ? null : (
                          <Button
                            size="sm"
                            variant={hasRoles ? "outline" : "primary"}
                            onClick={() => router.push("/profile")}
                          >
                            {hasRoles ? "수정" : "설정하기"}
                          </Button>
                        ),
                      },
                    ];

                    return (
                      <div className="space-y-1">
                        {!hasRiot && (
                          <div className="mb-4 p-3 bg-accent-primary/10 border border-accent-primary/30 rounded-lg">
                            <p className="text-sm text-text-primary font-medium">처음 오셨다면 2단계부터 시작하세요.</p>
                            <p className="text-xs text-text-secondary mt-1">소환사명 입력 → 아이콘 인증 → 주/부 역할과 선호 챔피언 선택 순서로 2~3분이면 완료됩니다.</p>
                          </div>
                        )}

                        {/* 전체 완료 배너 */}
                        {allDone && (
                          <div className="mb-4 p-3 bg-accent-success/10 border border-accent-success/30 rounded-lg flex items-center gap-2">
                            <Check className="h-4 w-4 text-accent-success" />
                            <p className="text-sm text-accent-success font-medium">모든 준비가 완료되었습니다. 내전에 참여할 수 있습니다!</p>
                          </div>
                        )}

                        {steps.map((step, idx) => (
                          <div key={step.num}>
                            <div className="flex items-center gap-4 py-4">
                              {/* 스텝 번호 / 완료 아이콘 / 진행 중 */}
                              <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                                step.done
                                  ? "bg-accent-success text-white"
                                  : (step as any).inProgress
                                    ? "bg-accent-warning/20 text-accent-warning border-2 border-accent-warning/50"
                                    : "bg-bg-tertiary text-text-tertiary border-2 border-bg-elevated"
                              }`}>
                                {step.done ? <Check className="h-4 w-4" /> : step.num}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-text-primary">{step.title}</p>
                                  {/* 진행 중 뱃지 */}
                                  {(step as any).inProgress && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-accent-warning bg-accent-warning/10 rounded-full">
                                      <span className="w-1.5 h-1.5 rounded-full bg-accent-warning animate-pulse" />
                                      진행 중
                                    </span>
                                  )}
                                </div>
                                <p className={`text-sm mt-0.5 ${
                                  step.done
                                    ? "text-accent-success"
                                    : (step as any).inProgress
                                      ? "text-accent-warning/80"
                                      : "text-text-secondary"
                                }`}>
                                  {step.desc}
                                </p>
                              </div>

                              {/* 액션 버튼 */}
                              {step.action}
                            </div>

                            {/* 구분선 (마지막 제외) */}
                            {idx < steps.length - 1 && (
                              <div className="flex items-stretch gap-4">
                                <div className="flex justify-center w-9 flex-shrink-0">
                                  <div className={`w-0.5 h-4 ${step.done ? "bg-accent-success/40" : "bg-bg-elevated"}`} />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Riot 계정 연동 모달 */}
              <AddAccountModal
                isOpen={showRiotModal}
                onClose={() => setShowRiotModal(false)}
                onAccountAdded={() => {
                  fetchAccounts();
                  fetchUser();
                  setShowRiotModal(false);
                }}
              />
              </div>
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

      {/* 이의신청 모달 */}
      {isAppealModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-secondary rounded-xl p-6 w-full max-w-md shadow-xl border border-bg-tertiary">
            <h2 className="text-lg font-bold text-text-primary mb-2">이의신청</h2>
            <p className="text-sm text-text-secondary mb-4">
              제재에 이의가 있으시면 사유를 상세히 작성해주세요.
              관리자 심사 후 처리 결과를 알려드립니다.
            </p>
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              maxLength={1000}
              rows={5}
              placeholder="이의신청 사유를 입력해주세요. (최대 1000자)"
              className="w-full bg-bg-primary border border-bg-tertiary rounded-lg p-3 text-sm text-text-primary resize-none focus:outline-none focus:border-accent-primary"
            />
            <p className="text-xs text-text-tertiary text-right mt-1">{appealReason.length}/1000</p>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setIsAppealModalOpen(false); setAppealReason(""); }}
                disabled={isSubmittingAppeal}
              >
                취소
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmitAppeal}
                disabled={isSubmittingAppeal || !appealReason.trim()}
              >
                {isSubmittingAppeal ? "제출 중..." : "제출하기"}
              </Button>
            </div>
          </div>
        </div>
      )}
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
