export const SITE_NAME = "Nexus";
export const SITE_TITLE = "Nexus - LoL 내전 랩과 커뮤니티";
export const SITE_DESCRIPTION =
  "리그 오브 레전드 내전 기록, 챔피언 통계, 장인 빌드, 랭킹, 클랜을 한곳에서 확인하는 Nexus 플랫폼입니다.";

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
