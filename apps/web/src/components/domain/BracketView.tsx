"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getDoubleElimFeeders } from "@/lib/bracket-topology";
import { CheckCircle2, CircleDashed, Clock3, Trophy, Swords, ShieldX } from "lucide-react";

interface Team {
  id: string;
  name: string;
  score?: number;
  captain?: { id: string; username: string };
}

// "팀장닉 팀" 형태로 표시. 팀장 정보가 없으면 원래 name으로 폴백.
export function getTeamDisplayName(team?: Team): string {
  if (!team) return "TBD";
  if (team.captain?.username) return `${team.captain.username} 팀`;
  return team.name;
}

export interface Match { // Exporting for use in other components
  id: string;
  round: number;
  matchNumber: number;
  team1?: Team;
  team2?: Team;
  winner?: Team;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  scheduledTime?: string;
  tournamentCode?: string;
  bracketSection?: string; // "WB_R1", "WB_F", "LB_R1", "LB_F", "GF", etc.
  mvpUserId?: string;
  aceUserId?: string;
}

interface BracketViewProps {
  matches: Match[];
  rounds: number;
  onMatchClick: (match: Match) => void;
}

function getMatchStatus(match: Match) {
  switch (match.status) {
    case "IN_PROGRESS":
      return {
        label: "진행 중",
        icon: <Swords className="h-3.5 w-3.5" />,
        className: "border-accent-primary/60 bg-accent-primary/10 text-accent-primary",
        cardClassName: "border-accent-primary/60 shadow-[0_0_30px_rgba(59,130,246,0.12)]",
      };
    case "COMPLETED":
      return {
        label: "완료",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        className: "border-accent-success/50 bg-accent-success/10 text-accent-success",
        cardClassName: "border-accent-success/45",
      };
    default:
      return {
        label: "대기",
        icon: <Clock3 className="h-3.5 w-3.5" />,
        className: "border-bg-tertiary bg-bg-tertiary/70 text-text-secondary",
        cardClassName: "border-bg-tertiary",
      };
  }
}

function TeamSlot({
  team,
  isWinner,
}: {
  team?: Team;
  isWinner: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[42px] items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors",
        isWinner
          ? "border-accent-gold/60 bg-accent-gold/10"
          : team
            ? "border-bg-tertiary bg-bg-tertiary/70"
            : "border-dashed border-bg-tertiary bg-bg-tertiary/30",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            isWinner ? "bg-accent-gold" : team ? "bg-accent-primary/70" : "bg-text-tertiary/50",
          )}
        />
        <span
          className={cn(
            "truncate text-sm font-semibold",
            team ? "text-text-primary" : "text-text-tertiary",
          )}
        >
          {getTeamDisplayName(team)}
        </span>
      </div>
      {isWinner ? (
        <Trophy className="h-4 w-4 shrink-0 text-accent-gold" />
      ) : team?.score !== undefined ? (
        <span className="shrink-0 text-base font-bold text-text-primary">{team.score}</span>
      ) : null}
    </div>
  );
}

// --- Shared match card ---
function MatchCard({
  match,
  onMatchClick,
  innerRef,
}: {
  match: Match;
  onMatchClick: (m: Match) => void;
  // 연결선 오버레이가 카드 위치를 측정하기 위한 ref 콜백 (DE 전용)
  innerRef?: (el: HTMLButtonElement | null) => void;
}) {
  const status = getMatchStatus(match);

  return (
    <button
      ref={innerRef}
      type="button"
      className={cn(
        "group relative w-[250px] shrink-0 rounded-lg border bg-bg-secondary/95 p-3 text-left shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-accent-primary/70 hover:shadow-xl md:w-[286px]",
        status.cardClassName,
      )}
      onClick={() => onMatchClick(match)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            Match {match.matchNumber}
          </p>
          {match.bracketSection && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">{SECTION_LABELS[match.bracketSection] || match.bracketSection}</p>
          )}
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold", status.className)}>
          {status.icon}
          {status.label}
        </span>
      </div>

      <div className="space-y-2">
        <TeamSlot team={match.team1} isWinner={match.winner?.id === match.team1?.id} />
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-bg-tertiary" />
          <span className="text-[10px] font-bold text-text-tertiary">VS</span>
          <div className="h-px flex-1 bg-bg-tertiary" />
        </div>
        <TeamSlot team={match.team2} isWinner={match.winner?.id === match.team2?.id} />
      </div>

      {match.scheduledTime && match.status === 'PENDING' && (
        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-text-secondary">
          <Clock3 className="h-3.5 w-3.5" />
          {new Date(match.scheduledTime).toLocaleString('ko-KR')}
        </div>
      )}
    </button>
  );
}

function RoundHeader({
  title,
  count,
  isFinal = false,
}: {
  title: string;
  count: number;
  isFinal?: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-bg-tertiary bg-bg-secondary/80 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {isFinal ? (
          <Trophy className="h-4 w-4 shrink-0 text-accent-gold" />
        ) : (
          <CircleDashed className="h-4 w-4 shrink-0 text-text-tertiary" />
        )}
        <h3 className="truncate text-sm font-bold text-text-primary">{title}</h3>
      </div>
      <span className="rounded-md bg-bg-tertiary px-2 py-0.5 text-xs font-semibold text-text-secondary">
        {count}경기
      </span>
    </div>
  );
}

// 컬럼 사이 연결선이 차지하는 가로 간격(px). 들어오는 가로선·컬럼 우측 마진과 맞춘다.
const CONNECTOR_GAP = "w-10 md:w-12";
const CONNECTOR_MARGIN = "mr-10 md:mr-12";

/**
 * 대진 트리의 매치 한 칸을 감싸 연결선을 그린다.
 * - tree 모드: 이전 라운드에서 들어오는 가로선 + 다음 라운드로 합쳐지는 세로 절반선(페어 결합).
 *   상단 칸(짝수 index)은 중앙→아래로, 하단 칸(홀수 index)은 중앙→위로 절반씩 그려
 *   두 칸의 중앙을 잇고, 그 중점이 다음 라운드 매치 높이와 정렬된다.
 * - flow 모드: 페어링을 단정할 수 없는 패자조용. 들어오는 가로선만 그려 진행 방향만 표시.
 */
function BracketCell({
  children,
  index,
  isFirstColumn,
  isLastColumn,
  mode = "tree",
}: {
  children: React.ReactNode;
  index: number;
  isFirstColumn: boolean;
  isLastColumn: boolean;
  mode?: "tree" | "flow";
}) {
  return (
    <div className="relative flex flex-1 items-center">
      {/* 이전 라운드에서 들어오는 가로 연결선 */}
      {!isFirstColumn && (
        <span
          className={cn(
            "pointer-events-none absolute right-full top-1/2 hidden h-px -translate-y-1/2 bg-bg-tertiary md:block",
            CONNECTOR_GAP,
          )}
        />
      )}
      {children}
      {/* 다음 라운드로 합쳐지는 세로 절반선 (tree 모드 전용) */}
      {mode === "tree" && !isLastColumn && (
        <span
          className={cn(
            "pointer-events-none absolute left-full hidden w-px bg-bg-tertiary md:block",
            index % 2 === 0 ? "top-1/2 h-1/2" : "bottom-1/2 h-1/2",
          )}
        />
      )}
    </div>
  );
}

function getRoundName(round: number, rounds: number): string {
  if (round === rounds) return "결승";
  if (round === rounds - 1) return "준결승";
  if (round === rounds - 2) return "8강";
  return `${round}라운드`;
}

function getRoundHeight(matchCount: number): number {
  return Math.max(156, matchCount * 148 + Math.max(0, matchCount - 1) * 28);
}

// --- Standard (single-elim / round-robin) bracket ---
function StandardBracket({ matches, rounds, onMatchClick }: BracketViewProps) {
  const matchesByRound = React.useMemo(() => {
    const grouped: Record<number, Match[]> = {};
    for (let i = 1; i <= rounds; i++) {
      grouped[i] = matches.filter(m => m.round === i).sort((a, b) => a.matchNumber - b.matchNumber);
    }
    return grouped;
  }, [matches, rounds]);

  const maxMatchesInRound = Math.max(1, ...Object.values(matchesByRound).map((roundMatches) => roundMatches.length));
  const roundHeight = getRoundHeight(maxMatchesInRound);
  const isRoundRobin = rounds === 1 && matches.length > 1;
  // rounds>1 = 엘리미네이션 트리. 연결선과 중앙 정렬을 적용한다.
  const isTree = rounds > 1;

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex min-w-max p-2 md:p-4">
        {Array.from({ length: rounds }, (_, i) => i + 1).map(round => (
          <div
            key={round}
            className={cn(
              "relative flex w-[250px] shrink-0 flex-col last:mr-0 md:w-[286px]",
              isTree ? CONNECTOR_MARGIN : "mr-6 md:mr-8",
            )}
          >
            <RoundHeader
              title={isRoundRobin ? "리그전" : getRoundName(round, rounds)}
              count={matchesByRound[round]?.length || 0}
              isFinal={!isRoundRobin && round === rounds}
            />
            {isTree ? (
              <div className="flex flex-1 flex-col" style={{ minHeight: roundHeight }}>
                {matchesByRound[round]?.map((match, index) => (
                  <BracketCell
                    key={match.id}
                    index={index}
                    isFirstColumn={round === 1}
                    isLastColumn={round === rounds}
                  >
                    <MatchCard match={match} onMatchClick={onMatchClick} />
                  </BracketCell>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-7">
                {matchesByRound[round]?.map(match => (
                  <MatchCard key={match.id} match={match} onMatchClick={onMatchClick} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Section label order for DE display
const WB_SECTIONS = ['WB_R1', 'WB_R2', 'WB_R3', 'WB_F'];
const LB_SECTIONS = ['LB_R1', 'LB_R2', 'LB_R3', 'LB_SEMI', 'LB_F'];

const SECTION_LABELS: Record<string, string> = {
  WB_R1: 'WB 1라운드', WB_R2: 'WB 준결승', WB_R3: 'WB 8강', WB_F: 'WB 결승',
  LB_R1: 'LB 1라운드', LB_R2: 'LB 2라운드', LB_R3: 'LB 3라운드',
  LB_SEMI: 'LB 준결승', LB_F: 'LB 결승',
  GF: '그랜드파이널',
};

// --- Double Elimination bracket ---
function DoubleEliminationBracket({ matches, onMatchClick }: { matches: Match[]; onMatchClick: (m: Match) => void }) {
  const bySec = React.useMemo(() => {
    const map: Record<string, Match[]> = {};
    for (const m of matches) {
      const sec = m.bracketSection || 'unknown';
      if (!map[sec]) map[sec] = [];
      map[sec].push(m);
    }
    // Sort within each section by matchNumber
    Object.values(map).forEach(arr => arr.sort((a, b) => a.matchNumber - b.matchNumber));
    return map;
  }, [matches]);

  const presentWB = WB_SECTIONS.filter(s => bySec[s]?.length);
  const presentLB = LB_SECTIONS.filter(s => bySec[s]?.length);
  const hasGF = !!bySec['GF']?.length;

  // 승자조는 라운드마다 정확히 절반으로 줄어드는 정상 트리 → 연결선과 중앙 정렬 적용.
  const wbHeight = getRoundHeight(
    Math.max(1, ...presentWB.map((s) => bySec[s]?.length || 1)),
  );

  // ── 연결선 오버레이: 카드 위치를 측정해 토폴로지대로 SVG 선을 그린다.
  //   승자조 내부 진출선은 CSS 트리(BracketCell)가 이미 그리므로 SVG는
  //   (1) 패자조 진출선, (2) 패자 하강선, (3) 밴드를 넘는 결승행 선만 그린다.
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef(new Map<string, HTMLElement>());
  const [positions, setPositions] = React.useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});

  const registerCard = React.useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) cardRefs.current.set(key, el);
      else cardRefs.current.delete(key);
    },
    [],
  );

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const crect = container.getBoundingClientRect();
      const next: Record<string, { x: number; y: number; w: number; h: number }> = {};
      cardRefs.current.forEach((el, key) => {
        const r = el.getBoundingClientRect();
        next[key] = {
          x: r.left - crect.left,
          y: r.top - crect.top,
          w: r.width,
          h: r.height,
        };
      });
      setPositions(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [matches]);

  // 토폴로지 + 측정 위치로 그릴 연결선 목록을 만든다.
  const edges = React.useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(bySec).forEach((s) => (counts[s] = bySec[s].length));
    const list: {
      id: string;
      d: string;
      kind: "winner" | "loser";
    }[] = [];

    Object.entries(bySec).forEach(([section, sectionMatches]) => {
      sectionMatches.forEach((_, index) => {
        const feeders = getDoubleElimFeeders(section, index, counts);
        const src = positions[`${section}:${index}`];
        if (!src) return;

        const addEdge = (
          target: { section: string; slotIndex: number } | null,
          kind: "winner" | "loser",
        ) => {
          if (!target) return;
          const tgt = positions[`${target.section}:${target.slotIndex}`];
          if (!tgt) return;
          const sx = src.x + src.w;
          const sy = src.y + src.h / 2;
          const tx = tgt.x;
          const ty = tgt.y + tgt.h / 2;
          const midX = Math.max(sx + 14, (sx + tx) / 2);
          list.push({
            id: `${section}:${index}-${kind}`,
            d: `M ${sx} ${sy} H ${midX} V ${ty} H ${tx}`,
            kind,
          });
        };

        // 승자조 내부(WB→WB) 진출선은 CSS 트리가 담당하므로 SVG에서 제외.
        if (
          feeders.winner &&
          !(
            (section === "WB_R1" || section === "WB_R2") &&
            feeders.winner.section.startsWith("WB")
          )
        ) {
          addEdge(feeders.winner, "winner");
        }
        addEdge(feeders.loser, "loser");
      });
    });
    return list;
  }, [bySec, positions]);

  // tree=true(승자조)면 CSS 연결선 트리, false(패자조·GF)면 카드만. 모든 카드는
  // 연결선 측정을 위해 registerCard로 ref를 등록한다.
  const renderSection = (
    section: string,
    opts: { tree: boolean; index: number; count: number },
  ) => (
    <div
      key={section}
      className={cn(
        "flex w-[250px] shrink-0 flex-col last:mr-0 md:w-[286px]",
        opts.tree && CONNECTOR_MARGIN,
      )}
    >
      <RoundHeader
        title={SECTION_LABELS[section] || section}
        count={bySec[section]?.length || 0}
        isFinal={section === "GF" || section.endsWith("_F")}
      />
      {opts.tree ? (
        <div className="flex flex-1 flex-col" style={{ minHeight: wbHeight }}>
          {bySec[section]?.map((match, index) => (
            <BracketCell
              key={match.id}
              index={index}
              isFirstColumn={opts.index === 0}
              isLastColumn={opts.index === opts.count - 1}
            >
              <MatchCard
                match={match}
                onMatchClick={onMatchClick}
                innerRef={registerCard(`${section}:${index}`)}
              />
            </BracketCell>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[188px] flex-col justify-around gap-5">
          {bySec[section]?.map((match, index) => (
            <MatchCard
              key={match.id}
              match={match}
              onMatchClick={onMatchClick}
              innerRef={registerCard(`${section}:${index}`)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full overflow-x-auto">
      <div ref={containerRef} className="relative min-w-max space-y-6">
        {/* 연결선 SVG (카드 뒤에 깔림) */}
        <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full" aria-hidden>
          {edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={
                edge.kind === "winner"
                  ? "text-accent-primary/45"
                  : "text-accent-danger/40"
              }
              strokeDasharray={edge.kind === "loser" ? "5 4" : undefined}
            />
          ))}
        </svg>

        {/* Winners Bracket */}
        {presentWB.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 mb-3">
              <Trophy className="h-4 w-4 text-accent-gold" />
              <h2 className="text-sm font-bold text-accent-gold uppercase tracking-wider">승자조 (Winners Bracket)</h2>
            </div>
            <div className="flex min-w-max p-2 md:p-4">
              {presentWB.map((section, index) =>
                renderSection(section, { tree: true, index, count: presentWB.length }),
              )}
            </div>
          </div>
        )}

        {/* Divider */}
        {presentLB.length > 0 && (
          <div className="border-t border-dashed border-bg-tertiary mx-4" />
        )}

        {/* Losers Bracket */}
        {presentLB.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 mb-3">
              <ShieldX className="h-4 w-4 text-accent-danger" />
              <h2 className="text-sm font-bold text-accent-danger uppercase tracking-wider">패자조 (Losers Bracket)</h2>
            </div>
            <div className="flex min-w-max gap-6 p-2 md:gap-8 md:p-4">
              {presentLB.map((section, index) =>
                renderSection(section, { tree: false, index, count: presentLB.length }),
              )}
            </div>
          </div>
        )}

        {/* Grand Final */}
        {hasGF && (
          <>
            <div className="border-t border-bg-tertiary mx-4" />
            <div className="flex justify-center p-4">
              {renderSection('GF', { tree: false, index: 0, count: 1 })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Main BracketView ---
export function BracketView({ matches, rounds, onMatchClick }: BracketViewProps) {
  const isDoubleElim = matches.some(m => m.bracketSection?.startsWith('LB') || m.bracketSection === 'GF');

  if (isDoubleElim) {
    return <DoubleEliminationBracket matches={matches} onMatchClick={onMatchClick} />;
  }

  return <StandardBracket matches={matches} rounds={rounds} onMatchClick={onMatchClick} />;
}
