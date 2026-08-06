"use client";

import { GuidedTour, type GuidedTourStep } from "./GuidedTour";
import { useAuthStore } from "@/stores/auth-store";
import {
  getUserOnboardingStorageKey,
  TOURNAMENTS_TOUR_STORAGE_KEY,
} from "@/lib/onboarding";

const STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="tournaments-filters"]',
    eyebrow: "내전 목록 가이드",
    title: "원하는 방만 빠르게 찾으세요",
    description:
      "대기 중인 방, 팀 구성 방식, 참가 가능 여부를 선택하거나 방 이름과 방장으로 검색할 수 있습니다.",
  },
  {
    selector: '[data-tour="tournaments-results"]',
    eyebrow: "내전 목록 가이드",
    title: "방을 선택하면 로비로 이동해요",
    description:
      "인원과 진행 방식을 확인한 뒤 원하는 방을 누르세요. 비공개 방은 비밀번호가 필요합니다.",
  },
  {
    selector: '[data-tour="tournaments-create"]',
    eyebrow: "내전 목록 가이드",
    title: "원하는 방이 없다면 직접 만드세요",
    description:
      "방 생성에서 정원, 팀 구성 방식, 공개 여부를 정할 수 있습니다.",
  },
];

export function TournamentsTour() {
  const userId = useAuthStore((state) => state.user?.id);
  if (!userId) return null;

  return (
    <GuidedTour
      ariaLabel="내전 목록 사용 가이드"
      steps={STEPS}
      storageKey={getUserOnboardingStorageKey(
        TOURNAMENTS_TOUR_STORAGE_KEY,
        userId,
      )}
      startDelay={700}
    />
  );
}
