"use client";

import { useState, useEffect } from "react";
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

export function StatsBanner({ isActive = true }: { isActive?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);

  // 스탯 카운트업 — 슬라이드가 활성화될 때마다 0→목표값
  const [statValues, setStatValues] = useState<number[]>([0, 0, 0]);

  useEffect(() => {
    // 비활성 시 0으로 리셋 — 다음 활성화 때 처음부터 카운트업
    if (!isActive) {
      setStatValues([0, 0, 0]);
      return;
    }

    // 숫자 카운트업 — RAF 기반 easeOutCubic
    const start = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / STAT_COUNT_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setStatValues(STATS.map((s) => {
        const val = eased * s.targetValue;
        return s.decimals > 0
          ? parseFloat(val.toFixed(s.decimals))
          : Math.floor(val);
      }));

      if (progress < 1) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [isActive]);

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

      {/* 좌측 배경 장식 — 미니 차트 실루엣 (우측 하단, 희미하게) */}
      <svg
        className="absolute right-[42%] md:right-[42%] bottom-2 w-28 h-20 md:w-36 md:h-24 pointer-events-none"
        viewBox="0 0 140 80"
        fill="none"
        style={{ opacity: isHovered ? 0.08 : 0.04, transition: "opacity 0.5s ease" }}
      >
        {/* 상승 꺾은선 그래프 */}
        <polyline
          points="10,65 30,55 50,60 70,40 90,35 110,20 130,10"
          stroke={INDIGO_LIGHT}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* 아래 영역 채우기 */}
        <polygon
          points="10,65 30,55 50,60 70,40 90,35 110,20 130,10 130,75 10,75"
          fill={`${INDIGO}40`}
        />
      </svg>

      {/* indigo 글로우 광원 — 좌측 상단 */}
      <div
        className="absolute -top-12 -left-12 w-40 h-40 rounded-full pointer-events-none transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle, ${INDIGO}18 0%, transparent 70%)`,
          opacity: isHovered ? 0.9 : 0.5,
        }}
      />

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
        <div className="w-full md:w-[60%] flex flex-col justify-center px-[5%] py-[5%] md:px-[7%]">
          {/* UPDATE 뱃지 */}
          <span
            className="inline-block w-fit px-3 py-1 rounded-full text-[11px] font-bold tracking-wider mb-1.5 md:mb-3"
            style={bannerBadgeStyle(INDIGO_LIGHT)}
          >
            UPDATE
          </span>

          {/* 큰 타이틀 — 호버 시 미세 슬라이드 */}
          <h3
            className="text-xl sm:text-2xl md:text-3xl font-black text-white mb-1.5 md:mb-2 transition-transform duration-500 ease-out"
            style={{ transform: isHovered ? "translateX(4px)" : "translateX(0)" }}
          >
            당신의 폼,{" "}
            <span style={{ color: INDIGO_LIGHT }}>우리가 다 기록</span>하고
            있습니다
          </h3>

          {/* 설명 텍스트 — 호버 시 약간 더 이동 */}
          <p
            className="text-xs sm:text-sm md:text-base text-white/60 leading-relaxed mb-2 md:mb-5 transition-transform duration-500 ease-out"
            style={{ transform: isHovered ? "translateX(8px)" : "translateX(0)" }}
          >
            KDA, 모스트, 주포지션. 숨길 수 없는 당신의 데이터.
            <br className="hidden sm:block" />
            &ldquo;나 잘했는데?&rdquo; 이제 데이터로 증명하세요.
          </p>

          {/* 모바일 전용 미니 스탯 — md 이상에서는 우측 패널이 담당 */}
          <div className="flex md:hidden items-center gap-4">
            {STATS.map((stat, i) => (
              <div key={stat.label} className="flex items-baseline gap-1">
                <span className="text-[10px] text-white/35">{stat.label}</span>
                <span
                  className="text-lg font-black tabular-nums"
                  style={{ color: INDIGO_LIGHT }}
                >
                  {stat.decimals > 0
                    ? statValues[i].toFixed(stat.decimals)
                    : statValues[i]}
                </span>
                <span className="text-[10px] text-white/25">{stat.displaySuffix}</span>
              </div>
            ))}
          </div>

        </div>

        {/* ── 우측 — 스탯 패널 (모바일에서 숨김) ── */}
        <div className="hidden md:flex w-full md:w-[40%] flex-col justify-center px-[4%] py-[5%] md:px-[6%]">
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
                      animation: isActive
                        ? `bar-fill 1.2s cubic-bezier(0.16, 1, 0.3, 1) ${200 + i * 150}ms both`
                        : "none",
                      width: isActive ? undefined : "0%",
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
