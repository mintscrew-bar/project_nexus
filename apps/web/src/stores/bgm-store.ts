import { create } from "zustand";

/**
 * 배경음악 음소거 설정.
 *
 * 브라우저에만 남긴다(`last-game` 과 같은 이유 — 기기마다 사정이 다르다).
 * 기본값은 "켜짐"이다. 저장된 값이 `"1"` 일 때만 음소거로 본다.
 */
const KEY = "nexus:bgm-muted";

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // 시크릿 모드 등에서 저장소가 막히면 기본값(켜짐)으로 둔다.
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    // 저장 실패는 치명적이지 않다. 이번 방문 동안만 유지된다.
  }
}

interface BgmState {
  muted: boolean;
  /**
   * 저장소 값을 읽었는지.
   * SSR 첫 렌더와 어긋나지 않도록, 읽기 전에는 버튼을 그리지 않는다.
   */
  hydrated: boolean;
  hydrate: () => void;
  toggleMuted: () => void;
  /** 다른 탭에서 바꾼 값을 반영할 때 쓴다. 저장소에는 다시 쓰지 않는다. */
  syncMuted: (muted: boolean) => void;
}

export const BGM_MUTED_STORAGE_KEY = KEY;

export const useBgmStore = create<BgmState>((set, get) => ({
  muted: false,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ muted: readMuted(), hydrated: true });
  },

  toggleMuted: () => {
    const muted = !get().muted;
    writeMuted(muted);
    set({ muted });
  },

  syncMuted: (muted) => set({ muted }),
}));
