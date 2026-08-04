"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth-store";
import { userApi } from "@/lib/api-client";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";
import { AddAccountModal } from "@/components/domain/AddAccountModal";
import { Check, Gamepad2, MessageSquare, UserRoundCheck } from "lucide-react";
import {
  getUserOnboardingStorageKey,
  ONBOARDING_MODAL_CLOSED_EVENT,
  ONBOARDING_MODAL_STORAGE_KEY,
} from "@/lib/onboarding";

export function OnboardingGuideModal() {
  const { user, isAuthenticated, fetchUser } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  // 첫 방문(미열람) + 로그인 상태일 때만 자동 노출
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (typeof window === "undefined") return;
    // 계정에 기록된 확인 이력이 최우선 — 기기·브라우저가 바뀌어도 다시 뜨지 않는다.
    // (Riot 계정과 주 라인을 이미 등록한 기존 유저도 서버에서 확인 완료로 판정한다)
    const userStorageKey = getUserOnboardingStorageKey(
      ONBOARDING_MODAL_STORAGE_KEY,
      user.id,
    );
    if (user.onboardingSeen) {
      // 서버에 완료 이력만 있는 사용자는 로컬 선행 조건이 없어 후속 투어가 시작되지 않았다.
      if (!window.localStorage.getItem(userStorageKey)) {
        window.localStorage.setItem(userStorageKey, "1");
        window.dispatchEvent(new Event(ONBOARDING_MODAL_CLOSED_EVENT));
      }
      return;
    }
    const accountCreatedAt = user.createdAt
      ? new Date(user.createdAt).getTime()
      : Number.NaN;
    const isNewAccount =
      Number.isFinite(accountCreatedAt) &&
      Date.now() - accountCreatedAt < 24 * 60 * 60 * 1000;
    const seen =
      window.localStorage.getItem(userStorageKey) ||
      (!isNewAccount &&
        window.localStorage.getItem(ONBOARDING_MODAL_STORAGE_KEY));
    if (!seen) setIsOpen(true);
  }, [isAuthenticated, user?.createdAt, user?.id, user?.onboardingSeen]);

  // 모달이 실제로 열릴 때만 Riot 연동 상태를 조회한다.
  // /auth/me는 최소 필드만 반환해 user.riotAccounts가 없으므로, 단계 완료 표시에 쓸 수 없다.
  const [riotAccounts, setRiotAccounts] = useState<any[]>([]);
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    let cancelled = false;
    userApi
      .getProfile(user.id)
      .then((profile) => {
        if (!cancelled) setRiotAccounts(profile?.riotAccounts ?? []);
      })
      .catch(() => {
        // 조회 실패 시 완료 뱃지만 표시되지 않는다. 온보딩 진행에는 영향 없음.
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.id]);

  const close = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        getUserOnboardingStorageKey(ONBOARDING_MODAL_STORAGE_KEY, user?.id),
        "1",
      );
      window.dispatchEvent(new Event(ONBOARDING_MODAL_CLOSED_EVENT));
    }
    // 계정 기준으로도 기록해 다른 기기에서 다시 뜨지 않게 한다. 실패해도 진행을 막지 않는다.
    userApi.updateSettings({ onboardingSeen: true }).catch(() => {});
    setIsOpen(false);
  };

  // 라이엇 계정 + 역할 등록 완료 여부 (디스코드는 로그인 = 이미 연동이므로 제외)
  const hasRiot = riotAccounts.length > 0;
  const primaryRiot = riotAccounts[0];
  const hasRoles = !!primaryRiot?.mainRole;
  const accountDone = hasRiot && hasRoles;

  if (!isOpen) return null;

  return (
    <>
      <Modal isOpen={isOpen && !addAccountOpen} onClose={close} size="md" showCloseButton={false}>
        <div className="px-1 py-1">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-primary/10">
              <Gamepad2 className="h-7 w-7 text-accent-primary" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-text-primary">
              {user?.username}님, 환영합니다!
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              내전에 참여하기 전 필요한 준비만 확인하고,
              <br className="hidden sm:block" /> 메인 화면에서 실제 기능을 함께 둘러볼게요.
            </p>
          </div>

          <div className="mb-6 space-y-3">
            <div className="rounded-xl border border-bg-tertiary bg-bg-primary/50 p-4">
              <div className="flex items-start gap-3">
                <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-primary/10">
                  <UserRoundCheck className="h-5 w-5 text-accent-primary" />
                  {accountDone && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-success">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-text-primary">
                      라이엇 계정과 역할
                    </h3>
                    {accountDone && (
                      <span className="text-xs font-semibold text-accent-success">준비 완료</span>
                    )}
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-text-secondary">
                    티어와 주·부 포지션은 팀 구성과 자동 밸런싱에 사용됩니다.
                  </p>
                  <Button
                    size="sm"
                    variant={accountDone ? "outline" : "primary"}
                    onClick={() => setAddAccountOpen(true)}
                  >
                    {accountDone ? "계정 및 역할 확인" : "라이엇 계정 연동하기"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-bg-tertiary bg-bg-primary/50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10">
                  <MessageSquare className="h-5 w-5 text-[#7289DA]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 text-sm font-bold text-text-primary">
                    Discord 음성 진행
                  </h3>
                  <p className="mb-3 text-xs leading-relaxed text-text-secondary">
                    내전 공지와 팀 음성 채널 이동은 NEXUS Discord에서 진행됩니다.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(
                        NEXUS_DISCORD_INVITE_URL,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Discord 참여하기
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-bg-tertiary pt-4">
            <button
              onClick={close}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              나중에 보기
            </button>
            <Button size="sm" onClick={close}>
              메인 화면 둘러보기
            </Button>
          </div>
        </div>
      </Modal>

      {/* 1단계: 라이엇 계정 + 역할 + 챔피언 등록 (온보딩 위에 겹쳐 열림) */}
      <AddAccountModal
        isOpen={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onAccountAdded={() => {
          setAddAccountOpen(false);
          // 완료 뱃지 갱신을 위해 유저 정보 재조회
          fetchUser().catch(() => {});
        }}
      />
    </>
  );
}
