// AdSense 설정. 위치별 슬롯이 없으면 공용 슬롯을 사용한다.
// 모든 값이 비어 있으면 <AdSlot />은 아무것도 렌더링하지 않는다.
export const ADSENSE_CLIENT = "ca-pub-4300484040518914";

const DEFAULT_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_DEFAULT?.trim() ?? "";

export const ADSENSE_SLOTS = {
  // 메인 랜딩 페이지의 모든 소개 콘텐츠와 CTA 다음
  landing:
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_LANDING?.trim() || DEFAULT_SLOT,
  // 목록형 공개 페이지(커뮤니티, 내전 목록)의 결과 목록 다음
  feed: process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED?.trim() || DEFAULT_SLOT,
  // 전적 검색 허브의 주요 기능 다음
  matchHub:
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_MATCH_HUB?.trim() || DEFAULT_SLOT,
  // 공개 사용자 프로필의 모든 콘텐츠 다음
  profile:
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_PROFILE?.trim() || DEFAULT_SLOT,
  // 가이드 및 커뮤니티 글의 본문/댓글 다음
  article:
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE?.trim() || DEFAULT_SLOT,
} as const;

export type AdSlotKey = keyof typeof ADSENSE_SLOTS;
