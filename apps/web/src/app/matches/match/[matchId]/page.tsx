import type { Metadata } from "next";
import { cache } from "react";
import { absoluteUrl } from "@/lib/seo";
import MatchDetailsClient, { type MatchDetails } from "./_MatchDetailsClient";

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

const getPublicMatch = cache(
  async (matchId: string): Promise<MatchDetails | null> => {
    try {
      const response = await fetch(
        `${API_BASE}/api/public/matches/${encodeURIComponent(matchId)}`,
        { next: { revalidate: 3600 } },
      );
      if (!response.ok) return null;
      return (await response.json()) as MatchDetails;
    } catch {
      // API가 잠시 불안정해도 인증 사용자의 기존 클라이언트 조회 경로는 유지한다.
      return null;
    }
  },
);

function matchTitle(match: MatchDetails): string {
  const roomName = match.roomName?.trim() || "롤 내전";
  const teamAName = match.teamA?.name || "A팀";
  const teamBName = match.teamB?.name || "B팀";
  return `${roomName} 경기 결과 — ${teamAName} vs ${teamBName}`;
}

function matchDescription(match: MatchDetails): string {
  const winnerName =
    match.winnerName ||
    (match.winnerId === match.teamA?.id
      ? match.teamA?.name
      : match.winnerId === match.teamB?.id
        ? match.teamB?.name
        : null);
  const playedAt = match.completedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(match.completedAt))
    : null;

  return [
    match.roomName || "Nexus 롤 내전",
    `${match.teamA?.name || "A팀"} vs ${match.teamB?.name || "B팀"}`,
    winnerName ? `${winnerName} 승리` : null,
    playedAt,
    "팀 구성과 참가자 경기 기록을 확인하세요.",
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchId: string }>;
}): Promise<Metadata> {
  const { matchId } = await params;
  const url = absoluteUrl(`/matches/match/${matchId}`);
  const match = await getPublicMatch(matchId);

  if (!match) {
    return {
      title: "내전 경기 상세",
      description: "Nexus 내전 경기 상세 기록입니다.",
      alternates: { canonical: url },
      robots: { index: false, follow: false },
    };
  }

  const title = matchTitle(match);
  const description = matchDescription(match);

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      images: [absoluteUrl("/images/og-banner.png")],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl("/images/og-banner.png")],
    },
  };
}

export default async function MatchDetailsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const match = await getPublicMatch(matchId);
  return <MatchDetailsClient initialMatch={match} />;
}
