import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "경기 기록",
  description:
    "Nexus에서 진행된 내전 경기 기록을 확인하세요. 팀 구성, 챔피언 픽, KDA, 승패를 전부 기록합니다.",
  alternates: {
    canonical: absoluteUrl("/matches"),
  },
  openGraph: {
    title: "경기 기록 | Nexus",
    description:
      "내전 경기 기록을 확인하세요. 팀 구성, 챔피언 픽, KDA, 승패를 전부 기록합니다.",
    url: absoluteUrl("/matches"),
  },
};

export default function MatchesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
