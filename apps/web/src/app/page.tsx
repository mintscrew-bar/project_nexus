import type { Metadata } from "next";
import { absoluteUrl, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo";
import HomeClient from "./_components/HomeClient";
import {
  LandingContentSections,
  LandingFooter,
  LandingHeader,
  LandingIntro,
} from "./_components/LandingContent";

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
  // 긴 공통 섹션은 한 번만 렌더링하고, 비로그인 전용 UI만 작은 슬롯으로 전달한다.
  // 비로그인/봇은 기존과 동일하게 전체 랜딩 본문을 SSR HTML로 받는다.
  return (
    <HomeClient
      header={<LandingHeader />}
      intro={<LandingIntro />}
      footer={<LandingFooter />}
    >
      <LandingContentSections />
    </HomeClient>
  );
}
