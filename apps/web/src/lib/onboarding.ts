export const ONBOARDING_MODAL_STORAGE_KEY = "nexus:onboarding-seen-v1";
export const HOME_TOUR_STORAGE_KEY = "nexus:home-tour-seen-v1";
export const TOURNAMENTS_TOUR_STORAGE_KEY = "nexus:tournaments-tour-seen-v1";
// v2: 음성 채널·시작 조건·입장 규칙 단계를 추가했다(2026-09-21 배포).
// 체크리스트 도입 때 v3 로 올렸다가 되돌렸다 — 바뀐 건 문구 한 줄이라, 전날
// 투어를 본 사람에게 하루 만에 다시 띄울 이유가 없다. 단계가 늘 때만 올린다.
export const LOBBY_TOUR_STORAGE_KEY = "nexus:lobby-tour-seen-v2";
export const ROOM_CREATION_TOUR_STORAGE_KEY =
  "nexus:room-creation-tour-seen-v1";
export const MATCHES_TOUR_STORAGE_KEY = "nexus:matches-tour-seen-v1";
export const RANKING_TOUR_STORAGE_KEY = "nexus:ranking-tour-seen-v1";
export const CLANS_TOUR_STORAGE_KEY = "nexus:clans-tour-seen-v1";
export const STREAMERS_TOUR_STORAGE_KEY = "nexus:streamers-tour-seen-v1";
export const COMMUNITY_TOUR_STORAGE_KEY = "nexus:community-tour-seen-v1";

export const ONBOARDING_MODAL_CLOSED_EVENT = "nexus:onboarding-modal-closed";

export function getUserOnboardingStorageKey(baseKey: string, userId?: string) {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

export function resetOnboardingGuides(userId?: string) {
  const baseKeys = [
    ONBOARDING_MODAL_STORAGE_KEY,
    HOME_TOUR_STORAGE_KEY,
    TOURNAMENTS_TOUR_STORAGE_KEY,
    LOBBY_TOUR_STORAGE_KEY,
    ROOM_CREATION_TOUR_STORAGE_KEY,
    MATCHES_TOUR_STORAGE_KEY,
    RANKING_TOUR_STORAGE_KEY,
    CLANS_TOUR_STORAGE_KEY,
    STREAMERS_TOUR_STORAGE_KEY,
    COMMUNITY_TOUR_STORAGE_KEY,
  ];

  baseKeys.forEach((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(getUserOnboardingStorageKey(key, userId));
  });
}
