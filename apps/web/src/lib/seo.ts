export const SITE_NAME = "Nexus";
export const SITE_TITLE = "Nexus - 롤 · 배그 내전 운영 플랫폼";
export const SITE_DESCRIPTION =
  "롤 내전 모집부터 팀 구성, 경매와 자동 밸런스, 대진표, 디스코드 연동, 내전 전적 기록까지 한곳에서 운영하는 리그 오브 레전드 내전 플랫폼입니다.";

export function getSiteUrl(): URL {
  const rawUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "https://labs-nexus.com";

  return new URL(rawUrl);
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}

/**
 * 링크 미리보기(카톡·디스코드 등) 기본 이미지.
 *
 * Next 는 페이지가 `openGraph` 를 따로 정의하면 루트 레이아웃의 openGraph 를
 * 통째로 갈아끼운다(깊은 병합이 아니다). 그래서 페이지마다 images 를 직접
 * 넣지 않으면 og:image 가 아예 빠진다 — 메인 포함 15개 페이지가 그랬다.
 * 원본 1.6MB PNG 는 카톡 미리보기 용량 제한에 걸릴 수 있어 1200x630 JPEG(약 120KB)로 둔다.
 */
export const DEFAULT_OG_IMAGES = [
  {
    url: absoluteUrl("/images/og-banner.jpg"),
    width: 1200,
    height: 630,
    alt: "Nexus - 내전 운영의 모든 것",
  },
];

/**
 * 게임별 화면의 정규 URL.
 *
 * 라우트가 `/lol/*` `/pubg/*` 로 갈린 뒤에도 canonical 이 옛 경로(`/matches`)를
 * 가리키고 있었다. canonical 이 308 로 튕기는 URL 을 가리키면 색인이 엉킨다.
 */
export function gameCanonical(gameSlug: string, path = ""): string {
  return absoluteUrl(`/${gameSlug}${path}`);
}
