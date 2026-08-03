"use client";

import { GuidedTour, type GuidedTourStep } from "./GuidedTour";
import { useAuthStore } from "@/stores/auth-store";
import {
  getUserOnboardingStorageKey,
  LOBBY_TOUR_STORAGE_KEY,
  TOURNAMENTS_TOUR_STORAGE_KEY,
} from "@/lib/onboarding";

const STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="lobby-participants"]',
    eyebrow: "로비 가이드",
    title: "참가자와 팀 구성을 확인하세요",
    description:
      "현재 참가 인원과 준비 상태를 볼 수 있습니다. 자유 팀 선택 방식에서는 원하는 팀도 여기서 고릅니다.",
  },
  {
    selector: '[data-tour="lobby-ready-status"]',
    eyebrow: "로비 가이드",
    title: "시작 조건을 확인하세요",
    description:
      "정원, 팀 편성, 준비 인원과 Discord 음성 채널 상태를 확인할 수 있습니다.",
  },
  {
    selector: '[data-tour="lobby-ready-action"]',
    eyebrow: "로비 가이드",
    title: "참가 준비가 끝나면 준비하세요",
    description:
      "역할과 팀 선택을 마친 뒤 준비하기를 누르세요. 모든 조건이 갖춰지면 방장이 내전을 시작합니다.",
  },
  {
    selector: '[data-tour="lobby-chat"]',
    eyebrow: "로비 가이드",
    title: "진행 관련 이야기는 로비 채팅에서",
    description:
      "참가자들과 포지션이나 진행 방식을 조율할 수 있습니다. 음성 진행은 Discord 채널을 이용하세요.",
  },
];

export function LobbyTour() {
  const userId = useAuthStore((state) => state.user?.id);
  if (!userId) return null;

  return (
    <GuidedTour
      ariaLabel="내전 로비 사용 가이드"
      steps={STEPS}
      storageKey={getUserOnboardingStorageKey(
        LOBBY_TOUR_STORAGE_KEY,
        userId,
      )}
      prerequisiteStorageKey={getUserOnboardingStorageKey(
        TOURNAMENTS_TOUR_STORAGE_KEY,
        userId,
      )}
      startDelay={900}
    />
  );
}
