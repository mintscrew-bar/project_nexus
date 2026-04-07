"use client";

import { useState, useMemo } from "react";

// ─── 타임라인 차트 컴포넌트 모음 ───
// MultiLineChart, TimelineGraphs, GoldDiffChart, ObjectEventTimeline

export interface ParticipantSeries {
  participantId: number;
  teamId: number;
  championName: string;
  summonerName: string;
  data: { min: number; value: number }[];
}

export function MultiLineChart({
  series, myParticipantId, myTeamId, label, formatVal,
}: {
  series: ParticipantSeries[];
  myParticipantId: number;
  myTeamId: number;
  label: string;
  formatVal: (v: number) => string;
}) {
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<number>>(new Set());
  if (!series.length || !series[0]?.data.length) return null;

  const togglePlayer = (pid: number) => {
    setHiddenPlayers(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const visibleSeries = series.filter(s => !hiddenPlayers.has(s.participantId));
  const allMins = Array.from(new Set(series.flatMap(s => s.data.map(d => d.min)))).sort((a, b) => a - b);
  const maxMin = allMins[allMins.length - 1] || 1;
  const visibleValues = visibleSeries.flatMap(s => s.data.map(d => d.value));
  const maxVal = Math.max(...(visibleValues.length ? visibleValues : [1]));
  const minVal = Math.min(...(visibleValues.length ? visibleValues : [0]));
  const range = maxVal - minVal || 1;

  const W = 500, H = 180;
  const padL = 44, padR = 8, padT = 10, padB = 24;
  const cW = W - padL - padR, cH = H - padT - padB;
  const toX = (m: number) => padL + (m / maxMin) * cW;
  const toY = (v: number) => padT + cH - ((v - minVal) / range) * cH;

  const xTicks: number[] = [];
  for (let m = 0; m <= maxMin; m += 5) xTicks.push(m);
  const yTicks = [minVal, minVal + range * 0.5, maxVal];

  const mySeries = series.find(s => s.participantId === myParticipantId);
  const myVisible = !hiddenPlayers.has(myParticipantId);
  const findNearest = (s: ParticipantSeries, targetMin: number) =>
    s.data.reduce((prev, curr) =>
      Math.abs(curr.min - targetMin) < Math.abs(prev.min - targetMin) ? curr : prev, s.data[0]);

  const hoverValues = hoverMin !== null
    ? visibleSeries.map(s => ({ ...s, value: findNearest(s, hoverMin)?.value ?? 0 })).sort((a, b) => b.value - a.value)
    : [];

  const tooltipLeft = hoverMin !== null ? Math.max(8, Math.min(68, (toX(hoverMin) / W) * 100)) : 50;
  const myTeamPlayers = series.filter(s => s.teamId === myTeamId);
  const enemyTeamPlayers = series.filter(s => s.teamId !== myTeamId);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        {mySeries && myVisible && (
          <span className="text-xs text-text-tertiary ml-auto">
            최종: {formatVal(mySeries.data[mySeries.data.length - 1]?.value ?? 0)}
          </span>
        )}
      </div>
      <div className="mb-2 space-y-1">
        {([
          { players: myTeamPlayers, label: '아군', labelClr: '#22c55e' },
          { players: enemyTeamPlayers, label: '적군', labelClr: '#ef4444' },
        ] as const).map(({ players, label: teamLabel, labelClr }) => (
          <div key={teamLabel} className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] font-medium w-5 shrink-0" style={{ color: labelClr }}>{teamLabel}</span>
            {players.map((s: ParticipantSeries) => {
              const isMe = s.participantId === myParticipantId;
              const isEnemy = s.teamId !== myTeamId;
              const isHidden = hiddenPlayers.has(s.participantId);
              const clr = isMe ? '#6366f1' : isEnemy ? '#ef4444' : '#22c55e';
              return (
                <button
                  key={s.participantId}
                  onClick={() => togglePlayer(s.participantId)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all ${
                    isHidden
                      ? 'text-text-tertiary opacity-30'
                      : isMe
                      ? 'text-accent-primary bg-accent-primary/10'
                      : 'text-text-secondary hover:bg-bg-elevated/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isHidden ? '#555' : clr, display: 'inline-block' }} />
                  <span className="max-w-[58px] truncate">{s.summonerName}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="relative select-none">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * W;
            const dataMin = ((svgX - padL) / cW) * maxMin;
            const nearest = allMins.reduce((prev, curr) =>
              Math.abs(curr - dataMin) < Math.abs(prev - dataMin) ? curr : prev);
            setHoverMin(nearest);
          }}
          onMouseLeave={() => setHoverMin(null)}
        >
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={padL + cW} y1={toY(t)} y2={toY(t)} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
              <text x={padL - 4} y={toY(t) + 3} textAnchor="end" fontSize="8" fill="currentColor" fillOpacity="0.4">{formatVal(t)}</text>
            </g>
          ))}
          {xTicks.map(m => (
            <text key={m} x={toX(m)} y={H - 4} textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.4">{m}m</text>
          ))}
          {visibleSeries.filter(s => s.teamId !== myTeamId).map(s => {
            const d = s.data.map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.min).toFixed(1)},${toY(pt.value).toFixed(1)}`).join(' ');
            return <path key={s.participantId} d={d} fill="none" stroke="#ef4444" strokeWidth="1" strokeOpacity={hoverMin !== null ? 0.5 : 0.3} />;
          })}
          {visibleSeries.filter(s => s.teamId === myTeamId && s.participantId !== myParticipantId).map(s => {
            const d = s.data.map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.min).toFixed(1)},${toY(pt.value).toFixed(1)}`).join(' ');
            return <path key={s.participantId} d={d} fill="none" stroke="#22c55e" strokeWidth="1" strokeOpacity={hoverMin !== null ? 0.6 : 0.4} />;
          })}
          {mySeries && myVisible && (() => {
            const pts = mySeries.data;
            const pathD = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.min).toFixed(1)},${toY(pt.value).toFixed(1)}`).join(' ');
            const areaD = `${pathD} L${toX(pts[pts.length - 1].min).toFixed(1)},${(padT + cH).toFixed(1)} L${toX(pts[0].min).toFixed(1)},${(padT + cH).toFixed(1)} Z`;
            return (<><path d={areaD} fill="#6366f1" fillOpacity="0.07" /><path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" /></>);
          })()}
          {hoverMin !== null && (<>
            <line x1={toX(hoverMin)} x2={toX(hoverMin)} y1={padT} y2={padT + cH}
              stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3,2" />
            {visibleSeries.map(s => {
              const pt = findNearest(s, hoverMin);
              if (!pt) return null;
              const isMe = s.participantId === myParticipantId;
              const clr = isMe ? '#6366f1' : s.teamId === myTeamId ? '#22c55e' : '#ef4444';
              return <circle key={s.participantId} cx={toX(pt.min)} cy={toY(pt.value)} r={isMe ? 4 : 2.5}
                fill={clr} fillOpacity={isMe ? 1 : 0.8} stroke="white" strokeWidth={isMe ? 1.5 : 0.5} strokeOpacity="0.4" />;
            })}
          </>)}
        </svg>
        {hoverMin !== null && hoverValues.length > 0 && (
          <div className="absolute top-0 z-20 pointer-events-none" style={{ left: `${tooltipLeft}%`, transform: 'translateX(-50%)' }}>
            <div className="bg-bg-secondary/95 backdrop-blur-sm border border-bg-elevated rounded-lg shadow-xl p-2 text-[11px] min-w-[130px]">
              <div className="text-text-tertiary font-medium mb-1.5 border-b border-bg-tertiary pb-1">{hoverMin}분</div>
              <div className="space-y-0.5">
                {hoverValues.map((v, rank) => {
                  const isMe = v.participantId === myParticipantId;
                  const clr = isMe ? '#6366f1' : v.teamId === myTeamId ? '#22c55e' : '#ef4444';
                  return (
                    <div key={v.participantId} className={`flex items-center gap-1.5 ${isMe ? 'font-bold' : ''}`}>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: clr }} />
                      <span className={`truncate w-[70px] ${isMe ? 'text-accent-primary' : 'text-text-secondary'}`}>
                        {rank === 0 && <span className="text-[9px] text-accent-gold mr-0.5">①</span>}
                        {v.summonerName}
                      </span>
                      <span className="ml-auto text-text-primary shrink-0 font-medium">{formatVal(v.value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimelineGraphs({
  tl, match, participant,
}: {
  tl: any;
  match: any;
  participant: any;
}) {
  const [activeTab, setActiveTab] = useState<'gold' | 'cs' | 'xp' | 'damage'>('gold');

  // tl.info.frames가 바뀌지 않는 한 재계산하지 않음
  const frames: any[] = tl?.info?.frames ?? [];
  const buildSeries = useMemo(() => {
    if (!frames.length) return { gold: [], cs: [], xp: [], damage: [] };
    const make = (getVal: (f: any) => number): ParticipantSeries[] => {
      const map = new Map<number, ParticipantSeries>();
      for (const p of match.info.participants) {
        map.set(p.participantId, {
          participantId: p.participantId,
          teamId: p.teamId,
          championName: p.championName,
          summonerName: p.riotIdGameName || p.summonerName || p.championName,
          data: [],
        });
      }
      for (const frame of frames) {
        const min = Math.round(frame.timestamp / 60000);
        for (const [pid, s] of map) {
          const pf = frame.participantFrames?.[String(pid)];
          if (pf) s.data.push({ min, value: getVal(pf) });
        }
      }
      return Array.from(map.values());
    };
    return {
      gold:   make(f => f.totalGold),
      cs:     make(f => f.minionsKilled + (f.jungleMinionsKilled || 0)),
      xp:     make(f => f.xp),
      damage: make(f => f.damageStats?.totalDamageDoneToChampions ?? 0),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames]);

  if (!frames.length) return null;

  const tabs = [
    { key: 'gold'   as const, label: '골드',   series: buildSeries.gold,   formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
    { key: 'cs'     as const, label: 'CS',     series: buildSeries.cs,     formatVal: (v: number) => String(Math.round(v)) },
    { key: 'xp'     as const, label: '경험치', series: buildSeries.xp,     formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
    { key: 'damage' as const, label: '피해량', series: buildSeries.damage, formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
  ];

  const active = tabs.find(t => t.key === activeTab)!;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-text-primary">타임라인 그래프</h3>
        <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-0.5">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-accent-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-bg-tertiary/30 rounded-lg p-3">
        <MultiLineChart
          series={active.series}
          myParticipantId={participant.participantId}
          myTeamId={participant.teamId}
          label={active.label}
          formatVal={active.formatVal}
        />
      </div>
    </div>
  );
}

export function GoldDiffChart({ tl, participant, match }: { tl: any; participant: any; match: any }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!tl?.info?.frames) return null;

  const myTeamId = participant.teamId;
  const frames = tl.info.frames;

  // participantId → teamId 매핑 (match 데이터 기반)
  const pidTeamMap = new Map<number, number>();
  for (const p of (match?.info?.participants || [])) {
    pidTeamMap.set(p.participantId, p.teamId);
  }

  const diffs: { min: number; diff: number }[] = [];
  for (const frame of frames) {
    const min = Math.round(frame.timestamp / 60000);
    let allyGold = 0, enemyGold = 0;
    for (const [pid, pf] of Object.entries(frame.participantFrames || {})) {
      const p = pf as any;
      const pTeamId = pidTeamMap.get(Number(pid)) ?? (Number(pid) <= 5 ? 100 : 200);
      if (pTeamId === myTeamId) allyGold += p.totalGold || 0;
      else enemyGold += p.totalGold || 0;
    }
    diffs.push({ min, diff: allyGold - enemyGold });
  }

  if (diffs.length < 2) return null;

  const maxMin = diffs[diffs.length - 1].min || 1;
  const maxAbsDiff = Math.max(...diffs.map(d => Math.abs(d.diff)), 500);
  const W = 500, H = 120;
  const padL = 44, padR = 8, padT = 8, padB = 20;
  const cW = W - padL - padR, cH = H - padT - padB;
  const midY = padT + cH / 2;
  const toX = (m: number) => padL + (m / maxMin) * cW;
  const toY = (d: number) => midY - (d / maxAbsDiff) * (cH / 2);

  const points = diffs.map(d => ({ x: toX(d.min), y: toY(d.diff) }));
  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // 우세 구간 (midY 위)
  const posAreaD = points.map((p, i) => {
    const clampY = Math.min(p.y, midY);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${clampY.toFixed(1)}`;
  }).join(' ') + ` L${points[points.length - 1].x.toFixed(1)},${midY.toFixed(1)} L${points[0].x.toFixed(1)},${midY.toFixed(1)} Z`;

  // 열세 구간 (midY 아래)
  const negAreaD = points.map((p, i) => {
    const clampY = Math.max(p.y, midY);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${clampY.toFixed(1)}`;
  }).join(' ') + ` L${points[points.length - 1].x.toFixed(1)},${midY.toFixed(1)} L${points[0].x.toFixed(1)},${midY.toFixed(1)} Z`;

  const xTicks: number[] = [];
  for (let m = 0; m <= maxMin; m += 5) xTicks.push(m);

  const hoverDiff = hoverIdx !== null ? diffs[hoverIdx] : null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-text-secondary">팀 골드 차이</span>
        <span className="text-[10px] text-text-tertiary ml-auto">
          <span className="text-accent-success">위</span>=우세 / <span className="text-accent-danger">아래</span>=열세
        </span>
      </div>
      <div className="relative bg-bg-tertiary/30 rounded-lg p-3 select-none">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * W;
            const dataMin = ((svgX - padL) / cW) * maxMin;
            let closest = 0;
            let minDist = Infinity;
            diffs.forEach((d, i) => {
              const dist = Math.abs(d.min - dataMin);
              if (dist < minDist) { minDist = dist; closest = i; }
            });
            setHoverIdx(closest);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <line x1={padL} x2={padL + cW} y1={midY} y2={midY} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
          <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="7" fill="#22c55e" fillOpacity="0.6">+{(maxAbsDiff / 1000).toFixed(1)}k</text>
          <text x={padL - 4} y={midY + 3} textAnchor="end" fontSize="7" fill="currentColor" fillOpacity="0.4">0</text>
          <text x={padL - 4} y={padT + cH + 4} textAnchor="end" fontSize="7" fill="#ef4444" fillOpacity="0.6">-{(maxAbsDiff / 1000).toFixed(1)}k</text>
          {xTicks.map(m => (
            <text key={m} x={toX(m)} y={H - 2} textAnchor="middle" fontSize="7" fill="currentColor" fillOpacity="0.4">{m}m</text>
          ))}
          <path d={posAreaD} fill="#22c55e" fillOpacity="0.12" />
          <path d={negAreaD} fill="#ef4444" fillOpacity="0.12" />
          <path d={lineD} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
          {hoverIdx !== null && hoverDiff && (
            <>
              <line x1={toX(hoverDiff.min)} x2={toX(hoverDiff.min)} y1={padT} y2={padT + cH}
                stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3,2" />
              <circle cx={toX(hoverDiff.min)} cy={toY(hoverDiff.diff)} r={4}
                fill={hoverDiff.diff >= 0 ? '#22c55e' : '#ef4444'} stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
            </>
          )}
        </svg>
        {hoverIdx !== null && hoverDiff && (
          <div className="absolute top-1 z-20 pointer-events-none"
            style={{ left: `${Math.max(10, Math.min(85, (toX(hoverDiff.min) / W) * 100))}%`, transform: 'translateX(-50%)' }}
          >
            <div className="bg-bg-secondary/95 backdrop-blur-sm border border-bg-elevated rounded-lg shadow-xl px-2.5 py-1.5 text-[10px]">
              <div className="text-text-tertiary">{hoverDiff.min}분</div>
              <div className={`font-bold ${hoverDiff.diff >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                {hoverDiff.diff >= 0 ? '+' : ''}{(hoverDiff.diff / 1000).toFixed(1)}k 골드
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ObjectEventTimeline({ tl, participant }: { tl: any; participant: any; match?: any }) {
  const [hoverEvent, setHoverEvent] = useState<number | null>(null);

  if (!tl?.info?.frames) return null;

  const myTeamId = participant.teamId;
  const frames = tl.info.frames;
  const lastFrame = frames[frames.length - 1];
  const maxMs = lastFrame?.timestamp || 1;
  const maxMin = Math.round(maxMs / 60000);

  interface ObjectEvent {
    min: number;
    timestamp: number;
    type: 'dragon' | 'baron' | 'herald' | 'tower';
    isAlly: boolean;
    detail: string;
  }

  const events: ObjectEvent[] = [];

  for (const frame of frames) {
    for (const ev of (frame.events || [])) {
      if (ev.type === 'ELITE_MONSTER_KILL') {
        const isAlly = ev.killerTeamId === myTeamId;
        let etype: ObjectEvent['type'] = 'dragon';
        let detail = '';
        if (ev.monsterType === 'BARON_NASHOR') {
          etype = 'baron'; detail = '바론';
        } else if (ev.monsterType === 'RIFTHERALD') {
          etype = 'herald'; detail = '전령';
        } else {
          etype = 'dragon';
          if (ev.monsterSubType) {
            const dragonMap: Record<string, string> = {
              FIRE: '불', INFERNAL: '불', WATER: '바다', OCEAN: '바다',
              EARTH: '산', MOUNTAIN: '산', AIR: '바람', CLOUD: '바람',
              CHEMTECH: '화학', HEXTECH: '헥스텍', ELDER: '장로',
            };
            const key = ev.monsterSubType.replace('_DRAGON', '');
            detail = dragonMap[key] || key;
          } else {
            detail = '드래곤';
          }
        }
        events.push({ min: Math.round(ev.timestamp / 60000), timestamp: ev.timestamp, type: etype, isAlly, detail });
      } else if (ev.type === 'BUILDING_KILL' && ev.buildingType === 'TOWER_BUILDING') {
        const isAlly = ev.teamId !== myTeamId;
        const detail = ev.laneType === 'MID_LANE' ? '미드 타워'
          : ev.laneType === 'TOP_LANE' ? '탑 타워'
          : ev.laneType === 'BOT_LANE' ? '봇 타워' : '타워';
        events.push({ min: Math.round(ev.timestamp / 60000), timestamp: ev.timestamp, type: 'tower', isAlly, detail });
      }
    }
  }

  if (events.length === 0) return null;

  const W = 500, H = 60;
  const padL = 44, padR = 8;
  const midY = H / 2;
  const toX = (min: number) => padL + (min / maxMin) * (W - padL - padR);
  const colorMap = { dragon: '#a78bfa', baron: '#c084fc', herald: '#f59e0b', tower: '#9ca3af' };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-text-secondary">오브젝트 타임라인</span>
        <div className="flex items-center gap-3 ml-auto text-[9px] text-text-tertiary">
          {([['dragon', '드래곤', '#a78bfa'], ['baron', '바론', '#c084fc'], ['herald', '전령', '#f59e0b'], ['tower', '타워', '#9ca3af']] as const).map(([key, label, clr]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: clr }} />{label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative bg-bg-tertiary/30 rounded-lg p-2 select-none">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
          <line x1={padL} x2={W - padR} y1={midY} y2={midY} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
          <text x={padL - 4} y={midY - 8} textAnchor="end" fontSize="7" fill="#22c55e" fillOpacity="0.5">아군</text>
          <text x={padL - 4} y={midY + 13} textAnchor="end" fontSize="7" fill="#ef4444" fillOpacity="0.5">적군</text>
          {events.map((ev, i) => {
            const x = toX(ev.min);
            const y = ev.isAlly ? midY - 12 : midY + 12;
            const clr = colorMap[ev.type];
            return (
              <g key={i}
                onMouseEnter={() => setHoverEvent(i)}
                onMouseLeave={() => setHoverEvent(null)}
                className="cursor-pointer"
              >
                <circle cx={x} cy={y} r={hoverEvent === i ? 6 : 4.5} fill={clr} fillOpacity={hoverEvent === i ? 1 : 0.7}
                  stroke={ev.isAlly ? '#22c55e' : '#ef4444'} strokeWidth="1" strokeOpacity="0.4" />
                <text x={x} y={y + 1} textAnchor="middle" fontSize="5" fill="white" fontWeight="bold" className="pointer-events-none">
                  {ev.type === 'dragon' ? 'D' : ev.type === 'baron' ? 'B' : ev.type === 'herald' ? 'H' : 'T'}
                </text>
              </g>
            );
          })}
        </svg>
        {hoverEvent !== null && events[hoverEvent] && (
          <div className="absolute top-0 z-20 pointer-events-none"
            style={{ left: `${Math.max(10, Math.min(85, (toX(events[hoverEvent].min) / W) * 100))}%`, transform: 'translateX(-50%)' }}
          >
            <div className="bg-bg-secondary/95 backdrop-blur-sm border border-bg-elevated rounded-lg shadow-xl px-2.5 py-1.5 text-[10px]">
              <div className="text-text-tertiary">{events[hoverEvent].min}분</div>
              <div className="font-medium text-text-primary">{events[hoverEvent].detail}</div>
              <div className={events[hoverEvent].isAlly ? 'text-accent-success' : 'text-accent-danger'}>
                {events[hoverEvent].isAlly ? '아군 처치' : '적군 처치'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
