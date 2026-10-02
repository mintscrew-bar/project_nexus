import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "커뮤니티",
  description:
    "롤·배그 내전 후기, 게임 팁과 질문을 게임별 Nexus 커뮤니티에서 나눠보세요.",
  alternates: {
    canonical: absoluteUrl("/community"),
  },
  openGraph: {
    title: "커뮤니티 | Nexus",
    description:
      "롤·배그 내전 후기, 게임 팁과 질문을 게임별 Nexus 커뮤니티에서 나눠보세요.",
    url: absoluteUrl("/community"),
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `커뮤니티 | ${SITE_NAME}`,
  description: "롤·배그 내전 커뮤니티 게시판",
  url: absoluteUrl("/community"),
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: absoluteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: "커뮤니티",
        item: absoluteUrl("/community"),
      },
    ],
  },
};

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
