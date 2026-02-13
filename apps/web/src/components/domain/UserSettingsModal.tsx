"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/stores/auth-store";
import { userApi } from "@/lib/api-client";
import { Modal, Button, LoadingSpinner, StatusSelector } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { usePresence } from "@/hooks/usePresence";
import { User, Bell, Shield, Palette } from "lucide-react";

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

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { user, isAuthenticated } = useAuthStore();
  const { myStatus, setStatus } = usePresence();
  const { setTheme: setNextTheme } = useTheme();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

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

  // Fetch settings when modal opens
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      setSettingsLoading(true);
      userApi.getSettings()
        .then((data) => {
          const theme = data.theme ?? "dark";
          setSettings({
            notifyMatchStart: data.notifyMatchStart ?? true,
            notifyMatchResult: data.notifyMatchResult ?? true,
            notifyClanActivity: data.notifyClanActivity ?? true,
            showOnlineStatus: data.showOnlineStatus ?? true,
            showMatchHistory: data.showMatchHistory ?? true,
            allowFriendRequests: data.allowFriendRequests ?? true,
            theme,
          });
          // 서버에 저장된 테마를 클라이언트에도 동기화
          setNextTheme(theme);
        })
        .catch((err) => {
          console.error("Failed to fetch settings:", err);
        })
        .finally(() => {
          setSettingsLoading(false);
        });
    }
  }, [isOpen, isAuthenticated]);

  const handleSettingChange = async (key: keyof UserSettings, value: boolean | string) => {
    const prevSettings = { ...settings };
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // 테마 변경 시 즉시 클라이언트에 적용
    if (key === "theme" && typeof value === "string") {
      setNextTheme(value);
    }

    try {
      await userApi.updateSettings({ [key]: value });
      addToast("설정이 저장되었습니다.", "success");
    } catch (error) {
      console.error("Settings update error:", error);
      setSettings(prevSettings);
      // 테마 변경 실패 시 이전 테마로 롤백
      if (key === "theme") {
        setNextTheme(prevSettings.theme);
      }
      addToast("설정 저장에 실패했습니다.", "error");
    }
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  const tabs = [
    { id: "profile" as const, label: "상태", icon: User },
    { id: "notifications" as const, label: "알림", icon: Bell },
    { id: "privacy" as const, label: "개인정보", icon: Shield },
    { id: "appearance" as const, label: "테마", icon: Palette },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="빠른 설정" size="lg">
      <div className="flex gap-4 min-h-[400px]">
        {/* Sidebar */}
        <div className="w-32 flex-shrink-0 border-r border-bg-tertiary pr-4">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                  activeTab === tab.id
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-text-secondary hover:bg-bg-tertiary"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-grow">
          {settingsLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {activeTab === "profile" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-text-primary mb-4">온라인 상태</h3>
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">현재 상태</p>
                      <p className="text-sm text-text-secondary">다른 사용자에게 표시되는 상태</p>
                    </div>
                    <StatusSelector
                      currentStatus={myStatus}
                      onStatusChange={(status) => setStatus(status)}
                    />
                  </div>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-text-primary mb-4">알림 설정</h3>
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">매치 시작 알림</p>
                      <p className="text-sm text-text-secondary">매치가 시작될 때 알림</p>
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
                      <p className="text-sm text-text-secondary">매치 결과 등록 시 알림</p>
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
              )}

              {activeTab === "privacy" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-text-primary mb-4">개인정보 설정</h3>
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">온라인 상태 표시</p>
                      <p className="text-sm text-text-secondary">접속 상태 공개 여부</p>
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
                      <p className="text-sm text-text-secondary">내전 전적 공개 여부</p>
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
                      <p className="text-sm text-text-secondary">친구 요청 수신 여부</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.allowFriendRequests}
                      onChange={(e) => handleSettingChange("allowFriendRequests", e.target.checked)}
                      className="w-5 h-5 accent-accent-primary cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {activeTab === "appearance" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-text-primary mb-4">테마 설정</h3>
                  <div className="grid grid-cols-3 gap-3">
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
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end mt-6 pt-4 border-t border-bg-tertiary">
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </div>
    </Modal>
  );
}
