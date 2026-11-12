"use client";

// 개발용 시안 — 로비 구성 비교 (실제 로비 코드는 건드리지 않는다)
// 접속: http://localhost:3010/dev/lobby-layout?v=a|b|c

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Check,
  Crown,
  Eye,
  Gavel,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  Share2,
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type P = {
  name: string;
  riot: string;
  tier: string;
  tierColor: string;
  main: string;
  sub: string;
  ready: boolean;
  host?: boolean;
};

const PLAYERS: (P | null)[] = [
  {
    name: "긴허",
    riot: "관리자 하루마룬",
    tier: "DIAMOND II",
    tierColor: "text-sky-300 bg-sky-400/15",
    main: "정글",
    sub: "탑",
    ready: true,
    host: true,
  },
  {
    name: "새벽정글러",
    riot: "새벽정글러#KR1",
    tier: "EMERALD I",
    tierColor: "text-emerald-300 bg-emerald-400/15",
    main: "정글",
    sub: "서폿",
    ready: true,
  },
  {
    name: "임천우",
    riot: "임천우#0101",
    tier: "PLATINUM II",
    tierColor: "text-teal-300 bg-teal-400/15",
    main: "미드",
    sub: "원딜",
    ready: false,
  },
  {
    name: "학20",
    riot: "학20#KR2",
    tier: "DIAMOND IV",
    tierColor: "text-sky-300 bg-sky-400/15",
    main: "원딜",
    sub: "미드",
    ready: true,
  },
  {
    name: "동글이안경",
    riot: "동글이안경#KR1",
    tier: "GOLD I",
    tierColor: "text-amber-300 bg-amber-400/15",
    main: "서폿",
    sub: "정글",
    ready: false,
  },
  {
    name: "레몬쉬폰",
    riot: "레몬쉬폰#lem",
    tier: "EMERALD III",
    tierColor: "text-emerald-300 bg-emerald-400/15",
    main: "탑",
    sub: "미드",
    ready: true,
  },
  {
    name: "흰둥이",
    riot: "흰둥이#KR1",
    tier: "PLATINUM I",
    tierColor: "text-teal-300 bg-teal-400/15",
    main: "탑",
    sub: "정글",
    ready: false,
  },
  null,
  null,
  null,
];
const joined = PLAYERS.filter(Boolean).length;
const readyN = PLAYERS.filter((p) => p?.ready).length;

const CHAT = [
  ["새벽정글러", "오늘 몇 시 시작해요?"],
  ["긴허", "10명 차면 바로 갑니다"],
  ["학20", "원딜 자리 비었나요"],
  ["임천우", "준비 잠깐만요"],
];

function Avatar({ name, size = 9 }: { name: string; size?: number }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-bg-elevated text-sm font-bold text-text-secondary",
        size === 9 ? "h-9 w-9" : "h-12 w-12 text-base",
      )}
    >
      {name.slice(0, 1)}
    </div>
  );
}

/** 한 줄 참가자 칸 (A·C 시안) */
function Row({ p, i }: { p: P | null; i: number }) {
  if (!p)
    return (
      <div className="flex h-[60px] items-center gap-3 rounded-xl border border-dashed border-bg-elevated/70 px-3 text-sm text-text-tertiary">
        <span className="w-5 text-center text-xs tabular-nums">{i + 1}</span>빈
        자리
      </div>
    );
  return (
    <div
      className={cn(
        "flex h-[60px] items-center gap-3 rounded-xl px-3",
        p.ready ? "bg-accent-success/[0.07]" : "bg-bg-tertiary/60",
      )}
    >
      <span className="w-5 text-center text-xs tabular-nums text-text-tertiary">
        {i + 1}
      </span>
      <Avatar name={p.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {p.host && <Crown className="h-3.5 w-3.5 text-accent-warning" />}
          <span className="truncate text-sm font-bold text-text-primary">
            {p.name}
          </span>
        </div>
        <div className="truncate text-xs text-text-tertiary">{p.riot}</div>
      </div>
      <span className="text-xs text-text-secondary">
        {p.main} <span className="text-text-tertiary">/ {p.sub}</span>
      </span>
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-[11px] font-bold",
          p.tierColor,
        )}
      >
        {p.tier}
      </span>
      <span
        className={cn(
          "w-14 text-right text-xs font-black",
          p.ready ? "text-accent-success" : "text-text-tertiary",
        )}
      >
        {p.ready ? "준비" : "대기"}
      </span>
    </div>
  );
}

/** 세로로 긴 참가자 칸 (B 시안) */
function Tile({ p, i }: { p: P | null; i: number }) {
  if (!p)
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-bg-elevated/70 text-sm text-text-tertiary">
        <span className="text-xs tabular-nums">{i + 1}</span>빈 자리
      </div>
    );
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl px-3 py-4 text-center",
        p.ready ? "bg-accent-success/[0.07]" : "bg-bg-tertiary/60",
      )}
    >
      <Avatar name={p.name} size={12} />
      <div className="flex items-center gap-1">
        {p.host && <Crown className="h-3.5 w-3.5 text-accent-warning" />}
        <span className="text-sm font-bold text-text-primary">{p.name}</span>
      </div>
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-[11px] font-bold",
          p.tierColor,
        )}
      >
        {p.tier}
      </span>
      <span className="text-xs text-text-secondary">
        {p.main} <span className="text-text-tertiary">/ {p.sub}</span>
      </span>
      <span
        className={cn(
          "text-sm font-black",
          p.ready ? "text-accent-success" : "text-text-tertiary",
        )}
      >
        {p.ready ? "준비 완료" : "대기 중"}
      </span>
    </div>
  );
}

function Chat({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary",
        className,
      )}
    >
      <h2 className="flex items-center gap-2 border-b border-bg-tertiary px-4 py-3 text-sm font-bold text-text-primary">
        <MessageSquare className="h-4 w-4" />
        채팅
      </h2>
      <div className="flex-1 space-y-2.5 overflow-hidden p-4 text-sm">
        {CHAT.map(([n, m], i) => (
          <div key={i}>
            <span className="font-semibold text-text-secondary">{n}</span>
            <span className="ml-2 text-text-primary">{m}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-bg-tertiary p-3">
        <div className="flex-1 rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-tertiary">
          메시지를 입력하세요…
        </div>
        <div className="rounded-lg bg-accent-primary/40 px-4 py-2 text-sm text-white">
          전송
        </div>
      </div>
    </section>
  );
}

function IconBtns() {
  return (
    <div className="flex items-center gap-1">
      {[Share2, UserCog, Radio].map((I, i) => (
        <span
          key={i}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-tertiary"
        >
          <I className="h-5 w-5" />
        </span>
      ))}
      <span className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-text-secondary">
        <Settings className="h-5 w-5" /> 방 설정
      </span>
    </div>
  );
}

function Actions() {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-lg border border-bg-elevated px-3 py-2 text-sm text-text-secondary">
        봇 채우기 (3)
      </span>
      <span className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-bold text-white">
        준비 완료하기
      </span>
      <span className="rounded-lg border border-accent-success/40 bg-accent-success/10 px-4 py-2 text-sm font-bold text-accent-success/60">
        내전 시작
      </span>
    </div>
  );
}

function Leave() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs font-semibold text-red-400">
      <LogOut className="h-4 w-4" /> 방 나가기
    </span>
  );
}

/** 큰 행동 버튼 — 역할마다 하나만 보여준다.
 *  일반 참가자: 준비하기 / 방장(선수든 운영자든): 내전 시작 + 봇 채우기
 *  관전자: 행동 버튼 없음 (전환은 관전 칸 버튼) */
function BigActions({ me }: { me: Me }) {
  if (me === "spectator")
    return (
      <span className="text-sm text-text-tertiary">
        관전 중이에요. 시작은 방장이 해요
      </span>
    );
  if (me === "player")
    return (
      <span className="flex h-12 w-64 items-center justify-center gap-2 rounded-xl bg-accent-primary text-base font-black text-white">
        <Check className="h-5 w-5" strokeWidth={3} /> 준비하기
      </span>
    );
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-12 items-center justify-center rounded-xl border border-bg-elevated px-4 text-sm text-text-secondary">
        봇 채우기 (3)
      </span>
      {/* 조건이 안 되면 흐리게 — 이유는 왼쪽 상태 문구가 말해준다 */}
      <span className="flex h-12 w-64 items-center justify-center gap-2 rounded-xl bg-accent-success/25 text-base font-black text-white/50">
        <Gavel className="h-5 w-5" /> 내전 시작
      </span>
    </div>
  );
}

/** 오른쪽 칸 행동 버튼 (확정 시안) — 준비는 선수에게, 시작·봇은 방장에게 */
function SideActions() {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-primary text-base font-black text-white">
        <Check className="h-5 w-5" strokeWidth={3} /> 준비 완료하기
      </span>
      <div className="flex gap-2">
        <span className="flex h-12 flex-1 items-center justify-center rounded-xl border border-accent-success/40 bg-accent-success/10 font-black text-accent-success/60">
          내전 시작
        </span>
        <span className="flex h-12 items-center justify-center rounded-xl border border-bg-elevated px-3 text-sm text-text-secondary">
          봇 채우기 (3)
        </span>
      </div>
    </div>
  );
}

function Status() {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-bold text-text-primary">
        {joined}/10 <span className="font-normal text-text-tertiary">참가</span>
      </span>
      <span className="font-bold text-accent-success">
        {readyN} <span className="font-normal text-text-tertiary">준비</span>
      </span>
      <span className="text-text-tertiary">
        3명 더 들어오면 시작할 수 있어요
      </span>
    </div>
  );
}

/** A — 머리 한 줄 + 고정 10칸(2열) + 채팅 */
function A() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-bg-tertiary bg-bg-secondary px-6 py-3">
        <div className="container mx-auto flex items-center gap-4">
          <Leave />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-text-primary">
                금요일 밤 5:5 내전
              </h1>
              <span className="font-mono text-sm text-accent-primary">
                #cmwc
              </span>
            </div>
            <div className="mt-0.5 flex gap-2 text-xs text-text-tertiary">
              <span>경매 드래프트</span>·<span>단판</span>·
              <span>싱글 엘리미네이션</span>·<span>관전 허용</span>
            </div>
          </div>
          <div className="ml-auto">
            <IconBtns />
          </div>
        </div>
      </header>
      <div className="container mx-auto flex min-h-0 flex-1 gap-4 px-6 py-4">
        <section className="flex min-w-0 flex-[2] flex-col rounded-xl border border-bg-tertiary bg-bg-secondary">
          <div className="flex items-center gap-4 border-b border-bg-tertiary px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Users className="h-4 w-4" /> 참가자
            </h2>
            <Status />
            <div className="ml-auto">
              <Actions />
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 content-start gap-2 p-4">
            {PLAYERS.map((p, i) => (
              <Row key={i} p={p} i={i} />
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-bg-tertiary px-4 py-2.5 text-xs text-text-tertiary">
            <Eye className="h-3.5 w-3.5" /> 관전 2명 · 운영자 0명
            <span className="ml-auto text-text-secondary">운영자로 전환</span>
          </div>
        </section>
        <Chat className="w-96" />
      </div>
    </div>
  );
}

/** B — 10칸을 5×2 큰 칸으로 + 아래 상태·버튼 바 */
function B() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-bg-tertiary bg-bg-secondary px-6 py-3">
        <div className="container mx-auto flex items-center gap-4">
          <Leave />
          <h1 className="text-lg font-bold text-text-primary">
            금요일 밤 5:5 내전
          </h1>
          <span className="font-mono text-sm text-accent-primary">#cmwc</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
            <Gavel className="h-3 w-3" /> 경매 · 단판
          </span>
          <div className="ml-auto">
            <IconBtns />
          </div>
        </div>
      </header>
      <div className="container mx-auto flex min-h-0 flex-1 gap-4 px-6 py-4">
        <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-bg-tertiary bg-bg-secondary">
          <div className="grid flex-1 grid-cols-5 grid-rows-2 gap-3 p-4">
            {PLAYERS.map((p, i) => (
              <Tile key={i} p={p} i={i} />
            ))}
          </div>
          <div className="flex items-center gap-4 border-t border-bg-tertiary px-4 py-3">
            <Status />
            <span className="text-xs text-text-tertiary">관전 2명</span>
            <div className="ml-auto">
              <Actions />
            </div>
          </div>
        </section>
        <Chat className="w-80" />
      </div>
    </div>
  );
}

/** C — 왼쪽 방 정보 칸 + 가운데 참가자 + 오른쪽 채팅 */
function C() {
  const info = [
    ["팀 구성", "경매 드래프트"],
    ["인원", "10명 · 5 vs 5"],
    ["경기 방식", "단판"],
    ["시작 포인트", "1,000P"],
    ["입찰 시간", "30초"],
    ["공개", "공개 · 관전 허용"],
  ];
  return (
    <div className="container mx-auto flex h-full min-h-0 gap-4 px-6 py-4">
      <aside className="flex w-72 shrink-0 flex-col gap-4 rounded-xl border border-bg-tertiary bg-bg-secondary p-4">
        <Leave />
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            금요일 밤 5:5 내전
          </h1>
          <span className="font-mono text-sm text-accent-primary">#cmwc</span>
        </div>
        <dl className="space-y-2 text-sm">
          {info.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-text-tertiary">{k}</dt>
              <dd className="font-semibold text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto grid grid-cols-2 gap-2 text-sm text-text-secondary">
          {[
            [Settings, "방 설정"],
            [Share2, "링크 공유"],
            [Radio, "방송 링크"],
            [UserCog, "내 설정"],
          ].map(([I, l]) => {
            const Icon = I as typeof Settings;
            return (
              <span
                key={l as string}
                className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary/60 px-3 py-2"
              >
                <Icon className="h-4 w-4" /> {l as string}
              </span>
            );
          })}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-bg-tertiary bg-bg-secondary">
        <div className="flex items-center gap-4 border-b border-bg-tertiary px-4 py-3">
          <Status />
          <div className="ml-auto">
            <Actions />
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-2 p-4">
          {PLAYERS.map((p, i) => (
            <Row key={i} p={p} i={i} />
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-bg-tertiary px-4 py-2.5 text-xs text-text-tertiary">
          <Check className="h-3.5 w-3.5" /> 관전 2명 · 운영자 0명
        </div>
      </section>
      <Chat className="w-80" />
    </div>
  );
}

const INFO = [
  ["팀 구성", "경매 드래프트"],
  ["인원", "10명 · 5 vs 5"],
  ["경기 방식", "단판"],
  ["시작 포인트", "1,000P"],
  ["입찰 시간", "30초"],
  ["공개", "공개 · 관전 허용"],
];

function HostBtns({ cols = 2 }: { cols?: number }) {
  return (
    <div
      className={cn(
        "grid gap-2 text-sm text-text-secondary",
        cols === 4 ? "grid-cols-4" : "grid-cols-2",
      )}
    >
      {(
        [
          [Settings, "방 설정"],
          [Share2, "링크 공유"],
          [Radio, "방송 링크"],
          [UserCog, "내 설정"],
        ] as const
      ).map(([Icon, l]) => (
        <span
          key={l}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-bg-tertiary/60 px-3 py-2"
        >
          <Icon className="h-4 w-4" /> {l}
        </span>
      ))}
    </div>
  );
}

function TileBoard({ footer = true }: { footer?: boolean }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-bg-tertiary bg-bg-secondary">
      <div className="flex items-center gap-4 border-b border-bg-tertiary px-4 py-3">
        <Status />
        <div className="ml-auto">
          <Actions />
        </div>
      </div>
      <div className="grid flex-1 grid-cols-5 grid-rows-2 gap-3 p-4">
        {PLAYERS.map((p, i) => (
          <Tile key={i} p={p} i={i} />
        ))}
      </div>
      {footer && (
        <div className="flex items-center gap-2 border-t border-bg-tertiary px-4 py-2.5 text-xs text-text-tertiary">
          <Eye className="h-3.5 w-3.5" /> 관전 2명 · 운영자 0명
          <span className="ml-auto text-text-secondary">운영자로 전환</span>
        </div>
      )}
    </section>
  );
}

/** D — C 의 왼쪽 방 정보 칸 + B 의 큰 칸 + 오른쪽 채팅 */
function D() {
  return (
    <div className="container mx-auto flex h-full min-h-0 gap-4 px-6 py-4">
      <aside className="flex w-64 shrink-0 flex-col gap-4 rounded-xl border border-bg-tertiary bg-bg-secondary p-4">
        <Leave />
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            금요일 밤 5:5 내전
          </h1>
          <span className="font-mono text-sm text-accent-primary">#cmwc</span>
        </div>
        <dl className="space-y-2 text-sm">
          {INFO.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-text-tertiary">{k}</dt>
              <dd className="font-semibold text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto">
          <HostBtns />
        </div>
      </aside>
      <TileBoard />
      <Chat className="w-80" />
    </div>
  );
}

/** E — 방 정보를 위쪽 가로 띠로 + 큰 칸 + 오른쪽 채팅 */
function E() {
  return (
    <div className="container mx-auto flex h-full min-h-0 flex-col gap-4 px-6 py-4">
      <div className="flex items-center gap-6 rounded-xl border border-bg-tertiary bg-bg-secondary px-5 py-3">
        <Leave />
        <div className="shrink-0">
          <h1 className="text-lg font-bold text-text-primary">
            금요일 밤 5:5 내전
          </h1>
          <span className="font-mono text-xs text-accent-primary">#cmwc</span>
        </div>
        <dl className="flex flex-1 items-center gap-6 text-sm">
          {INFO.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-text-tertiary">{k}</dt>
              <dd className="font-semibold text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
        <IconBtns />
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <TileBoard />
        <Chat className="w-80" />
      </div>
    </div>
  );
}

/** F — 큰 칸을 넓게, 오른쪽 한 줄에 방 정보(위) + 채팅(아래) */
function F() {
  return (
    <div className="container mx-auto flex h-full min-h-0 gap-4 px-6 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <Leave />
          <h1 className="text-xl font-bold text-text-primary">
            금요일 밤 5:5 내전
          </h1>
          <span className="font-mono text-sm text-accent-primary">#cmwc</span>
        </div>
        <TileBoard />
      </div>
      <div className="flex w-80 shrink-0 flex-col gap-4">
        <section className="rounded-xl border border-bg-tertiary bg-bg-secondary p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {INFO.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-text-tertiary">{k}</dt>
                <dd className="font-semibold text-text-primary">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <HostBtns />
          </div>
        </section>
        <Chat className="min-h-0 flex-1" />
      </div>
    </div>
  );
}

/** 시안용 초상화 — 실제 로비에서는 p.avatar(디스코드·업로드 이미지)가 들어간다 */
const PORTRAITS = [588, 4568, 5367, 29, 6, 4661, 5212];
function portraitUrl(i: number) {
  return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${PORTRAITS[i % PORTRAITS.length]}.png`;
}

/** 작은 참가자 칸 (G 시안) — 초상화가 칸 위쪽을 가로로 꽉 채운다 */
type ReadyStyle = "a" | "b" | "c";

function SmallTile({
  p,
  i,
  ready = "a",
}: {
  p: P | null;
  i: number;
  ready?: ReadyStyle;
}) {
  if (!p)
    return (
      <div className="flex h-[180px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-bg-elevated/70 text-xs text-text-tertiary">
        <span className="tabular-nums">{i + 1}</span>빈 자리
      </div>
    );
  return (
    <div
      className={cn(
        "flex h-[180px] flex-col overflow-hidden rounded-xl",
        p.ready ? "bg-accent-success/[0.07]" : "bg-bg-tertiary/60",
        // C안: 준비한 카드는 테두리 전체를 초록으로 감싼다 (왼쪽 막대 아님)
        ready === "c" && p.ready && "ring-2 ring-inset ring-accent-success",
      )}
    >
      {/* 초상화: 칸 폭을 다 쓴다. 준비 안 한 사람은 흐리게 */}
      <div className="relative min-h-0 flex-1 bg-bg-elevated">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portraitUrl(i)}
          alt=""
          className={cn(
            "h-full w-full object-cover",
            !p.ready && "opacity-50 grayscale",
          )}
        />
        {/* A안: 초상화 오른쪽 위 작은 표시 */}
        {ready === "a" && (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-black backdrop-blur",
              p.ready
                ? "bg-accent-success/90 text-white"
                : "bg-black/50 text-text-secondary",
            )}
          >
            {p.ready ? "준비" : "대기"}
          </span>
        )}
        {/* C안: 준비하면 초상화 가운데 큰 체크 */}
        {ready === "c" && p.ready && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-success text-white shadow-lg">
              <Check className="h-6 w-6" strokeWidth={3} />
            </span>
          </span>
        )}
      </div>
      {/* 이름·티어·라인 */}
      <div className="flex shrink-0 flex-col items-center gap-1 px-2 py-2">
        <div className="flex max-w-full items-center gap-1">
          {p.host && (
            <Crown className="h-3.5 w-3.5 shrink-0 text-accent-warning" />
          )}
          <span className="truncate text-sm font-black text-text-primary">
            {p.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold",
              p.tierColor,
            )}
          >
            {p.tier}
          </span>
          <span className="text-[11px] text-text-secondary">
            {p.main}
            <span className="text-text-tertiary">/{p.sub}</span>
          </span>
        </div>
      </div>
      {/* B안: 카드 맨 아래를 가로로 꽉 채운 상태 띠 */}
      {ready === "b" && (
        <div
          className={cn(
            "flex h-7 shrink-0 items-center justify-center gap-1 text-xs font-black",
            p.ready
              ? "bg-accent-success text-white"
              : "bg-bg-elevated/60 text-text-tertiary",
          )}
        >
          {p.ready && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          {p.ready ? "준비 완료" : "대기 중"}
        </div>
      )}
    </div>
  );
}

const SPECTATORS = ["구경꾼1", "치지직시청자", "롤알못", "새벽감자"];
/** 운영자 = 선수 대신 진행만 맡은 방장 (실제 로비: 관전으로 빠진 방장) */
const OPERATOR = { name: "하루마룬", icon: 4661 };

function iconUrl(id: number) {
  return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${id}.png`;
}

/** 운영·관전 띠 (G 시안) — 운영자 칸 + 관전자 초상화 목록 + 내 전환 버튼 */
type Me = "player" | "spectator" | "host";

/** 전환 버튼 문구 — 내 자리 기준 (방장은 운영자 ↔ 선수) */
function switchLabel(me: Me, hostIsOperator: boolean, full: boolean) {
  if (me === "host") {
    if (!hostIsOperator) return "운영자로 빠지기";
    return full ? "빈 자리 없음" : "선수로 참여";
  }
  if (me === "spectator") return full ? "빈 자리 없음" : "선수로 참여";
  return "나도 관전하기";
}

function SpectatorStrip({
  hostIsOperator,
  me,
}: {
  hostIsOperator: boolean;
  me: Me;
}) {
  const label = switchLabel(me, hostIsOperator, false);
  return (
    <div className="mx-4 mb-4 mt-3 flex gap-3">
      {/* 운영자: 한 명뿐이라 크게 — 누가 진행하는지 바로 보이게.
          방장이 선수로 뛰면 칸을 숨긴다 (방장은 참가자 카드 왕관으로 보인다) */}
      {hostIsOperator && (
        <div className="flex w-[260px] shrink-0 items-center gap-3 rounded-xl bg-accent-warning/[0.07] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconUrl(OPERATOR.icon)}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] font-black text-accent-warning">
              <Crown className="h-3.5 w-3.5" /> 운영자
            </div>
            <div className="truncate text-base font-black text-text-primary">
              {OPERATOR.name}
            </div>
            <div className="text-[11px] text-text-tertiary">
              선수로 뛰지 않고 진행만 맡아요
            </div>
          </div>
        </div>
      )}

      {/* 관전자: 초상화를 겹치지 않고 이름과 함께 */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 rounded-xl bg-bg-tertiary/30 p-3">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="text-xs font-black text-text-secondary">
            관전 {SPECTATORS.length}명
          </span>
          <span className="text-[11px] text-text-tertiary">
            대진·경매를 보기만 해요
          </span>
          {/* 내 전환 버튼 — 지금 내 자리 기준 (선수면 관전으로, 관전이면 선수로) */}
          <button className="ml-auto flex items-center gap-1.5 rounded-lg bg-bg-tertiary px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-bg-elevated hover:text-text-primary">
            <Eye className="h-3.5 w-3.5" /> {label}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {SPECTATORS.map((n, i) => (
            <span
              key={n}
              className="flex items-center gap-2 rounded-lg bg-bg-tertiary/70 py-1 pl-1 pr-3 text-sm text-text-secondary"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={iconUrl([29, 6, 588, 5212][i % 4])}
                alt=""
                className="h-7 w-7 rounded-md object-cover"
              />
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** G — F 정리: 작은 칸 + 오른쪽 위 방 정보(제목·나가기 포함) + 채팅 */
function G() {
  const q = useSearchParams();
  const ready = (q.get("ready") ?? "b") as ReadyStyle;
  // host=op: 방장이 운영자로 빠짐 / host=player: 방장이 선수로 뜀
  const hostIsOperator = q.get("host") !== "player";
  const me = (q.get("me") ?? "player") as Me;
  // act=top: 참가자 머리줄 / bottom: 참가자 칸 아래 큰 띠 / side: 오른쪽 방 정보 칸
  const act = q.get("act") ?? "side";
  return (
    <div className="container mx-auto flex h-full min-h-0 gap-4 px-6 py-4">
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-bg-tertiary bg-bg-secondary">
        <div className="flex items-center gap-4 border-b border-bg-tertiary px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Users className="h-4 w-4" /> 참가자
          </h2>
          <Status />
          {act === "top" && (
            <div className="ml-auto">
              <Actions />
            </div>
          )}
        </div>
        <div className="grid grid-cols-5 gap-3 p-4">
          {PLAYERS.map((p, i) => (
            <SmallTile
              key={i}
              p={p && { ...p, host: !hostIsOperator && !!p.host }}
              i={i}
              ready={ready}
            />
          ))}
        </div>
        {/* 아래쪽 묶음 — 남는 세로 공간 아래로 붙인다 */}
        <div className="mt-auto">
          {/* 아래 띠 시안: 카드와 관전 칸 사이 빈자리를 행동 버튼이 채운다 */}
          {act === "bottom" && (
            <div className="mx-4 flex items-center gap-4 rounded-xl bg-bg-tertiary/40 px-5 py-4">
              <div>
                <div className="text-lg font-black text-text-primary">
                  4 / 7{" "}
                  <span className="text-sm font-bold text-text-tertiary">
                    준비
                  </span>
                </div>
                <div className="text-xs text-text-tertiary">
                  3명 더 들어오면 시작할 수 있어요
                </div>
              </div>
              <div className="ml-auto">
                <BigActions me={me} />
              </div>
            </div>
          )}
          {/* 운영·관전 — 선수가 아닌 사람을 역할별로 나눠 보여준다 */}
          <SpectatorStrip hostIsOperator={hostIsOperator} me={me} />
        </div>
      </section>
      <div className="flex w-80 shrink-0 flex-col gap-4">
        <section className="rounded-xl border border-bg-tertiary bg-bg-secondary p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-text-primary">
                금요일 밤 5:5 내전
              </h1>
              <span className="font-mono text-xs text-accent-primary">
                #cmwc
              </span>
            </div>
            <span
              className="flex shrink-0 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-400"
              title="방 나가기"
            >
              <LogOut className="h-3.5 w-3.5" /> 나가기
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-bg-tertiary pt-4 text-sm">
            {INFO.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-text-tertiary">{k}</dt>
                <dd className="font-semibold text-text-primary">{v}</dd>
              </div>
            ))}
          </dl>
          {/* 오른쪽 칸 시안: 방 정보 바로 아래 큰 버튼 */}
          {act === "side" && (
            <div className="mt-4 border-t border-bg-tertiary pt-4">
              <SideActions />
            </div>
          )}
          <div className="mt-4">
            <HostBtns />
          </div>
        </section>
        <Chat className="min-h-0 flex-1" />
      </div>
    </div>
  );
}

function Preview() {
  const v = useSearchParams().get("v") ?? "a";
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {v === "b" ? (
        <B />
      ) : v === "c" ? (
        <C />
      ) : v === "d" ? (
        <D />
      ) : v === "e" ? (
        <E />
      ) : v === "f" ? (
        <F />
      ) : v === "g" ? (
        <G />
      ) : (
        <A />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
