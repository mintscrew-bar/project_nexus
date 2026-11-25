"use client";

import { isDefaultNameTint, type NameTint } from "@nexus/types";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 닉네임 폰트 — 글꼴 + 색·효과 세트.
 *
 * 글꼴은 모두 SIL OFL(상업 무료) 한글 글꼴이다. 사이트 기본 글꼴(Pretendard)과 달리
 * 처음부터 싣지 않고, 그 글꼴을 쓰는 이름이 화면에 처음 나올 때 한 번만 불러온다.
 * Google Fonts 는 글자 범위별로 잘라 주므로 닉네임에 쓰인 글자 조각만 받는다.
 * (CSP 의 style-src·font-src 에 fonts.googleapis.com·gstatic·jsdelivr 가 이미 열려 있다)
 */

export type NameStyleCode =
  | "ink"
  | "gold"
  | "pixel"
  | "pen"
  | "brush"
  | "neon"
  | "rainbow"
  | "flame"
  | "frost"
  | "thunder"
  | "moon"
  | "slime"
  | "sunset"
  | "ghost";

interface NameStyleDef {
  /** 글꼴 이름 (font-family) */
  family: string;
  /** 불러올 스타일시트 */
  href: string;
  /** 글꼴마다 눈에 보이는 크기가 달라 맞춘다 (em) */
  scale?: number;
  /** 색·효과 — globals.css 의 .nfx-* */
  className: string;
  /**
   * 산 사람이 색을 고를 수 있는가 (2026-11-20). 기본은 색상 회전(hue-rotate)이라 색이 뚜렷한
   * 글꼴만 — 무지개는 이미 모든 색이라 뺀다. 무채색 글꼴은 아래 colorize 로 칠한다.
   */
  tintable?: boolean;
  /**
   * 색을 돌리는 대신 글자 속을 고른 색으로 칠한다 (2026-11-25). 먹선(흰 글자)·붓글씨(한지빛)는
   * 거의 무채색이라 hue-rotate 가 듣지 않는다. 테두리·그림자는 그대로 두고 글자 색만 바꾼다.
   * 글자색은 CSS 변수 --nfx-fill 로 넘기고, 원래 색이면 변수를 비워 css 의 기본 색을 쓴다.
   */
  colorize?: boolean;
}

const gf = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family}&display=swap`;

export const NAME_STYLES: Record<NameStyleCode, NameStyleDef> = {
  ink: {
    family: "'Black Han Sans'",
    href: gf("Black+Han+Sans"),
    className: "nfx-ink",
    tintable: true,
    colorize: true,
  },
  gold: {
    family: "'Do Hyeon'",
    href: gf("Do+Hyeon"),
    scale: 1.08,
    className: "nfx-gold",
    tintable: true,
  },
  pixel: {
    family: "Galmuri11",
    href: "https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/galmuri.css",
    className: "nfx-pixel",
    tintable: true,
  },
  pen: {
    family: "'Nanum Pen Script'",
    href: gf("Nanum+Pen+Script"),
    scale: 1.3,
    className: "nfx-pen",
    tintable: true,
  },
  brush: {
    family: "'East Sea Dokdo'",
    href: gf("East+Sea+Dokdo"),
    scale: 1.35,
    className: "nfx-brush",
    tintable: true,
    colorize: true,
  },
  neon: {
    family: "Gugi",
    href: gf("Gugi"),
    className: "nfx-neon",
    tintable: true,
  },
  rainbow: {
    family: "Jua",
    href: gf("Jua"),
    scale: 1.05,
    className: "nfx-rainbow",
  },
  flame: {
    family: "'Black Han Sans'",
    href: gf("Black+Han+Sans"),
    className: "nfx-flame",
    tintable: true,
  },
  // ── 2026-11-25 추가 6종 (모두 SIL OFL 한글 글꼴) ──
  frost: {
    family: "Sunflower",
    href: gf("Sunflower:wght@700"),
    className: "nfx-frost",
    tintable: true,
  },
  thunder: {
    family: "Dokdo",
    href: gf("Dokdo"),
    scale: 1.3,
    className: "nfx-thunder",
    tintable: true,
  },
  moon: {
    family: "'Song Myung'",
    href: gf("Song+Myung"),
    scale: 1.05,
    className: "nfx-moon",
    tintable: true,
  },
  slime: {
    family: "'Single Day'",
    href: gf("Single+Day"),
    scale: 1.1,
    className: "nfx-slime",
    tintable: true,
  },
  sunset: {
    family: "Gaegu",
    href: gf("Gaegu:wght@700"),
    scale: 1.25,
    className: "nfx-sunset",
    tintable: true,
  },
  ghost: {
    family: "'Yeon Sung'",
    href: gf("Yeon+Sung"),
    scale: 1.05,
    className: "nfx-ghost",
    tintable: true,
  },
};

/** 같은 스타일시트를 두 번 넣지 않는다 */
const loaded = new Set<string>();
function ensureStylesheet(href: string) {
  if (typeof document === "undefined" || loaded.has(href)) return;
  loaded.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * 닉네임 글자에 스타일을 입힌다. `code` 가 없으면 children 을 그대로 둔다.
 * 바깥 글자 크기·굵기 맥락(로비 카드, 채팅 등)은 그대로 물려받는다.
 */
/** 색을 고를 수 있는 글꼴인가 */
export function isNameStyleTintable(code?: NameStyleCode | null): boolean {
  return Boolean(code && NAME_STYLES[code]?.tintable);
}

/**
 * 미리 정한 색 칸 — 원래 색에서 몇 도 돌릴지(색상 회전). 0 은 원래 색.
 * 칸 말고도 슬라이더로 색·채도·밝기를 아무 값이나 고를 수 있다.
 */
export const NAME_HUE_PRESETS = [0, 30, 60, 120, 165, 200, 250, 300] as const;

/**
 * 고른 색 → 글자 속 색 (colorize 글꼴용). 원래 색이면 null.
 * 색 = 고른 색상, 채도 = 100% 일 때 70%(밝은 글자색이 탁해 보이지 않게), 밝기 = 기준 72% 에 비례.
 * 채도 0% 면 회색~흰색, 밝기를 내리면 어두운 색까지 갈 수 있다.
 */
export function nameFillColor(t: NameTint | null | undefined): string | null {
  if (isDefaultNameTint(t) || !t) return null;
  const s = Math.min(100, Math.round(t.saturation * 0.7));
  const l = Math.min(95, Math.max(12, Math.round((72 * t.brightness) / 100)));
  return `hsl(${t.hue} ${s}% ${l}%)`;
}

/** 고른 색 → CSS filter. 원래 색이면 null */
export function nameTintFilter(t: NameTint | null | undefined): string | null {
  if (isDefaultNameTint(t) || !t) return null;
  return `hue-rotate(${t.hue}deg) saturate(${t.saturation}%) brightness(${t.brightness}%)`;
}

export function StyledName({
  code,
  tint,
  className,
  children,
}: {
  code?: NameStyleCode | null;
  /** 산 사람이 고른 색·채도·밝기 — 색을 고를 수 있는 글꼴에만 적용 */
  tint?: NameTint | null;
  className?: string;
  children: ReactNode;
}) {
  const def = code ? NAME_STYLES[code] : null;
  useEffect(() => {
    if (def) ensureStylesheet(def.href);
  }, [def]);
  if (!def) return <span className={className}>{children}</span>;
  const style: CSSProperties = {
    fontFamily: `${def.family}, var(--font-sans, sans-serif)`,
    fontSize: def.scale ? `${def.scale}em` : undefined,
    fontWeight: 400,
  };
  // 글자 속을 칠하는 글꼴 — 원래 색이면 변수를 비워 css 기본 색을 쓴다
  const fill = def.colorize ? nameFillColor(tint) : null;
  if (fill) (style as Record<string, string>)["--nfx-fill"] = fill;
  const styled = (
    <span
      className={cn("nfx-root", def.className, className)}
      style={style}
      data-text={typeof children === "string" ? children : undefined}
    >
      {children}
    </span>
  );
  // 고른 색 — 바깥 껍데기에 색상 회전을 건다. 글꼴 자체의 filter(그림자)·애니메이션과
  // 겹치지 않게 따로 감싼다. 「장식 숨기기」 설정이면 globals.css 가 꺼 준다(.nfx-tint)
  const filter = def.tintable && !def.colorize ? nameTintFilter(tint) : null;
  if (!filter) return styled;
  return (
    <span className="nfx-tint" style={{ filter }}>
      {styled}
    </span>
  );
}
