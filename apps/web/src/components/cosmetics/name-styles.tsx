"use client";

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
  "ink" | "gold" | "pixel" | "pen" | "brush" | "neon" | "rainbow" | "flame";

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
   * 산 사람이 색을 고를 수 있는가 (2026-11-20). 색상 회전이라 색이 뚜렷한 글꼴만 —
   * 먹선·붓글씨는 거의 무채색이라 돌려도 그대로고, 무지개는 이미 모든 색이라 뺀다.
   */
  tintable?: boolean;
}

const gf = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family}&display=swap`;

export const NAME_STYLES: Record<NameStyleCode, NameStyleDef> = {
  ink: {
    family: "'Black Han Sans'",
    href: gf("Black+Han+Sans"),
    className: "nfx-ink",
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
 * 고를 수 있는 색 — 원래 색에서 몇 도 돌릴지(색상 회전). 0 은 원래 색.
 * 미리 정한 칸 외에 슬라이더로 아무 값이나 고를 수도 있다.
 */
export const NAME_HUE_PRESETS = [0, 30, 60, 120, 165, 200, 250, 300] as const;

export function StyledName({
  code,
  hue,
  className,
  children,
}: {
  code?: NameStyleCode | null;
  /** 산 사람이 고른 색(색상 회전 도) — 색을 고를 수 있는 글꼴에만 적용 */
  hue?: number | null;
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
  if (!hue || !def.tintable) return styled;
  return (
    <span className="nfx-tint" style={{ filter: `hue-rotate(${hue}deg)` }}>
      {styled}
    </span>
  );
}
