import type { MetadataRoute } from "next";
import { GAMES, GAME_TITLES } from "@nexus/types";
import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");

  // 게임별 경로 아래로 옮겨간 비공개 화면. `/auction` 만 막으면
  // 실제로 서비스되는 `/lol/auction` `/pubg/auction` 은 그대로 열려 있다.
  const gameScopedPrivate = ["profile", "auction", "draft", "role-selection"];
  const gamePrivateDisallow = GAME_TITLES.flatMap((title) =>
    gameScopedPrivate.map((path) => `/${GAMES[title].slug}/${path}`),
  );

  // 로그인 없이 접근 불가한 라우트 — 검색 로봇에게 수집 금지 요청
  const privateDisallow = [
    "/admin",
    "/api",
    "/auth",
    "/dashboard",
    "/settings",
    "/rooms",
    "/dm",
    "/community/write",
    "/community/bookmarks",
    "/clans/create",
    ...gamePrivateDisallow,
  ];

  return {
    rules: [
      // 모든 검색 로봇: 공개 페이지 허용, 비공개 라우트 차단
      {
        userAgent: "*",
        allow: [
          "/",
          "/feed.xml",
          "/*.js", // JS·CSS 파비콘 수집 허용 (Naver 권고)
          "/*.css",
          "/icons/",
          "/images/",
        ],
        disallow: privateDisallow,
      },
      // 네이버 검색 로봇(Yeti) — 동일 규칙 명시적 적용
      {
        userAgent: "Yeti",
        allow: ["/", "/feed.xml", "/*.js", "/*.css", "/icons/", "/images/"],
        disallow: privateDisallow,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
