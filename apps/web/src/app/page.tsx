import type { Metadata } from "next";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";
import HomeClient from "./_components/HomeClient";
import LandingContent from "./_components/LandingContent";

export const metadata: Metadata = {
  title: {
    absolute: SITE_TITLE,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: absoluteUrl("/"),
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
  },
};

export default function HomePage() {
  // 랜딩을 서버 컴포넌트로 렌더해 주입 → 비로그인/봇은 SSR HTML로 랜딩 본문을 받는다.
  return <HomeClient landing={<LandingContent />} />;
}
