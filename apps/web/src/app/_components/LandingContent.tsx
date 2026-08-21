// 비로그인·검색봇용 랜딩 콘텐츠. 핵심 본문은 서버에서 렌더링한다.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  Clock,
  Coins,
  Gavel,
  Scale,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { AdSlotCard } from "@/components/ads/AdSlot";
import { LandingMobileNav } from "./LandingMobileNav";
import { LiveStreamersSection } from "@/components/home/LiveStreamersSection";

const operations: Array<{
  index: string;
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
  visual: "readiness" | "balance" | "records";
  accent: string;
}> = [
  {
    index: "01",
    icon: Users,
    title: "모집이 아니라 준비까지",
    description:
      "참가 인원과 준비 여부, Riot 계정, 선호 포지션을 로비에서 확인하고 시작 조건을 점검합니다",
    features: ["참가자 상태", "포지션 확인", "시작 조건"],
    visual: "readiness",
    accent: "text-amber-300",
  },
  {
    index: "02",
    icon: Scale,
    title: "내전에 맞는 팀 편성",
    description:
      "경매·스네이크·자동 밸런스·자유 선택 중 운영 방식에 맞는 팀 구성 방식을 선택합니다",
    features: ["경매·스네이크", "티어·포지션 반영", "자유 선택"],
    visual: "balance",
    accent: "text-violet-300",
  },
  {
    index: "03",
    icon: Trophy,
    title: "결과를 다음 내전의 기록으로",
    description:
      "대진표와 경기 결과, KDA와 챔피언 기록을 남기고 진행 상황을 방송 화면으로 연결합니다",
    features: ["경기 결과", "개인 전적", "방송 오버레이"],
    visual: "records",
    accent: "text-cyan-300",
  },
];

const footerLinks = [
  { href: "/about", label: "서비스 소개" },
  { href: "/guide", label: "가이드 · 자료" },
  { href: "/community", label: "커뮤니티" },
  { href: "/contact", label: "문의" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
];

const landingNavLinks = [
  { href: "#auction", label: "경매" },
  { href: "#operations", label: "주요 기능" },
  { href: "/tournaments", label: "내전 방" },
  { href: "/community", label: "커뮤니티" },
];

const positions = ["TOP", "JGL", "MID", "BOT", "SUP"];

const heroSignals = [
  "Discord 로그인",
  "실시간 경매",
  "Riot 계정 연동",
  "Discord 음성 연동",
];

const workflowOutcomes = [
  {
    value: "10–40명",
    label: "방 규모에 맞춰",
    description:
      "두 팀 내전부터 여러 팀 토너먼트까지 같은 운영 흐름을 사용합니다",
  },
  {
    value: "4가지",
    label: "내전에 맞는 팀 편성",
    description: "경매, 스네이크, 자동 밸런스, 자유 선택을 지원합니다",
  },
  {
    value: "실시간",
    label: "모두가 같은 진행 상태",
    description:
      "준비 상태와 팀 구성, 경매와 경기 진행을 참가자에게 동기화합니다",
  },
];

function OperationCardVisual({
  kind,
  wide = false,
}: {
  kind: "readiness" | "balance" | "records";
  wide?: boolean;
}) {
  const visualClassName = wide
    ? "absolute inset-x-6 bottom-5 rounded-2xl border border-white/[0.08] bg-[#101116]/95 p-4 shadow-2xl shadow-black/30 lg:inset-x-auto lg:bottom-8 lg:right-8 lg:w-[48%]"
    : "absolute inset-x-6 bottom-5 rounded-2xl border border-white/[0.08] bg-[#101116]/95 p-4 shadow-2xl shadow-black/30";

  if (kind === "readiness") {
    return (
      <div className={visualClassName}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold tracking-[0.16em] text-white/60">
              PLAYER CHECK
            </p>
            <p className="mt-1 text-xs font-semibold text-white/80">
              참가 준비
            </p>
          </div>
          <p className="text-lg font-bold tabular-nums text-white">
            8 <span className="text-white/60">/ 10</span>
          </p>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full w-4/5 rounded-full bg-amber-300" />
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {["TOP", "JGL", "MID", "BOT", "SUP"].map((position, index) => (
            <div key={position} className="text-center">
              <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/15 bg-amber-300/[0.07]">
                <Check
                  className={`h-3 w-3 ${index < 4 ? "text-amber-200" : "text-white/60"}`}
                />
              </div>
              <p className="mt-1.5 text-[8px] font-semibold text-white/60">
                {position}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "balance") {
    return (
      <div className={visualClassName}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold tracking-[0.16em] text-white/60">
              TEAM BALANCE
            </p>
            <p className="mt-1 text-xs font-semibold text-white/80">
              자동 밸런스 결과
            </p>
          </div>
          <p className="text-xs font-bold tabular-nums text-violet-200">
            티어·포지션 반영
          </p>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="space-y-1.5">
            {["TOP · D4", "MID · E2", "BOT · P1"].map((player) => (
              <div
                key={player}
                className="rounded-md border border-cyan-300/10 bg-cyan-300/[0.05] px-2 py-1.5 text-[9px] font-medium text-cyan-100/60"
              >
                {player}
              </div>
            ))}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-300/15 bg-violet-300/[0.07] text-[9px] font-black text-violet-200">
            VS
          </div>
          <div className="space-y-1.5 text-right">
            {["TOP · D3", "MID · E1", "BOT · P2"].map((player) => (
              <div
                key={player}
                className="rounded-md border border-rose-300/10 bg-rose-300/[0.05] px-2 py-1.5 text-[9px] font-medium text-rose-100/60"
              >
                {player}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={visualClassName}>
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <p className="text-[9px] font-bold tracking-[0.16em] text-white/60">
            MATCH RESULT
          </p>
          <p className="mt-1 text-xs font-semibold text-white/80">
            금요일 정기 내전
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm font-black tabular-nums">
          <span className="text-cyan-200">BLUE 2</span>
          <span className="text-white/60">:</span>
          <span className="text-rose-200">1 RED</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-5">
        <div className="space-y-2">
          {[72, 58, 84].map((width, index) => (
            <div key={width} className="flex items-center gap-2">
              <span className="w-7 text-[8px] font-medium text-white/60">
                {["KDA", "DMG", "GOLD"][index]}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-cyan-300/65"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-cyan-300/10 bg-cyan-300/[0.05] px-3 py-2 text-center">
          <p className="text-[8px] text-white/60">MVP</p>
          <p className="mt-1 text-[10px] font-bold text-cyan-100/75">
            MID · 4표
          </p>
        </div>
      </div>
    </div>
  );
}

const auctionBenefits: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Clock,
    title: "모두에게 같은 경매 시계",
    description:
      "현재 매물과 남은 시간을 경매 참가자에게 실시간으로 동기화합니다",
  },
  {
    icon: Coins,
    title: "예산까지 계산되는 입찰",
    description:
      "최고가와 입찰 팀, 각 팀의 남은 예산과 로스터를 한 화면에서 확인합니다",
  },
  {
    icon: Gavel,
    title: "유찰부터 다음 매물까지",
    description: "유찰 횟수와 다음 매물 전환을 경매 상태에 맞춰 관리합니다",
  },
];

function AuctionShowcase() {
  return (
    <section
      id="auction"
      className="relative scroll-mt-20 overflow-hidden border-y border-white/[0.07] bg-[#0b0c10] px-5 py-24 sm:px-6 md:py-32"
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-[420px] w-[920px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/[0.08] blur-[140px]"
      />
      <div className="relative mx-auto grid max-w-[1480px] gap-14 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:gap-20">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-amber-200/75">
            <Gavel className="h-3.5 w-3.5" />
            AUCTION SYSTEM
          </div>
          <h2 className="mt-7 max-w-2xl text-4xl font-black leading-[1.04] tracking-[-0.05em] text-white sm:text-5xl md:text-6xl">
            제한 시간과 예산으로
            <br />
            진행하는 실시간 팀 경매
          </h2>
          <p className="mt-7 max-w-xl text-base leading-7 text-white/60 md:text-lg md:leading-8">
            팀장은 남은 자리를 고려해 입찰하고 참가자는 현재 매물과 최고가,
            팀별 예산과 로스터 변화를 같은 화면에서 확인합니다
          </p>

          <ul className="mt-10 space-y-5">
            {auctionBenefits.map((benefit) => (
              <li key={benefit.title} className="flex gap-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-amber-200">
                  <benefit.icon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white/85">
                    {benefit.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-white/60">
                    {benefit.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <Link
            href="/guide#draft"
            className="group mt-10 inline-flex items-center gap-2 text-sm font-bold text-amber-200 transition-colors hover:text-amber-100"
          >
            경매 진행 방식 보기
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div
          aria-hidden="true"
          className="relative select-none rounded-[30px] border border-white/[0.09] bg-[#101116] p-3 shadow-[0_45px_120px_rgba(0,0,0,0.5)] sm:p-5"
        >
          <div className="absolute -inset-px -z-10 rounded-[30px] bg-gradient-to-br from-amber-300/15 via-violet-400/5 to-cyan-300/10 blur-xl" />
          <div className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0c0d12]">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-300/10 text-amber-200">
                  <Gavel className="auction-hammer h-4 w-4" />
                </span>
                <div>
                  <p className="text-[9px] font-bold tracking-[0.18em] text-white/60">
                    AUCTION ROOM
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-white/75">
                    금요일 정기 내전
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[9px] font-bold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                경매 진행 중
              </div>
            </div>

            <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-[1.12fr_0.88fr]">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.16em] text-white/60">
                      현재 매물 06 / 08
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400/25 to-cyan-300/10 text-lg font-black text-white/80">
                        N
                      </span>
                      <div>
                        <p className="text-base font-bold text-white">
                          NEXUS_06
                        </p>
                        <p className="mt-1 text-[10px] font-medium text-violet-200/65">
                          DIAMOND IV · MID / SUP
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="auction-countdown text-3xl font-black tabular-nums text-white">
                      12
                    </p>
                    <p className="mt-0.5 text-[9px] text-white/60">
                      남은 시간(초)
                    </p>
                  </div>
                </div>

                <div className="auction-bid-flash relative mt-5 overflow-hidden rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-4">
                  <span className="auction-bid-event absolute right-3 top-2 rounded-full border border-amber-200/15 bg-amber-200/10 px-2 py-1 text-[8px] font-bold text-amber-100">
                    +50G
                  </span>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-medium text-white/60">
                        최고 입찰가
                      </p>
                      <p className="auction-bid-value mt-1 text-2xl font-black tabular-nums text-amber-200">
                        1,250G
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-white/60">최고 입찰 팀</p>
                      <p className="mt-1 text-xs font-bold text-white/65">
                        TEAM VIOLET
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["+50G", "+100G", "+250G"].map((amount) => (
                    <div
                      key={amount}
                      className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-2 text-center text-[10px] font-bold text-white/60"
                    >
                      {amount}
                    </div>
                  ))}
                </div>
                <div className="auction-cta-pulse mt-2 rounded-lg bg-amber-200 px-3 py-2.5 text-center text-xs font-black text-[#17130b]">
                  1,300G 입찰
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold tracking-[0.16em] text-white/60">
                      TEAM BUDGET
                    </p>
                    <Coins className="h-3.5 w-3.5 text-amber-200/60" />
                  </div>
                  <div className="mt-4 space-y-2.5">
                    {[
                      ["TEAM BLUE", "2,750G", "3 / 5", "bg-cyan-300"],
                      ["TEAM VIOLET", "2,100G", "4 / 5", "bg-violet-300"],
                      ["TEAM RED", "3,000G", "3 / 5", "bg-rose-300"],
                    ].map(([team, budget, members, color]) => (
                      <div
                        key={team}
                        className={`rounded-xl border border-transparent bg-black/20 px-3 py-2.5 ${team === "TEAM VIOLET" ? "auction-team-winner" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${color}`}
                          />
                          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/55">
                            {team}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums text-white/70">
                            {budget}
                          </span>
                        </div>
                        <p className="mt-1 pl-3.5 text-[8px] text-white/60">
                          로스터 {members}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-300/10 text-violet-200">
                    <CircleDot className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold text-white/65">
                      입찰 이벤트 동기화
                    </p>
                    <p className="mt-1 text-[9px] text-white/60">
                      모든 참가자에게 즉시 반영
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OperationBoard() {
  return (
    <div className="relative mx-auto w-full max-w-[680px] lg:ml-auto">
      <div
        aria-hidden="true"
        className="absolute -inset-12 -z-10 rounded-full bg-violet-500/15 blur-[90px]"
      />

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#111217]/95 shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10">
              <Swords className="h-4 w-4 text-violet-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-white/60">
                MATCH CONTROL
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-white">
                금요일 밤 5:5 내전
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 sm:px-3">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
            모집 중
          </div>
        </div>

        <div className="grid gap-4 p-3 sm:p-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-white/60">참가 준비</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-white">
                  8<span className="text-white/60"> / 10</span>
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-300">
                2명 남음
              </span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-300" />
            </div>

            <div className="mt-5 space-y-2.5">
              {[
                ["Riot 계정 연동", "8 / 8", true],
                ["포지션 선택", "8 / 8", true],
                ["Discord 음성", "6 / 8", false],
              ].map(([label, value, ready]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${
                        ready
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-amber-400/15 text-amber-300"
                      }`}
                    >
                      {ready ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <CircleDot className="h-3 w-3" />
                      )}
                    </span>
                    <span className="text-xs text-white/65">{label}</span>
                  </div>
                  <span className="text-xs font-medium tabular-nums text-white/60">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden flex-col gap-4 md:flex">
            <div className="flex-1 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-violet-500/[0.09] to-transparent p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.18em] text-violet-300/70">
                    TEAM BUILDER
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    자동 밸런스
                  </p>
                </div>
                <Scale className="h-5 w-5 text-violet-300" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <p className="mb-2 text-[10px] font-bold text-cyan-300">
                    BLUE
                  </p>
                  {positions.map((position) => (
                    <div
                      key={`blue-${position}`}
                      className="rounded-lg border border-cyan-300/10 bg-cyan-300/[0.05] px-2 py-1.5 text-[10px] text-white/55"
                    >
                      {position}
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="mb-2 text-[10px] font-bold text-rose-300">
                    RED
                  </p>
                  {positions.map((position) => (
                    <div
                      key={`red-${position}`}
                      className="rounded-lg border border-rose-300/10 bg-rose-300/[0.05] px-2 py-1.5 text-[10px] text-white/55"
                    >
                      {position}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5865F2]/15 text-[#8d96ff]">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">
                  Discord 연결 준비
                </p>
                <p className="mt-0.5 truncate text-[10px] text-white/60">
                  팀 확정 후 각 팀 음성 채널로 이동
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 border-t border-white/[0.07] bg-black/20">
          {[
            ["MODE", "자동 밸런스"],
            ["FORMAT", "5 VS 5"],
            ["STATUS", "참가 가능"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-r border-white/[0.06] px-4 py-3 last:border-r-0 sm:px-5"
            >
              <p className="text-[9px] font-semibold tracking-[0.16em] text-white/60">
                {label}
              </p>
              <p className="mt-1 truncate text-[11px] font-medium text-white/65">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-5 -left-3 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#18191f]/95 px-4 py-3 shadow-2xl backdrop-blur lg:flex">
        <ShieldCheck className="h-5 w-5 text-emerald-300" />
        <div>
          <p className="text-[10px] text-white/60">START CHECK</p>
          <p className="text-xs font-semibold text-white">
            참가 준비와 시작 조건 확인 중
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingContentSections() {
  return (
    <>
      <section className="relative isolate overflow-hidden px-5 pb-20 pt-12 sm:px-6 md:pb-24 md:pt-16 lg:flex lg:min-h-[720px] lg:items-center lg:py-16 xl:min-h-[760px]">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_25%,rgba(102,126,234,0.18),transparent_32%),radial-gradient(circle_at_85%_65%,rgba(34,211,238,0.09),transparent_30%),linear-gradient(180deg,#0f0f0f_0%,#111117_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
        />

        <div className="mx-auto grid w-full max-w-[1480px] items-center gap-14 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12">
          <div>
            <h1 className="max-w-[760px] text-[clamp(3rem,6vw,6.25rem)] font-black leading-[0.98] tracking-[-0.065em] text-white">
              내전 운영,
              <br />
              <span className="bg-gradient-to-r from-[#8da2ff] via-[#b89cff] to-[#70d9ec] bg-clip-text text-transparent">
                한곳에서
              </span>
              <br />
              끝까지
            </h1>

            <p className="mt-7 max-w-xl text-base leading-7 text-white/55 sm:text-lg sm:leading-8">
              로비 모집과 팀 편성부터 경기 진행, 결과 기록까지 하나의 내전
              방에서 이어갑니다
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/login"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-[#111217] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f]"
              >
                내전 시작하기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/tournaments"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                열린 내전 보기
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <ul
              className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-white/60"
              aria-label="서비스 특징"
            >
              {heroSignals.map((signal) => (
                <li key={signal} className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  {signal}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-slide-up [animation-delay:120ms] [animation-fill-mode:both]">
            <OperationBoard />
          </div>
        </div>
      </section>

      {/* 방송 중인 스트리머가 있을 때만 나타난다 (없으면 섹션째 렌더 안 함) */}
      <LiveStreamersSection className="mx-auto max-w-[1480px] px-5 py-10 sm:px-6" />

      <section className="border-y border-white/[0.07] bg-[#0b0c10] px-5 sm:px-6">
        <div className="mx-auto grid max-w-[1480px] grid-cols-2 divide-x divide-white/[0.07] [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-white/[0.07] md:grid-cols-4 md:[&>*:nth-child(-n+2)]:border-b-0">
          {[
            ["01", "모집과 준비"],
            ["02", "팀 구성"],
            ["03", "역할과 대진표"],
            ["04", "경기와 기록"],
          ].map(([number, label]) => (
            <div
              key={number}
              className="flex items-center gap-3 px-4 py-5 sm:px-7"
            >
              <span className="text-[10px] font-bold text-violet-300/70">
                {number}
              </span>
              <span className="text-xs font-semibold text-white/55 sm:text-sm">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#efede7] px-5 py-24 text-[#151515] sm:px-6 md:py-36">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-xs font-bold tracking-[0.18em] text-[#151515]/65">
            WHY NEXUS
          </p>
          <h2 className="mt-8 max-w-[1240px] text-[clamp(2.5rem,6vw,6.6rem)] font-black leading-[1.02] tracking-[-0.065em]">
            내전은 방을 만드는 순간이 아니라,
            <span className="text-[#5d63d8]">
              {" "}
              마지막 경기가 끝나는 순간
            </span>{" "}
            완성됩니다
          </h2>
          <div className="mt-12 flex flex-col justify-between gap-8 border-t border-black/15 pt-6 md:flex-row md:items-start">
            <p className="max-w-xl text-base leading-7 text-black/55 md:text-lg">
              NEXUS는 방 생성과 참가 준비, 팀 구성, 경기 결과 기록을 하나의 운영
              흐름으로 제공합니다
            </p>
            <Link
              href="/about"
              className="group inline-flex w-fit items-center gap-3 text-sm font-bold"
            >
              NEXUS가 해결하는 문제
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#151515] text-white transition-transform group-hover:translate-x-1">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>

          <div className="mt-16 grid overflow-hidden rounded-[28px] border border-black/10 bg-white/35 md:grid-cols-3 md:divide-x md:divide-black/10">
            {workflowOutcomes.map((outcome) => (
              <article
                key={outcome.value}
                className="border-b border-black/10 p-6 last:border-b-0 sm:p-8 md:border-b-0"
              >
                <p className="text-3xl font-black tracking-[-0.04em] text-[#5d63d8] sm:text-4xl">
                  {outcome.value}
                </p>
                <h3 className="mt-4 text-lg font-bold tracking-[-0.02em]">
                  {outcome.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-black/65">
                  {outcome.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <AuctionShowcase />

      <section
        id="operations"
        className="relative scroll-mt-20 overflow-hidden bg-[#0f0f0f] px-5 py-24 sm:px-6 md:py-32"
      >
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-violet-500/[0.08] blur-[140px]"
        />
        <div className="relative mx-auto max-w-[1480px]">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-violet-300">
                OPERATIONS
              </p>
              <h2 className="mt-5 text-4xl font-black leading-[1.05] tracking-[-0.045em] text-white sm:text-5xl md:text-6xl">
                진행할수록
                <br />더 명확하게
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-white/60 lg:ml-auto lg:text-lg">
              로비에서는 참가 준비와 시작 조건을, 팀 구성 단계에서는 선택한 편성
              방식의 진행 상태를, 경기 후에는 결과와 전적을 확인합니다
            </p>
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-12">
            {operations.map((operation) => (
              <article
                key={operation.index}
                className={`group relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#17181d] p-7 transition-all duration-300 hover:border-white/[0.16] md:p-9 ${
                  operation.index === "01"
                    ? "min-h-[520px] lg:col-span-7"
                    : operation.index === "02"
                      ? "min-h-[520px] lg:col-span-5"
                      : "min-h-[540px] lg:col-span-12 lg:min-h-[390px]"
                }`}
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:28px_28px]"
                />
                <div
                  className={`absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t to-transparent ${
                    operation.index === "01"
                      ? "from-amber-400/[0.07]"
                      : operation.index === "02"
                        ? "from-violet-500/[0.08]"
                        : "from-cyan-400/[0.06]"
                  }`}
                />
                <div aria-hidden="true">
                  <OperationCardVisual
                    kind={operation.visual}
                    wide={operation.index === "03"}
                  />
                </div>
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-[0.18em] text-white/60">
                      FEATURE · {operation.index}
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                      <operation.icon className={`h-5 w-5 ${operation.accent}`} />
                    </span>
                  </div>
                  <div
                    className={`pt-10 ${operation.index === "03" ? "lg:max-w-[42%]" : ""}`}
                  >
                    <h3 className="text-2xl font-bold tracking-[-0.03em] text-white sm:text-3xl">
                      {operation.title}
                    </h3>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-white/60">
                      {operation.description}
                    </p>
                    <ul
                      className="mt-6 flex flex-wrap gap-2"
                      aria-label={`${operation.title} 주요 기능`}
                    >
                      {operation.features.map((feature) => (
                        <li
                          key={feature}
                          className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/55"
                        >
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.07] bg-[#0b0c10] px-5 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1480px]">
          <div className="grid gap-10 border-y border-white/[0.08] py-12 md:py-16 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] text-violet-300">
                <span className="h-px w-8 bg-violet-300/50" />
                READY TO HOST
              </div>
              <h2 className="mt-6 max-w-5xl text-4xl font-black leading-[1.04] tracking-[-0.05em] text-white sm:text-5xl md:text-6xl">
                내전 준비,
                <br />방 하나로 끝
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                브라우저에서 참가자를 확인하고 선택한 팀 구성 방식으로 경기를
                준비하세요
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <Link
                href="/auth/login"
                className="group inline-flex min-w-48 items-center justify-center gap-3 rounded-xl bg-white px-6 py-4 text-sm font-bold text-[#111217] transition-transform hover:-translate-y-0.5"
              >
                내전 방 만들기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <p className="text-[10px] text-white/60">
                Discord 로그인 후 바로 시작
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0f0f0f] px-5 pb-12 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <AdSlotCard slotKey="landing" minHeight={100} />
        </div>
      </section>
    </>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#0b0c10] px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-7 text-sm text-white/60">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-3 max-w-md text-xs leading-5 text-white/60">
              롤 내전의 로비, 팀 구성, 경기 결과를 연결하는 운영 플랫폼입니다
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-white/70"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="border-t border-white/[0.06] pt-6 text-[11px] leading-5 text-white/60">
          Project Nexus isn&apos;t endorsed by Riot Games and doesn&apos;t
          reflect the views or opinions of Riot Games or anyone officially
          involved in producing or managing Riot Games properties; League of
          Legends and Riot Games are trademarks or registered trademarks of Riot
          Games, Inc
        </p>
      </div>
    </footer>
  );
}

function LandingHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-bg-tertiary bg-bg-secondary px-3 py-2 md:px-4 md:py-3">
      <div className="mx-auto flex w-full items-center gap-2">
        <LandingMobileNav links={landingNavLinks} />
        <Link
          href="/"
          className="flex flex-shrink-0 items-center"
          aria-label="Nexus 홈"
        >
          <Logo className="h-8 w-auto" />
        </Link>

        <nav
          aria-label="랜딩 페이지 주요 메뉴"
          className="hidden min-w-0 flex-1 md:block"
        >
          <div className="flex items-center justify-center gap-1">
            {landingNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-bg-tertiary hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/auth/login"
            className="flex-shrink-0 rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active sm:px-6"
          >
            로그인
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function LandingContent() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#0f0f0f] pt-12 md:pt-16">
      <LandingHeader />
      <LandingContentSections />
      <LandingFooter />
    </main>
  );
}
