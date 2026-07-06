"use client";

import { useEffect, useRef, useState } from "react";
import type { BroadcastAuctionState } from "../_live/useBroadcastAuction";

/**
 * 라이브 경매 방송 뷰(프레젠테이션 전용) — 프로 e스포츠(각진) 스타일.
 * 데이터는 useBroadcastAuction(라이브) 또는 프리뷰 목업에서 주입.
 * 현재 매물·현재가·입찰팀·카운트다운 + 팀별 예산 + 실시간 낙찰/유찰 피드.
 */

const CUT = 18;
const clipL = `polygon(0 0, 100% 0, calc(100% - ${CUT}px) 100%, 0 100%)`;
const clipBanner = `polygon(0 0, 100% 0, calc(100% - ${CUT}px) 100%, ${CUT}px 100%)`;
const clipHex = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const PANEL =
  "linear-gradient(135deg, rgba(12,12,18,0.94), rgba(22,22,32,0.84))";

// timerEnd(+오프셋) 기준 남은 초 + 바 비율(관측 최댓값 대비)
function useCountdown(timerEnd: number | null, clockOffset: number) {
  const [now, setNow] = useState(() => Date.now());
  const maxRef = useRef(1);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  if (!timerEnd) {
    maxRef.current = 1;
    return { seconds: 0, ratio: 0, active: false };
  }
  const remainMs = Math.max(0, timerEnd - (now + clockOffset));
  const seconds = remainMs / 1000;
  if (seconds > maxRef.current) maxRef.current = seconds;
  return {
    seconds,
    ratio: Math.min(1, seconds / maxRef.current),
    active: remainMs > 0,
  };
}

const fmtP = (n?: number | null) =>
  n == null ? "-" : `${n.toLocaleString()}P`;

export function AuctionLiveView({
  state,
  accent = "#8B5CF6",
}: {
  state: BroadcastAuctionState;
  accent?: string;
}) {
  const { current, teams, remainingCount, feed, status, captainPhase } = state;
  const cd = useCountdown(current.timerEnd, current.clockOffset);
  const bidderColor =
    teams.find((t) => t.id === current.bidderTeamId)?.color || accent;
  const urgent = cd.active && cd.seconds <= 5;

  return (
    <div className="flex h-full w-full flex-col px-14 py-10">
      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
            className="h-10 w-1.5"
            style={{ background: accent, boxShadow: `0 0 16px ${accent}` }}
          />
          <h1 className="text-5xl font-black uppercase tracking-tight text-white">
            AUCTION
            <span className="ml-3 text-3xl font-bold text-white/40">경매</span>
          </h1>
          {status !== "COMPLETED" && (
            <span className="ml-1 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-sm font-black uppercase tracking-[0.28em] text-red-400">
                Live
              </span>
            </span>
          )}
        </div>
        <div
          className="px-6 py-2.5"
          style={{ clipPath: clipBanner, background: PANEL }}
        >
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-white/45">
            남은 매물
          </span>
          <span className="ml-3 text-3xl font-black text-white">
            {remainingCount}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.5fr_1fr] gap-8">
        {/* 현재 매물 */}
        <div
          className="relative flex flex-col p-[3px]"
          style={{
            clipPath: clipL,
            background: `linear-gradient(150deg, ${bidderColor}, ${bidderColor}18 60%)`,
          }}
        >
          <div
            className="flex flex-1 flex-col px-10 py-8"
            style={{ clipPath: clipL, background: PANEL }}
          >
            {status === "COMPLETED" ? (
              <div className="flex flex-1 items-center justify-center">
                <span className="text-6xl font-black uppercase tracking-widest text-white/40">
                  경매 종료
                </span>
              </div>
            ) : captainPhase && !current.player ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4">
                <span className="text-2xl font-black uppercase tracking-[0.3em] text-white/50">
                  팀장 선정 중
                </span>
                <span className="text-lg text-white/40">
                  지원자 {captainPhase.volunteers?.length ?? 0}명
                </span>
              </div>
            ) : current.player ? (
              <>
                <span className="text-lg font-black uppercase tracking-[0.3em] text-white/45">
                  현재 매물
                </span>
                <div className="mt-4 flex items-center gap-6">
                  {current.player.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.player.avatar}
                      alt=""
                      className="h-24 w-24 object-cover"
                      style={{ clipPath: clipHex }}
                    />
                  ) : (
                    <div
                      className="flex h-24 w-24 items-center justify-center text-4xl font-black text-black"
                      style={{ clipPath: clipHex, background: accent }}
                    >
                      {(current.player.username ?? "?").slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[52px] font-black leading-none text-white">
                      {current.player.username ?? "-"}
                    </p>
                    {current.player.tier && (
                      <p className="mt-2 text-xl font-bold uppercase tracking-widest text-white/50">
                        {current.player.tier}
                      </p>
                    )}
                  </div>
                </div>

                {/* 현재가 + 입찰팀 */}
                <div className="mt-8 flex items-end gap-5">
                  <div>
                    <span className="text-sm font-bold uppercase tracking-[0.2em] text-white/40">
                      현재가
                    </span>
                    <p
                      className="text-[64px] font-black leading-none"
                      style={{ color: current.bid > 0 ? "#fff" : "#ffffff66" }}
                    >
                      {fmtP(current.bid)}
                    </p>
                  </div>
                  {current.bidderTeamId && (
                    <div
                      className="mb-3 flex items-center gap-2 px-4 py-1.5"
                      style={{
                        clipPath: clipBanner,
                        background: `${bidderColor}`,
                      }}
                    >
                      <span className="text-lg font-black text-white drop-shadow">
                        {teams.find((t) => t.id === current.bidderTeamId)
                          ?.name ??
                          current.bidderName ??
                          "입찰"}
                      </span>
                    </div>
                  )}
                </div>

                {/* 카운트다운 바 */}
                <div className="mt-auto pt-8">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                      Time
                    </span>
                    <span
                      className={`text-2xl font-black tabular-nums ${
                        urgent ? "text-red-400" : "text-white"
                      }`}
                    >
                      {cd.seconds.toFixed(1)}s
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden bg-white/10">
                    <div
                      className="h-full transition-[width] duration-100"
                      style={{
                        width: `${cd.ratio * 100}%`,
                        background: urgent ? "#EF4444" : bidderColor,
                        boxShadow: `0 0 12px ${urgent ? "#EF4444" : bidderColor}`,
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <span className="text-3xl font-bold uppercase tracking-widest text-white/30">
                  다음 매물 준비 중
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 팀 현황 */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {teams.map((team) => {
            const tc = team.color || accent;
            const isBidder = team.id === current.bidderTeamId;
            return (
              <div
                key={team.id}
                className="relative p-[2px] transition-all"
                style={{
                  clipPath: clipL,
                  background: isBidder
                    ? `linear-gradient(160deg, ${tc}, ${tc}55)`
                    : `linear-gradient(160deg, ${tc}88, ${tc}08 65%)`,
                  boxShadow: isBidder ? `0 0 22px ${tc}77` : undefined,
                }}
              >
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ clipPath: clipL, background: PANEL }}
                >
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-1.5" style={{ background: tc }} />
                    <span className="truncate text-xl font-black tracking-tight text-white">
                      {team.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black" style={{ color: tc }}>
                      {fmtP(team.remainingBudget)}
                    </span>
                    <span className="ml-2 text-sm font-bold text-white/35">
                      {team.members?.length ?? 0}명
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 실시간 피드 */}
      <div className="mt-6 flex h-14 items-center gap-3 overflow-hidden">
        <span className="shrink-0 text-xs font-black uppercase tracking-[0.25em] text-white/30">
          Live Feed
        </span>
        <div className="flex flex-1 items-center gap-2.5 overflow-hidden">
          {feed.map((f) => (
            <FeedChip key={f.id} entry={f} accent={accent} />
          ))}
          {feed.length === 0 && (
            <span className="text-sm text-white/25">경매 이벤트 대기 중…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedChip({
  entry,
  accent,
}: {
  entry: BroadcastAuctionState["feed"][number];
  accent: string;
}) {
  const color =
    entry.type === "sold"
      ? "#22C55E"
      : entry.type === "unsold"
        ? "#9CA3AF"
        : entry.type === "bid"
          ? entry.teamColor || accent
          : accent;
  const label =
    entry.type === "sold"
      ? "낙찰"
      : entry.type === "unsold"
        ? "유찰"
        : entry.type === "bid"
          ? "입찰"
          : null;

  return (
    <div
      className="flex shrink-0 items-center gap-2 px-3 py-1.5"
      style={{ clipPath: clipBanner, background: "rgba(0,0,0,0.72)" }}
    >
      {label && (
        <span
          className="text-xs font-black uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
      )}
      <span className="whitespace-nowrap text-sm font-bold text-white/85">
        {entry.text ??
          [
            entry.playerName,
            entry.teamName && `→ ${entry.teamName}`,
            entry.amount != null && `${entry.amount.toLocaleString()}P`,
          ]
            .filter(Boolean)
            .join(" ")}
      </span>
    </div>
  );
}
