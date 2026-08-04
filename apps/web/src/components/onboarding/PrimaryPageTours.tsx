"use client";

import { useAuthStore } from "@/stores/auth-store";
import {
  CLANS_TOUR_STORAGE_KEY,
  COMMUNITY_TOUR_STORAGE_KEY,
  getUserOnboardingStorageKey,
  MATCHES_TOUR_STORAGE_KEY,
  RANKING_TOUR_STORAGE_KEY,
  STREAMERS_TOUR_STORAGE_KEY,
} from "@/lib/onboarding";
import { GuidedTour, type GuidedTourStep } from "./GuidedTour";

type PageTourProps = {
  ariaLabel: string;
  steps: GuidedTourStep[];
  storageKey: string;
};

function PageTour({ ariaLabel, steps, storageKey }: PageTourProps) {
  const userId = useAuthStore((state) => state.user?.id);
  if (!userId) return null;

  return (
    <GuidedTour
      ariaLabel={ariaLabel}
      steps={steps}
      storageKey={getUserOnboardingStorageKey(storageKey, userId)}
      startDelay={700}
    />
  );
}

const MATCHES_STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="matches-search"]',
    eyebrow: "내전 전적 가이드",
    title: "소환사 또는 NEXUS 유저를 검색하세요",
    description:
      "Riot ID는 게임명#태그 형식으로 입력하세요. NEXUS 유저 검색으로 플랫폼 내 참가자를 바로 찾을 수도 있습니다.",
  },
  {
    selector: '[data-tour="matches-recent"]',
    eyebrow: "내전 전적 가이드",
    title: "최근 검색으로 빠르게 돌아가세요",
    description:
      "이전에 확인한 소환사와 참가자가 기기에 저장되어 반복 검색 없이 전적을 다시 열 수 있습니다.",
  },
  {
    selector: '[data-tour="matches-features"]',
    eyebrow: "내전 전적 가이드",
    title: "내전 기록을 상세하게 분석하세요",
    description:
      "검색 결과에서는 경기별 지표, 챔피언 통계, 포지션 성적과 NEXUS 내전 기록을 확인할 수 있습니다.",
  },
];

const RANKING_STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="ranking-tabs"]',
    eyebrow: "랭킹 가이드",
    title: "개인 랭킹과 클랜 랭킹을 구분해 보세요",
    description:
      "글로벌 탭은 내전 기록이 10경기 이상인 참가자를 기준으로 집계하며, 클랜 탭에서는 클랜 경쟁으로 이동할 수 있습니다.",
  },
  {
    selector: '[data-tour="ranking-results"]',
    eyebrow: "랭킹 가이드",
    title: "참가자를 선택해 상세 전적을 확인하세요",
    description:
      "순위, 승률과 경기 수를 비교하고 참가자 행을 누르면 해당 유저의 전적 페이지로 이동합니다.",
  },
];

const CLANS_STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="clans-filters"]',
    eyebrow: "클랜 가이드",
    title: "조건에 맞는 클랜을 찾으세요",
    description:
      "이름과 태그를 검색하고 활동순, 최소 티어, 모집 여부를 조합해 가입할 클랜을 좁힐 수 있습니다.",
  },
  {
    selector: '[data-tour="clans-roles"]',
    eyebrow: "클랜 가이드",
    title: "모집 포지션으로 한 번 더 필터링하세요",
    description:
      "주 포지션을 모집 중인 클랜만 골라보고 여러 포지션을 동시에 선택할 수 있습니다.",
  },
  {
    selector: '[data-tour="clans-results"]',
    eyebrow: "클랜 가이드",
    title: "카드에서 모집 정보를 확인하세요",
    description:
      "멤버 수, 활동 상태, 최소 티어와 모집 포지션을 확인한 뒤 클랜 상세 또는 가입으로 이어가세요.",
  },
];

const STREAMERS_STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="streamers-intro"]',
    eyebrow: "스트리머 가이드",
    title: "NEXUS 스트리머를 한곳에서 만나보세요",
    description:
      "등록된 파트너와 클랜 방송을 확인하고 현재 라이브 중인 스트리머를 먼저 찾을 수 있습니다.",
  },
  {
    selector: '[data-tour="streamers-list"]',
    eyebrow: "스트리머 가이드",
    title: "방송과 시참 내전으로 바로 이동하세요",
    description:
      "스트리머 카드에서 방송 상태와 진행 중인 내전을 확인하고 팔로우하면 라이브 시작 알림을 받을 수 있습니다.",
  },
];

const COMMUNITY_STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="community-boards"]',
    eyebrow: "커뮤니티 가이드",
    title: "게시판을 선택하세요",
    description:
      "전체 글을 모아보거나 공지, 자유, 모집 등 원하는 게시판으로 바로 전환할 수 있습니다.",
  },
  {
    selector: '[data-tour="community-filters"]',
    eyebrow: "커뮤니티 가이드",
    title: "검색과 정렬로 필요한 글을 찾으세요",
    description:
      "검색어, 인기 태그와 정렬 조건을 조합해 모집 글이나 관심 있는 주제를 빠르게 찾을 수 있습니다.",
  },
  {
    selector: '[data-tour="community-feed"]',
    eyebrow: "커뮤니티 가이드",
    title: "게시글을 읽고 대화에 참여하세요",
    description:
      "카테고리별 최신 글을 확인하고 로그인 후 글쓰기, 댓글과 좋아요로 커뮤니티에 참여할 수 있습니다.",
  },
];

export function MatchesTour() {
  return <PageTour ariaLabel="내전 전적 사용 가이드" steps={MATCHES_STEPS} storageKey={MATCHES_TOUR_STORAGE_KEY} />;
}

export function RankingTour() {
  return <PageTour ariaLabel="랭킹 사용 가이드" steps={RANKING_STEPS} storageKey={RANKING_TOUR_STORAGE_KEY} />;
}

export function ClansTour() {
  return <PageTour ariaLabel="클랜 사용 가이드" steps={CLANS_STEPS} storageKey={CLANS_TOUR_STORAGE_KEY} />;
}

export function StreamersTour() {
  return <PageTour ariaLabel="스트리머 사용 가이드" steps={STREAMERS_STEPS} storageKey={STREAMERS_TOUR_STORAGE_KEY} />;
}

export function CommunityTour() {
  return <PageTour ariaLabel="커뮤니티 사용 가이드" steps={COMMUNITY_STEPS} storageKey={COMMUNITY_TOUR_STORAGE_KEY} />;
}
