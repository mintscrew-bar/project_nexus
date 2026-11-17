import { create } from "zustand";

/**
 * 꾸미기 효과 보기 설정 (설정 > 화면 설정, Task 22).
 *
 * - full  : 움직임 그대로
 * - still : 멈춘 그림 — 장식은 보이되 움직이지 않는다(날아다니는 것은 숨김)
 * - off   : 숨기기 — 남의 장식까지 전부 안 보이고 기본 모습으로 본다
 *
 * 이 브라우저에만 저장한다(계정 설정 아님). 실제 적용은 <html> 의
 * `cfx-still`·`cfx-off` 클래스로 하고, 규칙은 globals.css 「꾸미기 효과 설정」.
 */
export type CosmeticFxMode = "full" | "still" | "off";

const KEY = "nexus:cosmetic-fx";
const MODES: CosmeticFxMode[] = ["full", "still", "off"];

function read(): CosmeticFxMode {
  try {
    const raw = window.localStorage.getItem(KEY);
    return MODES.includes(raw as CosmeticFxMode)
      ? (raw as CosmeticFxMode)
      : "full";
  } catch {
    return "full";
  }
}

/** <html> 클래스를 모드에 맞춘다 — 캔버스 장식(픽셀 불)도 이 클래스를 보고 멈춘다 */
function apply(mode: CosmeticFxMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("cfx-still", mode === "still");
  root.classList.toggle("cfx-off", mode === "off");
}

interface CosmeticFxState {
  mode: CosmeticFxMode;
  hydrated: boolean;
  hydrate: () => void;
  setMode: (mode: CosmeticFxMode) => void;
}

export const useCosmeticFxStore = create<CosmeticFxState>((set, get) => ({
  mode: "full",
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const mode = read();
    apply(mode);
    set({ mode, hydrated: true });
  },

  setMode: (mode) => {
    try {
      window.localStorage.setItem(KEY, mode);
    } catch {
      // 저장이 막힌 환경에서는 지금 탭에서만 적용된다
    }
    apply(mode);
    set({ mode });
  },
}));

/** 캔버스로 그리는 장식이 매 박자 확인한다 — 「멈춘 그림」·「숨기기」면 그리지 않는다 */
export function cosmeticFxPaused(): boolean {
  if (typeof document === "undefined") return false;
  const cl = document.documentElement.classList;
  return cl.contains("cfx-still") || cl.contains("cfx-off");
}
