/**
 * 방송 오버레이 커스터마이징(방송인별).
 *
 * 서버는 저장 전에, 오버레이는 그리기 전에 같은 normalizeBroadcastSettings 를 거친다.
 * 저장된 JSON 이 옛 모양이거나 일부가 빠져 있어도 항상 완전한 설정이 나온다 —
 * 새 항목을 추가해도 기존 방송인의 설정을 고쳐 쓸 필요가 없다.
 *
 * 값이 null 인 색·로고·문구는 "기본값을 쓴다"는 뜻이다. 기본값은 소속 클랜 테마
 * (강조색·엠블럼)이고, 그것도 없으면 넥서스 기본 색이다.
 */

export const BROADCAST_PRESETS = ["default", "minimal", "glass"] as const;
export type BroadcastPreset = (typeof BROADCAST_PRESETS)[number];

export const BROADCAST_FONTS = [
  "default", // 사이트 기본(Pretendard)
  "display", // 굵은 제목체 — Black Han Sans
  "rounded", // 둥근체 — Jua
  "handwriting", // 손글씨 — Nanum Pen Script
] as const;
export type BroadcastFont = (typeof BROADCAST_FONTS)[number];

/** 장면(대기·경매·대진표 등) 뒤에 깔리는 배경. 경기 중 점수판은 항상 투명이다. */
export const BROADCAST_BACKGROUNDS = [
  "aurora", // 천천히 움직이는 빛 + 격자 (기존 기본 모습)
  "gradient", // 움직이지 않는 은은한 그라데이션
  "solid", // 단색
  "grain", // 단색 + 필름 그레인
  "particles", // 떠다니는 입자
  "transparent", // 배경 없이 패널만 — 게임·캠 화면 위에 합성
] as const;
export type BroadcastBackground = (typeof BROADCAST_BACKGROUNDS)[number];

export const BROADCAST_TRANSITIONS = ["wipe", "fade", "slide", "none"] as const;
export type BroadcastTransitionStyle = (typeof BROADCAST_TRANSITIONS)[number];

export const BROADCAST_TRANSITION_SPEEDS = ["slow", "normal", "fast"] as const;
export type BroadcastTransitionSpeed =
  (typeof BROADCAST_TRANSITION_SPEEDS)[number];

export const BROADCAST_NAME_DISPLAYS = ["nickname", "riotId", "both"] as const;
export type BroadcastNameDisplay = (typeof BROADCAST_NAME_DISPLAYS)[number];

export const BROADCAST_TEAM_LABELS = ["team", "captain"] as const;
export type BroadcastTeamLabel = (typeof BROADCAST_TEAM_LABELS)[number];

export interface BroadcastSettings {
  colors: {
    /** 강조색. null 이면 클랜 강조색 → 넥서스 보라 */
    accent: string | null;
    /** 블루 진영/왼쪽 팀 색 */
    blue: string | null;
    /** 레드 진영/오른쪽 팀 색 */
    red: string | null;
  };
  /** 하단바·대기 화면 로고. null 이면 클랜 엠블럼 */
  logoUrl: string | null;
  /** 하단바 제목 (null 이면 방 제목) */
  title: string | null;
  /** 하단바 보조 문구 (null 이면 진행 단계) */
  subtitle: string | null;
  show: {
    lowerThird: boolean;
    bidLog: boolean;
    pool: boolean;
    /** LIVE AUCTION·STARTING LINEUP 같은 영어 머리글 */
    englishLabels: boolean;
    /** 경매 매물 카드의 내전 지표 칸 */
    lotStats: boolean;
    /** 선수 소개의 랭킹 순위·칭찬 */
    playerBadges: boolean;
  };
  preset: BroadcastPreset;
  /** 전체 크기 배율 0.8 ~ 1.2 */
  scale: number;
  lowerThirdPosition: "bottom" | "top";
  font: BroadcastFont;
  idle: {
    /** 대기 화면 큰 문구 (null 이면 "곧 방송을 시작합니다") */
    title: string | null;
    subtitle: string | null;
  };
  breakScreen: {
    title: string | null;
    subtitle: string | null;
  };
  background: {
    type: BroadcastBackground;
    /** 효과 세기 0 ~ 100 */
    intensity: number;
  };
  transition: {
    style: BroadcastTransitionStyle;
    speed: BroadcastTransitionSpeed;
    /** 전환 때 장면 이름(AUCTION DRAFT 등)을 띄울지 */
    showLabel: boolean;
  };
  sfx: {
    enabled: boolean;
    /** 0 ~ 100 */
    volume: number;
  };
  nameDisplay: BroadcastNameDisplay;
  teamLabel: BroadcastTeamLabel;
}

export const DEFAULT_BROADCAST_SETTINGS: BroadcastSettings = {
  colors: { accent: null, blue: null, red: null },
  logoUrl: null,
  title: null,
  subtitle: null,
  show: {
    lowerThird: true,
    bidLog: true,
    pool: true,
    englishLabels: true,
    lotStats: true,
    playerBadges: true,
  },
  preset: "default",
  scale: 1,
  lowerThirdPosition: "bottom",
  font: "default",
  idle: { title: null, subtitle: null },
  breakScreen: { title: null, subtitle: null },
  background: { type: "aurora", intensity: 50 },
  transition: { style: "wipe", speed: "normal", showLabel: true },
  // OBS 오디오 믹서에 소스가 새로 생기면 놀랄 수 있어 기본은 꺼 둔다
  sfx: { enabled: false, volume: 60 },
  nameDisplay: "nickname",
  teamLabel: "team",
};

/** 넥서스 기본 진영 색 — 설정이 비었을 때 */
export const DEFAULT_BLUE = "#3B82F6";
export const DEFAULT_RED = "#EF4444";

const HEX = /^#[0-9a-fA-F]{6}$/;
/**
 * 로고 주소 — https 주소이거나 같은 사이트 경로(/uploads/...)만 받는다.
 * javascript: 같은 스킴이나 //다른호스트 형태는 막는다.
 */
const SAFE_URL = /^(https:\/\/|\/(?!\/))[^\s"'<>]+$/;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const color = (value: unknown): string | null =>
  typeof value === "string" && HEX.test(value) ? value.toUpperCase() : null;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
};

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

/**
 * 어떤 값이 와도 완전하고 안전한 설정으로 맞춘다.
 * 허용하지 않는 값은 조용히 기본값으로 돌린다 — 오버레이가 깨지는 것보다 낫다.
 */
export function normalizeBroadcastSettings(raw: unknown): BroadcastSettings {
  const d = DEFAULT_BROADCAST_SETTINGS;
  const r = asRecord(raw);
  const colors = asRecord(r.colors);
  const show = asRecord(r.show);
  const idle = asRecord(r.idle);
  const breakScreen = asRecord(r.breakScreen);
  const background = asRecord(r.background);
  const transition = asRecord(r.transition);
  const sfx = asRecord(r.sfx);

  return {
    colors: {
      accent: color(colors.accent),
      blue: color(colors.blue),
      red: color(colors.red),
    },
    logoUrl:
      typeof r.logoUrl === "string" && SAFE_URL.test(r.logoUrl)
        ? r.logoUrl.slice(0, 500)
        : null,
    title: text(r.title, 40),
    subtitle: text(r.subtitle, 60),
    show: {
      lowerThird: bool(show.lowerThird, d.show.lowerThird),
      bidLog: bool(show.bidLog, d.show.bidLog),
      pool: bool(show.pool, d.show.pool),
      englishLabels: bool(show.englishLabels, d.show.englishLabels),
      lotStats: bool(show.lotStats, d.show.lotStats),
      playerBadges: bool(show.playerBadges, d.show.playerBadges),
    },
    preset: oneOf(r.preset, BROADCAST_PRESETS, d.preset),
    scale: Math.round(clampNumber(r.scale, 0.8, 1.2, d.scale) * 100) / 100,
    lowerThirdPosition: oneOf(
      r.lowerThirdPosition,
      ["bottom", "top"] as const,
      d.lowerThirdPosition,
    ),
    font: oneOf(r.font, BROADCAST_FONTS, d.font),
    idle: { title: text(idle.title, 40), subtitle: text(idle.subtitle, 60) },
    breakScreen: {
      title: text(breakScreen.title, 40),
      subtitle: text(breakScreen.subtitle, 60),
    },
    background: {
      type: oneOf(background.type, BROADCAST_BACKGROUNDS, d.background.type),
      intensity: Math.round(
        clampNumber(background.intensity, 0, 100, d.background.intensity),
      ),
    },
    transition: {
      style: oneOf(transition.style, BROADCAST_TRANSITIONS, d.transition.style),
      speed: oneOf(
        transition.speed,
        BROADCAST_TRANSITION_SPEEDS,
        d.transition.speed,
      ),
      showLabel: bool(transition.showLabel, d.transition.showLabel),
    },
    sfx: {
      enabled: bool(sfx.enabled, d.sfx.enabled),
      volume: Math.round(clampNumber(sfx.volume, 0, 100, d.sfx.volume)),
    },
    nameDisplay: oneOf(r.nameDisplay, BROADCAST_NAME_DISPLAYS, d.nameDisplay),
    teamLabel: oneOf(r.teamLabel, BROADCAST_TEAM_LABELS, d.teamLabel),
  };
}
