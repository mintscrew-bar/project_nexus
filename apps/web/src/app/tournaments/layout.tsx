import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "토너먼트",
  description:
    "Nexus 토너먼트 일정과 결과를 확인하세요. 내전 팀들이 참가하는 공식 대회를 한눈에 볼 수 있습니다.",
  alternates: {
    canonical: absoluteUrl("/tournaments"),
  },
  openGraph: {
    title: "토너먼트 | Nexus",
    description:
      "롤 내전 팀 토너먼트 일정과 결과. 팀 등록부터 대진표까지 Nexus에서 관리합니다.",
    url: absoluteUrl("/tournaments"),
  },
};

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
