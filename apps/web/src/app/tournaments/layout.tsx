import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "롤 내전 방 모집·참여",
  description:
    "롤 내전 방을 찾고 참여하세요. 경매·스네이크 드래프트로 팀을 구성하는 리그 오브 레전드 내전 모집 목록을 Nexus에서 한눈에 확인할 수 있습니다.",
  alternates: {
    canonical: absoluteUrl("/tournaments"),
  },
  openGraph: {
    title: "롤 내전 방 모집·참여 | Nexus",
    description:
      "지금 열린 롤 내전 방을 확인하고 참여하세요. 경매·스네이크 드래프트로 팀을 짜는 내전 모집을 Nexus에서.",
    url: absoluteUrl("/tournaments"),
  },
};

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
