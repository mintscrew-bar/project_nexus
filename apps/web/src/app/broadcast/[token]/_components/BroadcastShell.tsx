"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * OBS 기준 1920×1080 고정 캔버스 셸.
 * - 반응형 페이지가 아니라 고정 stage + viewport에 맞춘 scale.
 * - 배경 투명 기본(투명 위에 게임/페이스캠 합성), bg="opaque"면 풀씬 배경.
 * - 레이어 구조: Theme → (Transition/Current Scene) → Persistent Overlay.
 *   Persistent Overlay는 scene 밖에 상주해 전환 중에도 끊기지 않는다.
 */

const STAGE_W = 1920;
const STAGE_H = 1080;

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const compute = () => {
      const s = Math.min(
        window.innerWidth / STAGE_W,
        window.innerHeight / STAGE_H,
      );
      setScale(s > 0 ? s : 1);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return scale;
}

export function BroadcastShell({
  bg,
  theme,
  scene,
  persistent,
}: {
  bg: "transparent" | "opaque";
  theme: any;
  scene: ReactNode;
  persistent: ReactNode;
}) {
  const scale = useStageScale();
  const accent = theme?.accentColor || "#667EEA";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: bg === "opaque" ? "#0a0a0f" : "transparent" }}
    >
      <div
        className="relative"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {/* Theme Layer (opaque 배경일 때만 풀씬 배경 그림) */}
        {bg === "opaque" && (
          <div className="absolute inset-0">
            {theme?.banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={theme.banner}
                alt=""
                className="h-full w-full object-cover opacity-30"
              />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background: `radial-gradient(circle at 50% 30%, ${accent}22, #0a0a0f 70%)`,
                }}
              />
            )}
          </div>
        )}

        {/* Current Scene */}
        <div className="absolute inset-0">{scene}</div>

        {/* Persistent Overlay — scene 밖 상주 */}
        <div className="pointer-events-none absolute inset-0">{persistent}</div>
      </div>
    </div>
  );
}
