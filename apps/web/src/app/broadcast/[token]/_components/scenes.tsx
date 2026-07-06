"use client";

import type { ReactNode } from "react";

/**
 * 방송 오버레이 Scene 컴포넌트들 — 프로 e스포츠(각진) 스타일.
 * 스냅샷(any) 기반 read-only 렌더. 라이브 인게임 스코어는 없음(설계 전제).
 * 공통 언어: 평행사변형 clip-path, 팀컬러 사선 프레임, 대문자 트래킹 라벨, 글래스+글로우.
 */

const DEFAULT_ACCENT = "#8B5CF6";

// 각진 패널 clip-path (평행사변형/사다리꼴)
const CUT = 18;
const clipLeft = `polygon(0 0, 100% 0, calc(100% - ${CUT}px) 100%, 0 100%)`; // 오른쪽 아래 슬랜트
const clipRight = `polygon(${CUT}px 0, 100% 0, 100% 100%, 0 100%)`; // 왼쪽 아래 슬랜트
const clipBanner = `polygon(0 0, 100% 0, calc(100% - ${CUT}px) 100%, ${CUT}px 100%)`; // 양쪽 아래
const clipHex =
  "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const PANEL_BG =
  "linear-gradient(135deg, rgba(12,12,18,0.94), rgba(22,22,32,0.84))";

// RoomStatus → 한글 단계 라벨
const STATUS_LABELS: Record<string, string> = {
  WAITING: "대기 중",
  AUCTION: "경매 중",
  DRAFTING: "드래프트 중",
  DRAFT: "드래프트 중",
  ROLE_SELECTION: "역할 선택",
  ROLE_SELECT: "역할 선택",
  IN_PROGRESS: "경기 중",
  COMPLETED: "종료",
};

export function statusLabel(status?: string): string {
  if (!status) return "진행 중";
  return STATUS_LABELS[status] ?? status;
}

export function accentOf(snapshot: any): string {
  return snapshot?.theme?.accentColor || DEFAULT_ACCENT;
}

// 슬랜트 태그(작은 강조 라벨) — skew로 각지게
function SlantTag({
  children,
  color,
  className = "",
}: {
  children: ReactNode;
  color: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        transform: "skewX(-11deg)",
        background: `linear-gradient(135deg, ${color}, ${color}bb)`,
        boxShadow: `0 10px 30px ${color}44`,
      }}
    >
      <div style={{ transform: "skewX(11deg)" }}>{children}</div>
    </div>
  );
}

// ─── Idle 화면 (활성 방 없음 — 스트리머만 브랜딩) ────────────────
export function IdleScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const theme = snapshot?.theme;
  const title = theme?.clanName || snapshot?.streamer?.name || "NEXUS";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-24 text-center">
      {theme?.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={theme.logo}
          alt=""
          className="mb-10 h-32 w-32 object-cover"
          style={{ clipPath: clipHex, boxShadow: `0 0 60px ${accent}66` }}
        />
      )}
      <SlantTag color={accent} className="mb-6">
        <span className="block px-7 py-2.5 text-2xl font-black uppercase tracking-[0.4em] text-white">
          {title}
        </span>
      </SlantTag>
      <h1 className="text-[68px] font-black leading-[0.95] tracking-tight text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.7)]">
        곧 방송을 시작합니다
      </h1>
      <p className="mt-8 text-2xl font-bold uppercase tracking-[0.35em] text-white/40">
        Standby
      </p>
    </div>
  );
}

// ─── 대기 화면 ────────────────────────────────────────────────
export function WaitingScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const room = snapshot?.room ?? {};
  const count = room.participantCount ?? 0;
  const max = room.maxParticipants ?? 10;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-24 text-center">
      <SlantTag color={accent} className="mb-8">
        <span className="block px-6 py-2 text-xl font-black uppercase tracking-[0.4em] text-white">
          NEXUS 내전
        </span>
      </SlantTag>

      <h1 className="mb-14 max-w-[1500px] text-[84px] font-black leading-[0.92] tracking-tight text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.7)]">
        {room.name ?? "내전 대기 중"}
      </h1>

      {/* 각진 카운트 배너 (컬러 프레임 + 글래스) */}
      <div
        className="relative p-[3px]"
        style={{
          clipPath: clipBanner,
          background: `linear-gradient(135deg, ${accent}, ${accent}22)`,
        }}
      >
        <div
          className="flex items-end gap-6 px-20 py-8"
          style={{ clipPath: clipBanner, background: PANEL_BG }}
        >
          <span className="text-[132px] font-black leading-none text-white">
            {count}
          </span>
          <div className="flex flex-col items-start pb-5">
            <span className="text-[48px] font-black leading-none text-white/35">
              / {max}
            </span>
            <span
              className="mt-3 text-2xl font-black uppercase tracking-[0.3em]"
              style={{ color: accent }}
            >
              모이는 중
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 경매 화면 (스냅샷 기반 요약; 라이브 매물/입찰은 후속) ──────────
export function AuctionScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const teams: any[] = snapshot?.teams ?? [];

  return (
    <div className="flex h-full w-full flex-col px-16 py-14">
      {/* 헤더 */}
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
            className="h-9 w-1.5"
            style={{ background: accent, boxShadow: `0 0 16px ${accent}` }}
          />
          <h1 className="text-5xl font-black uppercase tracking-tight text-white">
            AUCTION
            <span className="ml-3 text-3xl font-bold text-white/40">경매</span>
          </h1>
        </div>
        <SlantTag color={accent}>
          <span className="block px-6 py-2 text-2xl font-black text-white">
            {snapshot?.room?.name ?? ""}
          </span>
        </SlantTag>
      </div>

      {/* 팀 카드 그리드 */}
      <div className="grid flex-1 grid-cols-2 gap-5 xl:grid-cols-4">
        {teams.map((team, i) => {
          const tc = team.color || accent;
          return (
            <div
              key={team.id}
              className="relative p-[2px]"
              style={{
                clipPath: clipLeft,
                background: `linear-gradient(160deg, ${tc}, ${tc}11 65%)`,
              }}
            >
              <div
                className="flex h-full flex-col px-6 py-5"
                style={{ clipPath: clipLeft, background: PANEL_BG }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center text-lg font-black text-black"
                    style={{ clipPath: clipHex, background: tc }}
                  >
                    {i + 1}
                  </span>
                  <p className="truncate text-2xl font-black tracking-tight text-white">
                    {team.name}
                  </p>
                </div>
                <p
                  className="mb-4 text-lg font-black uppercase tracking-wider"
                  style={{ color: tc }}
                >
                  잔여{" "}
                  {team.remainingBudget?.toLocaleString?.() ??
                    team.remainingBudget}
                  P
                </p>
                <div className="flex flex-col gap-1.5 overflow-hidden">
                  {(team.members ?? []).slice(0, 6).map((m: any) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between border-l-2 pl-2.5 text-base text-white/80"
                      style={{ borderColor: `${tc}88` }}
                    >
                      <span className="truncate">{m.username ?? "-"}</span>
                      {m.soldPrice != null && (
                        <span className="ml-2 font-black text-white/50">
                          {m.soldPrice}P
                        </span>
                      )}
                    </div>
                  ))}
                  {(team.members?.length ?? 0) === 0 && (
                    <span className="text-base italic text-white/25">
                      영입 대기
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 경기 중계 상단 오버레이 (팀 정체성 바) ──────────────────────
function TeamPlate({
  team,
  side,
  win,
  lose,
  align,
}: {
  team: any;
  side: "BLUE" | "RED";
  win: boolean;
  lose: boolean;
  align: "left" | "right";
}) {
  const sideColor = side === "BLUE" ? "#3B82F6" : "#EF4444";
  const teamColor = team?.color || sideColor;
  const isLeft = align === "left";
  const clip = isLeft ? clipLeft : clipRight;

  return (
    <div
      className="relative min-w-[460px] transition-all duration-500"
      style={{
        opacity: lose ? 0.4 : 1,
        filter: lose ? "grayscale(0.6)" : "none",
      }}
    >
      {/* WIN 글로우 */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: clip,
          background: teamColor,
          opacity: win ? 0.85 : 0,
          filter: "blur(20px)",
          transition: "opacity .5s",
        }}
      />
      {/* 컬러 프레임 */}
      <div
        className="relative p-[3px]"
        style={{
          clipPath: clip,
          background: `linear-gradient(${isLeft ? "95deg" : "265deg"}, ${teamColor}, ${teamColor}22)`,
        }}
      >
        {/* 본문 */}
        <div
          className={`flex flex-col py-5 ${
            isLeft ? "items-start pl-8 pr-16" : "items-end pl-16 pr-8"
          }`}
          style={{ clipPath: clip, background: PANEL_BG }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-black uppercase tracking-[0.3em]"
              style={{ color: sideColor }}
            >
              {side} SIDE
            </span>
            {win && (
              <span
                className="px-1.5 py-0.5 text-xs font-black text-black"
                style={{ clipPath: clipBanner, background: teamColor }}
              >
                WIN
              </span>
            )}
          </div>
          <span className="mt-1 text-[44px] font-black leading-none text-white">
            {team?.name ?? "미정"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MatchScene({ snapshot }: { snapshot: any }) {
  const match = snapshot?.match;
  if (!match) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-4xl font-black uppercase tracking-widest text-white/30">
          No Live Match
        </p>
      </div>
    );
  }
  const done = match.status === "COMPLETED";
  const blueWin = done && match.winnerId && match.winnerId === match.blue?.id;
  const redWin = done && match.winnerId && match.winnerId === match.red?.id;
  const roundLabel =
    match.bracketRound ||
    (match.round != null ? `${match.round}라운드` : "경기");

  return (
    // 상단 안전영역: 하단은 롤 HUD/미니맵과 충돌하므로 비움
    <div className="flex w-full justify-center pt-9">
      <div className="flex items-stretch">
        <TeamPlate
          team={match.blue}
          side="BLUE"
          win={!!blueWin}
          lose={!!redWin}
          align="left"
        />

        {/* 중앙 VS 헥사곤 */}
        <div className="relative z-10 -mx-5 flex flex-col items-center">
          <div
            className="flex h-[92px] w-[92px] items-center justify-center p-[3px]"
            style={{
              clipPath: clipHex,
              background: `linear-gradient(135deg, ${accentOf(snapshot)}, ${accentOf(
                snapshot,
              )}22)`,
            }}
          >
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ clipPath: clipHex, background: PANEL_BG }}
            >
              <span className="text-3xl font-black italic text-white">VS</span>
            </div>
          </div>
          <div
            className="mt-2 whitespace-nowrap px-4 py-1"
            style={{ clipPath: clipBanner, background: "rgba(0,0,0,0.8)" }}
          >
            <span className="text-xs font-black uppercase tracking-[0.25em] text-white/70">
              {roundLabel}
            </span>
            <span
              className="ml-2 text-xs font-black uppercase tracking-[0.25em]"
              style={{ color: done ? "#9CA3AF" : "#F87171" }}
            >
              {done ? "FINAL" : "● LIVE"}
            </span>
          </div>
        </div>

        <TeamPlate
          team={match.red}
          side="RED"
          win={!!redWin}
          lose={!!blueWin}
          align="right"
        />
      </div>
    </div>
  );
}

// ─── Room Scene 스위치 (방 status 자동 추종) ────────────────────
export function RoomScene({ snapshot }: { snapshot: any }) {
  const status = snapshot?.room?.status;
  if (status === "AUCTION") return <AuctionScene snapshot={snapshot} />;
  // WAITING 및 그 외 단계는 우선 대기 화면으로 폴백 (드래프트/역할선택 세부는 후속)
  return <WaitingScene snapshot={snapshot} />;
}
