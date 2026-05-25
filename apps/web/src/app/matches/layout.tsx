import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "롤 내전 전적 검색",
  description:
    "롤 내전 전적을 검색하고 확인하세요. 소환사별 매치 기록, 팀 구성, 챔피언 픽, KDA, 승패까지 리그 오브 레전드 내전 전적을 Nexus에서 한눈에.",
  alternates: {
    canonical: absoluteUrl("/matches"),
  },
  openGraph: {
    title: "롤 내전 전적 검색 | Nexus",
    description:
      "롤 내전 전적을 검색하세요. 소환사별 매치 기록, 팀 구성, 챔피언 픽, KDA, 승패를 전부 확인할 수 있습니다.",
    url: absoluteUrl("/matches"),
  },
};

export default function MatchesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
