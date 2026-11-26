import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGES } from "@/lib/seo";
import { StreamerPageClient } from "./_StreamerPageClient";

export const metadata: Metadata = {
  title: "스트리머",
  description:
    "스트리머가 방송에서 연 내전 기록, 시청자 리그, 방송 일정과 공지를 확인하세요.",
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "NEXUS 스트리머",
    description: "방송 내전 기록과 다음 내전을 한곳에서 확인하세요.",
    url: absoluteUrl("/streamers"),
  },
};

export default async function StreamerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StreamerPageClient streamerId={id} />;
}
