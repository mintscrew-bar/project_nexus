"use client";

import type { GameTitle } from "@nexus/types";
import { GuidedTour, type GuidedTourStep } from "./GuidedTour";
import { useAuthStore } from "@/stores/auth-store";
import {
  getUserOnboardingStorageKey,
  LOBBY_TOUR_STORAGE_KEY,
} from "@/lib/onboarding";

const EYEBROW = "로비 가이드";

/*
 * 로비 안내.
 *
 * 시작 조건 문안은 서버 startGame(room.service)·경매/스네이크 시작 검증과
 * 로비 화면의 canStart 계산을 그대로 옮겼다. 음성 채널 검사는
 * discord-voice.service validateVoicePresence 기준이다 — "준비한 참가자"만
 * 보고, 봇이 채널을 조회하지 못하면 검사를 건너뛴다.
 *
 * 게임마다 팀 인원(롤 5명, 배그 4명)과 "정원이 꽉 차야 하는가"가 달라서
 * 해당 단계만 게임별로 갈린다.
 */

/** 시작 조건 — 게임마다 숫자와 규칙이 다르다 */
const START_RULES: Record<GameTitle, string> = {
  LOL: "방장만 시작할 수 있고, 선수 전원이 준비해야 합니다. 자동 밸런스와 자유 팀 선택은 정원이 꽉 차야 하고, 자유 팀 선택은 팀마다 5명씩 맞아야 합니다. 경매는 최소 4명, 스네이크는 최소 10명이면 정원이 덜 차도 시작됩니다.",
  PUBG: "방장만 시작할 수 있고, 선수 전원이 준비해야 합니다. 배그는 어떤 편성 방식이든 정원이 꽉 차야 시작되고, 자유 팀 선택은 스쿼드마다 4명씩 맞아야 합니다.",
};

/** 입장 규칙 — 필요한 게임 계정만 다르다 */
const JOIN_ACCOUNT: Record<GameTitle, string> = {
  LOL: "Riot 계정",
  PUBG: "PUBG 계정",
};

function buildSteps(game: GameTitle): GuidedTourStep[] {
  return [
    {
      selector: '[data-tour="lobby-participants"]',
      eyebrow: EYEBROW,
      title: "참가자와 팀 구성을 확인하세요",
      description:
        "참가 인원과 각자의 준비 상태를 볼 수 있습니다. 카드의 스피커 표시가 초록색이면 Discord 대기실 음성 채널에 들어와 있고, 흐리게 꺼져 있으면 아직 안 들어온 것입니다. 자유 팀 선택 방식에서는 여기서 원하는 팀을 고릅니다.",
    },
    {
      selector: '[data-tour="lobby-ready-status"]',
      eyebrow: EYEBROW,
      title: "준비 현황에서 막힌 곳을 확인하세요",
      description:
        "전체·준비·대기 인원과 함께, 지금 시작이 안 되는 이유가 한 줄로 표시됩니다. 조건이 다 갖춰지면 초록색 '시작 가능'으로 바뀝니다.",
    },
    {
      // 로비 화면 안에 음성 채널 자체가 없어서 가운데 말풍선으로 띄운다.
      eyebrow: EYEBROW,
      title: "Discord 대기실 음성 채널에 들어가세요",
      description:
        "방이 만들어지면 Discord 서버에 『방 제목』 카테고리와 '── 대기실 ──' 음성 채널이 생깁니다. 준비를 누른 사람은 전원 이 채널에 들어와 있어야 방장이 시작할 수 있고, 빠진 사람이 있으면 이름이 안내됩니다. 팀이 정해지면 봇이 팀별 음성 채널로 옮겨 줍니다.",
    },
    {
      selector: '[data-tour="lobby-ready-action"]',
      eyebrow: EYEBROW,
      title: "준비를 누르세요",
      description:
        "참가 준비가 끝나면 '준비 완료하기'를 누르세요. 다시 누르면 취소됩니다. 자유 팀 선택 방식은 팀을 먼저 골라야 준비할 수 있고, 관전자는 준비 없이 지켜봅니다.",
    },
    {
      selector: '[data-tour="lobby-ready-status"]',
      eyebrow: EYEBROW,
      title: "시작 조건",
      description: START_RULES[game],
    },
    {
      eyebrow: EYEBROW,
      title: "입장과 관전",
      description: `방에 들어오려면 Discord 연동이 필요하고, 선수로 참가하려면 ${JOIN_ACCOUNT[game]}도 있어야 합니다. 관전자는 정원과 팀 편성에서 빠지며, 관전 허용 방이 만석이면 새로 들어온 사람은 자동으로 관전자가 됩니다. 다른 대기 방에 있다가 이 방에 들어오면 이전 방에서는 자동으로 나가집니다.`,
    },
    {
      selector: '[data-tour="lobby-chat"]',
      eyebrow: EYEBROW,
      title: "진행 이야기는 로비 채팅에서",
      description:
        "포지션이나 진행 방식을 여기서 조율하세요. 채팅은 방에 있는 사람 모두에게 보이고, 음성 진행은 Discord 채널에서 합니다.",
    },
  ];
}

// GuidedTour 는 steps 참조가 바뀌면 시작 로직을 다시 돌리므로 게임마다 한 번만 만든다.
const STEPS: Record<GameTitle, GuidedTourStep[]> = {
  LOL: buildSteps("LOL"),
  PUBG: buildSteps("PUBG"),
};

export function LobbyTour({ gameTitle }: { gameTitle?: GameTitle }) {
  const userId = useAuthStore((state) => state.user?.id);
  if (!userId) return null;

  return (
    <GuidedTour
      ariaLabel="내전 로비 사용 가이드"
      steps={STEPS[gameTitle ?? "LOL"] ?? STEPS.LOL}
      storageKey={getUserOnboardingStorageKey(LOBBY_TOUR_STORAGE_KEY, userId)}
      startDelay={900}
    />
  );
}
