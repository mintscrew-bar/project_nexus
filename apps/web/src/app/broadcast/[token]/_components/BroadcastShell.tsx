"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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
  transitionKey,
  transition,
}: {
  bg: "transparent" | "opaque";
  theme: any;
  scene: ReactNode;
  persistent: ReactNode;
  transitionKey?: string;
  transition?: {
    label: string;
    subLabel?: string;
    eyebrow?: string;
    tone?: "phase" | "match" | "result";
  };
}) {
  const scale = useStageScale();
  const accent = theme?.accentColor || "#667EEA";
  const [displayScene, setDisplayScene] = useState(scene);
  const [transitionActive, setTransitionActive] = useState(false);
  const currentKeyRef = useRef(transitionKey);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    if (!transitionKey || currentKeyRef.current === transitionKey) {
      setDisplayScene(scene);
      currentKeyRef.current = transitionKey;
      return;
    }

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setTransitionActive(true);

    timersRef.current.push(
      setTimeout(() => {
        setDisplayScene(scene);
        currentKeyRef.current = transitionKey;
      }, 360),
      setTimeout(() => setTransitionActive(false), 860),
    );

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [scene, transitionKey]);

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
        <div className="absolute inset-0">{displayScene}</div>

        {/* Scene Transition */}
        <BroadcastTransition
          active={transitionActive}
          accent={accent}
          label={transition?.label ?? "NEXT PHASE"}
          subLabel={transition?.subLabel}
          eyebrow={transition?.eyebrow}
          tone={transition?.tone}
        />

        {/* Persistent Overlay — scene 밖 상주 */}
        <div className="pointer-events-none absolute inset-0">{persistent}</div>
      </div>
    </div>
  );
}

function BroadcastTransition({
  active,
  accent,
  label,
  subLabel,
  eyebrow = "NEXT PHASE",
  tone = "phase",
}: {
  active: boolean;
  accent: string;
  label: string;
  subLabel?: string;
  eyebrow?: string;
  tone?: "phase" | "match" | "result";
}) {
  const toneColor =
    tone === "result" ? "#F6C945" : tone === "match" ? "#60A5FA" : accent;

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <style>{`
        @keyframes nexus-transition-fade {
          0% { opacity: 0; }
          16% { opacity: 1; }
          72% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes nexus-transition-sweep {
          0% { transform: translateX(-120%) skewX(-14deg); }
          46% { transform: translateX(6%) skewX(-14deg); }
          100% { transform: translateX(126%) skewX(-14deg); }
        }
        @keyframes nexus-transition-mark {
          0% { opacity: 0; transform: translateY(12px); }
          24% { opacity: 0; transform: translateY(12px); }
          42% { opacity: 1; transform: translateY(0); }
          78% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
      `}</style>
      <div
        className="absolute inset-0 bg-black/72"
        style={{ animation: "nexus-transition-fade 860ms ease both" }}
      />
      <div
        className="absolute inset-y-0 left-0 w-[62%] bg-black/78"
        style={{
          clipPath: "polygon(0 0, 82% 0, 100% 100%, 0 100%)",
          animation: "nexus-transition-sweep 860ms cubic-bezier(.76,0,.18,1) both",
        }}
      />
      <div
        className="absolute inset-y-0 left-0 w-[12px]"
        style={{
          background: toneColor,
          boxShadow: `0 0 34px ${toneColor}`,
          animation: "nexus-transition-sweep 860ms cubic-bezier(.76,0,.18,1) both",
        }}
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "nexus-transition-mark 860ms ease both" }}
      >
        <div className="grid grid-cols-[96px_auto] items-center gap-8">
          <div
            className="flex h-24 w-24 items-center justify-center border text-4xl font-black text-white"
            style={{
              borderColor: `${toneColor}aa`,
              boxShadow: `0 0 38px ${toneColor}44`,
              background: "rgba(5,5,9,0.72)",
            }}
          >
            NX
          </div>
          <div>
            <p
              className="text-sm font-black uppercase tracking-[0.46em]"
              style={{ color: toneColor }}
            >
              {eyebrow}
            </p>
            <h2 className="mt-3 text-[64px] font-black uppercase leading-none tracking-normal text-white">
              {label}
            </h2>
            {subLabel && (
              <p className="mt-3 text-2xl font-black text-white/54">
                {subLabel}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
