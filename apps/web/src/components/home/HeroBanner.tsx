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
// 파티클
// ─────────────────────────────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: `${5 + ((i * 13 + 7) % 90)}%`,
  size: 2 + (i % 4),
  delay: `${(i * 0.6) % 10}s`,
  duration: `${5 + (i % 6) * 2}s`,
  color:
    i % 4 === 0
      ? "rgba(139,92,246,0.5)"
      : i % 4 === 1
      ? "rgba(99,102,241,0.45)"
      : i % 4 === 2
      ? "rgba(217,70,239,0.4)"
      : "rgba(168,85,247,0.35)",
}));

// ─────────────────────────────────────────────────────────────────────────────
// 궤도
// ─────────────────────────────────────────────────────────────────────────────
const ORBITS = [
  { radius: 80,  duration: "10s", reverse: false, color: "rgba(139,92,246,0.15)", dotSize: 6,  magnetStrength: 40 },
  { radius: 140, duration: "15s", reverse: true,  color: "rgba(99,102,241,0.12)", dotSize: 7,  magnetStrength: 55 },
  { radius: 210, duration: "20s", reverse: false, color: "rgba(217,70,239,0.10)", dotSize: 5,  magnetStrength: 70 },
  { radius: 290, duration: "28s", reverse: true,  color: "rgba(168,85,247,0.08)", dotSize: 8,  magnetStrength: 90 },
  { radius: 380, duration: "35s", reverse: false, color: "rgba(139,92,246,0.06)", dotSize: 6,  magnetStrength: 110 },
];

const ORBIT_DOT_COLORS = [
  { bg: "rgba(139,92,246,0.7)", shadow: "rgba(139,92,246,0.7)" },
  { bg: "rgba(99,102,241,0.6)", shadow: "rgba(99,102,241,0.6)" },
  { bg: "rgba(217,70,239,0.6)", shadow: "rgba(217,70,239,0.6)" },
  { bg: "rgba(168,85,247,0.5)", shadow: "rgba(168,85,247,0.5)" },
  { bg: "rgba(139,92,246,0.4)", shadow: "rgba(139,92,246,0.5)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 글로우 오브
// ─────────────────────────────────────────────────────────────────────────────
const GLOW_ORBS = [
  { x: "15%", y: "25%", size: 200, color: "rgba(139,92,246,0.08)", duration: "7s" },
  { x: "80%", y: "20%", size: 160, color: "rgba(217,70,239,0.06)", duration: "9s" },
  { x: "60%", y: "75%", size: 240, color: "rgba(99,102,241,0.07)", duration: "11s" },
  { x: "25%", y: "70%", size: 180, color: "rgba(168,85,247,0.06)", duration: "8s" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Framer Motion
// ─────────────────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

interface HeroBannerProps {
  isAuthenticated?: boolean;
}

export function HeroBanner({ isAuthenticated = false }: HeroBannerProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);

  // 목표값 (마우스 실제 위치), 현재값 (보간 중), RAF ID
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  // dot/글로우 오브용 state (CSS transition으로 처리)
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  // RAF 루프: 매 프레임 lerp로 부드럽게 궤도 기울기 업데이트
  useEffect(() => {
    const LERP_SPEED = 0.06; // 낮을수록 느리고 부드러움

    const animate = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;

      cur.x += (tgt.x - cur.x) * LERP_SPEED;
      cur.y += (tgt.y - cur.y) * LERP_SPEED;

      if (orbitRef.current) {
        orbitRef.current.style.transform =
          `perspective(500px) rotateX(${cur.y * -30}deg) rotateY(${cur.x * 30}deg)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    // RAF용 목표값 업데이트 (즉시, 상태 업데이트 없음)
    targetRef.current = { x, y };
    // dot/글로우용 state 업데이트
    setMouse({ x, y });
  }, []);

  const handleMouseLeave = useCallback(() => {
    targetRef.current = { x: 0, y: 0 };
    setMouse({ x: 0, y: 0 });
  }, []);

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative flex flex-col items-center justify-center h-screen min-h-[600px] px-4 text-center overflow-hidden"
    >
      {/* ── 레이어 1: 배경 그라데이션 ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(139,92,246,0.12) 0%, rgba(99,102,241,0.06) 40%, transparent 70%)",
          animation: "gradient-shift 8s ease-in-out infinite",
        }}
      />

      {/* ── 레이어 1.5: 글로우 오브 (마우스 따라 이동) ── */}
      <div className="absolute inset-0 pointer-events-none">
        {GLOW_ORBS.map((orb, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: orb.x,
              top: orb.y,
              width: orb.size,
              height: orb.size,
              background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
              transform: `translate(calc(-50% + ${mouse.x * 30 * (i % 2 === 0 ? 1 : -1)}px), calc(-50% + ${mouse.y * 30 * (i % 2 === 0 ? 1 : -1)}px))`,
              transition: "transform 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              animation: `glow-breathe ${orb.duration} ease-in-out infinite`,
              animationDelay: `${i * 1.5}s`,
            }}
          />
        ))}
      </div>

      {/* ── 레이어 2: 궤도 링 (RAF lerp 기울기 + 자석 혼합) ── */}
      <div
        ref={orbitRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
      >
        {ORBITS.map((orbit, i) => (
          <div
            key={i}
            className="absolute rounded-full border will-change-transform"
            style={{
              width: orbit.radius * 2,
              height: orbit.radius * 2,
              borderColor: orbit.color,
              animation: `orbit-spin ${orbit.duration} linear infinite ${orbit.reverse ? "reverse" : "normal"}`,
              // 궤도 링 자체도 마우스 방향으로 살짝 이동 (바깥 궤도일수록 더 크게)
              transform: `translate(${mouse.x * orbit.magnetStrength * 0.3}px, ${mouse.y * orbit.magnetStrength * 0.3}px)`,
              transition: "transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          >
            {/* 메인 dot — 마우스 쪽으로 끌려감 */}
            <div
              className="absolute rounded-full"
              style={{
                width: orbit.dotSize,
                height: orbit.dotSize,
                top: -(orbit.dotSize / 2),
                left: "50%",
                marginLeft: -(orbit.dotSize / 2),
                backgroundColor: ORBIT_DOT_COLORS[i].bg,
                boxShadow: `0 0 ${orbit.dotSize * 3}px ${ORBIT_DOT_COLORS[i].shadow}`,
                transform: `translate(${mouse.x * orbit.magnetStrength}px, ${mouse.y * orbit.magnetStrength}px)`,
                transition: "transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              }}
            />
            {/* 반대편 dot */}
            <div
              className="absolute rounded-full"
              style={{
                width: orbit.dotSize * 0.6,
                height: orbit.dotSize * 0.6,
                bottom: -(orbit.dotSize * 0.3),
                left: "50%",
                marginLeft: -(orbit.dotSize * 0.3),
                backgroundColor: ORBIT_DOT_COLORS[i].bg,
                opacity: 0.5,
                transform: `translate(${mouse.x * orbit.magnetStrength * 0.5}px, ${mouse.y * orbit.magnetStrength * 0.5}px)`,
                transition: "transform 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              }}
            />
          </div>
        ))}
      </div>

      {/* 떠오르는 파티클 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute bottom-0 rounded-full"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animation: `float-up ${p.duration} ease-in-out infinite`,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* ── 레이어 3: 콘텐츠 ── */}
      <motion.div
        className="relative z-10 max-w-4xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* 로고 */}
        <motion.div
          className="flex justify-center mb-4"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 0.5,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          <Logo size="xl" variant="icon-only" />
        </motion.div>

        {/* 타이틀 */}
        <motion.h1
          className={`${exo2.className} text-5xl md:text-7xl font-bold mb-4 tracking-wider`}
          variants={itemVariants}
        >
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg, #8b5cf6, #6366f1, #d946ef)",
            }}
          >
            NEXUS
          </span>
        </motion.h1>

        {/* 서브타이틀 */}
        <motion.p
          className="text-xl md:text-2xl text-text-secondary mb-8"
          variants={itemVariants}
        >
          LoL 내전 토너먼트의 새로운 기준
        </motion.p>

        {/* CTA 버튼 */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          variants={itemVariants}
        >
          {isAuthenticated ? (
            <Link href="/tournaments">
              <button
                className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-lg font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6, #6366f1, #7c3aed)",
                }}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <Swords className="h-5 w-5" />
                내전 참가하기
              </button>
            </Link>
          ) : (
            <>
              <Link href="/auth/login">
                <button
                  className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-lg font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6, #6366f1, #7c3aed)",
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
