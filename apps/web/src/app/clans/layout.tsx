import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "클랜",
  description:
    "Nexus 클랜 목록을 탐색하고 내전 팀에 합류하세요. 클랜 검색, 랭킹, 모집 현황을 한눈에 확인합니다.",
  alternates: {
    canonical: absoluteUrl("/clans"),
  },
  openGraph: {
    title: "클랜 브라우저 | Nexus",
    description:
      "롤 내전 클랜을 찾고 합류하세요. 클랜 랭킹과 모집 현황을 실시간으로 확인할 수 있습니다.",
    url: absoluteUrl("/clans"),
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `클랜 브라우저 | ${SITE_NAME}`,
  description: "롤 내전 클랜 목록 및 검색 페이지",
  url: absoluteUrl("/clans"),
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "클랜", item: absoluteUrl("/clans") },
    ],
  },
};

export default function ClansLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
