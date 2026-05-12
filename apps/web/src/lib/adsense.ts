// AdSense 설정 — 승인 후 콘솔에서 발급받은 슬롯 ID로 교체
// 빈 문자열이면 <AdSlot />이 아무것도 렌더링하지 않음 (안전)
export const ADSENSE_CLIENT = "ca-pub-9854590549377922";

export const ADSENSE_SLOTS = {
  // 메인 랜딩 페이지 — features 섹션과 운영 섹션 사이
  landingMid: "",
  // 실험실(통계) — 챔피언 리스트 상단
  labTop: "",
  // 유저 프로필 — 페이지 하단
  profileBottom: "",
} as const;

export type AdSlotKey = keyof typeof ADSENSE_SLOTS;
