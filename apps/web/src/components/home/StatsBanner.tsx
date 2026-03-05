"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { STATS_COLORS, bannerBadgeStyle, bannerGlowGradient } from "./banner-constants";

// ─────────────────────────────────────────────────────────────────────────────
// 상수 정의
// ─────────────────────────────────────────────────────────────────────────────

// 테마 색상 — 공통 상수에서 가져옴
const INDIGO = STATS_COLORS.primary;
const INDIGO_DARK = STATS_COLORS.dark;
const INDIGO_LIGHT = STATS_COLORS.glow;

// 좌측 배경 / 우측 배경
const BG_LEFT = STATS_COLORS.bgLeft;
const BG_RIGHT = STATS_COLORS.bgRight;

// 스탯 데이터 — 우측 패널에 표시될 3개 행
interface StatRow {
  label: string;
  targetValue: number;  // 카운트업 목표값
  displaySuffix: string; // 숫자 뒤 붙는 문자 (%, 배수 등)
  decimals: number;      // 소수점 자릿수
  barPercent: number;    // progress bar 퍼센트 (0~100)
}

const STATS: StatRow[] = [
  { label: "승률",  targetValue: 72,  displaySuffix: "%", decimals: 0, barPercent: 72 },
  { label: "KDA",  targetValue: 3.4, displaySuffix: "",  decimals: 1, barPercent: 68 },
  { label: "출전",  targetValue: 47,  displaySuffix: "",  decimals: 0, barPercent: 47 },
];

// 카운트업 소요 시간 (ms)
const STAT_COUNT_DURATION = 1400;

// ─────────────────────────────────────────────────────────────────────────────
// StatsBanner 컴포넌트
// "스코어보드" 컨셉 — 좌우 60:40 분할 레이아웃
// ─────────────────────────────────────────────────────────────────────────────

export function StatsBanner() {
  const [isHovered, setIsHovered] = useState(false);

  // 스탯 카운트업 — 마운트 시 0→목표값
  const [statValues, setStatValues] = useState<number[]>([0, 0, 0]);
  const countStarted = useRef(false);

  useEffect(() => {
    if (countStarted.current) return;
    countStarted.current = true;

    // 숫자 카운트업 — RAF 기반 easeOutCubic
    // 프로그레스 바는 CSS @keyframes bar-fill 로 처리 (transition보다 안정적)
    const start = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / STAT_COUNT_DURATION, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);

      setStatValues(STATS.map((s) => {
        const val = eased * s.targetValue;
        // 소수점 처리
        return s.decimals > 0
          ? parseFloat(val.toFixed(s.decimals))
          : Math.floor(val);
      }));

      if (progress < 1) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    // 언마운트 시 RAF 루프 취소 — 슬라이드 전환 시 누수 방지
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <Link
      href="/matches"
      aria-label="내전 전적 통계 — 매치 기록 페이지로 이동"
      className="group relative block h-full rounded-2xl overflow-hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── 배경: 좌우 분할 (좌 60% 어두운 인디고, 우 40% 약간 밝은 인디고) ── */}
      <div className="absolute inset-0 flex">
        <div className="w-[60%]" style={{ background: BG_LEFT }} />
        <div className="w-[40%]" style={{ background: BG_RIGHT }} />
      </div>

      {/* 세로 구분선 — indigo glow */}
      <div
        className="absolute top-0 bottom-0 left-[60%] w-px pointer-events-none hidden md:block"
        style={{
          background: `linear-gradient(180deg, transparent, ${INDIGO}50, transparent)`,
          boxShadow: isHovered ? `0 0 8px ${INDIGO}40` : "none",
          transition: "box-shadow 0.5s ease",
        }}
      />

      {/* 우측 패널 배경 — 미세한 도트 그리드 */}
      <div
        className="absolute top-0 bottom-0 left-[60%] right-0 opacity-[0.05] pointer-events-none hidden md:block"
        style={{
          backgroundImage: `radial-gradient(${INDIGO}60 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      />

      {/* 호버 시 우측 패널 전체 밝아지는 오버레이 */}
      <div
        className="absolute top-0 bottom-0 left-[60%] right-0 pointer-events-none transition-opacity duration-500 hidden md:block"
        style={{
          background: `${INDIGO}08`,
          opacity: isHovered ? 1 : 0,
        }}
      />

      {/* ── 메인 컨텐츠: 좌우 분할 ── */}
      <div className="relative z-10 flex flex-col md:flex-row h-full">

        {/* ── 좌측 60% — 타이틀 영역 ── */}
        {/* 좌측 — 타이틀 영역 (모바일: 전체 너비, 패딩 축소) */}
        <div className="w-full md:w-[60%] flex flex-col justify-center px-4 md:px-10 py-3 md:py-10">
          {/* UPDATE 뱃지 */}
          <span
            className="inline-block w-fit px-3 py-1 rounded-full text-[11px] font-bold tracking-wider mb-1.5 md:mb-3"
            style={bannerBadgeStyle(INDIGO_LIGHT)}
          >
            UPDATE
          </span>

          {/* 큰 타이틀 — DiscordBanner 수준의 후크 */}
          {/* 큰 타이틀 — 모바일에서 폰트 축소 */}
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white mb-1.5 md:mb-2">
            내전을{" "}
            <span style={{ color: INDIGO_LIGHT }}>지배하는</span>{" "}
            데이터
          </h3>

          {/* 설명 텍스트 — 크고 밝게 */}
          {/* 설명 텍스트 — 모바일에서 축소 */}
          <p className="text-xs sm:text-sm md:text-base text-white/60 leading-relaxed mb-2 md:mb-5">
            KDA, 챔피언, 포지션 통계를 자동으로 기록.
            <br className="hidden sm:block" />
            나의 성장을 한눈에.
          </p>

        </div>

        {/* ── 우측 — 스탯 패널 (모바일에서 숨김) ── */}
        <div className="hidden md:flex w-full md:w-[40%] flex-col justify-center px-5 md:px-8 py-5 md:py-10">
          {/* 시즌 헤더 */}
          <p className="text-[10px] text-white/30 tracking-wider font-bold mb-4 uppercase">
            이번 시즌
          </p>

          {/* 스탯 행 3개 */}
          <div className="flex flex-col gap-3">
            {STATS.map((stat, i) => (
              <div key={stat.label}>
                {/* 라벨 + 숫자 행 */}
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-white/40 font-medium">
                    {stat.label}
                  </span>
                  <span
                    className="text-2xl md:text-3xl font-black tabular-nums"
                    style={{ color: INDIGO_LIGHT }}
                  >
                    {stat.decimals > 0
                      ? statValues[i].toFixed(stat.decimals)
                      : statValues[i]}
                    <span className="text-xs text-white/30 ml-0.5">
                      {stat.displaySuffix}
                    </span>
                  </span>
                </div>

                {/* progress bar — CSS keyframe animation (transition보다 마운트 시 안정적) */}
                <div className="relative w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full rounded-full"
                    style={{
                      "--bar-target": `${stat.barPercent}%`,
                      background: `linear-gradient(90deg, ${INDIGO}, ${INDIGO_LIGHT})`,
                      boxShadow: `0 0 8px ${INDIGO}50`,
                      animation: `bar-fill 1.2s cubic-bezier(0.16, 1, 0.3, 1) ${200 + i * 150}ms both`,
                    } as React.CSSProperties & { "--bar-target": string }}
                  />
                </div>

                {/* 구분선 (마지막 행 제외) */}
                {i < STATS.length - 1 && (
                  <div className="mt-3 h-px bg-white/[0.04]" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 glow 라인 — indigo */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px transition-opacity duration-500"
        style={{
          opacity: isHovered ? 1 : 0.3,
          background: bannerGlowGradient(INDIGO),
        }}
      />
    </Link>
  );
}
