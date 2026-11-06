"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BroadcastSettings } from "@nexus/types";
import {
  BROADCAST_FONT_FAMILY,
  BroadcastLookProvider,
  TRANSITION_DURATION_MS,
  resolveLook,
} from "./look";

/**
 * OBS 기준 1920×1080 고정 캔버스 셸.
 * - 반응형 페이지가 아니라 고정 stage + viewport에 맞춘 scale.
 * - 배경 투명 기본(투명 위에 게임/페이스캠 합성), bg="opaque"면 풀씬 배경.
 * - 레이어 구조: Theme → (Transition/Current Scene) → Persistent Overlay.
 *   Persistent Overlay는 scene 밖에 상주해 전환 중에도 끊기지 않는다.
 * - 방송인 커스터마이징(settings)을 컨텍스트로 내려준다(look.tsx). 글꼴·크기 배율·
 *   전환 방식은 여기서, 색·배경·문구는 각 장면이 컨텍스트에서 읽어 적용한다.
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
  settings,
  scene,
  persistent,
  transitionKey,
  transition,
}: {
  bg: "transparent" | "opaque";
  theme: any;
  /** 방송인 커스터마이징(스냅샷의 settings). 없으면 기본값 */
  settings?: unknown;
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
  const look = resolveLook(settings, theme);
  const accent = look.accent;
  const {
    transition: transitionSetting,
    font,
    scale: userScale,
  } = look.settings;
  const transitionMs = TRANSITION_DURATION_MS[transitionSetting.speed];
  const transitionOff = transitionSetting.style === "none";
  const fontFamily = BROADCAST_FONT_FAMILY[font];

  const [displayScene, setDisplayScene] = useState(scene);
  const [transitionActive, setTransitionActive] = useState(false);
  const currentKeyRef = useRef(transitionKey);
  const latestSceneRef = useRef(scene);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    latestSceneRef.current = scene;
    if (!transitionKey || currentKeyRef.current === transitionKey) {
      setDisplayScene(scene);
      currentKeyRef.current = transitionKey;
    }
  }, [scene, transitionKey]);

  useEffect(() => {
    if (!transitionKey || currentKeyRef.current === transitionKey) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // "전환 없음" — 막 없이 바로 바꾼다
    if (transitionOff) {
      setDisplayScene(latestSceneRef.current);
      currentKeyRef.current = transitionKey;
      return;
    }

    setTransitionActive(true);
    // 막이 화면을 다 덮는 지점(전체의 54%)에서 장면을 갈아 끼운다
    timersRef.current.push(
      setTimeout(
        () => {
          setDisplayScene(latestSceneRef.current);
          currentKeyRef.current = transitionKey;
        },
        Math.round(transitionMs * 0.54),
      ),
      setTimeout(() => setTransitionActive(false), transitionMs),
    );

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [transitionKey, transitionMs, transitionOff]);

  return (
    <BroadcastLookProvider look={look}>
      {/* 기본 외 글꼴은 고른 것만 Google Fonts 에서 받는다 */}
      {fontFamily.googleFamily && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${fontFamily.googleFamily}&display=swap`}
        />
      )}
      {/* 고른 글꼴은 큰 제목(h1·h2)에만 — 작은 글씨까지 바꾸면 방송 화면에서 뭉개진다 */}
      {fontFamily.family && (
        <style>{`.bc-stage h1, .bc-stage h2 { font-family: ${fontFamily.family}; font-weight: 400; font-synthesis: none; }`}</style>
      )}
      <div
        className="bc-stage fixed inset-0 flex items-center justify-center overflow-hidden"
        style={{ background: bg === "opaque" ? "#0a0a0f" : "transparent" }}
      >
        {/* shrink-0 — 창이 1920 보다 작으면(설정 화면 미리보기 iframe 등) flex 자식이라
            폭이 줄어든 채 축소돼 화면이 옆으로 찌그러졌다 */}
        <div
          className="relative shrink-0"
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

          {/* Current Scene — 방송인이 고른 크기 배율은 장면에만 건다(가운데 기준) */}
          <div
            className="absolute inset-0 transition-[filter,opacity] duration-300"
            style={{
              filter: transitionActive ? "brightness(0.42) blur(2px)" : "none",
              opacity: transitionActive ? 0.72 : 1,
              transform: userScale !== 1 ? `scale(${userScale})` : undefined,
              transformOrigin: "center center",
            }}
          >
            {displayScene}
          </div>

          {/* Scene Transition */}
          <BroadcastTransition
            active={transitionActive}
            accent={accent}
            mark={look.mark}
            logo={look.logo}
            style={transitionSetting.style}
            durationMs={transitionMs}
            showLabel={transitionSetting.showLabel}
            showEyebrow={look.settings.show.englishLabels}
            label={transition?.label ?? "NEXT PHASE"}
            subLabel={transition?.subLabel}
            eyebrow={transition?.eyebrow}
            tone={transition?.tone}
          />

          {/* Persistent Overlay — scene 밖 상주 */}
          <div className="pointer-events-none absolute inset-0">
            {persistent}
          </div>
        </div>
      </div>
    </BroadcastLookProvider>
  );
}

/**
 * 장면 전환. 방송인 설정으로 방식·속도·장면 이름 표시를 고른다.
 * - wipe: 검은 막이 왼쪽에서 오른쪽으로 쓸고 지나간다 (기존)
 * - fade: 막 없이 어두워졌다 밝아진다
 * - slide: 막이 오른쪽에서 들어와 왼쪽으로 빠진다
 */
function BroadcastTransition({
  active,
  accent,
  mark,
  logo,
  style,
  durationMs,
  showLabel,
  showEyebrow,
  label,
  subLabel,
  eyebrow = "NEXT PHASE",
  tone = "phase",
}: {
  active: boolean;
  accent: string;
  mark: string;
  logo: string | null;
  style: BroadcastSettings["transition"]["style"];
  durationMs: number;
  showLabel: boolean;
  showEyebrow: boolean;
  label: string;
  subLabel?: string;
  eyebrow?: string;
  tone?: "phase" | "match" | "result";
}) {
  const toneColor =
    tone === "result" ? "#F6C945" : tone === "match" ? "#60A5FA" : accent;

  if (!active || style === "none") return null;

  const ms = `${durationMs}ms`;
  const sweep =
    style === "wipe"
      ? "nexus-transition-sweep"
      : style === "slide"
        ? "nexus-transition-slide"
        : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <style>{`
        @keyframes nexus-transition-fade {
          0% { opacity: 0; }
          12% { opacity: 1; }
          78% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes nexus-transition-sweep {
          0% { transform: translateX(-100%); }
          46% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
        @keyframes nexus-transition-slide {
          0% { transform: translateX(100%); }
          46% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
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
        className="absolute inset-0 bg-black/90"
        style={{ animation: `nexus-transition-fade ${ms} ease both` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.18), rgba(0,0,0,0.84) 62%)",
          animation: `nexus-transition-fade ${ms} ease both`,
        }}
      />
      {sweep && (
        <div
          className="absolute inset-y-0 left-0 w-full bg-black/82"
          style={{
            animation: `${sweep} ${ms} cubic-bezier(.76,0,.18,1) both`,
          }}
        />
      )}
      <div
        className="absolute left-0 right-0 top-1/2 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${toneColor}, transparent)`,
          boxShadow: `0 0 24px ${toneColor}66`,
          animation: `nexus-transition-fade ${ms} ease both`,
        }}
      />
      {showLabel && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: `nexus-transition-mark ${ms} ease both` }}
        >
          <div
            className="relative grid w-[1180px] grid-cols-[auto_minmax(0,1fr)] items-center gap-9 px-10 py-9"
            style={{
              background:
                "linear-gradient(90deg, rgba(2,2,6,0), rgba(2,2,6,0.96) 14%, rgba(10,10,16,0.94) 86%, rgba(2,2,6,0))",
              borderTop: `1px solid ${toneColor}88`,
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 28px 90px rgba(0,0,0,0.62)",
            }}
          >
            <span
              className="absolute left-0 right-0 top-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${toneColor}, transparent)`,
              }}
            />
            <div
              className="flex h-20 w-20 items-center justify-center overflow-hidden border-y text-3xl font-black text-white"
              style={{
                borderColor: `${toneColor}aa`,
                background: "rgba(5,5,9,0.54)",
              }}
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-14 w-14 object-cover" />
              ) : (
                mark
              )}
            </div>
            <div>
              {showEyebrow && (
                <p
                  className="text-sm font-black uppercase tracking-[0.46em]"
                  style={{ color: toneColor }}
                >
                  {eyebrow}
                </p>
              )}
              <h2 className="mt-3 text-[72px] font-black uppercase leading-none tracking-normal text-white">
                {showEyebrow || !subLabel ? label : subLabel}
              </h2>
              {subLabel && showEyebrow && (
                <p className="mt-3 text-2xl font-black text-white/58">
                  {subLabel}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
