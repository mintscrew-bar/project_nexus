import { create } from "zustand";
import {
  BGM_DEFAULT_USER_VOLUME,
  BGM_TRACKS,
  stepTrack,
} from "@/lib/bgm/playlist";

/**
 * 배경음악 설정과 재생목록 조작.
 *
 * 음소거·볼륨은 브라우저에만 남긴다(`last-game` 과 같은 이유 — 기기마다 사정이
 * 다르다). 음소거 기본값은 "켜짐"이다. 저장된 값이 `"1"` 일 때만 음소거로 본다.
 *
 * 실제 재생은 `BgmPlayer` 가 한다. 화면(재생목록 패널)은 여기에 "이 곡을 틀어
 * 달라"는 요청만 남기고, 플레이어가 그 요청을 보고 곡을 바꾼다. 지금 무슨 곡이
 * 나오는지는 거꾸로 플레이어가 여기에 적는다.
 */
const MUTED_KEY = "nexus:bgm-muted";
const VOLUME_KEY = "nexus:bgm-volume";

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    // 시크릿 모드 등에서 저장소가 막히면 기본값(켜짐)으로 둔다.
    return false;
  }
}

function readVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw === null) return BGM_DEFAULT_USER_VOLUME;
    const stored = Number(raw);
    return Number.isFinite(stored)
      ? clampVolume(stored)
      : BGM_DEFAULT_USER_VOLUME;
  } catch {
    return BGM_DEFAULT_USER_VOLUME;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장 실패는 치명적이지 않다. 이번 방문 동안만 유지된다.
  }
}

interface BgmState {
  muted: boolean;
  /** 사용자 볼륨(0~1). 실제 재생 볼륨은 여기에 최대치·게임 중 비율을 곱한다. */
  volume: number;
  /**
   * 저장소 값을 읽었는지.
   * SSR 첫 렌더와 어긋나지 않도록, 읽기 전에는 버튼을 그리지 않는다.
   */
  hydrated: boolean;
  /** 지금 걸려 있는 곡. 플레이어가 적는다. */
  currentTrackId: string | null;
  /**
   * 재생목록에서 고른 곡. `seq` 는 같은 곡을 다시 눌러도 요청으로 알아채게
   * 하려는 번호다.
   */
  trackRequest: { trackId: string; seq: number } | null;

  hydrate: () => void;
  toggleMuted: () => void;
  /** 다른 탭에서 바꾼 값을 반영할 때 쓴다. 저장소에는 다시 쓰지 않는다. */
  syncMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  syncVolume: (volume: number) => void;
  setCurrentTrackId: (trackId: string | null) => void;
  /** 이 곡을 튼다. 음소거 중이었다면 곡을 고른 것 자체를 "듣겠다"로 보고 푼다. */
  playTrack: (trackId: string) => void;
  playNext: () => void;
  playPrev: () => void;
}

export const BGM_MUTED_STORAGE_KEY = MUTED_KEY;
export const BGM_VOLUME_STORAGE_KEY = VOLUME_KEY;

export const useBgmStore = create<BgmState>((set, get) => ({
  muted: false,
  volume: BGM_DEFAULT_USER_VOLUME,
  hydrated: false,
  currentTrackId: null,
  trackRequest: null,

  hydrate: () => {
    if (get().hydrated) return;
    set({ muted: readMuted(), volume: readVolume(), hydrated: true });
  },

  toggleMuted: () => {
    const muted = !get().muted;
    write(MUTED_KEY, muted ? "1" : "0");
    set({ muted });
  },

  syncMuted: (muted) => set({ muted }),

  setVolume: (volume) => {
    const next = clampVolume(volume);
    write(VOLUME_KEY, String(next));
    set({ volume: next });
  },

  syncVolume: (volume) => set({ volume: clampVolume(volume) }),

  setCurrentTrackId: (trackId) => set({ currentTrackId: trackId }),

  playTrack: (trackId) => {
    if (get().muted) {
      write(MUTED_KEY, "0");
      set({ muted: false });
    }
    set((state) => ({
      trackRequest: { trackId, seq: (state.trackRequest?.seq ?? 0) + 1 },
    }));
  },

  playNext: () => {
    const next = stepTrack(BGM_TRACKS, get().currentTrackId, 1);
    if (next) get().playTrack(next.id);
  },

  playPrev: () => {
    const prev = stepTrack(BGM_TRACKS, get().currentTrackId, -1);
    if (prev) get().playTrack(prev.id);
  },
}));
