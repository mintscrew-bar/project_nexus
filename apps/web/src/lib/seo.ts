export const SITE_NAME = "Nexus";
export const SITE_TITLE = "Nexus - 롤 내전, 전적, 스크림 랩";
export const SITE_DESCRIPTION =
  "롤 내전 모집과 전적 기록, 스크림 관리, 챔피언 통계, 장인 빌드, 랭킹, 클랜을 한곳에서 확인하는 리그 오브 레전드 커뮤니티 플랫폼입니다.";

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
