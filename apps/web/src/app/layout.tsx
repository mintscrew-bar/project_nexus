import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/AppShell";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { Suspense } from "react";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  absoluteUrl,
  getSiteUrl,
} from "@/lib/seo";

const inter = Inter({ subsets: ["latin"] });
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ["Nexus Lab", "넥서스", "롤 내전 Nexus"],
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
    "챔피언 통계",
    "장인 빌드",
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
    "챔피언 통계",
    "장인 빌드",
    "롤 챔피언 통계",
    "롤 장인 빌드",
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
        url: absoluteUrl("/images/nexus2.png"),
        width: 1200,
        height: 630,
        alt: "Nexus",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl("/images/nexus2.png")],
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  manifest: "/manifest.webmanifest",
  other: {
    "naver-site-verification": "799f4d82676fc5d3b1292100b8bfa7edefb7d593",
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
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9854590549377922"
          crossOrigin="anonymous"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <GoogleAnalytics />
      </head>
      <body className={`${inter.className} font-sans min-h-screen flex flex-col`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        {/* useSearchParams는 Suspense 경계 필요 */}
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        <ConsentBanner />
      </body>
    </html>
  );
}
