"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Trophy, Medal, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";

interface TeamStanding {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
}

interface VictoryScreenProps {
  standings: TeamStanding[];
  onClose?: () => void;
  autoRedirectSeconds?: number;
}

export function VictoryScreen({
  standings,
  onClose,
  autoRedirectSeconds = 30,
}: VictoryScreenProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(autoRedirectSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/tournaments");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  const handleManualExit = () => {
    if (onClose) {
      onClose();
    } else {
      router.push("/tournaments");
    }
  };

  const winner = standings[0];
  const getMedalColor = (index: number) => {
    switch (index) {
      case 0:
        return "text-yellow-500"; // Gold
      case 1:
        return "text-gray-400"; // Silver
      case 2:
        return "text-orange-600"; // Bronze
      default:
        return "text-text-tertiary";
    }
  };

  const getMedalIcon = (index: number) => {
    if (index === 0) {
      return <Trophy className="w-8 h-8" />;
    }
    return <Medal className="w-6 h-6" />;
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-bg-secondary border-2 border-accent-primary rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl animate-scaleIn">
        {/* Victory Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4 animate-bounce">
            <Trophy className="w-20 h-20 text-accent-gold" />
          </div>
          <h1 className="text-4xl font-bold text-text-primary mb-2">
            🎉 토너먼트 종료! 🎉
          </h1>
          <p className="text-text-secondary">
            모든 경기가 완료되었습니다
          </p>
        </div>

        {/* Champion */}
        {winner && (
          <div className="bg-gradient-to-r from-accent-gold/20 to-accent-primary/20 border-2 border-accent-gold rounded-xl p-6 mb-6 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Trophy className="w-8 h-8 text-accent-gold animate-pulse" />
              <h2 className="text-3xl font-bold text-accent-gold">
                우승: {winner.teamName}
              </h2>
              <Trophy className="w-8 h-8 text-accent-gold animate-pulse" />
            </div>
            <p className="text-text-secondary">
              {winner.wins}승 {winner.losses}패
            </p>
          </div>
        )}

        {/* Final Standings */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-text-primary mb-4 text-center">
            최종 순위
          </h3>
          <div className="space-y-3">
            {standings.map((team, index) => (
              <div
                key={team.teamId}
                className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                  index === 0
                    ? "bg-accent-gold/10 border-2 border-accent-gold"
                    : "bg-bg-tertiary border border-bg-elevated"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex items-center justify-center w-10 h-10 ${getMedalColor(
                      index
                    )}`}
                  >
                    {getMedalIcon(index)}
                  </div>
                  <div>
                    <div className="font-bold text-text-primary">
                      #{index + 1} {team.teamName}
                    </div>
                    <div className="text-sm text-text-secondary">
                      {team.wins}승 {team.losses}패
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-text-primary">
                    {team.wins}
                  </div>
                  <div className="text-xs text-text-tertiary">승리</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Countdown & Actions */}
        <div className="border-t border-bg-tertiary pt-6">
          <div className="text-center mb-4">
            <p className="text-text-secondary mb-2">
              {countdown}초 후 자동으로 룸 목록으로 이동합니다
            </p>
            <div className="w-full bg-bg-tertiary rounded-full h-2 overflow-hidden">
              <div
                className="bg-accent-primary h-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${(countdown / autoRedirectSeconds) * 100}%`,
                }}
              />
            </div>
          </div>

          <Button
            onClick={handleManualExit}
            className="w-full bg-accent-primary hover:bg-accent-hover text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            지금 나가기
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            transform: scale(0.9);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
