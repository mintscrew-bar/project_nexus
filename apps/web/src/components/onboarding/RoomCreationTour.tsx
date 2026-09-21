"use client";

import type { GameTitle } from "@nexus/types";
import { GuidedTour, type GuidedTourStep } from "./GuidedTour";
import { useAuthStore } from "@/stores/auth-store";
import {
  getUserOnboardingStorageKey,
  ROOM_CREATION_TOUR_STORAGE_KEY,
} from "@/lib/onboarding";

const EYEBROW = "방 만들기 가이드";

/*
 * 방 생성 모달 항목별 안내.
 *
 * 문안의 숫자·조건은 전부 서버 검증(room.service createRoom/startGame,
 * auction·snake-draft 시작 조건)과 폼 선택지에서 가져왔다. 둘 중 하나가
 * 바뀌면 여기도 같이 고쳐야 한다.
 *
 * 조건부로만 보이는 칸(경매 설정, 다전제, 킬내기 시간 등)은 대상이 안 보이면
 * GuidedTour 가 화면 가운데에 말풍선을 띄우므로 단계를 빼지 않아도 된다.
 */

/** 두 게임이 문구까지 같은 단계 */
const DISCORD_STEP: GuidedTourStep = {
  selector: '[data-tour="room-create-discord"]',
  eyebrow: EYEBROW,
  title: "Discord 서버",
  description:
    "방을 만들면 이 서버에 『방 제목』 카테고리와 '── 대기실 ──' 음성 채널이 생깁니다. 기본은 넥서스 서버이고, 내 서버에 봇을 추가해 연동했다면 그 서버를 고를 수 있습니다. 이 항목만은 방을 만든 뒤 바꿀 수 없습니다.",
};

const OPTIONS_STEP: GuidedTourStep = {
  selector: '[data-tour="room-create-options"]',
  eyebrow: EYEBROW,
  title: "비공개 방과 관전 허용",
  description:
    "비공개 방은 비밀번호(4자 이상)를 아는 사람만 들어올 수 있습니다. 관전을 허용하면 선수 정원과 별도로 관전자가 들어올 수 있고, 정원이 다 찬 뒤 들어오는 사람은 자동으로 관전자가 됩니다.",
};

function buildLolSteps(): GuidedTourStep[] {
  return [
    {
      selector: '[data-tour="room-create-name"]',
      eyebrow: EYEBROW,
      title: "방 제목",
      description:
        "내전 목록과 Discord 카테고리 이름으로 그대로 쓰입니다(최대 50자). '다이아+ 경매', '즐겜팟'처럼 티어나 분위기를 적어 두면 맞는 사람이 들어옵니다.",
    },
    DISCORD_STEP,
    {
      selector: '[data-tour="room-create-host-role"]',
      eyebrow: EYEBROW,
      title: "방장 참여 방식",
      description:
        "선수로 참가하면 방장도 정원과 팀 편성에 들어갑니다. 운영자로 진행하면 선수 자리 없이 시작·편성·결과 입력만 맡고, Riot 계정이 없어도 방을 만들 수 있습니다.",
    },
    {
      selector: '[data-tour="room-create-size"]',
      eyebrow: EYEBROW,
      title: "참가 인원과 대진 방식",
      description:
        "10명은 5대5 단판, 15·30명은 3팀·6팀 리그전, 20·40명은 4팀·8팀 토너먼트입니다. 토너먼트 정원에서는 진 팀도 패자조에서 한 번 더 싸우는 더블 일리미네이션을 켤 수 있습니다(4팀 6경기, 8팀 14경기).",
    },
    {
      selector: '[data-tour="room-create-series"]',
      eyebrow: EYEBROW,
      title: "다전제",
      description:
        "경기마다 몇 판을 할지 정합니다. 기본은 전 경기 단판이고, '결승만 3판 2선'처럼 뒤로 갈수록 판 수를 늘릴 수도 있습니다. 더블 일리미네이션을 켜면 단판으로 고정됩니다.",
    },
    {
      selector: '[data-tour="room-create-team-mode"]',
      eyebrow: EYEBROW,
      title: "팀 구성 방식",
      description:
        "경매는 팀장이 포인트로 선수를 사고, 스네이크는 팀장이 번갈아 지명합니다. 자동 밸런스는 라인별 실력으로 팀과 역할을 나누고, 자유 팀 선택은 참가자가 직접 팀을 고릅니다. 카드 오른쪽 도움말 버튼에서 방식별 진행을 자세히 볼 수 있습니다.",
    },
    {
      selector: '[data-tour="room-create-team-settings"]',
      eyebrow: EYEBROW,
      title: "경매·드래프트 세부 설정",
      description:
        "경매는 팀장 시작 포인트(500~2,000), 최소 입찰 단위, 입찰 제한 시간(15~60초), 팀장 선정(점수 상위 자동·방장 지명·30초 자원 모집)을 정합니다. 스네이크는 팀장 선정과 픽 제한 시간(30~90초)을 정합니다.",
    },
    {
      selector: '[data-tour="room-create-team-mode"]',
      eyebrow: EYEBROW,
      title: "방식마다 시작 조건이 다릅니다",
      description:
        "자동 밸런스와 자유 팀 선택은 정원이 꽉 차야 시작할 수 있고, 자유 팀 선택은 팀마다 5명씩 맞아야 합니다. 경매는 최소 4명, 스네이크는 최소 10명이면 정원이 덜 차도 시작할 수 있습니다.",
    },
    OPTIONS_STEP,
    {
      selector: '[data-tour="room-create-submit"]',
      eyebrow: EYEBROW,
      title: "확인하고 만들기",
      description:
        "요약 줄에서 설정을 한 번 더 확인하고 방 생성을 누르면 로비로 이동합니다. Discord 연동이 필요하고, 선수로 참가한다면 Riot 계정도 연동돼 있어야 합니다. Discord 서버를 뺀 설정은 시작 전까지 로비의 방 설정에서 바꿀 수 있습니다.",
    },
  ];
}

function buildPubgSteps(): GuidedTourStep[] {
  return [
    {
      selector: '[data-tour="room-create-name"]',
      eyebrow: EYEBROW,
      title: "방 제목",
      description:
        "내전 목록과 Discord 카테고리 이름으로 그대로 쓰입니다(최대 50자). 목록에는 앞에 [스배]·[카배] 표시가 자동으로 붙으니 제목에 따로 적지 않아도 됩니다.",
    },
    {
      selector: '[data-tour="room-create-platform"]',
      eyebrow: EYEBROW,
      title: "플랫폼",
      description:
        "스팀 배그와 카카오 배그는 같은 판에서 만날 수 없어서 방마다 정합니다. 참가자가 어느 쪽으로 들어와야 하는지 목록과 공지에서 바로 보입니다.",
    },
    {
      selector: '[data-tour="room-create-game-mode"]',
      eyebrow: EYEBROW,
      title: "경기 모드",
      description:
        "킬내기는 정해진 시간 동안 킬·사망·치킨 점수를 쌓는 시간제입니다. 배틀로얄 내전은 여러 판의 순위·킬 점수를 합산합니다. 모드를 바꾸면 고를 수 있는 정원이 달라집니다.",
    },
    DISCORD_STEP,
    {
      selector: '[data-tour="room-create-host-role"]',
      eyebrow: EYEBROW,
      title: "방장 참여 방식",
      description:
        "선수로 참가하면 방장도 정원과 스쿼드 편성에 들어갑니다. 운영자로 진행하면 선수 자리 없이 시작·편성·결과 입력만 맡고, PUBG 계정이 없어도 방을 만들 수 있습니다.",
    },
    {
      selector: '[data-tour="room-create-size"]',
      eyebrow: EYEBROW,
      title: "참가 인원",
      description:
        "4인 스쿼드 기준 정원입니다. 킬내기는 8·12·16명, 배틀로얄은 32~100명 중에서 고릅니다. 배그는 어떤 편성 방식이든 정원이 모두 차야 시작할 수 있으니 모을 수 있는 인원으로 잡으세요.",
    },
    {
      selector: '[data-tour="room-create-length"]',
      eyebrow: EYEBROW,
      title: "진행 시간 / 총 경기 수",
      description:
        "킬내기는 진행 시간(30~240분)을 고릅니다. 시간 안에 시작한 판은 끝난 뒤에도 자동으로 집계됩니다. 배틀로얄은 총 경기 수(1~20판)를 적고, 모든 스쿼드가 탈락 없이 전 판에 참가합니다.",
    },
    {
      selector: '[data-tour="room-create-team-mode"]',
      eyebrow: EYEBROW,
      title: "팀 구성 방식",
      description:
        "경매는 팀장이 포인트로 팀원을 사고, 스네이크는 팀장이 번갈아 지명합니다. 자동 밸런스는 NEXUS 편성 점수로 스쿼드를 고르게 나누고, 자유 팀 선택은 참가자가 직접 스쿼드를 고릅니다.",
    },
    {
      selector: '[data-tour="room-create-team-settings"]',
      eyebrow: EYEBROW,
      title: "경매·드래프트 세부 설정",
      description:
        "경매는 시작 포인트, 최소 입찰 단위, 입찰 제한 시간, 팀장 선정 방식을 정합니다. 스네이크는 팀장 선정(랜덤·점수 상위·방장 지명·자원 모집)과 픽 제한 시간을 정합니다. 점수가 없는 계정은 자동 팀장 선정에서 빠집니다.",
    },
    OPTIONS_STEP,
    {
      selector: '[data-tour="room-create-submit"]',
      eyebrow: EYEBROW,
      title: "확인하고 만들기",
      description:
        "요약 줄에서 설정을 한 번 더 확인하고 방 생성을 누르면 로비로 이동합니다. Discord 연동이 필요하고, 선수로 참가한다면 PUBG 계정도 등록돼 있어야 합니다. Discord 서버를 뺀 설정은 시작 전까지 로비의 방 설정에서 바꿀 수 있습니다.",
    },
  ];
}

// 게임마다 한 번만 만든다. GuidedTour 는 steps 참조가 바뀌면 시작 로직을
// 다시 돌리므로 렌더마다 새 배열을 넘기면 안 된다.
const STEPS: Record<GameTitle, GuidedTourStep[]> = {
  LOL: buildLolSteps(),
  PUBG: buildPubgSteps(),
};

/**
 * 방 생성 모달이 처음 열릴 때 항목별로 짚어 주는 투어.
 * 모달 안에서 렌더돼 모달이 열릴 때 마운트되고, 닫으면 같이 사라진다.
 */
export function RoomCreationTour({ gameTitle }: { gameTitle: GameTitle }) {
  const userId = useAuthStore((state) => state.user?.id);
  if (!userId) return null;

  return (
    <GuidedTour
      ariaLabel="방 만들기 사용 가이드"
      steps={STEPS[gameTitle] ?? STEPS.LOL}
      storageKey={getUserOnboardingStorageKey(
        ROOM_CREATION_TOUR_STORAGE_KEY,
        userId,
      )}
      // 모달 등장 애니메이션이 끝난 뒤 자리를 잡아야 강조 테두리가 어긋나지 않는다.
      startDelay={600}
    />
  );
}
