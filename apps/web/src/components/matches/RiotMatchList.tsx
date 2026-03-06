"use client";

import { useState, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api-client";
import {
  QUEUE_TABS,
  getChampionIcon,
  getQueueTypeName,
  getSummonerSpellName,
  calculateTimeAgo,
  getItemIcon,
} from "./match-utils";
import Image from "next/image";
import {
  Loader2,
  Gamepad2,
  Target,
  ChevronDown,
  ChevronUp,
  Shield,
  Crosshair,
} from "lucide-react";
import { Button } from "@/components/ui";

// ─── Internal chart components (moved from summoner page) ───

interface ParticipantSeries {
  participantId: number;
  teamId: number;
  championName: string;
  summonerName: string;
  data: { min: number; value: number }[];
}

function MultiLineChart({
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

function TimelineGraphs({
  tl, match, participant,
}: {
  tl: any;
  match: any;
  participant: any;
}) {
  const [activeTab, setActiveTab] = useState<'gold' | 'cs' | 'xp' | 'damage'>('gold');

  if (!tl?.info?.frames) return null;

  const buildSeries = (getVal: (f: any) => number): ParticipantSeries[] => {
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
    for (const frame of tl.info.frames) {
      const min = Math.round(frame.timestamp / 60000);
      for (const [pid, s] of map) {
        const pf = frame.participantFrames?.[String(pid)];
        if (pf) s.data.push({ min, value: getVal(pf) });
      }
    }
    return Array.from(map.values());
  };

  const tabs = [
    { key: 'gold' as const, label: '골드', series: buildSeries(f => f.totalGold), formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
    { key: 'cs' as const, label: 'CS', series: buildSeries(f => f.minionsKilled + (f.jungleMinionsKilled || 0)), formatVal: (v: number) => String(Math.round(v)) },
    { key: 'xp' as const, label: '경험치', series: buildSeries(f => f.xp), formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
    { key: 'damage' as const, label: '피해량', series: buildSeries(f => f.damageStats?.totalDamageDoneToChampions ?? 0), formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
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

function GoldDiffChart({ tl, participant, match }: { tl: any; participant: any; match: any }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!tl?.info?.frames) return null;

  const myTeamId = participant.teamId;
  const frames = tl.info.frames;

  // Build participantId → teamId lookup from match data
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

  // Build area paths split by positive/negative
  const points = diffs.map(d => ({ x: toX(d.min), y: toY(d.diff) }));

  // Full line path
  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Positive area (above midY = gold advantage)
  const posAreaD = points.map((p, i) => {
    const clampY = Math.min(p.y, midY);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${clampY.toFixed(1)}`;
  }).join(' ') + ` L${points[points.length - 1].x.toFixed(1)},${midY.toFixed(1)} L${points[0].x.toFixed(1)},${midY.toFixed(1)} Z`;

  // Negative area (below midY = gold disadvantage)
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
          {/* Zero line */}
          <line x1={padL} x2={padL + cW} y1={midY} y2={midY} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
          {/* Y labels */}
          <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="7" fill="#22c55e" fillOpacity="0.6">+{(maxAbsDiff / 1000).toFixed(1)}k</text>
          <text x={padL - 4} y={midY + 3} textAnchor="end" fontSize="7" fill="currentColor" fillOpacity="0.4">0</text>
          <text x={padL - 4} y={padT + cH + 4} textAnchor="end" fontSize="7" fill="#ef4444" fillOpacity="0.6">-{(maxAbsDiff / 1000).toFixed(1)}k</text>
          {/* X labels */}
          {xTicks.map(m => (
            <text key={m} x={toX(m)} y={H - 2} textAnchor="middle" fontSize="7" fill="currentColor" fillOpacity="0.4">{m}m</text>
          ))}
          {/* Areas */}
          <path d={posAreaD} fill="#22c55e" fillOpacity="0.12" />
          <path d={negAreaD} fill="#ef4444" fillOpacity="0.12" />
          {/* Line */}
          <path d={lineD} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Hover */}
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

function ObjectEventTimeline({ tl, participant, match }: { tl: any; participant: any; match: any }) {
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
        const killerTeamId = ev.killerTeamId;
        const isAlly = killerTeamId === myTeamId;
        let etype: ObjectEvent['type'] = 'dragon';
        let detail = '';
        if (ev.monsterType === 'BARON_NASHOR') {
          etype = 'baron';
          detail = '바론';
        } else if (ev.monsterType === 'RIFTHERALD') {
          etype = 'herald';
          detail = '전령';
        } else {
          etype = 'dragon';
          if (ev.monsterSubType) {
            const dragonMap: Record<string, string> = {
              FIRE: '불', INFERNAL: '불',
              WATER: '바다', OCEAN: '바다',
              EARTH: '산', MOUNTAIN: '산',
              AIR: '바람', CLOUD: '바람',
              CHEMTECH: '화학', HEXTECH: '헥스텍', ELDER: '장로',
            };
            const key = ev.monsterSubType.replace('_DRAGON', '');
            detail = dragonMap[key] || key;
          } else {
            detail = '드래곤';
          }
        }
        events.push({
          min: Math.round(ev.timestamp / 60000),
          timestamp: ev.timestamp,
          type: etype,
          isAlly,
          detail,
        });
      } else if (ev.type === 'BUILDING_KILL' && ev.buildingType === 'TOWER_BUILDING') {
        const isAlly = ev.teamId !== myTeamId; // teamId = team that lost the tower
        events.push({
          min: Math.round(ev.timestamp / 60000),
          timestamp: ev.timestamp,
          type: 'tower',
          isAlly,
          detail: ev.laneType === 'MID_LANE' ? '미드 타워' : ev.laneType === 'TOP_LANE' ? '탑 타워' : ev.laneType === 'BOT_LANE' ? '봇 타워' : '타워',
        });
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
          {/* Center line */}
          <line x1={padL} x2={W - padR} y1={midY} y2={midY} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
          {/* Ally / Enemy labels */}
          <text x={padL - 4} y={midY - 8} textAnchor="end" fontSize="7" fill="#22c55e" fillOpacity="0.5">아군</text>
          <text x={padL - 4} y={midY + 13} textAnchor="end" fontSize="7" fill="#ef4444" fillOpacity="0.5">적군</text>
          {/* Events */}
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

// ─── Main Component ──────────────────────────────────

interface RiotMatchListProps {
  gameName: string;
  tagLine: string;
  puuid: string;
  navigateToSummoner: (gameName: string, tagLine: string) => void;
}

const RIOT_MATCH_COUNT = 10;
const ddVer = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";

export default function RiotMatchList({
  gameName,
  tagLine,
  puuid,
  navigateToSummoner,
}: RiotMatchListProps) {
  const [selectedQueueId, setSelectedQueueId] = useState<number | undefined>(undefined);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const mountedMatchesRef = useRef(new Set<string>());
  const [matchDetailTabs, setMatchDetailTabs] = useState<Map<string, 'teams' | 'build' | 'stats' | 'timeline'>>(new Map());
  const [timelineData, setTimelineData] = useState<Map<string, any>>(new Map());
  const [timelineLoading, setTimelineLoading] = useState<Set<string>>(new Set());

  const {
    data: riotMatchPages,
    isLoading: isLoadingRiotMatches,
    isError: isRiotMatchError,
    refetch: refetchRiotMatches,
    isFetchingNextPage: isLoadingMoreRiotMatches,
    fetchNextPage: loadMoreRiotMatches,
    hasNextPage: hasMoreRiotMatches,
  } = useInfiniteQuery({
    queryKey: ["riotMatches", gameName, tagLine, selectedQueueId],
    queryFn: ({ pageParam = 0 }) =>
      statsApi.getSummonerRiotMatches(gameName, tagLine, RIOT_MATCH_COUNT, selectedQueueId, pageParam),
    getNextPageParam: (lastPage: any[], _allPages: any[][], lastPageParam: number) => {
      if (lastPage.length === 0) return undefined;
      return lastPageParam + RIOT_MATCH_COUNT;
    },
    initialPageParam: 0,
    staleTime: 3 * 60 * 1000,
    retry: false,
    enabled: !!gameName && !!tagLine,
  });

  const riotMatches = riotMatchPages?.pages.flat() ?? [];

  const toggleMatchExpand = (matchId: string) => {
    if (!expandedMatches.has(matchId)) {
      mountedMatchesRef.current.add(matchId);
    }
    setExpandedMatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(matchId)) newSet.delete(matchId);
      else newSet.add(matchId);
      return newSet;
    });
  };

  const loadTimeline = async (matchId: string) => {
    if (timelineData.has(matchId) || timelineLoading.has(matchId)) return;
    setTimelineLoading(prev => new Set(prev).add(matchId));
    try {
      const data = await statsApi.getMatchTimeline(matchId);
      setTimelineData(prev => new Map(prev).set(matchId, data));
    } catch (err) {
      console.error("Failed to load timeline:", err);
    } finally {
      setTimelineLoading(prev => { const s = new Set(prev); s.delete(matchId); return s; });
    }
  };

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-3 sm:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-sm sm:text-xl font-bold text-text-primary flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 sm:h-5 sm:w-5 text-accent-primary" />
          Riot 게임 전적
        </h2>
      </div>

      {/* Queue Type Tabs */}
      <div className="flex gap-0.5 sm:gap-1 bg-bg-tertiary/50 rounded-lg p-0.5 sm:p-1 mb-3 sm:mb-4 overflow-x-auto">
        {QUEUE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedQueueId(tab.queueId)}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${
              selectedQueueId === tab.queueId
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Match List */}
      {isLoadingRiotMatches ? (
        <div className="text-center py-16">
          <Loader2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 animate-spin" />
          <p className="text-text-secondary">Riot 전적을 불러오는 중...</p>
        </div>
      ) : isRiotMatchError ? (
        <div className="text-center py-16">
          <Gamepad2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">전적 불러오기 실패</h3>
          <p className="text-text-secondary mb-4">Riot 전적을 불러올 수 없습니다</p>
          <Button onClick={() => refetchRiotMatches()}>다시 시도</Button>
        </div>
      ) : riotMatches.length === 0 ? (
        <div className="text-center py-16">
          <Target className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">최근 전적이 없습니다</h3>
          <p className="text-text-secondary">최근 플레이한 게임이 없습니다</p>
        </div>
      ) : (
        <div className="divide-y divide-bg-tertiary/30">
          {riotMatches.map((match) => {
            const participant = match.info.participants.find(
              (p: any) => p.puuid === puuid
            );
            if (!participant) return null;

            const matchId = match.metadata.matchId;
            const isExpanded = expandedMatches.has(matchId);

            const kda = participant.deaths === 0
              ? "Perfect"
              : ((participant.kills + participant.assists) / participant.deaths).toFixed(2);

            const duration = match.info.gameDuration || 1;
            const gameDurationMin = Math.floor(duration / 60);
            const gameDurationSec = duration % 60;
            const csPerMin = ((participant.totalMinionsKilled + participant.neutralMinionsKilled) / (duration / 60)).toFixed(1);

            const timeAgo = calculateTimeAgo(match.info.gameEndTimestamp);

            const team = match.info.teams.find((t: any) => t.teamId === participant.teamId);
            const teamKills = team?.objectives?.champion?.kills || 1;
            const killParticipation = ((participant.kills + participant.assists) / teamKills * 100).toFixed(0);

            const myTeam = match.info.participants.filter((p: any) => p.teamId === participant.teamId);
            const enemyTeam = match.info.participants.filter((p: any) => p.teamId !== participant.teamId);
            const myTeamWon = participant.win;

            const getCarryScore = (p: any) => p.kills * 3 + p.assists + (p.totalDamageDealtToChampions / 1000);
            const winningTeam = myTeamWon ? myTeam : enemyTeam;
            const losingTeam = myTeamWon ? enemyTeam : myTeam;
            const mvpPuuid = [...winningTeam].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0]?.puuid ?? null;
            const acePuuid = [...losingTeam].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0]?.puuid ?? null;

            return (
              <div
                key={matchId}
                className={`overflow-hidden transition-all ${isExpanded ? 'bg-bg-secondary/60' : participant.win ? 'bg-accent-success/[0.06]' : 'bg-accent-danger/[0.06]'}`}
              >
                {/* Match Header */}
                <div
                  className="px-3 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-4 cursor-pointer hover:bg-bg-tertiary/30 transition-colors"
                  onClick={() => toggleMatchExpand(matchId)}
                >
                  <div className="flex items-center gap-2 sm:gap-4">
                    <Image
                      src={getChampionIcon(participant.championName)}
                      alt={participant.championName}
                      width={48}
                      height={48}
                      className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />

                    <div className="min-w-0 flex-shrink-0">
                      <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5">
                        <span className={`font-bold text-xs sm:text-sm ${participant.win ? "text-accent-success" : "text-accent-danger"}`}>
                          {participant.win ? "승리" : "패배"}
                        </span>
                        <span className="text-[10px] sm:text-xs text-text-secondary truncate hidden sm:inline">{getQueueTypeName(match.info.queueId)}</span>
                      </div>
                      <div className="text-[10px] sm:text-xs text-text-tertiary">{gameDurationMin}:{gameDurationSec.toString().padStart(2, '0')} · {timeAgo}</div>
                      <div className="text-[10px] sm:text-xs text-text-tertiary truncate">{participant.championName}</div>
                    </div>

                    <div className="text-center flex-shrink-0">
                      <div className="text-xs sm:text-sm font-bold text-text-primary">
                        {participant.kills}/<span className="text-accent-danger">{participant.deaths}</span>/{participant.assists}
                      </div>
                      <div className="text-[10px] sm:text-xs text-text-secondary">{kda} KDA</div>
                    </div>

                    {/* CS/킬관여 — 모바일 숨김 */}
                    <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                      <div className="text-center">
                        <div className="text-sm font-medium text-text-primary">{participant.totalMinionsKilled + participant.neutralMinionsKilled}</div>
                        <div className="text-xs text-text-tertiary">CS</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium text-text-primary">{killParticipation}%</div>
                        <div className="text-xs text-text-tertiary">킬관여</div>
                      </div>
                    </div>

                    {/* 아이템 — 모바일에서 축소 표시 */}
                    <div className="hidden sm:flex gap-1 flex-shrink-0 items-center">
                      {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].map((item: number, idx: number) => (
                        <div key={idx} className="w-6 h-6 lg:w-8 lg:h-8 rounded-md bg-bg-tertiary border border-bg-elevated">
                          {item !== 0 && (
                            <Image
                              src={getItemIcon(item)}
                              alt="item"
                              width={32}
                              height={32}
                              className="w-full h-full rounded-md"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                        </div>
                      ))}
                      <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-bg-tertiary border border-bg-elevated">
                        {participant.item6 !== 0 && (
                          <Image
                            src={getItemIcon(participant.item6)}
                            alt="trinket"
                            width={32}
                            height={32}
                            className="w-full h-full rounded-full"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                      </div>
                      {participant.item7 != null && participant.item7 !== 0 && (
                        <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-md bg-bg-tertiary border border-amber-500/40">
                          <Image
                            src={getItemIcon(participant.item7)}
                            alt="quest"
                            width={32}
                            height={32}
                            className="w-full h-full rounded-md"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex-1" />

                    {/* 참가자 목록 — 모바일 숨김 */}
                    <div className="hidden lg:flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col justify-center gap-0.5 w-24">
                        {myTeam.map((p: any) => {
                          const isMvp = p.puuid === mvpPuuid;
                          const isAce = p.puuid === acePuuid;
                          const isMe = p.puuid === puuid;
                          const name = p.riotIdGameName || p.summonerName || p.championName;
                          return (
                            <div
                              key={p.puuid}
                              className={`flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity text-xs ${isMe ? 'text-accent-primary font-semibold' : 'text-text-tertiary'}`}
                              onClick={() => { if (p.riotIdGameName && p.riotIdTagline) navigateToSummoner(p.riotIdGameName, p.riotIdTagline); }}
                              title={`${p.riotIdGameName || p.summonerName}#${p.riotIdTagline || ''}`}
                            >
                              {isMvp && <span className="text-[9px] font-bold bg-yellow-500/90 text-yellow-950 px-0.5 rounded shrink-0">MVP</span>}
                              {isAce && <span className="text-[9px] font-bold bg-purple-500/80 text-white px-0.5 rounded shrink-0">ACE</span>}
                              <span className="truncate">{name}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="w-px bg-bg-tertiary/50 self-stretch" />
                      <div className="flex flex-col justify-center gap-0.5 w-24 min-w-0">
                        {enemyTeam.map((p: any) => {
                          const isMvp = p.puuid === mvpPuuid;
                          const isAce = p.puuid === acePuuid;
                          const name = p.riotIdGameName || p.summonerName || p.championName;
                          return (
                            <div
                              key={p.puuid}
                              className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity text-xs text-text-tertiary"
                              onClick={() => { if (p.riotIdGameName && p.riotIdTagline) navigateToSummoner(p.riotIdGameName, p.riotIdTagline); }}
                              title={`${p.riotIdGameName || p.summonerName}#${p.riotIdTagline || ''}`}
                            >
                              {isMvp && <span className="text-[9px] font-bold bg-yellow-500/90 text-yellow-950 px-0.5 rounded shrink-0">MVP</span>}
                              {isAce && <span className="text-[9px] font-bold bg-purple-500/80 text-white px-0.5 rounded shrink-0">ACE</span>}
                              <span className="truncate">{name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-text-tertiary flex-shrink-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" /> : <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {mountedMatchesRef.current.has(matchId) && (
                  <div style={{ display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 0.2s ease' }}>
                  <div className="overflow-hidden"><div className="border-t border-bg-tertiary/40">
                    <div className="flex border-b border-bg-tertiary bg-bg-tertiary/30">
                      {(['teams', 'build', 'stats', 'timeline'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => {
                            const newTabs = new Map(matchDetailTabs);
                            newTabs.set(matchId, tab);
                            setMatchDetailTabs(newTabs);
                            if (tab === 'build' || tab === 'timeline') {
                              loadTimeline(matchId);
                            }
                          }}
                          className={`px-4 py-2 text-xs font-medium transition-colors relative ${
                            (matchDetailTabs.get(matchId) || 'teams') === tab
                              ? 'text-accent-primary'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {tab === 'teams' ? '팀 상세' : tab === 'build' ? '빌드' : tab === 'stats' ? '통계' : '타임라인'}
                          {(matchDetailTabs.get(matchId) || 'teams') === tab && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Teams Tab */}
                    {(matchDetailTabs.get(matchId) || 'teams') === 'teams' && (() => {
                      const allParticipants = match.info.participants;
                      const sortedByCarry = [...allParticipants].sort((a: any, b: any) => {
                        const scoreA = (a.kills * 3 + a.assists * 1.5) / Math.max(a.deaths, 1) + a.totalDamageDealtToChampions / 10000;
                        const scoreB = (b.kills * 3 + b.assists * 1.5) / Math.max(b.deaths, 1) + b.totalDamageDealtToChampions / 10000;
                        return scoreB - scoreA;
                      });
                      const carryRanks = new Map(sortedByCarry.map((p: any, idx: number) => [p.puuid, idx + 1]));
                      const maxDamage = Math.max(...allParticipants.map((p: any) => p.totalDamageDealtToChampions));

                      const renderPlayerRow = (p: any, isMe: boolean, teamWon: boolean, index: number) => {
                        const pKda = p.deaths === 0 ? p.kills + p.assists : ((p.kills + p.assists) / p.deaths).toFixed(2);
                        const pCs = p.totalMinionsKilled + p.neutralMinionsKilled;
                        const pCsPerMin = (pCs / (duration / 60)).toFixed(1);
                        const carryRank = carryRanks.get(p.puuid) || 10;
                        const damagePercent = (p.totalDamageDealtToChampions / maxDamage) * 100;
                        const pKillParticipation = ((p.kills + p.assists) / Math.max(teamKills, 1) * 100).toFixed(0);
                        const isAceRow = carryRank === 1;
                        const isMvpRow = carryRank <= 2 && teamWon;

                        return (
                          <div
                            key={p.puuid}
                            className={`flex items-center flex-nowrap gap-2 lg:gap-4 py-2 lg:py-3 px-2 lg:px-4 transition-all text-xs ${
                              isMe
                                ? "bg-accent-primary/[0.12] border-l-2 border-accent-primary"
                                : index % 2 === 0
                                ? (teamWon ? "bg-accent-success/[0.01]" : "bg-accent-danger/[0.01]")
                                : (teamWon ? "bg-accent-success/[0.05]" : "bg-accent-danger/[0.05]")
                            } ${!isMe && "hover:bg-bg-tertiary/40 cursor-pointer"}`}
                            onClick={() => {
                              if (!isMe && p.riotIdGameName && p.riotIdTagline) {
                                navigateToSummoner(p.riotIdGameName, p.riotIdTagline);
                              }
                            }}
                          >
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <div className="relative">
                                <Image
                                  src={getChampionIcon(p.championName)}
                                  alt={p.championName}
                                  width={48}
                                  height={48}
                                  className="w-10 h-10 xl:w-12 xl:h-12 rounded"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                                <span className="absolute -bottom-0.5 -right-0.5 bg-bg-primary/90 text-[8px] px-0.5 rounded text-text-primary font-bold border border-bg-elevated">
                                  {p.champLevel}
                                </span>
                              </div>
                              <div className="hidden lg:flex gap-0.5">
                                <div className="flex flex-col gap-0.5">
                                  <Image
                                    src={`/icons/spells/Summoner${getSummonerSpellName(p.summoner1Id)}.png`}
                                    alt="spell1"
                                    width={20}
                                    height={20}
                                    className="w-5 h-5 rounded"
                                    onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                  />
                                  <Image
                                    src={`/icons/spells/Summoner${getSummonerSpellName(p.summoner2Id)}.png`}
                                    alt="spell2"
                                    width={20}
                                    height={20}
                                    className="w-5 h-5 rounded"
                                    onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                  />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  {p.perks?.styles?.[0]?.selections?.[0]?.perk && (
                                    <Image
                                      src={`/icons/perks/${p.perks.styles[0].selections[0].perk}.png`}
                                      alt="primary rune"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5 rounded-full bg-bg-primary"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                  {p.perks?.styles?.[1]?.style && (
                                    <Image
                                      src={`/icons/perks/${p.perks.styles[1].style}.png`}
                                      alt="secondary rune"
                                      width={14}
                                      height={14}
                                      className="w-3.5 h-3.5 rounded-full bg-bg-primary opacity-60"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className={`flex-1 min-w-0 ${isMe ? "text-accent-primary font-medium" : "text-text-primary"}`}>
                              <span className="truncate block text-xs">
                                {p.riotIdGameName || p.summonerName || "Unknown"}
                                {p.riotIdTagline && <span className="text-text-tertiary text-[10px]">#{p.riotIdTagline}</span>}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              {isAceRow && (
                                <span className="flex-shrink-0 px-2 py-0.5 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border border-amber-400/50 text-amber-300 text-[10px] font-bold rounded">ACE</span>
                              )}
                              {isMvpRow && !isAceRow && (
                                <span className="flex-shrink-0 px-2 py-0.5 bg-gradient-to-r from-blue-500/30 to-cyan-500/30 border border-blue-400/50 text-blue-300 text-[10px] font-bold rounded">MVP</span>
                              )}
                            </div>

                            {/* 캐리 순위 - xl에서만 표시 */}
                            <div className="hidden xl:flex items-center gap-2 w-16">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                carryRank === 1 ? "bg-amber-500/40 text-amber-200 border border-amber-400/50" :
                                carryRank === 2 ? "bg-gray-400/40 text-gray-200 border border-gray-400/50" :
                                carryRank === 3 ? "bg-orange-400/40 text-orange-200 border border-orange-400/50" :
                                "bg-bg-elevated text-text-tertiary"
                              }`}>
                                {carryRank}
                              </div>
                              <div className="text-[11px] font-medium text-text-secondary">{pKillParticipation}%</div>
                            </div>

                            <div className="w-20 lg:w-28 text-center flex-shrink-0">
                              <div className="font-bold text-sm">{p.kills}/<span className="text-accent-danger">{p.deaths}</span>/{p.assists}</div>
                              <div className="text-xs text-text-tertiary">{pKda} KDA</div>
                            </div>

                            {/* 딜량 바 - lg에서만 표시 */}
                            <div className="hidden lg:block w-32 flex-shrink-0">
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-text-tertiary">딜량</span>
                                <span className="text-accent-danger font-semibold">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</span>
                              </div>
                              <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-red-600 to-orange-500" style={{ width: `${damagePercent}%` }} />
                              </div>
                            </div>

                            {/* CS - lg에서만 표시 */}
                            <div className="hidden lg:block w-20 text-center flex-shrink-0">
                              <div className="font-medium text-sm">{pCs}</div>
                              <div className="text-xs text-text-tertiary">{pCsPerMin}/m</div>
                            </div>

                            <div className="flex gap-0.5 lg:gap-1 flex-shrink-0 items-center">
                              {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item: number, idx: number) => (
                                <div key={idx} className={`w-5 h-5 lg:w-6 lg:h-6 ${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-primary border border-bg-tertiary`}>
                                  {item !== 0 && (
                                    <Image
                                      src={getItemIcon(item)}
                                      alt="item"
                                      width={24}
                                      height={24}
                                      className={`w-full h-full ${idx === 6 ? 'rounded-full' : 'rounded'}`}
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                </div>
                              ))}
                              {p.item7 != null && p.item7 !== 0 && (
                                <div className="w-5 h-5 lg:w-6 lg:h-6 rounded bg-bg-primary border border-amber-500/40">
                                  <Image
                                    src={getItemIcon(p.item7)}
                                    alt="quest"
                                    width={24}
                                    height={24}
                                    className="w-full h-full rounded"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div className="overflow-x-auto">
                        <div className="w-fit min-w-full p-3">
                          <div className={`mb-1.5 rounded ${myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"}`}>
                            <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${myTeamWon ? "text-accent-success" : "text-accent-danger"}`}>
                              <Shield className="h-3 w-3" />
                              <span>{myTeamWon ? "승리" : "패배"}</span>
                              <span className="text-text-tertiary font-normal text-[10px]">(아군)</span>
                              <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                {myTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                              </span>
                            </div>
                            <div>{myTeam.map((p: any, idx: number) => renderPlayerRow(p, p.puuid === puuid, myTeamWon, idx))}</div>
                          </div>
                          <div className={`rounded ${!myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"}`}>
                            <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${!myTeamWon ? "text-accent-success" : "text-accent-danger"}`}>
                              <Crosshair className="h-3 w-3" />
                              <span>{!myTeamWon ? "승리" : "패배"}</span>
                              <span className="text-text-tertiary font-normal text-[10px]">(적군)</span>
                              <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                {enemyTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                              </span>
                            </div>
                            <div>{enemyTeam.map((p: any, idx: number) => renderPlayerRow(p, false, !myTeamWon, idx))}</div>
                          </div>
                        </div></div>
                      );
                    })()}

                    {/* Build Tab */}
                    {matchDetailTabs.get(matchId) === 'build' && (() => {
                      const tl = timelineData.get(matchId);
                      const isLoadingTl = timelineLoading.has(matchId);

                      const itemEvents: { timestamp: number; itemId: number }[] = [];
                      if (tl?.info?.frames) {
                        for (const frame of tl.info.frames) {
                          for (const ev of (frame.events || [])) {
                            if (ev.type === 'ITEM_PURCHASED' && ev.participantId === participant.participantId) {
                              itemEvents.push({ timestamp: ev.timestamp, itemId: ev.itemId });
                            }
                          }
                        }
                      }

                      const byMinute = new Map<number, number[]>();
                      for (const ev of itemEvents) {
                        const min = Math.floor(ev.timestamp / 60000);
                        if (!byMinute.has(min)) byMinute.set(min, []);
                        byMinute.get(min)!.push(ev.itemId);
                      }
                      const minutes = Array.from(byMinute.keys()).sort((a, b) => a - b);

                      return (
                        <div className="p-4">
                          <h3 className="text-sm font-bold text-text-primary mb-3">아이템 구매 타임라인</h3>
                          {isLoadingTl ? (
                            <div className="flex items-center gap-2 text-xs text-text-secondary py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              타임라인 불러오는 중...
                            </div>
                          ) : !tl ? (
                            <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded">타임라인 데이터를 불러올 수 없습니다.</div>
                          ) : itemEvents.length === 0 ? (
                            <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded">아이템 구매 기록이 없습니다.</div>
                          ) : (
                            <div className="overflow-x-auto pb-1">
                              <div className="flex items-end gap-0 min-w-max relative">
                                <div className="absolute left-4 right-4 h-px bg-bg-elevated/80" style={{ bottom: '22px' }} />
                                {minutes.map((min) => (
                                  <div key={min} className="flex flex-col items-center px-2.5" style={{ minWidth: '52px' }}>
                                    <div className="flex flex-col gap-0.5 items-center mb-1.5">
                                      {byMinute.get(min)!.map((itemId, i) => (
                                        <Image
                                          key={i}
                                          src={getItemIcon(itemId)}
                                          alt={`item ${itemId}`}
                                          width={28}
                                          height={28}
                                          className="w-7 h-7 rounded border border-bg-tertiary/80"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      ))}
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-bg-secondary border-2 border-text-tertiary/50 z-10 mb-1" />
                                    <span className="text-[9px] text-text-tertiary">{min}분</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <h3 className="text-sm font-bold text-text-primary mb-3 mt-6">최종 빌드</h3>
                          <div className="flex gap-2 items-center">
                            {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].map((item: number, idx: number) => (
                              <div key={idx} className={`${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-tertiary`}>
                                {item !== 0 ? (
                                  <Image
                                    src={getItemIcon(item)}
                                    alt="item"
                                    width={48}
                                    height={48}
                                    className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated`}
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated bg-bg-secondary`} />
                                )}
                              </div>
                            ))}
                            {participant.item7 != null && participant.item7 !== 0 && (
                              <div className="rounded bg-bg-tertiary">
                                <Image
                                  src={getItemIcon(participant.item7)}
                                  alt="quest"
                                  width={48}
                                  height={48}
                                  className="w-12 h-12 rounded border-2 border-amber-500/40"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Stats Tab */}
                    {matchDetailTabs.get(matchId) === 'stats' && (() => {
                      const allP = match.info.participants;

                      const statDefs = [
                        { label: '총 피해량', getValue: (p: any) => p.totalDamageDealtToChampions || 0, format: (v: number) => v.toLocaleString(), color: 'from-red-600 to-orange-500' },
                        { label: '받은 피해량', getValue: (p: any) => p.totalDamageTaken || 0, format: (v: number) => v.toLocaleString(), color: 'from-blue-600 to-cyan-500' },
                        { label: '치유량', getValue: (p: any) => p.totalHeal || 0, format: (v: number) => v.toLocaleString(), color: 'from-green-600 to-emerald-500' },
                        { label: 'CC 시간', getValue: (p: any) => p.timeCCingOthers || 0, format: (v: number) => `${v.toFixed(0)}초`, color: 'from-purple-600 to-violet-500' },
                        { label: '획득 골드', getValue: (p: any) => p.goldEarned || 0, format: (v: number) => v.toLocaleString(), color: 'from-yellow-600 to-amber-500' },
                        { label: '분당 골드', getValue: (p: any) => (p.goldEarned || 0) / Math.max(duration / 60, 1), format: (v: number) => v.toFixed(0), color: 'from-yellow-600 to-amber-500' },
                        { label: 'CS', getValue: (p: any) => (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0), format: (v: number) => String(Math.round(v)), color: 'from-teal-600 to-cyan-500' },
                        { label: '분당 CS', getValue: (p: any) => ((p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0)) / Math.max(duration / 60, 1), format: (v: number) => v.toFixed(1), color: 'from-teal-600 to-cyan-500' },
                      ];

                      return (
                        <div className="p-4">
                          <h3 className="text-sm font-bold text-text-primary mb-3">10인 비교 통계</h3>
                          <div className="grid grid-cols-2 gap-3">
                            {statDefs.map((stat) => {
                              const values = allP.map((p: any) => ({ puuid: p.puuid, name: p.riotIdGameName || p.championName, val: stat.getValue(p) }));
                              const sorted = [...values].sort((a, b) => b.val - a.val);
                              const maxVal = sorted[0]?.val || 1;
                              const myVal = stat.getValue(participant);
                              const myRank = sorted.findIndex(v => v.puuid === participant.puuid) + 1;

                              return (
                                <div key={stat.label} className="bg-bg-tertiary/50 rounded-lg p-2.5">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-text-secondary font-medium">{stat.label}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        myRank === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30' :
                                        myRank <= 3 ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30' :
                                        'bg-bg-elevated text-text-tertiary'
                                      }`}>
                                        #{myRank}
                                      </span>
                                      <span className="text-xs font-bold text-text-primary">{stat.format(myVal)}</span>
                                    </div>
                                  </div>
                                  <div className="space-y-0.5">
                                    {sorted.map((v, i) => {
                                      const isMe = v.puuid === participant.puuid;
                                      const pct = maxVal > 0 ? (v.val / maxVal) * 100 : 0;
                                      return (
                                        <div key={v.puuid} className="flex items-center gap-1.5 group">
                                          <span className={`text-[9px] w-[52px] truncate ${isMe ? 'text-accent-primary font-bold' : 'text-text-tertiary'}`}>
                                            {v.name}
                                          </span>
                                          <div className="flex-1 h-[6px] bg-bg-elevated rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${isMe ? `bg-gradient-to-r ${stat.color}` : 'bg-text-tertiary/20'}`}
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <span className={`text-[9px] w-10 text-right ${isMe ? 'text-text-primary font-medium' : 'text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                                            {stat.format(v.val)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Timeline Tab */}
                    {matchDetailTabs.get(matchId) === 'timeline' && (() => {
                      const tl = timelineData.get(matchId);
                      const isLoadingTl = timelineLoading.has(matchId);
                      return (
                        <div className="p-4">
                          {isLoadingTl ? (
                            <div className="flex items-center gap-2 text-xs text-text-secondary py-8 justify-center">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              타임라인 불러오는 중...
                            </div>
                          ) : !tl?.info?.frames ? (
                            <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded text-center py-8">
                              타임라인 데이터를 불러올 수 없습니다.
                            </div>
                          ) : (
                            <>
                              <TimelineGraphs tl={tl} match={match} participant={participant} />
                              <GoldDiffChart tl={tl} participant={participant} match={match} />
                              <ObjectEventTimeline tl={tl} participant={participant} match={match} />
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div></div></div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load More Button */}
      {riotMatches.length > 0 && hasMoreRiotMatches && (
        <div className="mt-4 text-center">
          <button
            onClick={() => loadMoreRiotMatches()}
            disabled={isLoadingMoreRiotMatches}
            className="px-6 py-2 bg-bg-tertiary hover:bg-bg-elevated border border-bg-elevated rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMoreRiotMatches ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                불러오는 중...
              </span>
            ) : (
              "더보기"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
