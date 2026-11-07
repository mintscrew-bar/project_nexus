"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { broadcastApi } from "@/lib/api-client";
import { getTierIcon } from "@/lib/tier-icon";
import { getRoleIcon } from "@/lib/role-icon";
import { commendationTagLabel } from "@/lib/commendation";
import { getChampionIconUrl } from "@/app/[game]/tournaments/[id]/lobby/_components/icons";
import { playerDisplayName, useBroadcastLook } from "./look";

/**
 * 경매 매물 카드 — 매물 선수에 대한 모든 것을 한 장에 묶는다.
 *
 *  ┌ 남은 시간 막대(카드 맨 위, 줄어든다) ───────────────────────────┐
 *  │ [사진] 이름 · Riot ID         │ 라인별 실력 (라인·티어·선호 챔피언) │
 *  │ 티어 · 주/부 라인              │                                    │
 *  │ 현재 입찰가 · 선두 팀   [남은초] │ 내전 기록 8칸                       │
 *  └──────────────────────────────────────────────────────────────┘
 *
 * 예전에는 매물 카드와 선수 정보 판이 따로 떠 있어 눈이 두 곳을 오갔다(2026-11-06 운영자 피드백).
 * 라인별 티어·챔피언·지표는 방송 전용 선수 프로필(토큰 인증, 송출 중인 방 참가자만)에서 받는다.
 * 미리보기는 profile 을 직접 넘긴다. 조회 전·실패 시에는 "—".
 */

const LANES = [
  { key: "TOP", label: "탑" },
  { key: "JUNGLE", label: "정글" },
  { key: "MID", label: "미드" },
  { key: "ADC", label: "원딜" },
  { key: "SUPPORT", label: "서포터" },
] as const;

const ROLE_KO: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

const AVATAR_FALLBACK = "/images/placeholders/non-avatar-128.png";

type Profile = Awaited<ReturnType<typeof broadcastApi.getPlayerProfile>>;

/** 매물 선수 프로필 — 같은 키로 캐시를 나눠 쓴다 */
export function useLotProfile(token?: string, userId?: string | null) {
  return useQuery({
    queryKey: ["broadcastPlayerProfile", token, userId],
    queryFn: () => broadcastApi.getPlayerProfile(token!, userId!),
    enabled: Boolean(token && userId),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** 남은 초 + 막대 기준 길이(매물마다 본 가장 큰 남은 시간) */
function useCountdown(timerEnd: number | undefined, lotId: string | undefined) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [span, setSpan] = useState({ id: lotId, max: 0 });
  useEffect(() => {
    const update = () =>
      setTimeLeft(Math.max(0, ((timerEnd ?? 0) - Date.now()) / 1000));
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [timerEnd]);
  if (span.id !== lotId || timeLeft > span.max) {
    setSpan({ id: lotId, max: timeLeft });
  }
  const ratio = span.max > 0 ? Math.min(1, timeLeft / span.max) : 0;
  return { seconds: Math.ceil(timeLeft), ratio };
}

export function AuctionLotCard({
  auctionState,
  teams,
  token,
  profile: profileOverride,
}: {
  auctionState: any;
  teams: any[];
  token?: string;
  /** 미리보기용 — 넘기면 조회하지 않는다 */
  profile?: Profile | null;
}) {
  const { accent, settings } = useBroadcastLook();
  const player = auctionState.currentPlayer;
  const playerId = player?.id ?? player?.userId;
  const { data } = useLotProfile(
    profileOverride === undefined ? token : undefined,
    playerId,
  );
  const profile = profileOverride ?? data ?? null;
  const riot = profile?.riotAccount ?? null;
  const { seconds, ratio } = useCountdown(auctionState.timerEnd, playerId);
  const urgent = seconds <= 5;
  const timerColor = urgent ? "#F43F5E" : accent;

  const bidderTeam = teams.find(
    (team) =>
      team.id === auctionState.currentHighestBidder ||
      team.captainId === auctionState.currentHighestBidder,
  );
  const bidderName =
    auctionState.currentHighestBidderName ??
    bidderTeam?.captainName ??
    bidderTeam?.name ??
    null;
  const name =
    playerDisplayName(
      { username: player?.username, riotAccount: riot },
      settings.nameDisplay,
    ) || "대기 중";
  const mainRole = riot?.mainRole ?? player?.mainRole ?? player?.position;
  const subRole = riot?.subRole ?? player?.subRole;
  const tier = riot?.tier ?? player?.tier ?? null;
  const tierIcon = tier ? getTierIcon(tier) : null;

  return (
    <section className="relative overflow-hidden rounded-xl border border-white/10 bg-black/55 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      {/* 남은 시간 막대 — 카드 맨 위에서 줄어든다 */}
      <div className="h-1.5 w-full bg-white/8">
        <div
          className="h-full transition-[width] duration-100 ease-linear"
          style={{ width: `${ratio * 100}%`, background: timerColor }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 12% 0%, ${accent}26, transparent 42%)`,
        }}
      />

      <div className="relative grid grid-cols-[440px_minmax(0,1fr)] gap-7 p-7">
        {/* ── 왼쪽: 누구인가 + 입찰 ── */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={player?.avatar || AVATAR_FALLBACK}
              alt=""
              className="h-24 w-24 shrink-0 rounded-full object-cover"
              style={{ boxShadow: `0 0 0 3px ${accent}aa` }}
              onError={(e) => {
                e.currentTarget.src = AVATAR_FALLBACK;
              }}
            />
            <div className="min-w-0">
              <h1 className="truncate text-[52px] font-black leading-none text-white">
                {name}
              </h1>
              {riot && settings.nameDisplay === "nickname" && (
                <p className="mt-2 truncate text-base font-bold text-white/40">
                  {riot.gameName}#{riot.tagLine}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-md bg-white/[0.07] px-3 py-1.5 text-base font-black text-white">
              {tierIcon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tierIcon} alt="" width={20} height={20} />
              )}
              {tier ?? "UNRANKED"}
            </span>
            {mainRole && ROLE_KO[mainRole] && (
              <span
                className="rounded-md px-3 py-1.5 text-base font-black text-white"
                style={{ background: `${accent}33` }}
              >
                주 {ROLE_KO[mainRole]}
              </span>
            )}
            {subRole && ROLE_KO[subRole] && (
              <span className="rounded-md bg-white/[0.05] px-3 py-1.5 text-base font-bold text-white/60">
                부 {ROLE_KO[subRole]}
              </span>
            )}
          </div>

          <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 pt-6">
            <div className="min-w-0">
              <p className="text-sm font-black text-white/45">현재 입찰가</p>
              <p className="mt-1 flex items-end gap-1.5">
                <span className="text-[64px] font-black tabular-nums leading-none text-amber-300">
                  {(auctionState.currentHighestBid ?? 0).toLocaleString()}
                </span>
                <span className="mb-1.5 text-xl font-black text-amber-300/60">
                  G
                </span>
              </p>
              <p className="mt-2 flex min-w-0 items-center gap-2 text-xl font-black text-white/80">
                {bidderTeam?.color && (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: bidderTeam.color }}
                  />
                )}
                <span className="truncate">{bidderName ?? "첫 입찰 대기"}</span>
              </p>
            </div>
            {/* 남은 초 — 5초부터 빨강 */}
            <div className="text-right">
              <span
                className="text-[88px] font-black tabular-nums leading-none"
                style={{ color: urgent ? "#FB7185" : "#fff" }}
              >
                {seconds}
              </span>
              <span className="ml-1 text-2xl font-black text-white/40">초</span>
              {auctionState.yuchalCount > 0 && (
                <p className="mt-1 text-sm font-black text-amber-200">
                  유찰 {auctionState.yuchalCount}회
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 오른쪽: 어떻게 쓰나 ── */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] gap-6 border-l border-white/10 pl-7">
          <LaneSkills riot={riot} mainRole={mainRole} />

          {settings.show.lotStats && <LotStats profile={profile} />}
        </div>
      </div>
    </section>
  );
}

/**
 * 선수 카드 — 조작 패널의 "선수 카드 띄우기"로 어떤 장면 위에든 잠깐 올라온다.
 * 매물 카드에서 입찰 부분만 빼고, 소속 팀과 배정 라인을 붙였다.
 * 데이터는 매물 카드와 같은 방송 전용 프로필(송출 중인 방 참가자만).
 */
export function PlayerSpotlightCard({
  token,
  userId,
  teams,
  profile: profileOverride,
}: {
  token?: string;
  userId: string;
  teams: any[];
  /** 미리보기용 — 넘기면 조회하지 않는다 */
  profile?: Profile | null;
}) {
  const { accent, settings } = useBroadcastLook();
  const { data } = useLotProfile(
    profileOverride === undefined ? token : undefined,
    userId,
  );
  const profile = profileOverride ?? data ?? null;
  // 프로필이 오기 전에는 빈 카드를 띄우지 않는다 (조회 실패 시에도 조용히 안 뜬다)
  if (!profile) return null;
  const riot = profile.riotAccount ?? null;
  const team = teams.find((t) =>
    (t.members ?? []).some((m: any) => m.userId === userId),
  );
  const member = team?.members?.find((m: any) => m.userId === userId);
  const teamColor = team?.color ?? accent;
  const name =
    playerDisplayName(
      { username: profile.username, riotAccount: riot },
      settings.nameDisplay,
    ) || "선수";
  const mainRole = riot?.mainRole ?? null;
  const assigned = member?.assignedRole as string | undefined;
  const tier = riot?.tier ?? null;
  const tierIcon = tier ? getTierIcon(tier) : null;

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0B0D11]/[0.97] shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-md"
      style={{ animation: "spotlight-in 520ms cubic-bezier(.2,.8,.2,1) both" }}
    >
      <style>{`@keyframes spotlight-in { from { opacity: 0; transform: translateY(60px); } to { opacity: 1; transform: none; } }`}</style>
      {/* 소속 팀 색 띠 */}
      <div className="h-1.5 w-full" style={{ background: teamColor }} />
      <div className="relative grid grid-cols-[400px_minmax(0,1fr)] gap-7 p-7">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profile.avatar || AVATAR_FALLBACK}
              alt=""
              className="h-24 w-24 shrink-0 rounded-full object-cover"
              style={{ boxShadow: `0 0 0 3px ${teamColor}` }}
              onError={(e) => {
                e.currentTarget.src = AVATAR_FALLBACK;
              }}
            />
            <div className="min-w-0">
              <h1 className="truncate text-[52px] font-black leading-none text-white">
                {name}
              </h1>
              {riot && settings.nameDisplay === "nickname" && (
                <p className="mt-2 truncate text-base font-bold text-white/40">
                  {riot.gameName}#{riot.tagLine}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {team && (
              <span
                className="rounded-md px-3 py-1.5 text-base font-black text-white"
                style={{ background: `${teamColor}40` }}
              >
                {team.name}
              </span>
            )}
            {assigned && ROLE_KO[assigned] && (
              <span className="rounded-md bg-white/[0.08] px-3 py-1.5 text-base font-black text-white">
                {ROLE_KO[assigned]}
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-md bg-white/[0.07] px-3 py-1.5 text-base font-black text-white">
              {tierIcon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tierIcon} alt="" width={20} height={20} />
              )}
              {tier ?? "UNRANKED"}
            </span>
          </div>
          {member?.soldPrice != null && (
            <p className="mt-auto pt-6 text-xl font-black text-amber-300">
              낙찰가 {Number(member.soldPrice).toLocaleString()} G
            </p>
          )}
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] gap-6 border-l border-white/10 pl-7">
          <LaneSkills riot={riot} mainRole={assigned ?? mainRole} />
          {settings.show.lotStats && <LotStats profile={profile} />}
        </div>
      </div>
    </section>
  );
}

/** 라인별 실력 — 라인·티어·선호 챔피언 (매물 카드·선수 카드 공용) */
function LaneSkills({
  riot,
  mainRole,
}: {
  riot: Profile["riotAccount"] | null;
  mainRole?: string | null;
}) {
  const { accent } = useBroadcastLook();
  return (
    <div className="min-w-0">
      <p className="mb-2.5 text-sm font-black text-white/55">라인별 실력</p>
      <div className="grid gap-1">
        {LANES.map((lane) => {
          const laneTier = riot?.roleTiers?.find((t) => t.role === lane.key);
          const champs = (riot?.championPreferences ?? [])
            .filter((c) => c.role === lane.key)
            .sort((a, b) => a.order - b.order)
            .slice(0, 3);
          const isMain = mainRole === lane.key;
          const laneTierIcon = laneTier ? getTierIcon(laneTier.tier) : null;
          const roleIcon = getRoleIcon(lane.key);
          return (
            <div
              key={lane.key}
              className="grid h-[52px] grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3"
              style={{
                background: isMain ? `${accent}22` : "rgba(255,255,255,0.03)",
              }}
            >
              <span className="flex items-center gap-2 text-base font-black text-white">
                {roleIcon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={roleIcon}
                    alt=""
                    className="h-4 w-4 brightness-0 invert"
                  />
                )}
                {lane.label}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 truncate text-base font-black text-white/80">
                {laneTierIcon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={laneTierIcon} alt="" width={20} height={20} />
                )}
                {laneTier
                  ? `${laneTier.tier} ${laneTier.rank ?? ""}`.trim()
                  : "—"}
              </span>
              <span className="flex items-center gap-1">
                {champs.map((c) => {
                  const icon = getChampionIconUrl(c.championId);
                  return icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${c.championId}-${c.order}`}
                      src={icon}
                      alt=""
                      className="h-9 w-9 rounded-md"
                    />
                  ) : null;
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 내전 기록 8칸 — 사이트 매물 카드와 같은 항목 */
function LotStats({ profile }: { profile: Profile | null }) {
  const stats = profile?.stats;
  const kda = profile?.kda;
  const praise = profile?.reputation?.commendations;
  const games = stats ? stats.wins + stats.losses : 0;
  const hasKda = Boolean(kda && kda.games > 0);
  const dash = "—";
  const cells: { label: string; value: string; sub?: string; tone?: string }[] =
    [
      {
        label: "내전 승률",
        value: games > 0 ? `${Math.round(stats!.winRate)}%` : dash,
        sub: games > 0 ? `${stats!.wins}승 ${stats!.losses}패` : "기록 없음",
        tone: games > 0 && stats!.winRate >= 60 ? "#4ADE80" : undefined,
      },
      {
        label: "칭찬",
        value: praise && praise.total > 0 ? `${praise.total}` : dash,
        sub:
          praise && praise.total > 0 && praise.topTags[0]
            ? commendationTagLabel(praise.topTags[0].tag)
            : undefined,
      },
      {
        label: "KDA",
        value: hasKda
          ? ((kda!.kills + kda!.assists) / Math.max(1, kda!.deaths)).toFixed(2)
          : dash,
        sub: hasKda
          ? `${kda!.kills.toFixed(1)}/${kda!.deaths.toFixed(1)}/${kda!.assists.toFixed(1)}`
          : undefined,
      },
      {
        label: "킬관여",
        value:
          hasKda && kda!.killParticipation != null
            ? `${kda!.killParticipation}%`
            : dash,
      },
      {
        label: "피해량",
        value: hasKda && kda!.damage ? kda!.damage.toLocaleString() : dash,
      },
      { label: "CS", value: hasKda && kda!.cs ? `${kda!.cs}` : dash },
      { label: "시야", value: hasKda && kda!.vision ? `${kda!.vision}` : dash },
      {
        label: "골드",
        value: hasKda && kda!.gold ? kda!.gold.toLocaleString() : dash,
      },
    ];

  return (
    <div className="min-w-0">
      <p className="mb-2.5 text-sm font-black text-white/55">내전 기록</p>
      <div className="grid grid-cols-2 gap-1">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="flex h-[64px] flex-col justify-center rounded-lg bg-white/[0.03] px-3"
          >
            <p className="text-xs font-black text-white/45">{cell.label}</p>
            <p className="flex items-baseline gap-2">
              <span
                className="text-2xl font-black tabular-nums leading-tight text-white"
                style={cell.tone ? { color: cell.tone } : undefined}
              >
                {cell.value}
              </span>
              {cell.sub && (
                <span className="truncate text-xs font-bold text-white/40">
                  {cell.sub}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
