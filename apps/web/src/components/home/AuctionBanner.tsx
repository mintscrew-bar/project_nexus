"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AUCTION_COLORS, bannerBadgeStyle, bannerGlowGradient } from "./banner-constants";

// ─────────────────────────────────────────────────────────────────────────────
// 상수 정의
// ─────────────────────────────────────────────────────────────────────────────

// 테마 색상 — 공통 상수에서 가져옴
const VIOLET = AUCTION_COLORS.primary;
const VIOLET_GLOW = AUCTION_COLORS.glow;
const GOLD = AUCTION_COLORS.accent;
const BG_DARK = AUCTION_COLORS.bg;

// ─────────────────────────────────────────────────────────────────────────────
// 팀 슬롯 데이터 — 5v5 경매 드래프트로 채워지는 슬롯
// ─────────────────────────────────────────────────────────────────────────────

/** 롤 포지션 (LoL 5인 구성) */
const POSITIONS = ["TOP", "JGL", "MID", "BOT", "SUP"] as const;

/** 팀 색상 */
const TEAM_BLUE = AUCTION_COLORS.teamBlue;
const TEAM_RED = AUCTION_COLORS.teamRed;

/** 슬롯 상태: "filled"=낙찰됨, "bidding"=현재 입찰 중, "empty"=미입찰 */
type SlotState = "filled" | "bidding" | "empty";

interface TeamSlot {
  position: (typeof POSITIONS)[number];
  state: SlotState;
  /** 낙찰 포인트 (filled일 때만) */
  points?: number;
}

// 블루팀 초기 상태 — 일부만 채워진 모습
const INITIAL_BLUE: TeamSlot[] = [
  { position: "TOP", state: "filled", points: 280 },
  { position: "JGL", state: "filled", points: 350 },
  { position: "MID", state: "bidding" },
  { position: "BOT", state: "empty" },
  { position: "SUP", state: "empty" },
];

// 레드팀 초기 상태
const INITIAL_RED: TeamSlot[] = [
  { position: "TOP", state: "filled", points: 310 },
  { position: "JGL", state: "bidding" },
  { position: "MID", state: "empty" },
  { position: "BOT", state: "empty" },
  { position: "SUP", state: "empty" },
];

// 입찰 경쟁 시뮬레이션 — 화면에 떠오르는 입찰 알림들
interface BidEvent {
  id: number;
  team: "blue" | "red";
  points: number;
  /** 등장 딜레이(ms) — 마운트 시점 기준 */
  delay: number;
}

const BID_EVENTS: BidEvent[] = [
  { id: 0, team: "blue", points: 150, delay: 600 },
  { id: 1, team: "red", points: 200, delay: 1200 },
  { id: 2, team: "blue", points: 250, delay: 1800 },
  { id: 3, team: "red", points: 300, delay: 2400 },
  { id: 4, team: "blue", points: 350, delay: 3000 },
];

// 입찰 카운터 표시 최대값 (현재 경매 중인 선수의 최고가가 올라가는 연출)
const BID_COUNT_STEPS = [150, 200, 250, 300, 350];

// ─────────────────────────────────────────────────────────────────────────────
// AuctionBanner 컴포넌트
// 경매 드래프트 팀 구성 시각화 — 큰 후크 + 슬롯 채우기 + 실시간 입찰 경쟁
// ─────────────────────────────────────────────────────────────────────────────

export function AuctionBanner({ isActive = true }: { isActive?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);

  // 현재 표시 중인 입찰 이벤트 인덱스 (순차 등장)
  const [bidIndex, setBidIndex] = useState(0);

  // 입찰가 카운터 — 최신 입찰 로그와 동기화
  const currentBid = BID_COUNT_STEPS[Math.max(bidIndex - 1, 0)];

  // 슬라이드가 활성화될 때마다 입찰 이벤트 재시작
  useEffect(() => {
    if (!isActive) {
      setBidIndex(0);
      return;
    }

    // 각 입찰 이벤트를 시간차로 등장시킴
    const ids = BID_EVENTS.map((evt, i) =>
      setTimeout(() => setBidIndex(i + 1), evt.delay)
    );
    return () => ids.forEach(clearTimeout);
  }, [isActive]);

  return (
    <Link
      href="/tournaments"
      aria-label="경매 드래프트 시스템 — 내전방 목록으로 이동"
      className="group relative block h-full rounded-2xl overflow-hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── 배경: 다크 퍼플 그라데이션 ── */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${BG_DARK} 0%, #120a2e 50%, ${BG_DARK} 100%)`,
        }}
      />

      {/* 배경 그리드 패턴 — 경매장 느낌의 미세한 격자 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* violet 글로우 광원 — 우측 상단 (주 광원) */}
      <div
        className="absolute -top-20 -right-20 w-56 h-56 rounded-full pointer-events-none transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle, ${VIOLET}25 0%, transparent 70%)`,
          opacity: isHovered ? 1 : 0.6,
        }}
      />

      {/* gold 글로우 광원 — 좌측 하단 (입찰가 강조, 경매 긴장감) */}
      <div
        className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full pointer-events-none transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle, ${GOLD}15 0%, ${VIOLET}08 40%, transparent 70%)`,
          opacity: isHovered ? 0.9 : 0.5,
        }}
      />

      {/* ── 메인 콘텐츠: 모바일 세로 / md 이상 좌우 분할 ── */}
      <div className="relative z-10 flex flex-col md:flex-row h-full">

        {/* ── 좌측 — DRAFT 뱃지 + 큰 후크 + 입찰가 (모바일: 전체 너비) ── */}
        <div className="flex flex-col justify-center px-4 py-3 md:px-8 md:py-6 w-full md:w-[55%] shrink-0">
          {/* DRAFT 뱃지 */}
          <span
            className="inline-block w-fit px-3 py-1 rounded-full text-[11px] font-bold tracking-wider mb-1.5 md:mb-3"
            style={bannerBadgeStyle(VIOLET_GLOW)}
          >
            DRAFT
          </span>

          {/* 큰 후크 타이틀 — 호버 시 미세 슬라이드 */}
          <h3
            className="text-xl sm:text-2xl md:text-3xl font-black text-white mb-1.5 transition-transform duration-500 ease-out"
            style={{ transform: isHovered ? "translateX(4px)" : "translateX(0)" }}
          >
            포인트로{" "}
            <span style={{ color: VIOLET_GLOW }}>최강팀</span>을 구성하라
          </h3>

          {/* 부제목 — 호버 시 약간 더 이동 */}
          <p
            className="text-xs sm:text-sm text-white/55 mb-1.5 md:mb-4 transition-transform duration-500 ease-out"
            style={{ transform: isHovered ? "translateX(8px)" : "translateX(0)" }}
          >
            실시간 입찰 · 전략적 드래프트
          </p>

          {/* 현재 입찰가 — 호버 시 glow 강화 */}
          <div
            className="flex items-baseline gap-1.5 transition-transform duration-500 ease-out"
            style={{ transform: isHovered ? "translateX(8px)" : "translateX(0)" }}
          >
            <span className="text-[11px] text-white/30 tracking-wider">현재 입찰</span>
            <span
              className="text-xl md:text-2xl font-black tabular-nums transition-all duration-300"
              style={{
                color: GOLD,
                textShadow: isHovered ? `0 0 20px ${GOLD}60` : `0 0 12px ${GOLD}40`,
              }}
            >
              {currentBid}
            </span>
            <span className="text-xs text-white/40 font-medium">P</span>
          </div>
        </div>

        {/* 세로 구분선 — 모바일에서 숨김 */}
        <div
          className="hidden md:block w-px self-stretch my-6 shrink-0"
          style={{ background: `linear-gradient(180deg, transparent, ${VIOLET}30, transparent)` }}
        />

        {/* ── 우측 — 5v5 슬롯 시각화 (모바일에서 숨김) ── */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-2 md:gap-4 px-4 md:px-6 py-5">

          {/* 블루팀 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] font-bold tracking-widest text-center mb-0.5" style={{ color: TEAM_BLUE }}>
              BLUE
            </p>
            {INITIAL_BLUE.map((slot) => (
              <SlotCell key={`blue-${slot.position}`} slot={slot} teamColor={TEAM_BLUE} />
            ))}
          </div>

          {/* VS */}
          <span
            className="text-base font-black shrink-0"
            style={{ color: `${VIOLET}70`, textShadow: `0 0 12px ${VIOLET}30` }}
          >
            VS
          </span>

          {/* 레드팀 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] font-bold tracking-widest text-center mb-0.5" style={{ color: TEAM_RED }}>
              RED
            </p>
            {INITIAL_RED.map((slot) => (
              <SlotCell key={`red-${slot.position}`} slot={slot} teamColor={TEAM_RED} />
            ))}
          </div>

          {/* 입찰 로그 (데스크톱만) */}
          <div className="hidden lg:flex flex-col gap-1 ml-2 w-24">
            <p className="text-[9px] text-white/25 tracking-wider mb-1">입찰 로그</p>
            {BID_EVENTS.map((evt, i) => {
              const isVisible = i < bidIndex;
              return (
                <div
                  key={evt.id}
                  className="flex items-center gap-1.5 transition-all duration-400 ease-out"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateX(0)" : "translateX(-8px)",
                  }}
                >
                  <span
                    className="block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: evt.team === "blue" ? TEAM_BLUE : TEAM_RED }}
                  />
                  <span className="text-[10px] text-white/50 tabular-nums">{evt.points}P</span>
                  {i === bidIndex - 1 && (
                    <span
                      className="text-[8px] font-bold px-1 rounded"
                      style={{ color: GOLD, backgroundColor: `${GOLD}15` }}
                    >
                      NEW
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 하단 glow 라인 — violet */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px transition-opacity duration-500"
        style={{
          opacity: isHovered ? 1 : 0.4,
          background: bannerGlowGradient(VIOLET),
        }}
      />

      {/* 호버 시 전체 배경 미세 밝아짐 */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: `linear-gradient(135deg, ${VIOLET}06 0%, transparent 50%)`,
          opacity: isHovered ? 1 : 0,
        }}
      />
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotCell — 개별 포지션 슬롯
// ─────────────────────────────────────────────────────────────────────────────

function SlotCell({
  slot,
  teamColor,
}: {
  slot: TeamSlot;
  teamColor: string;
}) {
  const { position, state, points } = slot;

  // 슬롯 상태별 스타일 분기
  if (state === "filled") {
    // 낙찰 완료 — 포지션 + 포인트 표시
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md min-w-[80px] md:min-w-[90px]"
        style={{
          background: `${teamColor}15`,
          border: `1px solid ${teamColor}30`,
        }}
      >
        <span
          className="text-[10px] font-bold w-6"
          style={{ color: teamColor }}
        >
          {position}
        </span>
        <span className="text-[10px] text-white/60 tabular-nums">
          {points}P
        </span>
        {/* 체크 표시 */}
        <svg
          className="w-2.5 h-2.5 ml-auto"
          viewBox="0 0 10 10"
          fill="none"
        >
          <path
            d="M2 5l2.5 2.5L8 3"
            stroke={teamColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (state === "bidding") {
    // 입찰 진행 중 — 깜빡이는 보더 + 포지션
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md min-w-[80px] md:min-w-[90px]"
        style={{
          background: `${VIOLET}10`,
          border: `1px solid ${VIOLET}40`,
          animation: "auction-slot-pulse 2s ease-in-out infinite",
        }}
      >
        <span
          className="text-[10px] font-bold w-6"
          style={{ color: VIOLET_GLOW }}
        >
          {position}
        </span>
        <span
          className="text-[10px] font-medium"
          style={{ color: GOLD }}
        >
          입찰 중
        </span>
        {/* 맥동 점 */}
        <span
          className="block w-1.5 h-1.5 rounded-full ml-auto"
          style={{
            background: GOLD,
            animation: "live-pulse 1.5s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  // empty — 비어있는 슬롯
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md min-w-[80px] md:min-w-[90px]"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(255,255,255,0.08)",
      }}
    >
      <span className="text-[10px] font-bold w-6 text-white/20">
        {position}
      </span>
      <span className="text-[10px] text-white/15">—</span>
    </div>
  );
}
