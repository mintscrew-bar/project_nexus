import type { Metadata } from "next";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";
import HomeClient from "./_components/HomeClient";
import LandingContent, { LandingContentSections } from "./_components/LandingContent";

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
  // contentSections는 로그인 후에도 콘텐츠 섹션을 보여주기 위해 별도로 주입한다.
  return (
    <HomeClient
      landing={<LandingContent />}
      contentSections={<LandingContentSections />}
    />
  );
}
