"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";

// 파편 파티클 데이터
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  angle: number;
}

// 파티클 20개 미리 생성 (SSR 안전하게 고정값 사용)
const PARTICLES: Particle[] = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: (i * 37 + 13) % 100, // 의사 난수 분포
  y: (i * 53 + 7) % 100,
  size: 2 + (i % 4),
  delay: (i * 0.15) % 3,
  duration: 2 + (i % 3),
  angle: (i * 47) % 360,
}));

export function DiscordBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });

  // 마우스 위치 추적 (parallax 효과용)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  return (
    <a
      href="https://discord.gg/bKqH9pkfggb"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block rounded-2xl overflow-hidden cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setMousePos({ x: 0.5, y: 0.5 });
      }}
      onMouseMove={handleMouseMove}
    >
      {/* 배경 그라데이션 — Discord 블루 + Nexus accent */}
      <div
        className="absolute inset-0 transition-all duration-700 ease-out"
        style={{
          background: isHovered
            ? `radial-gradient(circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, #7289DA 0%, #5865F2 30%, #4338ca 70%, #1e1b4b 100%)`
            : "linear-gradient(135deg, #5865F2 0%, #4338ca 50%, #1e1b4b 100%)",
        }}
      />

      {/* 배경 패턴 — 미세한 그리드 */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* 호버 시 떠다니는 파편 파티클 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full transition-all duration-500"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background: p.id % 3 === 0
                ? "rgba(114,137,218,0.6)"  // Discord light blue
                : p.id % 3 === 1
                ? "rgba(99,102,241,0.5)"   // Indigo
                : "rgba(255,255,255,0.3)",  // White
              opacity: isHovered ? 1 : 0,
              transform: isHovered
                ? `translate(${Math.sin(p.angle) * 15}px, ${Math.cos(p.angle) * 15}px) scale(1)`
                : "translate(0, 0) scale(0)",
              animation: isHovered
                ? `float-particle ${p.duration}s ease-in-out ${p.delay}s infinite alternate`
                : "none",
            }}
          />
        ))}
      </div>

      {/* 메인 컨텐츠 */}
      <div
        ref={containerRef}
        className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-10 py-10 md:py-14 px-6 md:px-12"
      >
        {/* 왼쪽 — Nexus 로고 (호버 시 살짝 위로 + 회전) */}
        <div
          className="shrink-0 transition-all duration-500 ease-out"
          style={{
            transform: isHovered
              ? `translateY(-8px) rotate(-3deg) scale(1.05)`
              : "translateY(0) rotate(0) scale(1)",
            filter: isHovered ? "drop-shadow(0 8px 24px rgba(88,101,242,0.4))" : "none",
          }}
        >
          <Image
            src="/images/nexus.png"
            alt="Nexus"
            width={80}
            height={80}
            className="object-contain"
          />
        </div>

        {/* 중앙 — 멘트 */}
        <div className="flex-1 text-center md:text-left">
          <p
            className="text-2xl md:text-3xl font-bold text-white mb-2 transition-all duration-500 ease-out"
            style={{
              transform: isHovered
                ? "translateX(6px)"
                : "translateX(0)",
            }}
          >
            솔랭은 잠깐 쉬고,
            <br className="hidden sm:block" />{" "}
            <span className="text-[#7289DA]">진짜 내전</span> 한 판 어때?
          </p>
          <p
            className="text-sm md:text-base text-white/60 transition-all duration-500 ease-out"
            style={{
              transform: isHovered
                ? "translateX(10px)"
                : "translateX(0)",
            }}
          >
            경매 드래프트 · 자동 밸런싱 · 실시간 매칭
          </p>
        </div>

        {/* 오른쪽 — Discord 참가 버튼 */}
        <div
          className="shrink-0 flex items-center gap-2.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-5 py-3 transition-all duration-500 ease-out"
          style={{
            transform: isHovered
              ? "translateX(4px) scale(1.03)"
              : "translateX(0) scale(1)",
            background: isHovered
              ? "rgba(255,255,255,0.18)"
              : "rgba(255,255,255,0.1)",
            boxShadow: isHovered
              ? "0 4px 20px rgba(88,101,242,0.3)"
              : "none",
          }}
        >
          {/* Discord 로고 SVG */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 71 55"
            fill="white"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.4 37.4 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 4.9a.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.2a58.9 58.9 0 0017.7 9a.2.2 0 00.3-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.4 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.7 58.7 0 0070.5 45.7v-.2c1.4-15-2.3-28-9.8-39.6a.2.2 0 00-.1 0zM23.7 37.3c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.3 3.1 6.3 7-2.8 7-6.3 7zm23.2 0c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.1 6.3 7-2.8 7-6.3 7z" />
          </svg>
          <span className="text-white font-semibold text-sm md:text-base whitespace-nowrap">
            Discord 참가하기
          </span>
          {/* 화살표 — 호버 시 오른쪽으로 이동 */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="shrink-0 transition-transform duration-300"
            style={{
              transform: isHovered ? "translateX(3px)" : "translateX(0)",
            }}
          >
            <path
              d="M6 3l5 5-5 5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* 하단 glow 효과 — 호버 시 나타남 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px transition-opacity duration-500"
        style={{
          opacity: isHovered ? 1 : 0,
          background: "linear-gradient(90deg, transparent, #7289DA, transparent)",
        }}
      />

    </a>
  );
}
