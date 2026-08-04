import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
import { StreamersClient } from "./_StreamersClient";

export const metadata: Metadata = {
  title: "스트리머",
  description:
    "NEXUS와 함께하는 스트리머들의 방송을 확인하고, 지금 열려 있는 시참 내전에 참가해보세요.",
  alternates: {
    canonical: absoluteUrl("/streamers"),
  },
  openGraph: {
    title: "NEXUS 스트리머",
    description:
      "방송 중인 스트리머와 진행 중인 시참 내전을 한곳에서 확인하세요.",
    url: absoluteUrl("/streamers"),
  },
};

export default function StreamersPage() {
  return <StreamersClient />;
}
