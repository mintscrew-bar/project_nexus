"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronDown, Swords } from "lucide-react";
import { Exo_2 } from "next/font/google";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";

const exo2 = Exo_2({ subsets: ["latin"], weight: ["700"] });

// 로고 그라디언트 기반 색상 팔레트
const INDIGO = "#667EEA";
const PURPLE = "#764BA2";
const INDIGO_RGB = { r: 102, g: 126, b: 234 };

const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r},${c.g},${c.b},${a})`;

// 콘텐츠 등장 — stagger
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// 코너 브래킷 (LoL UI 스타일)
const cornerVariants = {
  topLeft: {
    hidden: { x: -16, y: -16, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.1 } },
  },
  topRight: {
    hidden: { x: 16, y: -16, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
  },
  bottomLeft: {
    hidden: { x: -16, y: 16, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.3 } },
  },
  bottomRight: {
    hidden: { x: 16, y: 16, opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.4 } },
  },
};

interface HeroBannerProps {
  isAuthenticated?: boolean;
}

export function HeroBanner({ isAuthenticated = false }: HeroBannerProps) {
  // 마우스 패럴랙스 — RAF lerp (리렌더 없음)
  const hexGridRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const LERP = 0.05;
    const tick = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;
      cur.x += (tgt.x - cur.x) * LERP;
      cur.y += (tgt.y - cur.y) * LERP;

      if (Math.abs(cur.x - tgt.x) > 0.001 || Math.abs(cur.y - tgt.y) > 0.001) {
        if (hexGridRef.current)
          hexGridRef.current.style.transform = `translate(${cur.x * 10}px, ${cur.y * 10}px)`;
        if (glowRef.current)
          glowRef.current.style.transform = `translate(${cur.x * 20}px, ${cur.y * 20}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    targetRef.current = {
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    targetRef.current = { x: 0, y: 0 };
  }, []);

  // 바깥 육각형 꼭짓점 계산
  const hexVertices = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const r = 130;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });
  const hexPoints = hexVertices.map((v) => `${v.x},${v.y}`).join(" ");

  // 로그인 후 — 컴팩트 배너 (높이 고정, 핵심 요소만)
  if (isAuthenticated) {
    return (
      <section
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative flex items-center justify-center h-[160px] md:h-[180px] px-4 overflow-hidden bg-bg-primary"
      >
        {/* 헥스 그리드 배경 */}
        <div ref={hexGridRef} className="absolute inset-0 pointer-events-none" style={{ willChange: "transform" }}>
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hex-grid-auth" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
                <polygon points="28,2 51,16 51,44 28,58 5,44 5,16" fill="none" stroke={INDIGO} strokeWidth="0.5" strokeOpacity="0.05" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hex-grid-auth)" />
          </svg>
        </div>

        {/* 중심 글로우 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            ref={glowRef}
            className="absolute rounded-full"
            style={{
              width: 360,
              height: 360,
              background: `radial-gradient(circle, ${rgba(INDIGO_RGB, 0.1)} 0%, ${rgba(INDIGO_RGB, 0.03)} 50%, transparent 70%)`,
              willChange: "transform",
            }}
          />
        </div>

        {/* 콘텐츠 — 로고 + 타이틀 + CTA 가로 배치 */}
        <motion.div
          className="relative z-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center gap-3">
            <Logo size="sm" variant="icon-only" />
            <span
              className={`${exo2.className} text-2xl md:text-3xl font-bold tracking-wider bg-clip-text text-transparent`}
              style={{ backgroundImage: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})` }}
            >
              NEXUS
            </span>
          </div>

          <p className="hidden sm:block text-sm text-text-secondary">
            솔랭 억까에 지쳤다면?{" "}
            <span className="text-text-primary">여기서 제대로 된 한 판.</span>
          </p>

          <Link href="/tournaments">
            <button
              className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white overflow-hidden transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})`,
                boxShadow: `0 0 16px ${rgba(INDIGO_RGB, 0.3)}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 28px ${rgba(INDIGO_RGB, 0.5)}`; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 0 16px ${rgba(INDIGO_RGB, 0.3)}`; }}
            >
              <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <Swords className="h-3.5 w-3.5" />
              내전 참가하기
            </button>
          </Link>
        </motion.div>
      </section>
    );
  }

  return (
    <section
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative flex flex-col items-center justify-center h-[calc(100svh-80px)] min-h-[560px] px-4 text-center overflow-hidden bg-bg-primary"
    >
      {/* 레이어 1: 헥스 그리드 배경 — 마우스 패럴랙스 */}
      <div
        ref={hexGridRef}
        className="absolute inset-0 pointer-events-none"
        style={{ willChange: "transform" }}
      >
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hex-grid" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
              <polygon points="28,2 51,16 51,44 28,58 5,44 5,16" fill="none" stroke={INDIGO} strokeWidth="0.5" strokeOpacity="0.05" />
              <polygon points="28,52 51,66 51,94 28,108 5,94 5,66" fill="none" stroke={PURPLE} strokeWidth="0.5" strokeOpacity="0.03" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-grid)" />
        </svg>
      </div>

      {/* 레이어 2: 중심 글로우 + 육각형 — 마우스 패럴랙스 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* 방사형 글로우 */}
        <div
          ref={glowRef}
          className="absolute rounded-full"
          style={{
            width: 560,
            height: 560,
            background: `radial-gradient(circle, ${rgba(INDIGO_RGB, 0.14)} 0%, ${rgba(INDIGO_RGB, 0.04)} 50%, transparent 70%)`,
            willChange: "transform",
          }}
        />

        {/* 육각형 프레임 — 1개, 느린 회전 */}
        <svg
          className="absolute"
          width="320"
          height="320"
          viewBox="-160 -160 320 320"
          style={{ overflow: "visible" }}
        >
          <polygon
            points={hexPoints}
            fill="none"
            stroke={INDIGO}
            strokeWidth="1"
            strokeOpacity="0.2"
            style={{ animation: "hex-rotate-cw 40s linear infinite", transformOrigin: "center" }}
          />
          {/* 꼭짓점 강조 — 정적 */}
          {hexVertices.map((v, i) => (
            <circle key={i} cx={v.x} cy={v.y} r={2.5} fill={INDIGO} opacity="0.35" />
          ))}
        </svg>
      </div>

      {/* 레이어 3: 코너 브래킷 */}
      <motion.div className="absolute top-6 left-6 pointer-events-none" variants={cornerVariants.topLeft} initial="hidden" animate="visible">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <path d="M2 16 L2 2 L16 2" stroke={INDIGO} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="square" />
        </svg>
      </motion.div>
      <motion.div className="absolute top-6 right-6 pointer-events-none" variants={cornerVariants.topRight} initial="hidden" animate="visible">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <path d="M28 2 L42 2 L42 16" stroke={INDIGO} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="square" />
        </svg>
      </motion.div>
      <motion.div className="absolute bottom-6 left-6 pointer-events-none" variants={cornerVariants.bottomLeft} initial="hidden" animate="visible">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <path d="M2 28 L2 42 L16 42" stroke={INDIGO} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="square" />
        </svg>
      </motion.div>
      <motion.div className="absolute bottom-6 right-6 pointer-events-none" variants={cornerVariants.bottomRight} initial="hidden" animate="visible">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <path d="M28 42 L42 42 L42 28" stroke={INDIGO} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="square" />
        </svg>
      </motion.div>

      {/* 스크롤 인디케이터 — 다음 섹션 존재 신호 */}
      <motion.button
        type="button"
        aria-label="아래로 스크롤"
        onClick={() =>
          window.scrollBy({ top: window.innerHeight - 80, behavior: "smooth" })
        }
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.6 }}
      >
        <span className="text-[11px] tracking-[0.2em] uppercase opacity-70">
          Scroll
        </span>
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-5 w-5" />
        </motion.span>
      </motion.button>

      {/* 레이어 4: 콘텐츠 */}
      <motion.div
        className="relative z-10 max-w-3xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* 로고 */}
        <motion.div
          className="flex justify-center mb-6"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <Logo size="xl" variant="icon-only" />
        </motion.div>

        {/* 타이틀 */}
        <motion.h1
          className={`${exo2.className} text-5xl sm:text-6xl md:text-8xl font-bold mb-5 tracking-wider`}
          variants={itemVariants}
        >
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})` }}
          >
            NEXUS
          </span>
        </motion.h1>

        {/* 서브타이틀 */}
        <motion.p
          className="text-base sm:text-lg md:text-xl text-text-secondary mb-8 md:mb-10 leading-relaxed"
          variants={itemVariants}
        >
          솔랭 억까에 지쳤다면?<br className="sm:hidden" />{" "}
          <span className="text-text-primary">여기서 제대로 된 한 판.</span>
        </motion.p>

        {/* CTA */}
        <motion.div className="flex flex-col sm:flex-row gap-3 justify-center" variants={itemVariants}>
          <Link href="/auth/login">
            <button
              className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-base font-semibold text-white overflow-hidden transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${INDIGO}, ${PURPLE})`,
                boxShadow: `0 0 24px ${rgba(INDIGO_RGB, 0.3)}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 36px ${rgba(INDIGO_RGB, 0.5)}`; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 0 24px ${rgba(INDIGO_RGB, 0.3)}`; }}
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
        </motion.div>
      </motion.div>
    </section>
  );
}
