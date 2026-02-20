"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { userApi } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label, LoadingSpinner, StatusSelector, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { usePresence } from "@/hooks/usePresence";
import { User, Bell, Shield, Palette, LogOut, Check, Camera, Info, ChevronDown } from "lucide-react";

type SettingsTab = "profile" | "notifications" | "privacy" | "appearance" | "about";

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
  allowFriendRequests: boolean;
  theme: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();
  const { myStatus, setStatus } = usePresence();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form state
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

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
    allowFriendRequests: true,
    theme: "dark",
  });
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (user) {
      setUsername(user.username || "");
      setBio(user.bio || "");
    }
  }, [user]);

  // Fetch settings
  useEffect(() => {
    if (isAuthenticated) {
      userApi.getSettings()
        .then((data) => {
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
            allowFriendRequests: data.allowFriendRequests ?? true,
            theme: data.theme ?? "dark",
          });
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

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await userApi.updateProfile({ username, bio });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      addToast("프로필이 저장되었습니다.", "success");
    } catch (error) {
      console.error("Profile update error:", error);
      addToast("프로필 저장에 실패했습니다.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSettingChange = async (key: keyof UserSettings, value: boolean | string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      await userApi.updateSettings({ [key]: value });
    } catch (error) {
      console.error("Settings update error:", error);
      // Revert on error
      setSettings(settings);
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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      addToast("지원하지 않는 이미지 형식입니다. (jpg, png, gif, webp만 가능)", "error");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      addToast("이미지 크기는 5MB 이하여야 합니다.", "error");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setIsUploadingAvatar(true);
    try {
      const response = await userApi.uploadAvatar(file);
      addToast("프로필 사진이 변경되었습니다.", "success");
      // Update the auth store with new avatar URL
      if (response.avatarUrl) {
        // The avatar URL needs to be resolved to full URL for display
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        setAvatarPreview(`${apiUrl}${response.avatarUrl}`);
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      addToast("프로필 사진 업로드에 실패했습니다.", "error");
      setAvatarPreview(null);
    } finally {
      setIsUploadingAvatar(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const tabs = [
    { id: "profile" as const, label: "프로필", icon: User },
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
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Content */}
          <div className="md:col-span-3">
            {activeTab === "profile" && (
              <Card>
                <CardHeader>
                  <CardTitle>프로필 설정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <div className="w-20 h-20 rounded-full bg-bg-tertiary flex items-center justify-center overflow-hidden relative">
                        {(avatarPreview || user.avatar) ? (
                          <Image
                            src={avatarPreview || user.avatar!}
                            alt={user.username}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <User className="h-10 w-10 text-text-tertiary" />
                        )}
                        {isUploadingAvatar && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <LoadingSpinner size="sm" />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleAvatarClick}
                        disabled={isUploadingAvatar}
                        className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/50 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">{user.username}</p>
                      <p className="text-sm text-text-secondary">{user.email}</p>
                      <button
                        onClick={handleAvatarClick}
                        disabled={isUploadingAvatar}
                        className="text-sm text-accent-primary hover:underline mt-1"
                      >
                        사진 변경
                      </button>
                    </div>
                  </div>

                  {/* Status Selector */}
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">온라인 상태</p>
                      <p className="text-sm text-text-secondary">현재 상태를 설정합니다</p>
                    </div>
                    <StatusSelector
                      currentStatus={myStatus}
                      onStatusChange={(status) => setStatus(status)}
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="username">사용자 이름</Label>
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="사용자 이름"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="bio">자기소개</Label>
                      <textarea
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="자기소개를 입력하세요"
                        rows={4}
                        className="mt-1 w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end items-center gap-3">
                    {saveSuccess && (
                      <span className="text-accent-success flex items-center gap-1">
                        <Check className="h-4 w-4" />
                        저장됨
                      </span>
                    )}
                    <Button onClick={handleSaveProfile} isLoading={isSaving}>
                      저장
                    </Button>
                  </div>
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
                          <p className="text-sm text-text-secondary">내전 전적을 공개합니다</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.showMatchHistory}
                          onChange={(e) => handleSettingChange("showMatchHistory", e.target.checked)}
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
                    <InfoRow label="문의" value="nexus.lol.kr@gmail.com" accent />
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

                <LegalSection
                  title="서비스 이용약관"
                  content={TERMS_OF_SERVICE}
                />
                <LegalSection
                  title="개인정보 처리방침"
                  content={PRIVACY_POLICY}
                />
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
    </div>
  );
}

/* ─── Info row ─── */
function InfoRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-bg-tertiary last:border-b-0">
      <span className="text-text-secondary text-sm">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${accent ? 'text-accent-primary' : 'text-text-primary'}`}>
        {value}
      </span>
    </div>
  );
}

/* ─── Collapsible legal section ─── */
function LegalSection({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="font-semibold text-text-primary">{title}</span>
        <ChevronDown className={`h-5 w-5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
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

/* ─── 서비스 이용약관 ─── */
const TERMS_OF_SERVICE = `최종 수정일: 2026년 2월 20일
시행일: 2026년 2월 20일

제1조 (목적)
본 약관은 Harumaroon(이하 "운영자")이 운영하는 NEXUS(이하 "서비스")의 이용과 관련하여 운영자와 이용자 간의 권리, 의무 및 책임 사항, 기타 필요한 사항을 규정함을 목적으로 합니다.

제2조 (정의)
① "서비스"란 NEXUS 웹 애플리케이션을 통해 제공되는 리그 오브 레전드 내전(커스텀 게임) 매칭, 팀 구성, 경매/드래프트, 대진표 관리, 전적 기록 등 일체의 기능을 말합니다.
② "이용자"란 본 약관에 동의하고 서비스에 회원 가입하여 서비스를 이용하는 자를 말합니다.
③ "Riot 계정 연동"이란 이용자가 본인 소유의 Riot Games 계정 정보를 서비스에 인증하여 연결하는 행위를 말합니다.
④ "내전"이란 서비스를 통해 구성된 참가자들이 리그 오브 레전드 커스텀 게임에서 진행하는 경기를 말합니다.

제3조 (약관의 효력 및 변경)
① 본 약관은 서비스 화면에 게시하거나 기타 합리적인 방법으로 이용자에게 공지함으로써 효력이 발생합니다.
② 운영자는 관련 법령을 위배하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일 7일 전부터 서비스 내에 공지합니다.
③ 이용자가 변경된 약관에 동의하지 않는 경우 서비스 이용을 중단하고 탈퇴할 수 있으며, 변경된 약관의 시행일 이후에도 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 봅니다.

제4조 (서비스 가입)
① 이용자는 서비스가 정한 가입 양식에 따라 회원 정보를 기입한 후 본 약관에 동의함으로써 회원 가입을 신청합니다.
② 서비스는 다음 각 호에 해당하는 가입 신청에 대해 승인을 거부할 수 있습니다.
  1. 타인의 정보를 도용한 경우
  2. 허위 정보를 기재한 경우
  3. 기타 서비스 운영에 지장을 초래하는 경우

제5조 (이용자의 의무)
① 이용자는 다음 행위를 해서는 안 됩니다.
  1. 타인의 개인정보를 도용하거나 허위 정보를 등록하는 행위
  2. 서비스의 운영을 고의로 방해하는 행위
  3. 다른 이용자에 대한 욕설, 비방, 차별, 성희롱 등 불쾌감을 주는 행위
  4. 내전 진행 중 의도적 트롤링, 고의 탈주, 불공정 행위
  5. 서비스를 통해 얻은 정보를 운영자의 동의 없이 상업적으로 이용하는 행위
  6. 서비스의 기술적 취약점을 악용하거나 비정상적인 방법으로 서비스에 접근하는 행위
  7. 기타 관련 법령, 본 약관 또는 서비스 정책에 위반되는 행위
② 이용자가 위 항목을 위반한 경우, 운영자는 경고, 이용 제한, 계정 정지 등의 조치를 취할 수 있습니다.

제6조 (서비스의 제공 및 변경)
① 서비스는 다음과 같은 기능을 제공합니다.
  1. 내전 방 생성 및 참가
  2. 경매 또는 스네이크 드래프트를 통한 팀 구성
  3. 역할(포지션) 선택
  4. 토너먼트 대진표 생성 및 결과 기록
  5. 전적 및 통계 조회
  6. 채팅 기능
  7. 친구 및 클랜 시스템
② 운영자는 서비스의 품질 향상을 위해 기능을 추가, 변경, 중단할 수 있으며, 중요한 변경이 있는 경우 사전에 공지합니다.

제7조 (서비스의 중단)
① 운영자는 다음 각 호의 사유가 발생한 경우 서비스의 전부 또는 일부를 일시적으로 중단할 수 있습니다.
  1. 시스템 정기 점검, 서버 증설 또는 교체
  2. 정전, 천재지변 등 불가항력적 사유
  3. Riot Games API 서비스의 장애 또는 정책 변경
  4. 기타 운영상 합리적 필요가 있는 경우
② 운영자는 서비스 중단 시 가능한 한 사전에 공지하며, 불가피한 경우 사후에 공지할 수 있습니다.

제8조 (지적재산권)
① 서비스의 디자인, 소스 코드, 로고, 텍스트 등 서비스 자체에 관한 저작권 및 지적재산권은 운영자에게 있습니다.
② 이용자가 서비스 내에서 작성한 콘텐츠(채팅, 프로필 정보 등)의 저작권은 해당 이용자에게 귀속됩니다.
③ 리그 오브 레전드, Riot Games 및 관련 로고, 챔피언 이미지 등은 Riot Games, Inc.의 상표 또는 저작물입니다.

제9조 (Riot Games 관련 고지)
① NEXUS isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
② 본 서비스에서 사용하는 게임 데이터는 Riot Games API를 통해 제공되며, Riot Games Developer 정책 및 이용 약관을 준수합니다.
③ 이용자는 서비스를 통해 제공되는 게임 데이터가 Riot Games의 정책 변경에 따라 달라질 수 있음을 이해합니다.

제10조 (면책)
① 운영자는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 대한 책임이 면제됩니다.
② 운영자는 이용자의 귀책사유로 인한 서비스 이용 장애에 대하여 책임을 지지 않습니다.
③ 운영자는 이용자가 서비스를 이용하여 기대하는 이익을 얻지 못하거나 서비스 자료에 대한 취사선택 또는 이용으로 발생하는 손해에 대해 책임을 지지 않습니다.
④ 본 서비스는 비영리 목적으로 운영되며, 서비스 이용 과정에서 발생하는 게임 내 결과에 대해 운영자는 어떠한 책임도 부담하지 않습니다.

제11조 (회원 탈퇴 및 자격 상실)
① 이용자는 서비스에 언제든 탈퇴를 요청할 수 있으며, 서비스는 즉시 회원 탈퇴를 처리합니다.
② 이용자가 다음 각 호의 사유에 해당하는 경우, 서비스는 사전 통보 후 회원 자격을 제한 또는 상실시킬 수 있습니다.
  1. 가입 신청 시 허위 내용을 등록한 경우
  2. 서비스를 이용하여 법령 또는 본 약관이 금지하는 행위를 하는 경우
  3. 다른 이용자의 서비스 이용을 심각하게 방해하는 경우

제12조 (분쟁 해결)
본 약관과 관련하여 발생한 분쟁에 대해 운영자와 이용자는 성실히 협의하여 해결하도록 합니다.

부칙
본 약관은 2026년 2월 20일부터 시행합니다.`;

/* ─── 개인정보 처리방침 ─── */
const PRIVACY_POLICY = `최종 수정일: 2026년 2월 20일
시행일: 2026년 2월 20일

NEXUS(이하 "서비스")는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 본 개인정보 처리방침을 통해 이용자의 개인정보가 어떻게 수집·이용·보관·파기되는지 안내합니다.

1. 수집하는 개인정보 항목 및 수집 방법

가. 회원가입 시 수집 항목
• 필수: 이메일 주소, 사용자 이름(닉네임), 비밀번호(로컬 가입 시)
• 선택: 프로필 사진, 자기소개

나. OAuth(소셜) 로그인 시 수집 항목
• Google 로그인: 이름, 이메일 주소, 프로필 사진
• Discord 로그인: 사용자 이름, 이메일 주소, 프로필 사진, Discord 사용자 ID

다. Riot 계정 연동 시 수집 항목
• 소환사 이름, 태그라인, PUUID
• 게임 티어 및 랭크 정보
• 주 포지션, 부 포지션, 선호 챔피언 목록

라. 서비스 이용 과정에서 자동 수집되는 항목
• 접속 IP 주소, 브라우저 종류 및 버전
• 접속 일시, 서비스 이용 기록
• 쿠키(Cookie) 및 세션 정보

2. 개인정보의 이용 목적
• 회원 식별 및 본인 인증
• 서비스 제공: 내전 매칭, 팀 구성, 전적 기록 등
• 게임 데이터 활용: 공정한 팀 밸런스를 위한 티어·포지션 정보 활용
• 서비스 내 프로필 표시 및 소셜 기능(친구, 클랜)
• 서비스 관련 공지사항 및 알림 전달
• 서비스 개선을 위한 통계 분석 (비식별 처리)
• 부정 이용 방지 및 서비스 안정성 확보

3. 개인정보의 보유 및 이용 기간
• 회원 정보: 회원 탈퇴 시까지
• 서비스 이용 기록: 최종 접속일로부터 1년 (이후 자동 삭제)
• 부정 이용 기록: 해당 제재 종료 후 1년
• 단, 관련 법령에 의해 보존이 필요한 경우 아래 기간 동안 보존합니다.
  - 전자상거래 등에서의 소비자보호에 관한 법률: 계약 또는 청약철회 등에 관한 기록 5년
  - 통신비밀보호법: 로그인 기록 3개월

4. 개인정보의 파기 절차 및 방법
• 보유 기간이 경과하거나 회원 탈퇴 요청 시 지체 없이 해당 개인정보를 파기합니다.
• 전자적 파일 형태: 복구 불가능한 기술적 방법으로 영구 삭제
• 종이 문서: 분쇄기로 분쇄하거나 소각

5. 개인정보의 제3자 제공
서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 다음의 경우는 예외로 합니다.
• 이용자가 사전에 명시적으로 동의한 경우
• 법령의 규정에 의하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우

6. 개인정보의 처리 위탁
서비스는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁하고 있습니다.
• Riot Games API: 게임 데이터 조회 (Riot Games의 개인정보 처리방침에 따름)
해당 위탁 업무의 내용이나 수탁자가 변경될 경우 본 방침을 통해 공지합니다.

7. 이용자 및 법정대리인의 권리와 행사 방법
① 이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다.
② 위 요청은 서비스 내 설정 메뉴 또는 개인정보 보호 책임자에게 이메일로 연락하여 행사할 수 있습니다.
③ 이용자가 개인정보의 삭제를 요청한 경우, 해당 정보를 지체 없이 삭제한 후 삭제 완료 사실을 통지합니다.

8. 개인정보의 안전성 확보 조치
서비스는 개인정보의 안전성 확보를 위해 다음 조치를 취하고 있습니다.
• 비밀번호 암호화: 업계 표준 단방향 암호화 알고리즘을 사용하여 안전하게 저장
• 인증 토큰 보호: 민감 정보가 포함되지 않도록 설계된 인증 체계 적용
• 전송 구간 암호화: 이용자와 서버 간 모든 통신을 암호화하여 전송
• 접근 권한 관리: 개인정보에 대한 접근 권한을 최소한으로 제한
• 정기 점검: 보안 취약점에 대한 정기적 점검 및 업데이트

9. 쿠키(Cookie) 사용
① 서비스는 이용자에게 적절한 서비스를 제공하기 위해 쿠키를 사용합니다.
② 쿠키의 사용 목적: 로그인 상태 유지, 세션 관리
③ 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 서비스 이용에 어려움이 있을 수 있습니다.

10. 개인정보 보호 책임자
서비스의 개인정보 보호 책임자는 다음과 같습니다.
• 책임자: Harumaroon
• 이메일: nexus.lol.kr@gmail.com
이용자는 서비스 이용 중 발생하는 모든 개인정보 관련 문의를 위 이메일을 통해 제기할 수 있으며, 서비스는 이용자의 문의에 성실히 답변합니다.

11. 개인정보 처리방침의 변경
본 개인정보 처리방침이 변경되는 경우, 변경 사항을 서비스 내에 공지하며 변경된 방침은 공지한 날로부터 7일 후에 효력이 발생합니다.`;

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
