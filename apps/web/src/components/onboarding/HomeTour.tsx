"use client";

import { useAuthStore } from "@/stores/auth-store";
import { GuidedTour, type GuidedTourStep } from "./GuidedTour";
import {
  getUserOnboardingStorageKey,
  HOME_TOUR_STORAGE_KEY,
  ONBOARDING_MODAL_CLOSED_EVENT,
  ONBOARDING_MODAL_STORAGE_KEY,
} from "@/lib/onboarding";

const STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="home-active-rooms"]',
    title: "참가할 내전을 찾아보세요",
    description:
      "지금 모집 중인 방이 여기에 표시됩니다. 방을 선택하면 참가자와 진행 방식을 확인할 수 있어요.",
  },
  {
    selector: '[data-tour="home-create-room"]',
    title: "직접 방을 만들 수도 있어요",
    description:
      "원하는 인원과 경매·스네이크·자동 밸런스 같은 팀 구성 방식을 선택해 새 내전을 시작하세요.",
  },
  {
    selector: '[data-tour="home-my-stats"]',
    title: "내전 기록은 여기에 쌓여요",
    description:
      "게임이 끝나면 승률, 포지션, 자주 플레이한 챔피언 기록을 한눈에 확인할 수 있습니다.",
  },
  {
    selector: '[data-tour="user-menu"]',
    title: "내 정보는 프로필에서 관리하세요",
    description:
      "라이엇 계정, 선호 역할과 챔피언, 알림 및 공개 설정을 언제든 변경할 수 있습니다.",
  },
];

export function HomeTour() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id);
  if (!isAuthenticated || !userId) return null;

  return (
    <GuidedTour
      ariaLabel="첫 로그인 메인 화면 가이드"
      steps={STEPS}
      storageKey={getUserOnboardingStorageKey(HOME_TOUR_STORAGE_KEY, userId)}
      prerequisiteStorageKey={getUserOnboardingStorageKey(
        ONBOARDING_MODAL_STORAGE_KEY,
        userId,
      )}
      startEvent={ONBOARDING_MODAL_CLOSED_EVENT}
      startOnMount
    />
  );
}
