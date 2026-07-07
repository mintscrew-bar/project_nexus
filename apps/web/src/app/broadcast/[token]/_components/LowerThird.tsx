"use client";

import { accentOf, statusLabel } from "./scenes";

/**
 * 공통 하단 상태 바.
 * 사선 카드 대신 얇은 방송 ticker 형태로 유지해 모든 씬에서 같은 패키지처럼 보이게 한다.
 */
export function LowerThird({ snapshot }: { snapshot: any }) {
  if (!snapshot?.room) return null;
  const accent = accentOf(snapshot);
  const room = snapshot.room;
  const theme = snapshot.theme;

  return (
    <div className="absolute bottom-12 left-12 right-12 select-none">
      <div className="flex h-[64px] items-center border-y border-white/10 bg-black/62 px-5 text-white backdrop-blur">
        <div className="flex h-full items-center gap-4 pr-5">
          <div
            className="flex h-10 min-w-10 items-center justify-center border-y px-2 text-xl font-black"
            style={{ borderColor: accent }}
          >
            {theme?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logo} alt="" className="h-7 w-7 object-cover" />
            ) : (
              (theme?.clanTag ?? "NX").slice(0, 3)
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-[0.28em] text-red-400">
              LIVE
            </span>
          </div>
        </div>

        <div className="h-8 w-px bg-white/12" />

        <div className="flex min-w-0 flex-1 items-center gap-5 px-5">
          <span className="shrink-0 text-xs font-black uppercase tracking-[0.28em] text-white/38">
            {statusLabel(room.status)}
          </span>
          <span className="min-w-0 truncate text-xl font-black text-white">
            {room.name}
          </span>
        </div>

        <div className="h-8 w-px bg-white/12" />

        <div className="flex items-baseline gap-2 pl-5">
          <span className="text-2xl font-black tabular-nums text-white">
            {room.participantCount}
          </span>
          <span className="text-sm font-black tabular-nums text-white/34">
            / {room.maxParticipants}
          </span>
          <span className="ml-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/36">
            Players
          </span>
        </div>
      </div>
    </div>
  );
}
