"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_BLUE,
  DEFAULT_BROADCAST_SETTINGS,
  DEFAULT_RED,
  normalizeBroadcastSettings,
  type BroadcastSettings,
} from "@nexus/types";

/**
 * 방송 오버레이의 "모습" — 방송인 커스터마이징(settings) + 클랜 테마(theme)를 합친 값.
 *
 * 장면 컴포넌트들은 스냅샷을 받아 그리는데, 경매처럼 스냅샷 없이 소켓 데이터만 받는
 * 장면도 있어서 설정은 컨텍스트로 내려준다(BroadcastShell 이 감싼다).
 * 컨텍스트 밖(옛 미리보기 등)에서 써도 기본값으로 그려지게 기본 컨텍스트를 둔다.
 */

const NEXUS_ACCENT = "#8B5CF6";

export interface BroadcastLook {
  settings: BroadcastSettings;
  accent: string;
  blue: string;
  red: string;
  /** 하단바·대기 화면 로고 — 방송인 로고 → 클랜 엠블럼 → 없음 */
  logo: string | null;
  /** 로고가 없을 때 글자 배지 */
  mark: string;
}

export function resolveLook(
  rawSettings: unknown,
  theme?: {
    accentColor?: string | null;
    logo?: string | null;
    clanTag?: string | null;
  } | null,
): BroadcastLook {
  const settings = normalizeBroadcastSettings(rawSettings);
  return {
    settings,
    accent: settings.colors.accent ?? theme?.accentColor ?? NEXUS_ACCENT,
    blue: settings.colors.blue ?? DEFAULT_BLUE,
    red: settings.colors.red ?? DEFAULT_RED,
    logo: settings.logoUrl ?? theme?.logo ?? null,
    mark: (theme?.clanTag ?? "NX").slice(0, 3),
  };
}

const LookContext = createContext<BroadcastLook>(
  resolveLook(DEFAULT_BROADCAST_SETTINGS, null),
);

export function BroadcastLookProvider({
  look,
  children,
}: {
  look: BroadcastLook;
  children: ReactNode;
}) {
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>;
}

export function useBroadcastLook(): BroadcastLook {
  return useContext(LookContext);
}

/**
 * 진영 색 — 방송인이 블루/레드 색을 정했으면 팀 고유색보다 우선한다.
 * 정하지 않았으면 팀 색 → 넥서스 기본 진영색.
 */
export function sideColor(
  look: BroadcastLook,
  side: "blue" | "red",
  teamColor?: string | null,
): string {
  const custom = look.settings.colors[side];
  return custom ?? teamColor ?? (side === "blue" ? look.blue : look.red);
}

/**
 * 설정 글꼴 → CSS font-family. 기본 외 글꼴은 Google Fonts 에서 받는다
 * (BroadcastShell 이 필요한 것만 <link> 로 불러온다).
 */
export const BROADCAST_FONT_FAMILY: Record<
  BroadcastSettings["font"],
  { family: string | null; googleFamily: string | null }
> = {
  default: { family: null, googleFamily: null },
  display: {
    family: "'Black Han Sans', sans-serif",
    googleFamily: "Black+Han+Sans",
  },
  rounded: { family: "'Jua', sans-serif", googleFamily: "Jua" },
  handwriting: {
    family: "'Nanum Pen Script', cursive",
    googleFamily: "Nanum+Pen+Script",
  },
};

/** 전환 속도 → 전체 길이(ms). 장면 교체는 이 값의 54% 지점에서 한다. */
export const TRANSITION_DURATION_MS: Record<
  BroadcastSettings["transition"]["speed"],
  number
> = { slow: 1700, normal: 1200, fast: 750 };

/**
 * 이름 표시 방식에 맞춘 선수 이름.
 * Riot ID 가 없는 선수(미연동·배그)는 사이트 닉네임으로 떨어진다.
 */
export function playerDisplayName(
  player:
    | {
        username?: string | null;
        gameName?: string | null;
        tagLine?: string | null;
        riotAccount?: {
          gameName?: string | null;
          tagLine?: string | null;
        } | null;
      }
    | null
    | undefined,
  mode: BroadcastSettings["nameDisplay"],
): string {
  const nickname = player?.username ?? "";
  const gameName = player?.gameName ?? player?.riotAccount?.gameName ?? null;
  if (mode === "nickname" || !gameName) return nickname;
  if (mode === "riotId") return gameName;
  return nickname && nickname !== gameName
    ? `${nickname} (${gameName})`
    : gameName;
}

/** 팀 이름 표시 — "팀장 이름" 이면 팀장 이름을 쓰고, 없으면 팀 이름 */
export function teamDisplayName(
  team:
    | {
        name?: string | null;
        captainName?: string | null;
        captain?: { username?: string | null } | null;
      }
    | null
    | undefined,
  mode: BroadcastSettings["teamLabel"],
): string {
  const name = team?.name ?? "";
  if (mode === "captain") {
    return team?.captainName ?? team?.captain?.username ?? name;
  }
  return name;
}

/** 영어 머리글(LIVE AUCTION 등)인지 — "영어 머리글 끄기"에서 숨길 대상 */
export function isEnglishLabel(text: unknown): boolean {
  return (
    typeof text === "string" && /^[A-Za-z0-9 .·:/&'#\-–—]+$/.test(text.trim())
  );
}
