"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { userApi } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label, LoadingSpinner, StatusSelector, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { usePresence } from "@/hooks/usePresence";
import { User, Bell, Shield, Palette, LogOut, Check, Camera } from "lucide-react";

type SettingsTab = "profile" | "notifications" | "privacy" | "appearance";

interface UserSettings {
  notifyMatchStart: boolean;
  notifyMatchResult: boolean;
  notifyClanActivity: boolean;
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
    notifyMatchStart: true,
    notifyMatchResult: true,
    notifyClanActivity: true,
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
            notifyMatchStart: data.notifyMatchStart ?? true,
            notifyMatchResult: data.notifyMatchResult ?? true,
            notifyClanActivity: data.notifyClanActivity ?? true,
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
                      <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                        <div>
                          <p className="font-medium text-text-primary">매치 시작 알림</p>
                          <p className="text-sm text-text-secondary">매치가 시작될 때 알림을 받습니다</p>
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
                          <p className="font-medium text-text-primary">매치 결과 알림</p>
                          <p className="text-sm text-text-secondary">매치 결과가 등록되었을 때 알림</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.notifyMatchResult}
                          onChange={(e) => handleSettingChange("notifyMatchResult", e.target.checked)}
                          className="w-5 h-5 accent-accent-primary cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <div>
                          <p className="font-medium text-text-primary">클랜 활동 알림</p>
                          <p className="text-sm text-text-secondary">클랜 관련 활동 알림을 받습니다</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.notifyClanActivity}
                          onChange={(e) => handleSettingChange("notifyClanActivity", e.target.checked)}
                          className="w-5 h-5 accent-accent-primary cursor-pointer"
                        />
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
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
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
