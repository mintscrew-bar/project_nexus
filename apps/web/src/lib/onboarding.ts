export const ONBOARDING_MODAL_STORAGE_KEY = "nexus:onboarding-seen-v1";
export const HOME_TOUR_STORAGE_KEY = "nexus:home-tour-seen-v1";
export const TOURNAMENTS_TOUR_STORAGE_KEY = "nexus:tournaments-tour-seen-v1";
export const LOBBY_TOUR_STORAGE_KEY = "nexus:lobby-tour-seen-v1";
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
