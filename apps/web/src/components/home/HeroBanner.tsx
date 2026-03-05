"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Swords } from "lucide-react";
import { Exo_2 } from "next/font/google";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";

const exo2 = Exo_2({ subsets: ["latin"], weight: ["700"] });

// ─────────────────────────────────────────────────────────────────────────────
// 색상 팔레트 — 로고 그라디언트 기반 (#667EEA → #764BA2)
// ─────────────────────────────────────────────────────────────────────────────
const INDIGO = "#667EEA";
const PURPLE = "#764BA2";
const INDIGO_RGB = { r: 102, g: 126, b: 234 };
const PURPLE_RGB = { r: 118, g: 75, b: 162 };

/** rgba 문자열 생성 헬퍼 */
const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r},${c.g},${c.b},${a})`;

// ─────────────────────────────────────────────────────────────────────────────
// 에너지 빔 설정 — 중심에서 방사형으로 뻗는 빛줄기
// 각 빔마다 고유 흐름 속도(duration)를 부여해서 비동기적 파동감 연출
// ─────────────────────────────────────────────────────────────────────────────
const ENERGY_BEAMS = [
  { angle: -30, length: 320, delay: 0, width: 1.5, duration: 2.0 },
  { angle: 15, length: 280, delay: 0.8, width: 1, duration: 3.5 },
  { angle: 75, length: 350, delay: 0.3, width: 1.2, duration: 1.5 },
  { angle: 135, length: 260, delay: 1.2, width: 1, duration: 4.0 },
  { angle: 200, length: 300, delay: 0.6, width: 1.5, duration: 2.5 },
  { angle: 255, length: 290, delay: 1.0, width: 1, duration: 3.0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Framer Motion 변형 — 에너지 충전 → 집중 → 등장
// ─────────────────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.5 },
  },
};

const itemVariants = {
  hidden: { y: 25, opacity: 0, filter: "blur(12px)", scale: 0.95 },
  visible: {
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    scale: 1,
    transition: {
      duration: 0.7,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

// 코너 브래킷 슬라이드인 변형
const cornerVariants = {
  topLeft: {
    hidden: { x: -20, y: -20, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.6, delay: 0.2 } },
  },
  topRight: {
    hidden: { x: 20, y: -20, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.6, delay: 0.3 } },
  },
  bottomLeft: {
    hidden: { x: -20, y: 20, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.6, delay: 0.4 } },
  },
  bottomRight: {
    hidden: { x: 20, y: 20, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.6, delay: 0.5 } },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
interface HeroBannerProps {
  isAuthenticated?: boolean;
}

export function HeroBanner({ isAuthenticated = false }: HeroBannerProps) {
  const sectionRef = useRef<HTMLElement>(null);

  // ── DOM 직접 조작용 ref — React 리렌더 없이 마우스 패럴랙스 구현 ──
  const hexGridRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const beamSvgRef = useRef<HTMLDivElement>(null);

  // 마우스 추적 — RAF lerp 기반 (부드러운 보간)
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  // 글리치 효과 — 간헐적 발동
  const [isGlitching, setIsGlitching] = useState(false);

  // ── RAF 메인 루프: 마우스 lerp 보간 → DOM 직접 조작 (리렌더 없음) ──
  useEffect(() => {
    const LERP_SPEED = 0.04;

    const animate = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;

      // lerp 보간
      cur.x += (tgt.x - cur.x) * LERP_SPEED;
      cur.y += (tgt.y - cur.y) * LERP_SPEED;

      // 미세 변화가 있을 때만 DOM 업데이트 (성능 최적화)
      const dx = Math.abs(cur.x - tgt.x);
      const dy = Math.abs(cur.y - tgt.y);
      if (dx > 0.001 || dy > 0.001) {
        // 육각형 그리드 — 느린 패럴랙스
        if (hexGridRef.current) {
          hexGridRef.current.style.transform = `translate(${cur.x * 8}px, ${cur.y * 8}px)`;
        }
        // 중앙 글로우 — 중간 속도 패럴랙스
        if (glowRef.current) {
          glowRef.current.style.transform = `translate(${cur.x * 15}px, ${cur.y * 15}px)`;
        }
        // 에너지 빔 SVG — 마우스 방향 기울기
        if (beamSvgRef.current) {
          beamSvgRef.current.style.transform = `rotate(${cur.x * 3}deg)`;
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── 글리치 효과 타이머 — 5~12초 간격으로 짧은 글리치 ──
  // timerIds ref로 모든 타이머를 추적해서 언마운트 시 전부 정리
  const glitchTimerIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const triggerGlitch = () => {
      setIsGlitching(true);
      // 글리치 지속 시간: 200~400ms — 체감될 정도의 길이
      const offId = setTimeout(() => setIsGlitching(false), 200 + Math.random() * 200);
      // 다음 글리치까지 대기: 5~12초
      const nextId = setTimeout(triggerGlitch, 5000 + Math.random() * 7000);
      glitchTimerIds.current.push(offId, nextId);
    };

    const initialId = setTimeout(triggerGlitch, 3000);
    glitchTimerIds.current.push(initialId);

    return () => {
      // 언마운트 시 모든 타이머 정리 (재귀 체인 포함)
      glitchTimerIds.current.forEach(clearTimeout);
      glitchTimerIds.current = [];
    };
  }, []);

  // ── 마우스 이벤트 핸들러 ──
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // -1 ~ +1 범위로 정규화
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    targetRef.current = { x, y };
  }, []);

  const handleMouseLeave = useCallback(() => {
    targetRef.current = { x: 0, y: 0 };
  }, []);

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative flex flex-col items-center justify-center h-screen min-h-[600px] px-4 text-center overflow-hidden"
      style={{ background: "#0a0a0f" }}
    >
      {/* ── 레이어 1: 육각형 그리드 배경 (SVG 패턴) ── */}
      <div
        ref={hexGridRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          // 초기 위치 — RAF 루프에서 transform 직접 갱신
          transform: "translate(0px, 0px)",
          willChange: "transform",
        }}
      >
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* 육각형 하나의 형태 정의 — pointy-top 방향 */}
            <pattern
              id="hex-grid"
              width="56"
              height="100"
              patternUnits="userSpaceOnUse"
              patternTransform="scale(1.2)"
            >
              {/* 첫 번째 육각형 */}
              <polygon
                points="28,2 51,16 51,44 28,58 5,44 5,16"
                fill="none"
                stroke={INDIGO}
                strokeWidth="0.5"
                strokeOpacity="0.04"
              />
              {/* 두 번째 육각형 (오프셋) */}
              <polygon
                points="28,52 51,66 51,94 28,108 5,94 5,66"
                fill="none"
                stroke={PURPLE}
                strokeWidth="0.5"
                strokeOpacity="0.03"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-grid)" />
        </svg>
      </div>

      {/* ── 레이어 2: 중심 에너지 코어 (육각형 에너지 필드 + 원형 링) ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* A. 방사형 글로우 배경 — 인디고 + 퍼플 (확대 + 강화) */}
        <div
          ref={glowRef}
          className="absolute rounded-full"
          style={{
            width: 600,
            height: 600,
            background: `radial-gradient(circle, ${rgba(INDIGO_RGB, 0.18)} 0%, ${rgba(PURPLE_RGB, 0.08)} 40%, transparent 70%)`,
            // 초기 위치 — RAF 루프에서 transform 직접 갱신
            transform: "translate(0px, 0px)",
            willChange: "transform",
          }}
        />

        {/* B + C. SVG 통합: 육각형 에너지 필드 + 원형 링 */}
        <svg
          className="absolute"
          width="400"
          height="400"
          viewBox="-200 -200 400 400"
          style={{ overflow: "visible" }}
        >
          {/* ── C. 원형 링 (기존 div 링 → SVG circle 교체) ── */}

          {/* 링 1: 인디고 점선, 시계 방향 20s */}
          <circle
            cx="0"
            cy="0"
            r="120"
            fill="none"
            stroke={INDIGO}
            strokeWidth="0.8"
            strokeOpacity="0.12"
            strokeDasharray="3 8"
            style={{
              animation: "hex-rotate-cw 20s linear infinite",
              transformOrigin: "center",
            }}
          />

          {/* 링 2: 퍼플 점선, 반시계 방향 28s */}
          <circle
            cx="0"
            cy="0"
            r="170"
            fill="none"
            stroke={PURPLE}
            strokeWidth="0.6"
            strokeOpacity="0.07"
            strokeDasharray="1 14"
            style={{
              animation: "hex-rotate-ccw 28s linear infinite",
              transformOrigin: "center",
            }}
          />

          {/* ── B. 육각형 에너지 필드 ── */}

          {/* B-1. 바깥 육각형 링 (240px ≈ r120) — 시계 방향 25s */}
          <g
            style={{
              animation: "hex-rotate-cw 25s linear infinite",
              transformOrigin: "center",
            }}
          >
            {/* 육각형 외곽선 */}
            <polygon
              points={(() => {
                // 반지름 120px 육각형 꼭짓점 좌표 계산
                const r = 120;
                return Array.from({ length: 6 }, (_, i) => {
                  const angle = (Math.PI / 3) * i - Math.PI / 2;
                  return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
                }).join(" ");
              })()}
              fill="none"
              stroke={INDIGO}
              strokeWidth="1"
              strokeOpacity="0.3"
            />
            {/* 6개 꼭짓점 강조 원 — 호흡 애니메이션 */}
            {Array.from({ length: 6 }, (_, i) => {
              const angle = (Math.PI / 3) * i - Math.PI / 2;
              const r = 120;
              return (
                <circle
                  key={`outer-vertex-${i}`}
                  cx={Math.cos(angle) * r}
                  cy={Math.sin(angle) * r}
                  r={3}
                  fill={INDIGO}
                  opacity="0.5"
                  style={{
                    animation: `particle-breathe ${1.8 + i * 0.3}s ease-in-out infinite`,
                  }}
                />
              );
            })}
          </g>

          {/* B-2. 안쪽 육각형 링 (160px ≈ r80) — 반시계 방향 18s, 점선 */}
          <g
            style={{
              animation: "hex-rotate-ccw 18s linear infinite",
              transformOrigin: "center",
            }}
          >
            <polygon
              points={(() => {
                const r = 80;
                return Array.from({ length: 6 }, (_, i) => {
                  const angle = (Math.PI / 3) * i - Math.PI / 2;
                  return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
                }).join(" ");
              })()}
              fill="none"
              stroke={PURPLE}
              strokeWidth="0.8"
              strokeOpacity="0.2"
              strokeDasharray="6 4"
            />
          </g>

          {/* B-3. 중심 에너지 크로스 — 수평 + 수직 + 대각선 */}
          {/* 수평선 (80px = ±40) */}
          <line
            x1="-40" y1="0" x2="40" y2="0"
            stroke={INDIGO}
            strokeWidth="1"
            strokeOpacity="0.25"
            strokeDasharray="4 8"
            style={{ animation: "energy-flow 3s linear infinite" }}
          />
          {/* 수직선 (80px = ±40) */}
          <line
            x1="0" y1="-40" x2="0" y2="40"
            stroke={INDIGO}
            strokeWidth="1"
            strokeOpacity="0.25"
            strokeDasharray="4 8"
            style={{ animation: "energy-flow 3.5s linear infinite" }}
          />
          {/* 대각선 45도 (50px = ±25 * √2/2 ≈ ±17.7) */}
          <line
            x1="-17.7" y1="-17.7" x2="17.7" y2="17.7"
            stroke={PURPLE}
            strokeWidth="0.8"
            strokeOpacity="0.2"
            strokeDasharray="4 8"
            style={{ animation: "energy-flow 4s linear infinite" }}
          />
          {/* 대각선 135도 */}
          <line
            x1="17.7" y1="-17.7" x2="-17.7" y2="17.7"
            stroke={PURPLE}
            strokeWidth="0.8"
            strokeOpacity="0.2"
            strokeDasharray="4 8"
            style={{ animation: "energy-flow 4.5s linear infinite" }}
          />

          {/* B-4. 중심 점 — 맥동 */}
          <circle
            cx="0"
            cy="0"
            r="4"
            fill={INDIGO}
            opacity="0.8"
            style={{ animation: "core-dot-pulse 2s ease-in-out infinite" }}
          />
        </svg>
      </div>

      {/* ── 레이어 3: 에너지 빔 (핵심 효과) ── */}
      <div
        ref={beamSvgRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          // 초기 위치 — RAF 루프에서 rotate 직접 갱신
          transform: "rotate(0deg)",
          willChange: "transform",
        }}
      >
        <svg
          className="absolute"
          width="100%"
          height="100%"
          viewBox="-500 -400 1000 800"
          style={{ overflow: "visible" }}
        >
          <defs>
            {/* 에너지 빔용 그라디언트 — 중심이 밝고 끝이 투명 */}
            <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={INDIGO} stopOpacity="0.6" />
              <stop offset="60%" stopColor={INDIGO} stopOpacity="0.2" />
              <stop offset="100%" stopColor={INDIGO} stopOpacity="0" />
            </linearGradient>

            {/* 빔 끝 파티클 글로우 */}
            <radialGradient id="particle-glow">
              <stop offset="0%" stopColor={INDIGO} stopOpacity="0.8" />
              <stop offset="100%" stopColor={INDIGO} stopOpacity="0" />
            </radialGradient>

            {/* 글로우 필터 — 빔에 부드러운 발광 효과 */}
            <filter id="beam-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 각 에너지 빔 렌더링 — 빔마다 개별 흐름 속도 적용 */}
          {ENERGY_BEAMS.map((beam, i) => {
            const rad = (beam.angle * Math.PI) / 180;
            const endX = Math.cos(rad) * beam.length;
            const endY = Math.sin(rad) * beam.length;
            return (
              <g key={i}>
                {/* 메인 빔 라인 — 듬성듬성한 점으로 레이저 파동 연출 */}
                <line
                  x1={0}
                  y1={0}
                  x2={endX}
                  y2={endY}
                  stroke={INDIGO}
                  strokeWidth={beam.width}
                  strokeOpacity={0.3}
                  strokeDasharray="4 20"
                  filter="url(#beam-glow)"
                  style={{
                    // 에너지 흐름 + 맥동 두 애니메이션 동시 적용
                    animation: `energy-flow ${beam.duration}s linear infinite, beam-pulse ${beam.duration * 1.5}s ease-in-out infinite`,
                    animationDelay: `${beam.delay}s, ${beam.delay * 0.7}s`,
                  }}
                />

                {/* 빔 끝의 섬광 파티클 — 호흡하듯 팽창/수축 */}
                <circle
                  cx={endX}
                  cy={endY}
                  r={3}
                  fill="url(#particle-glow)"
                  style={{
                    animation: `energy-flow ${beam.duration}s linear infinite, particle-breathe ${beam.duration * 1.2}s ease-in-out infinite`,
                    animationDelay: `${beam.delay}s, ${beam.delay * 0.5}s`,
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── 레이어 4: 스캔라인 오버레이 (매우 희미하게) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(102,126,234,0.015) 2px, rgba(102,126,234,0.015) 4px)",
        }}
      />

      {/* ── 레이어 4.5: 코너 브래킷 장식 (LoL UI 스타일) ── */}
      {/* 좌상단 */}
      <motion.div
        className="absolute top-6 left-6 pointer-events-none"
        variants={cornerVariants.topLeft}
        initial="hidden"
        animate="visible"
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path
            d="M2 18 L2 2 L18 2"
            stroke={INDIGO}
            strokeWidth="1.5"
            strokeOpacity="0.25"
            strokeLinecap="square"
          />
          <path
            d="M6 14 L6 6 L14 6"
            stroke={PURPLE}
            strokeWidth="0.8"
            strokeOpacity="0.15"
            strokeLinecap="square"
          />
        </svg>
      </motion.div>

      {/* 우상단 */}
      <motion.div
        className="absolute top-6 right-6 pointer-events-none"
        variants={cornerVariants.topRight}
        initial="hidden"
        animate="visible"
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path
            d="M30 2 L46 2 L46 18"
            stroke={INDIGO}
            strokeWidth="1.5"
            strokeOpacity="0.25"
            strokeLinecap="square"
          />
          <path
            d="M34 6 L42 6 L42 14"
            stroke={PURPLE}
            strokeWidth="0.8"
            strokeOpacity="0.15"
            strokeLinecap="square"
          />
        </svg>
      </motion.div>

      {/* 좌하단 */}
      <motion.div
        className="absolute bottom-6 left-6 pointer-events-none"
        variants={cornerVariants.bottomLeft}
        initial="hidden"
        animate="visible"
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path
            d="M2 30 L2 46 L18 46"
            stroke={INDIGO}
            strokeWidth="1.5"
            strokeOpacity="0.25"
            strokeLinecap="square"
          />
          <path
            d="M6 34 L6 42 L14 42"
            stroke={PURPLE}
            strokeWidth="0.8"
            strokeOpacity="0.15"
            strokeLinecap="square"
          />
        </svg>
      </motion.div>

      {/* 우하단 */}
      <motion.div
        className="absolute bottom-6 right-6 pointer-events-none"
        variants={cornerVariants.bottomRight}
        initial="hidden"
        animate="visible"
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path
            d="M30 46 L46 46 L46 30"
            stroke={INDIGO}
            strokeWidth="1.5"
            strokeOpacity="0.25"
            strokeLinecap="square"
          />
          <path
            d="M34 42 L42 42 L42 34"
            stroke={PURPLE}
            strokeWidth="0.8"
            strokeOpacity="0.15"
            strokeLinecap="square"
          />
        </svg>
      </motion.div>

      {/* ── 레이어 5: 콘텐츠 ── */}
      <motion.div
        className="relative z-10 max-w-4xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* 로고 — 에너지 집결 → 과폭발 → 반동 → 안정 3단계 진입 */}
        <motion.div
          className="flex justify-center mb-4"
          initial={{ scale: 0.3, opacity: 0, filter: "blur(20px)" }}
          animate={{
            scale: [0.3, 1.2, 0.95, 1.05, 1],
            opacity: [0, 0.8, 1, 1, 1],
            filter: [
              "blur(20px)",
              "blur(4px)",
              "blur(0px)",
              "blur(0px)",
              "blur(0px)",
            ],
          }}
          transition={{
            duration: 1.0,
            times: [0, 0.4, 0.65, 0.8, 1],
            ease: "easeOut",
          }}
        >
          <div
            style={{
              // 비대칭 박동: 2.5s 주기, 40%에서 갑자기 밝아졌다 잦아듦
              // rounded-full 제거 — 사각형 로고 형태에 맞는 글로우
              animation: "core-glow-pulse 2.5s ease-in-out infinite",
            }}
          >
            <Logo size="xl" variant="icon-only" />
          </div>
        </motion.div>

        {/* 타이틀 — NEXUS (글리치 효과 적용) */}
        <motion.h1
          className={`${exo2.className} text-5xl md:text-7xl font-bold mb-4 tracking-wider relative`}
          variants={itemVariants}
        >
          <span
            className="bg-clip-text text-transparent relative"
            style={{
              backgroundImage: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})`,
              // 글리치 duration 0.2s로 — 전 구간 키프레임이 체감됨
              animation: isGlitching ? "glitch-flicker 0.2s ease-in-out" : "none",
            }}
          >
            NEXUS
          </span>

          {/* 글리치 시 색수차 레이어 — 좌측 빨강 편향 */}
          {isGlitching && (
            <>
              <span
                className="absolute inset-0 bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})`,
                  transform: "translateX(-2px)",
                  opacity: 0.5,
                  mixBlendMode: "screen",
                }}
                aria-hidden="true"
              >
                NEXUS
              </span>
              <span
                className="absolute inset-0 bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${PURPLE}, ${INDIGO})`,
                  transform: "translateX(2px)",
                  opacity: 0.5,
                  mixBlendMode: "screen",
                }}
                aria-hidden="true"
              >
                NEXUS
              </span>
            </>
          )}
        </motion.h1>

        {/* 서브타이틀 */}
        <motion.p
          className="text-xl md:text-2xl text-text-secondary mb-8"
          variants={itemVariants}
        >
          LoL 내전 토너먼트의 새로운 기준
        </motion.p>

        {/* CTA 버튼 — 인디고 → 퍼플 그라디언트 */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          variants={itemVariants}
        >
          {isAuthenticated ? (
            <Link href="/tournaments">
              <button
                className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-lg font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})`,
                  boxShadow: `0 0 20px ${rgba(INDIGO_RGB, 0.3)}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 35px ${rgba(INDIGO_RGB, 0.5)}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 20px ${rgba(INDIGO_RGB, 0.3)}`;
                }}
              >
                {/* 호버 시 빛 스위프 효과 */}
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <Swords className="h-5 w-5" />
                내전 참가하기
              </button>
            </Link>
          ) : (
            <>
              <Link href="/auth/login">
                <button
                  className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-lg font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                  style={{
                    background: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})`,
                    boxShadow: `0 0 20px ${rgba(INDIGO_RGB, 0.3)}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 35px ${rgba(INDIGO_RGB, 0.5)}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 20px ${rgba(INDIGO_RGB, 0.3)}`;
                  }}
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  Discord로 시작하기
                </button>
              </Link>
              <Link href="/tournaments">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                  자세히 알아보기
                </Button>
              </Link>
            </>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}
