"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { matchApi } from "@/lib/api-client";
import { Button } from "@/components/ui";
import {
  InternalMatchView,
  MatchSkeleton,
  type MatchDetails,
} from "@/components/matches/internal-match/InternalMatchView";

export type { MatchDetails };

/**
 * 내전 상세 페이지.
 * 화면 자체는 InternalMatchView 가 그린다 — 전적 목록에서 내전 판을 펼칠 때와 같은
 * 컴포넌트다. 여기서는 조회·로딩·에러·뒤로가기만 맡는다.
 */
export default function MatchDetailsClient({
  initialMatch = null,
}: {
  initialMatch?: MatchDetails | null;
}) {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchDetails | null>(initialMatch);
  const [isLoading, setIsLoading] = useState(!initialMatch);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMatch?.id === matchId) return;

    const fetchMatchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await matchApi.getMatch(matchId);
        setMatch(data);
      } catch (err: any) {
        console.error("Failed to fetch match details:", err);
        setError(
          err.response?.data?.message || "매치 정보를 불러오는데 실패했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    };
    fetchMatchDetails();
  }, [initialMatch, matchId]);

  if (isLoading) return <MatchSkeleton />;

  if (error || !match) {
    return (
      <div className="flex-grow flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <p className="text-accent-danger mb-4">
            {error || "매치를 찾을 수 없습니다."}
          </p>
          <Button onClick={() => router.back()}>돌아가기</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-bg-tertiary">
        <div className="container mx-auto px-4 py-4">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            돌아가기
          </button>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <InternalMatchView match={match} />
      </div>
    </div>
  );
}
