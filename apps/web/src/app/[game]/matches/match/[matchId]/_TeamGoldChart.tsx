"use client";

import { useMemo, useState } from "react";

// ─── 팀 골드 차이 그래프 (대회 중계 방식) ─────────────────────
//
// LCK·월즈 중계와 gol.gg 같은 대회 통계 사이트의 표기를 따른다.
//   - 가로축 경기 시간(분), 세로축 두 팀의 골드 차이. 0 선 위 = 위쪽 팀 우세
//   - 면은 "앞선 팀의 색"으로 칠한다 (우세/열세 초록·빨강이 아니다)
//   - 위·아래 끝에 팀 이름
//   - 오브젝트(용·전령·내셔 남작·포탑·억제기)를 가져간 팀 줄에 공식 아이콘으로 찍는다
//   - 숫자는 축약 없이 (+3,250)
//
// 분당 골드는 Riot 타임라인(match-v5 /timeline)에만 있다. 토너먼트 코드로
// 수집된 경기(riotMatchId 있음)만 그릴 수 있다.
//
// 아이콘: 롤 클라이언트 전적 화면 에셋(CommunityDragon rcp-fe-lol-match-history).
// 공허 유충은 회색 한 벌(right_icons_grub.png 스프라이트)뿐이라
// 다른 아이콘과 같은 팀색으로 다시 칠해 horde-{100,200}.png 로 뒀다.

export interface GoldChartTeam {
  name: string;
  color: string;
  /** 이 팀 선수들의 Riot puuid — 타임라인 참가자를 팀으로 나누는 기준 */
  puuids: string[];
  /** 이 팀의 Riot 진영(100/200). puuid 로 못 찾는 참가자의 폴백 */
  riotTeamId: number | null;
}

type ObjectiveType =
  "dragon" | "horde" | "herald" | "baron" | "tower" | "inhibitor";

interface ObjectiveEvent {
  minute: number;
  type: ObjectiveType;
  /** 0 = 위쪽 팀(teams[0]), 1 = 아래쪽 팀 */
  team: 0 | 1;
}

const OBJECTIVE_LABEL: Record<ObjectiveType, string> = {
  dragon: "드래곤",
  horde: "공허 유충",
  herald: "협곡의 전령",
  baron: "내셔 남작",
  tower: "포탑",
  inhibitor: "억제기",
};

/** 아이콘은 팀색 두 벌이 있다. 위쪽 팀(블루색) 100, 아래쪽 팀(레드색) 200 */
const iconSrc = (type: ObjectiveType, team: 0 | 1) =>
  `/icons/objectives/${type}-${team === 0 ? 100 : 200}.png`;

const fmt = (n: number) => Math.abs(Math.round(n)).toLocaleString("ko-KR");

/** 타임라인 → 분당 골드 차이 + 오브젝트 이벤트 */
function buildSeries(timeline: any, teams: [GoldChartTeam, GoldChartTeam]) {
  const frames: any[] = timeline?.info?.frames ?? [];
  if (frames.length < 2) return null;

  // Riot participantId(1~10) → 팀 인덱스
  const puuidTeam = new Map<string, 0 | 1>();
  teams[0].puuids.forEach((p) => puuidTeam.set(p, 0));
  teams[1].puuids.forEach((p) => puuidTeam.set(p, 1));
  const riotSideTeam = (riotTeamId: number): 0 | 1 =>
    teams[0].riotTeamId != null
      ? riotTeamId === teams[0].riotTeamId
        ? 0
        : 1
      : riotTeamId === 100
        ? 0
        : 1;

  const pidTeam = new Map<number, 0 | 1>();
  const metaPuuids: string[] =
    timeline?.metadata?.participants ??
    (timeline?.info?.participants ?? []).map((p: any) => p.puuid);
  metaPuuids.forEach((puuid, index) => {
    const pid = index + 1;
    // puuid 로 못 찾으면 Riot 관례(1~5 블루, 6~10 레드)로 진영을 정한다
    pidTeam.set(
      pid,
      puuidTeam.get(puuid) ?? riotSideTeam(pid <= 5 ? 100 : 200),
    );
  });

  const points = frames.map((frame) => {
    let gold0 = 0;
    let gold1 = 0;
    for (const [pid, pf] of Object.entries<any>(
      frame.participantFrames ?? {},
    )) {
      if (pidTeam.get(Number(pid)) === 0) gold0 += pf.totalGold ?? 0;
      else gold1 += pf.totalGold ?? 0;
    }
    return { minute: frame.timestamp / 60000, diff: gold0 - gold1 };
  });

  const events: ObjectiveEvent[] = [];
  for (const frame of frames) {
    for (const e of frame.events ?? []) {
      const minute = e.timestamp / 60000;
      if (e.type === "ELITE_MONSTER_KILL" && e.killerTeamId) {
        const type: ObjectiveType | null =
          e.monsterType === "DRAGON"
            ? "dragon"
            : e.monsterType === "HORDE"
              ? "horde"
              : e.monsterType === "RIFTHERALD"
                ? "herald"
                  : e.monsterType === "BARON_NASHOR"
                    ? "baron"
                    : null;
        if (type)
          events.push({ minute, type, team: riotSideTeam(e.killerTeamId) });
      } else if (e.type === "BUILDING_KILL" && e.teamId) {
        // BUILDING_KILL 의 teamId 는 "건물을 잃은 팀"이다 → 가져간 팀은 반대
        const type: ObjectiveType =
          e.buildingType === "INHIBITOR_BUILDING" ? "inhibitor" : "tower";
        events.push({
          minute,
          type,
          team: riotSideTeam(e.teamId) === 0 ? 1 : 0,
        });
      }
    }
  }

  return { points, events };
}

export function TeamGoldChart({
  timeline,
  teams,
}: {
  timeline: any;
  /** [위쪽 팀, 아래쪽 팀] */
  teams: [GoldChartTeam, GoldChartTeam];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const series = useMemo(() => buildSeries(timeline, teams), [timeline, teams]);
  if (!series) return null;
  const { points, events } = series;

  // ── 좌표계 ──
  const W = 1000;
  const H = 240;
  const padL = 64;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const midY = padT + cH / 2;
  const maxMin = points[points.length - 1].minute || 1;
  // 위아래 대칭. 1,000 단위로 올려 눈금을 깔끔하게
  const maxAbs = Math.max(
    1000,
    Math.ceil(Math.max(...points.map((p) => Math.abs(p.diff))) / 1000) * 1000,
  );
  const toX = (m: number) => padL + (m / maxMin) * cW;
  const toY = (d: number) => midY - (d / maxAbs) * (cH / 2);

  const line = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${toX(p.minute).toFixed(1)},${toY(p.diff).toFixed(1)}`,
    )
    .join(" ");
  // 선 아래(0 선까지)를 닫은 면. 위/아래 클립으로 팀색을 나눠 칠한다
  const area = `${line} L${toX(maxMin).toFixed(1)},${midY} L${toX(0).toFixed(1)},${midY} Z`;

  const xTicks: number[] = [];
  for (let m = 0; m <= maxMin; m += 5) xTicks.push(m);
  const yTicks = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];

  const hover = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverLeader = hover ? (hover.diff >= 0 ? teams[0] : teams[1]) : null;
  // 호버한 1분 구간에 있었던 오브젝트
  const hoverEvents = hover
    ? events.filter(
        (e) => e.minute > hover.minute - 1 && e.minute <= hover.minute,
      )
    : [];

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5">
      <div className="flex items-center gap-4 mb-3">
        <h3 className="text-sm font-semibold text-text-secondary">골드 차이</h3>
        <div className="ml-auto flex items-center gap-4 text-xs text-text-tertiary">
          {teams.map((team, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: team.color }}
              />
              {team.name} {i === 0 ? "우세 ▲" : "우세 ▼"}
            </span>
          ))}
        </div>
      </div>

      {/* 위쪽 팀 오브젝트 줄 */}
      <ObjectiveRow
        events={events.filter((e) => e.team === 0)}
        toPct={(m) => (toX(m) / W) * 100}
      />

      <div className="relative select-none">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair overflow-visible"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const m =
              ((((e.clientX - rect.left) / rect.width) * W - padL) / cW) *
              maxMin;
            let best = 0;
            points.forEach((p, i) => {
              if (Math.abs(p.minute - m) < Math.abs(points[best].minute - m))
                best = i;
            });
            setHoverIdx(best);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <clipPath id="gold-above">
              <rect x={0} y={0} width={W} height={midY} />
            </clipPath>
            <clipPath id="gold-below">
              <rect x={0} y={midY} width={W} height={H - midY} />
            </clipPath>
          </defs>

          {/* 가로 눈금 */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={padL + cW}
                y1={toY(v)}
                y2={toY(v)}
                stroke="currentColor"
                strokeOpacity={v === 0 ? 0.3 : 0.07}
                strokeDasharray={v === 0 ? undefined : "4 4"}
              />
              <text
                x={padL - 8}
                y={toY(v) + 4}
                textAnchor="end"
                fontSize="12"
                fill={
                  v > 0
                    ? teams[0].color
                    : v < 0
                      ? teams[1].color
                      : "currentColor"
                }
                fillOpacity={v === 0 ? 0.4 : 0.85}
              >
                {v === 0 ? "0" : `+${fmt(v)}`}
              </text>
            </g>
          ))}
          {xTicks.map((m) => (
            <text
              key={m}
              x={toX(m)}
              y={H - 4}
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
              fillOpacity="0.4"
            >
              {m}분
            </text>
          ))}

          {/* 앞선 팀 색으로 면 칠하기 */}
          <path
            d={area}
            fill={teams[0].color}
            fillOpacity="0.3"
            clipPath="url(#gold-above)"
          />
          <path
            d={area}
            fill={teams[1].color}
            fillOpacity="0.3"
            clipPath="url(#gold-below)"
          />
          <path
            d={line}
            fill="none"
            stroke={teams[0].color}
            strokeWidth="2"
            clipPath="url(#gold-above)"
          />
          <path
            d={line}
            fill="none"
            stroke={teams[1].color}
            strokeWidth="2"
            clipPath="url(#gold-below)"
          />

          {hover && (
            <>
              <line
                x1={toX(hover.minute)}
                x2={toX(hover.minute)}
                y1={padT}
                y2={padT + cH}
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeDasharray="3 3"
              />
              <circle
                cx={toX(hover.minute)}
                cy={toY(hover.diff)}
                r={5}
                fill={hoverLeader!.color}
                stroke="white"
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute top-0 z-20"
            style={{
              left: `${Math.max(12, Math.min(88, (toX(hover.minute) / W) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="rounded-lg border border-bg-elevated bg-bg-secondary/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
              <div className="text-text-tertiary">
                {Math.round(hover.minute)}분
              </div>
              {hover.diff === 0 ? (
                <div className="font-bold text-text-primary">동률</div>
              ) : (
                <div
                  className="font-bold"
                  style={{ color: hoverLeader!.color }}
                >
                  {hoverLeader!.name} +{fmt(hover.diff)} 골드
                </div>
              )}
              {hoverEvents.map((e, i) => (
                <div key={i} className="mt-0.5 text-text-secondary">
                  {teams[e.team].name} · {OBJECTIVE_LABEL[e.type]}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 아래쪽 팀 오브젝트 줄 */}
      <ObjectiveRow
        events={events.filter((e) => e.team === 1)}
        toPct={(m) => (toX(m) / W) * 100}
      />
    </div>
  );
}

/** 시간축에 맞춰 오브젝트 아이콘을 찍는 한 줄 */
function ObjectiveRow({
  events,
  toPct,
}: {
  events: ObjectiveEvent[];
  toPct: (minute: number) => number;
}) {
  return (
    <div className="relative h-6">
      {events.map((e, i) => {
        // 포탑·유충은 자주 나와서 작게
        const size = e.type === "tower" || e.type === "horde" ? 14 : 20;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={iconSrc(e.type, e.team)}
            alt={OBJECTIVE_LABEL[e.type]}
            title={`${Math.floor(e.minute)}:${String(Math.round((e.minute % 1) * 60)).padStart(2, "0")} ${OBJECTIVE_LABEL[e.type]}`}
            width={size}
            height={size}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${toPct(e.minute)}%` }}
          />
        );
      })}
    </div>
  );
}
