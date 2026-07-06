"use client";

import { accentOf, statusLabel } from "./scenes";

/**
 * 하단 상태 띠 (lower-third) — 프로 e스포츠(각진) 스타일, 모든 scene 공통.
 * 좌하단에 상주해 "지금 무슨 단계인지"를 항상 보여준다.
 * 두 각진 블록(액센트 태그 + 글래스 본문)을 겹쳐 붙여 중계 그래픽 느낌을 낸다.
 */
export function LowerThird({ snapshot }: { snapshot: any }) {
  if (!snapshot?.room) return null;
  const accent = accentOf(snapshot);
  const room = snapshot.room;
  const theme = snapshot.theme;

  return (
    <div className="absolute bottom-12 left-12 flex h-[70px] select-none items-stretch">
      {/* 액센트 태그 블록 (클랜 엠블럼/태그) */}
      <div
        className="relative flex items-center px-5"
        style={{
          transform: "skewX(-11deg)",
          background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
          boxShadow: `0 12px 34px ${accent}55`,
        }}
      >
        <div style={{ transform: "skewX(11deg)" }}>
          {theme?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logo}
              alt=""
              className="h-11 w-11 object-cover"
              style={{
                clipPath:
                  "polygon(15% 0, 100% 0, 85% 100%, 0 100%)",
              }}
            />
          ) : (
            <span className="text-3xl font-black uppercase tracking-tight text-white">
              {(theme?.clanTag ?? "N").slice(0, 3)}
            </span>
          )}
        </div>
      </div>

      {/* 본문 글래스 패널 */}
      <div
        className="relative -ml-2 flex items-center gap-5 pl-7 pr-8"
        style={{
          transform: "skewX(-11deg)",
          background:
            "linear-gradient(135deg, rgba(12,12,18,0.95), rgba(22,22,32,0.86))",
          borderTop: `2px solid ${accent}`,
        }}
      >
        <div
          className="flex items-center gap-5"
          style={{ transform: "skewX(11deg)" }}
        >
          <div className="flex flex-col">
            <div className="mb-0.5 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-[0.28em] text-red-400">
                LIVE
              </span>
              <span className="text-[11px] font-black uppercase tracking-[0.28em] text-white/45">
                · {statusLabel(room.status)}
              </span>
            </div>
            <span className="text-xl font-black leading-none tracking-tight text-white">
              {room.name}
            </span>
          </div>

          <div className="h-9 w-px bg-white/15" />

          <div className="flex flex-col items-center">
            <span className="text-lg font-black leading-none text-white">
              {room.participantCount}
              <span className="text-white/35">/{room.maxParticipants}</span>
            </span>
            <span className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Players
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
