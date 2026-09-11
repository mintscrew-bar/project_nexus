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
 * 게임별 화면의 정규 URL.
 *
 * 라우트가 `/lol/*` `/pubg/*` 로 갈린 뒤에도 canonical 이 옛 경로(`/matches`)를
 * 가리키고 있었다. canonical 이 308 로 튕기는 URL 을 가리키면 색인이 엉킨다.
 */
export function gameCanonical(gameSlug: string, path = ""): string {
  return absoluteUrl(`/${gameSlug}${path}`);
}
