export const ONBOARDING_MODAL_STORAGE_KEY = "nexus:onboarding-seen-v1";
export const HOME_TOUR_STORAGE_KEY = "nexus:home-tour-seen-v1";
export const TOURNAMENTS_TOUR_STORAGE_KEY = "nexus:tournaments-tour-seen-v1";
export const LOBBY_TOUR_STORAGE_KEY = "nexus:lobby-tour-seen-v1";

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
  ];

  baseKeys.forEach((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(getUserOnboardingStorageKey(key, userId));
  });
}
