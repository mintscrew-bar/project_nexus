import { create } from "zustand";

const ENABLED_KEY = "nexus:sfx-enabled";
const VOLUME_KEY = "nexus:sfx-volume";
const DEFAULT_VOLUME = 0.7;

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

function readVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const stored = Number(raw);
    return Number.isFinite(stored) ? clampVolume(stored) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장이 막힌 환경에서는 현재 탭의 상태만 유지한다.
  }
}

interface SfxState {
  enabled: boolean;
  volume: number;
  hydrated: boolean;
  hydrate: () => void;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setVolume: (volume: number) => void;
}

export const useSfxStore = create<SfxState>((set, get) => ({
  enabled: true,
  volume: DEFAULT_VOLUME,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ enabled: readEnabled(), volume: readVolume(), hydrated: true });
  },

  setEnabled: (enabled) => {
    write(ENABLED_KEY, enabled ? "1" : "0");
    set({ enabled });
  },

  toggleEnabled: () => get().setEnabled(!get().enabled),

  setVolume: (volume) => {
    const nextVolume = clampVolume(volume);
    write(VOLUME_KEY, String(nextVolume));
    set({ volume: nextVolume });
  },
}));

export const SFX_ENABLED_STORAGE_KEY = ENABLED_KEY;
export const SFX_VOLUME_STORAGE_KEY = VOLUME_KEY;
