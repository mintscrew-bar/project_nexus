"use client";

import { accentOf, statusLabel } from "./scenes";

/**
 * 하단 상태 띠 (lower-third) — 모든 scene 공통, Persistent Overlay에 상주.
 * "시청자가 지금 무슨 단계인지" 알게 하는 핵심 장치.
 */
export function LowerThird({ snapshot }: { snapshot: any }) {
  if (!snapshot?.room) return null;
  const accent = accentOf(snapshot);
  const room = snapshot.room;
  const theme = snapshot.theme;

  return (
    <div className="pointer-events-none absolute bottom-10 left-10 flex items-center gap-4">
      <div
        className="flex items-center gap-4 rounded-2xl px-6 py-3.5"
        style={{
          background: "rgba(0,0,0,0.78)",
          borderLeft: `5px solid ${accent}`,
        }}
      >
        {/* 클랜 엠블럼 (있으면) */}
        {theme?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.logo}
            alt=""
            className="h-11 w-11 rounded-lg object-cover"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-lg text-lg font-black text-white"
            style={{ background: accent }}
          >
            {(theme?.clanTag ?? "N").slice(0, 2)}
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-white">
            {room.name}
          </span>
          <span className="text-white/30">·</span>
          <span
            className="rounded-md px-3 py-1 text-lg font-bold"
            style={{ background: `${accent}33`, color: "#fff" }}
          >
            {statusLabel(room.status)}
          </span>
          <span className="text-white/30">·</span>
          <span className="text-xl font-bold text-white/70">
            {room.participantCount}/{room.maxParticipants}
          </span>
        </div>
      </div>
    </div>
  );
}
