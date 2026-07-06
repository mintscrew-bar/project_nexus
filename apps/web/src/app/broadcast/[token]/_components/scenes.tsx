"use client";

/**
 * 방송 오버레이 Scene 컴포넌트들.
 * 스냅샷(any) 기반 read-only 렌더. 라이브 인게임 스코어는 없음(설계 전제).
 */

const DEFAULT_ACCENT = "#667EEA";

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

// ─── 대기 화면 ────────────────────────────────────────────────
export function WaitingScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const room = snapshot?.room ?? {};
  const count = room.participantCount ?? 0;
  const max = room.maxParticipants ?? 10;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-24 text-center">
      <p
        className="mb-6 text-2xl font-black uppercase tracking-[0.3em]"
        style={{ color: accent }}
      >
        NEXUS 내전
      </p>
      <h1 className="mb-10 max-w-[1400px] text-[72px] font-black leading-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
        {room.name ?? "내전 대기 중"}
      </h1>
      <div
        className="flex items-center gap-6 rounded-3xl px-14 py-8"
        style={{ background: `${accent}22`, border: `2px solid ${accent}66` }}
      >
        <span className="text-[120px] font-black leading-none text-white">
          {count}
          <span className="text-[56px] text-white/50"> / {max}</span>
        </span>
        <span className="text-4xl font-bold text-white/80">모이는 중</span>
      </div>
      <p className="mt-10 text-3xl font-semibold text-white/50">
        잠시 후 시작합니다
      </p>
    </div>
  );
}

// ─── 경매 화면 (스냅샷 기반 요약; 라이브 매물/입찰은 후속) ──────────
export function AuctionScene({ snapshot }: { snapshot: any }) {
  const accent = accentOf(snapshot);
  const teams: any[] = snapshot?.teams ?? [];

  return (
    <div className="flex h-full w-full flex-col px-16 py-14">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-5xl font-black text-white">경매 진행 중</h1>
        <span
          className="rounded-full px-6 py-2 text-2xl font-bold"
          style={{ background: `${accent}22`, color: accent }}
        >
          {snapshot?.room?.name ?? ""}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-6 xl:grid-cols-4">
        {teams.map((team) => (
          <div
            key={team.id}
            className="flex flex-col rounded-2xl bg-black/40 p-6 backdrop-blur-sm"
            style={{ borderTop: `4px solid ${team.color || accent}` }}
          >
            <p className="mb-1 truncate text-3xl font-black text-white">
              {team.name}
            </p>
            <p className="mb-4 text-xl font-bold" style={{ color: accent }}>
              잔여 {team.remainingBudget?.toLocaleString?.() ?? team.remainingBudget}P
            </p>
            <div className="flex flex-col gap-2 overflow-hidden">
              {(team.members ?? []).slice(0, 6).map((m: any) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between text-lg text-white/80"
                >
                  <span className="truncate">{m.username ?? "-"}</span>
                  {m.soldPrice != null && (
                    <span className="font-bold text-white/60">
                      {m.soldPrice}P
                    </span>
                  )}
                </div>
              ))}
              {(team.members?.length ?? 0) === 0 && (
                <span className="text-lg text-white/30">영입 대기</span>
              )}
            </div>
          </div>
        ))}
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
}: {
  team: any;
  side: "BLUE" | "RED";
  win: boolean;
  lose: boolean;
}) {
  const sideColor = side === "BLUE" ? "#3B82F6" : "#EF4444";
  const teamColor = team?.color || sideColor;
  return (
    <div
      className={`flex min-w-[420px] flex-col rounded-2xl px-8 py-5 transition-all ${
        lose ? "opacity-50" : "opacity-100"
      }`}
      style={{
        background: "rgba(0,0,0,0.72)",
        borderBottom: `5px solid ${teamColor}`,
        boxShadow: win ? `0 0 0 3px ${teamColor}` : undefined,
      }}
    >
      <span
        className="text-lg font-black uppercase tracking-[0.25em]"
        style={{ color: sideColor }}
      >
        {side} SIDE {win && "· WIN"}
      </span>
      <span className="truncate text-4xl font-black text-white">
        {team?.name ?? "미정"}
      </span>
    </div>
  );
}

export function MatchScene({ snapshot }: { snapshot: any }) {
  const match = snapshot?.match;
  if (!match) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-4xl font-bold text-white/40">중계할 경기가 없습니다</p>
      </div>
    );
  }
  const done = match.status === "COMPLETED";
  const blueWin = done && match.winnerId && match.winnerId === match.blue?.id;
  const redWin = done && match.winnerId && match.winnerId === match.red?.id;
  const roundLabel =
    match.bracketRound || (match.round != null ? `${match.round}라운드` : "경기");

  return (
    // 상단 안전영역: 하단은 롤 HUD/미니맵과 충돌하므로 비움
    <div className="flex w-full justify-center pt-10">
      <div className="flex items-stretch gap-5">
        <TeamPlate team={match.blue} side="BLUE" win={!!blueWin} lose={!!redWin} />
        <div className="flex flex-col items-center justify-center rounded-2xl bg-black/72 px-6 py-3">
          <span className="text-2xl font-black text-white/80">VS</span>
          <span className="mt-1 whitespace-nowrap text-sm font-bold text-white/50">
            {roundLabel} · {statusLabel(match.status)}
          </span>
        </div>
        <TeamPlate team={match.red} side="RED" win={!!redWin} lose={!!blueWin} />
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
