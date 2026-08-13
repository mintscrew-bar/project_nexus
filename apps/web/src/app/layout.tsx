import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/pretendard.css";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/AppShell";
import { ThirdPartyScripts } from "@/components/analytics/ThirdPartyScripts";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  absoluteUrl,
  getSiteUrl,
} from "@/lib/seo";

// className 대신 variable 로 받는다. className 을 body 에 걸면 font-family 가
// 통째로 Inter 로 고정돼 tailwind 의 fontFamily.sans(Pretendard 우선) 가 무시된다.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ["넥서스", "롤 내전 Nexus"],
  url: absoluteUrl("/"),
  description: SITE_DESCRIPTION,
  inLanguage: "ko-KR",
  keywords: [
    "롤 내전",
    "롤 전적",
    "롤 스크림",
    "리그 오브 레전드 내전",
    "내전 전적",
    "스크림 관리",
    "롤 내전 경매",
    "롤 내전 팀 밸런스",
    "롤 내전 대진표",
    "디스코드 내전",
  ],
};

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Nexus",
    "넥서스",
    "리그 오브 레전드",
    "롤 전적",
    "롤 스크림",
    "롤 내전",
    "LOL 내전",
    "리그오브레전드 전적",
    "리그오브레전드 스크림",
    "내전 모집",
    "스크림 모집",
    "내전 전적",
    "롤 내전 경매",
    "롤 내전 팀 밸런스",
    "롤 내전 대진표",
    "디스코드 내전",
    "클랜",
    "랭킹",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: absoluteUrl("/images/og-banner.png"),
        width: 1731,
        height: 909,
        alt: "Nexus - 내전 운영의 모든 것",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl("/images/og-banner.png")],
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  manifest: "/manifest.webmanifest",
  other: {
    "naver-site-verification": "799f4d82676fc5d3b1292100b8bfa7edefb7d593",
    "google-adsense-account": ADSENSE_CLIENT,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} font-sans h-screen flex flex-col overflow-hidden`}
      >
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <ThirdPartyScripts />
      </body>
    </html>
  );
}
