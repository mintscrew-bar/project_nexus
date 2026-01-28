"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label, LoadingSpinner } from "@/components/ui";
import { User, Bell, Shield, Palette, LogOut } from "lucide-react";

type SettingsTab = "profile" | "notifications" | "privacy" | "appearance";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [isSaving, setIsSaving] = useState(false);

  // Profile form state
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

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
    try {
      // TODO: Implement profile update API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      alert("프로필이 저장되었습니다.");
    } catch (error) {
      alert("프로필 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    if (confirm("로그아웃 하시겠습니까?")) {
      await logout();
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
                    onClick={handleLogout}
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
                    <div className="w-20 h-20 rounded-full bg-bg-tertiary flex items-center justify-center overflow-hidden">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-10 w-10 text-text-tertiary" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">{user.username}</p>
                      <p className="text-sm text-text-secondary">{user.email}</p>
                    </div>
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

                  <div className="flex justify-end">
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
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">내전 초대 알림</p>
                      <p className="text-sm text-text-secondary">내전 초대를 받았을 때 알림</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-accent-primary" />
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">경매/드래프트 알림</p>
                      <p className="text-sm text-text-secondary">경매 또는 드래프트 시작 시 알림</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-accent-primary" />
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-text-primary">매치 결과 알림</p>
                      <p className="text-sm text-text-secondary">매치 결과가 등록되었을 때 알림</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-accent-primary" />
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "privacy" && (
              <Card>
                <CardHeader>
                  <CardTitle>개인정보 설정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">프로필 공개</p>
                      <p className="text-sm text-text-secondary">다른 사용자가 내 프로필을 볼 수 있음</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-accent-primary" />
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-bg-tertiary">
                    <div>
                      <p className="font-medium text-text-primary">전적 공개</p>
                      <p className="text-sm text-text-secondary">내전 전적을 공개합니다</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-accent-primary" />
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-text-primary">온라인 상태 표시</p>
                      <p className="text-sm text-text-secondary">접속 중일 때 온라인 상태를 표시합니다</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-accent-primary" />
                  </div>
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
                      <button className="p-4 rounded-lg border-2 border-accent-primary bg-bg-tertiary">
                        <div className="h-8 bg-gray-900 rounded mb-2" />
                        <p className="text-sm text-text-primary">다크</p>
                      </button>
                      <button className="p-4 rounded-lg border-2 border-bg-tertiary bg-bg-tertiary hover:border-accent-primary transition-colors">
                        <div className="h-8 bg-gray-100 rounded mb-2" />
                        <p className="text-sm text-text-primary">라이트</p>
                      </button>
                      <button className="p-4 rounded-lg border-2 border-bg-tertiary bg-bg-tertiary hover:border-accent-primary transition-colors">
                        <div className="h-8 bg-gradient-to-r from-gray-900 to-gray-100 rounded mb-2" />
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
    </div>
  );
}
