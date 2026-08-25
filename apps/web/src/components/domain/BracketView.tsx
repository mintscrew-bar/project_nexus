"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getDoubleElimFeeders } from "@nexus/types";
import {
  CheckCircle2,
  CircleDashed,
  Clock3,
  Trophy,
  Swords,
  ShieldX,
} from "lucide-react";

interface TeamMember {
  id: string;
  username: string;
  assignedRole?: string | null;
  championPreferences?: Array<{
    role: string;
    championId: string;
    order: number;
  }>;
}

interface Team {
  id: string;
  name: string;
  score?: number;
  captain?: { id: string; username: string };
  members?: TeamMember[];
}

// "팀장닉 팀" 형태로 표시. 팀장 정보가 없으면 원래 name으로 폴백.
export function getTeamDisplayName(team?: Team): string {
  if (!team) return "TBD";
  if (team.captain?.username) return `${team.captain.username} 팀`;
  return team.name;
}

export interface Match {
  // Exporting for use in other components
  id: string;
  round: number;
  matchNumber: number;
  team1?: Team;
  team2?: Team;
  winner?: Team;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  scheduledTime?: string;
  tournamentCode?: string;
  bracketSection?: string; // "WB_R1", "WB_F", "LB_R1", "LB_F", "GF", etc.
  mvpUserId?: string;
  aceUserId?: string;
  /** 다전제 시리즈 길이. 1=단판 */
  bestOf?: number;
  /** 현재 진행 중이거나 다음에 치를 세트 번호 */
  currentGameNumber?: number;
  /**
   * 지금 가리키고 있는 세트(= `id`가 가리키는 Match) 자체의 상태.
   *
   * 위의 `status`는 시리즈(대진 슬롯) 상태라 세트 상태와 다르다.
   * 예를 들어 2세트가 막 만들어졌을 때 시리즈는 IN_PROGRESS지만 세트는 PENDING이다.
   * 시작·가위바위보·결과 보고처럼 "세트 하나"에 대한 동작은 반드시 이 값으로 판단해야 한다.
   * `status`로 판단하면 시작 버튼이 사라지거나, 아직 시작도 안 한 세트에
   * 결과 보고를 걸어 서버가 400으로 막는다.
   */
  currentGameStatus?: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  /** 이 슬롯에 속한 세트(Match) id 목록 */
  gameIds?: string[];
}

/**
 * 카드 밀도.
 *
 * 8팀 더블 엘리미네이션은 상세 카드로 그리면 세로 2500px·가로 2100px 이라
 * 어떤 화면에도 안 들어간다. 컴팩트는 팀명과 점수만 남겨 한 화면에 담는다.
 */
type Density = "compact" | "detailed";

/** 밀도별 카드 치수 — 트리 정렬 여백 계산이 이 값에 묶여 있다. */
const DENSITY = {
  detailed: { card: "w-[320px] md:w-[400px]", slotGap: 420, minColumn: 430 },
  compact: { card: "w-[208px] md:w-[232px]", slotGap: 104, minColumn: 120 },
} as const;

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
        className:
          "border-accent-primary/60 bg-accent-primary/10 text-accent-primary",
        dotClassName: "text-accent-primary",
        cardClassName:
          "border-accent-primary/60 shadow-[0_0_30px_rgba(59,130,246,0.12)]",
      };
    case "COMPLETED":
      return {
        label: "완료",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        className:
          "border-accent-success/50 bg-accent-success/10 text-accent-success",
        dotClassName: "text-accent-success",
        cardClassName: "border-accent-success/45",
      };
    default:
      return {
        label: "대기",
        icon: <Clock3 className="h-3.5 w-3.5" />,
        className: "border-bg-tertiary bg-bg-tertiary/70 text-text-secondary",
        dotClassName: "text-text-tertiary",
        cardClassName: "border-bg-tertiary",
      };
  }
}

function TeamSlot({
  team,
  isWinner,
  density = "detailed",
}: {
  team?: Team;
  isWinner: boolean;
  density?: Density;
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        compact ? "px-2 py-1" : "px-3 py-3",
        isWinner
          ? "border-accent-gold/60 bg-accent-gold/10"
          : team
            ? "border-bg-tertiary bg-bg-tertiary/70"
            : "border-dashed border-bg-tertiary bg-bg-tertiary/30",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              isWinner
                ? "bg-accent-gold"
                : team
                  ? "bg-accent-primary/70"
                  : "bg-text-tertiary/50",
            )}
          />
          <span
            className={cn(
              "truncate font-bold",
              compact ? "text-xs" : "text-sm",
              team ? "text-text-primary" : "text-text-tertiary",
            )}
          >
            {getTeamDisplayName(team)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {team?.score !== undefined && (
            <span
              className={cn(
                "font-bold text-text-primary",
                compact ? "text-sm" : "text-base",
              )}
            >
              {team.score}
            </span>
          )}
          {isWinner && (
            <Trophy
              className={cn(
                "text-accent-gold",
                compact ? "h-3 w-3" : "h-4 w-4",
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Shared match card ---
function MatchCard({
  match,
  onMatchClick,
  innerRef,
  density = "detailed",
}: {
  match: Match;
  density?: Density;
  onMatchClick: (m: Match) => void;
  // 연결선 오버레이가 카드 위치를 측정하기 위한 ref 콜백 (DE 전용)
  innerRef?: (el: HTMLButtonElement | null) => void;
}) {
  const status = getMatchStatus(match);
  const compact = density === "compact";

  // 컴팩트는 한 줄 머리글 + 팀 두 줄만 남긴다. 나머지 정보(섹션명·세트 진행·
  // 예정 시각)는 카드를 열면 볼 수 있으므로 여기서는 접는다.
  if (compact) {
    return (
      <button
        ref={innerRef}
        type="button"
        className={cn(
          "group relative shrink-0 rounded-md border bg-bg-secondary/95 p-1.5 text-left shadow-md shadow-black/10 transition-all hover:border-accent-primary/70 hover:shadow-lg",
          DENSITY.compact.card,
          status.cardClassName,
        )}
        onClick={() => onMatchClick(match)}
        title={`Match ${match.matchNumber}${(match.bestOf ?? 1) > 1 ? ` · BO${match.bestOf}` : ""} · ${status.label} — 클릭해 상세 열기`}
      >
        <div className="mb-1 flex items-center justify-between gap-1.5 px-1">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            M{match.matchNumber}
            {(match.bestOf ?? 1) > 1 && (
              <span className="ml-1 text-accent-primary">BO{match.bestOf}</span>
            )}
          </span>
          <span className={cn("shrink-0", status.dotClassName)}>
            {status.icon}
          </span>
        </div>
        <div className="space-y-1">
          <TeamSlot
            team={match.team1}
            isWinner={match.winner?.id === match.team1?.id}
            density="compact"
          />
          <TeamSlot
            team={match.team2}
            isWinner={match.winner?.id === match.team2?.id}
            density="compact"
          />
        </div>
      </button>
    );
  }

  return (
    <button
      ref={innerRef}
      type="button"
      className={cn(
        "group relative shrink-0 rounded-lg border bg-bg-secondary/95 p-3 text-left shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-accent-primary/70 hover:shadow-xl",
        DENSITY.detailed.card,
        status.cardClassName,
      )}
      onClick={() => onMatchClick(match)}
      title="클릭해 매치 상세 열기 (라인업·진영 결정·결과 보고)"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            Match {match.matchNumber}
            {/* 다전제면 시리즈 길이를 함께 보여준다 */}
            {(match.bestOf ?? 1) > 1 && (
              <span className="ml-1.5 text-accent-primary">
                BO{match.bestOf}
              </span>
            )}
          </p>
          {match.bracketSection && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {SECTION_LABELS[match.bracketSection] || match.bracketSection}
            </p>
          )}
          {(match.bestOf ?? 1) > 1 && match.status !== "COMPLETED" && (
            <p className="mt-0.5 text-xs text-text-secondary">
              {match.currentGameNumber ?? 1}세트 진행
            </p>
          )}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold",
            status.className,
          )}
        >
          {status.icon}
          {status.label}
        </span>
      </div>

      <div className="space-y-2">
        <TeamSlot
          team={match.team1}
          isWinner={match.winner?.id === match.team1?.id}
        />
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-bg-tertiary" />
          <span className="text-[10px] font-bold text-text-tertiary">VS</span>
          <div className="h-px flex-1 bg-bg-tertiary" />
        </div>
        <TeamSlot
          team={match.team2}
          isWinner={match.winner?.id === match.team2?.id}
        />
      </div>

      {match.scheduledTime && match.status === "PENDING" && (
        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-text-secondary">
          <Clock3 className="h-3.5 w-3.5" />
          {new Date(match.scheduledTime).toLocaleString("ko-KR")}
        </div>
      )}
    </button>
  );
}

function RoundHeader({
  title,
  count,
  isFinal = false,
  density = "detailed",
}: {
  title: string;
  count: number;
  isFinal?: boolean;
  density?: Density;
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border border-bg-tertiary bg-bg-secondary/80",
        compact ? "mb-2 px-2 py-1" : "mb-4 px-3 py-2",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isFinal ? (
          <Trophy
            className={cn(
              "shrink-0 text-accent-gold",
              compact ? "h-3 w-3" : "h-4 w-4",
            )}
          />
        ) : (
          <CircleDashed
            className={cn(
              "shrink-0 text-text-tertiary",
              compact ? "h-3 w-3" : "h-4 w-4",
            )}
          />
        )}
        <h3
          className={cn(
            "truncate font-bold text-text-primary",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {title}
        </h3>
      </div>
      <span
        className={cn(
          "rounded-md bg-bg-tertiary font-semibold text-text-secondary",
          compact ? "px-1.5 text-[10px]" : "px-2 py-0.5 text-xs",
        )}
      >
        {count}경기
      </span>
    </div>
  );
}

// 컬럼 사이 연결선이 차지하는 가로 간격(px). 들어오는 가로선·컬럼 우측 마진과 맞춘다.
const CONNECTOR_GAP = "w-8 md:w-12";
const CONNECTOR_MARGIN = "mr-8 md:mr-12";

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

function getRoundHeight(matchCount: number, density: Density): number {
  const { slotGap, minColumn } = DENSITY[density];
  return Math.max(
    minColumn,
    matchCount * slotGap +
      Math.max(0, matchCount - 1) * (density === "compact" ? 8 : 36),
  );
}

// --- Standard (single-elim / round-robin) bracket ---
function StandardBracket({
  matches,
  rounds,
  onMatchClick,
  density,
}: BracketViewProps & { density: Density }) {
  const matchesByRound = React.useMemo(() => {
    const grouped: Record<number, Match[]> = {};
    for (let i = 1; i <= rounds; i++) {
      grouped[i] = matches
        .filter((m) => m.round === i)
        .sort((a, b) => a.matchNumber - b.matchNumber);
    }
    return grouped;
  }, [matches, rounds]);

  const maxMatchesInRound = Math.max(
    1,
    ...Object.values(matchesByRound).map((roundMatches) => roundMatches.length),
  );
  const roundHeight = getRoundHeight(maxMatchesInRound, density);
  const isRoundRobin = rounds === 1 && matches.length > 1;
  // rounds>1 = 엘리미네이션 트리. 연결선과 중앙 정렬을 적용한다.
  const isTree = rounds > 1;

  return (
    <div className="w-max">
      <div
        className={cn(
          "flex min-w-max",
          density === "compact" ? "p-2" : "p-2 md:p-4",
        )}
      >
        {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
          <div
            key={round}
            className={cn(
              "relative flex shrink-0 flex-col last:mr-0",
              DENSITY[density].card,
              isTree
                ? density === "compact"
                  ? "mr-5"
                  : CONNECTOR_MARGIN
                : density === "compact"
                  ? "mr-3"
                  : "mr-6 md:mr-8",
            )}
          >
            <RoundHeader
              title={isRoundRobin ? "리그전" : getRoundName(round, rounds)}
              count={matchesByRound[round]?.length || 0}
              isFinal={!isRoundRobin && round === rounds}
              density={density}
            />
            {isTree ? (
              <div
                className="flex flex-1 flex-col"
                style={{ minHeight: roundHeight }}
              >
                {matchesByRound[round]?.map((match, index) => (
                  <BracketCell
                    key={match.id}
                    index={index}
                    isFirstColumn={round === 1}
                    isLastColumn={round === rounds}
                  >
                    <MatchCard
                      match={match}
                      onMatchClick={onMatchClick}
                      density={density}
                    />
                  </BracketCell>
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  "flex flex-col",
                  density === "compact" ? "gap-2" : "gap-7",
                )}
              >
                {matchesByRound[round]?.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onMatchClick={onMatchClick}
                    density={density}
                  />
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
const WB_SECTIONS = ["WB_R1", "WB_R2", "WB_R3", "WB_F"];
const LB_SECTIONS = ["LB_R1", "LB_R2", "LB_R3", "LB_SEMI", "LB_F"];

const SECTION_LABELS: Record<string, string> = {
  WB_R1: "WB 1라운드",
  WB_R2: "WB 준결승",
  WB_R3: "WB 8강",
  WB_F: "WB 결승",
  LB_R1: "LB 1라운드",
  LB_R2: "LB 2라운드",
  LB_R3: "LB 3라운드",
  LB_SEMI: "LB 준결승",
  LB_F: "LB 결승",
  GF: "그랜드파이널",
};

// --- Double Elimination bracket ---
function DoubleEliminationBracket({
  matches,
  onMatchClick,
  density,
}: {
  matches: Match[];
  onMatchClick: (m: Match) => void;
  density: Density;
}) {
  const bySec = React.useMemo(() => {
    const map: Record<string, Match[]> = {};
    for (const m of matches) {
      const sec = m.bracketSection || "unknown";
      if (!map[sec]) map[sec] = [];
      map[sec].push(m);
    }
    // Sort within each section by matchNumber
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.matchNumber - b.matchNumber),
    );
    return map;
  }, [matches]);

  const presentWB = WB_SECTIONS.filter((s) => bySec[s]?.length);
  const presentLB = LB_SECTIONS.filter((s) => bySec[s]?.length);
  const hasGF = !!bySec["GF"]?.length;

  // 승자조는 라운드마다 정확히 절반으로 줄어드는 정상 트리 → 연결선과 중앙 정렬 적용.
  const wbHeight = getRoundHeight(
    Math.max(1, ...presentWB.map((s) => bySec[s]?.length || 1)),
    density,
  );

  /**
   * 라운드 축을 공유하는 열 배치.
   *
   * 승자조와 패자조를 세로로 쌓으면 8팀 기준 세로 2500px 이 되고, 무엇보다
   * "WB 몇 라운드에서 진 팀이 LB 어디로 가는지"가 눈에 들어오지 않는다.
   * 패자조는 승자조보다 한 열 뒤에서 시작한다 — LB_R1 은 WB_R1 의 패자를
   * 받으므로 WB_R2 와 같은 열에 서고, 그 뒤로 하나씩 밀린다.
   *
   *   열0      열1      열2     열3       열4    열5
   *   WB_R1 → WB_R2 →  WB_F ────────────────────→ GF
   *     ↓패자   ↓패자    ↓패자                     ↑
   *          LB_R1 → LB_R2 → LB_SEMI → LB_F ─────┘
   */
  const layout = React.useMemo(() => {
    const cells: {
      section: string;
      column: number;
      row: "wb" | "lb" | "gf";
      tree: boolean;
    }[] = [];
    presentWB.forEach((section, index) =>
      cells.push({ section, column: index, row: "wb", tree: true }),
    );
    presentLB.forEach((section, index) =>
      cells.push({ section, column: index + 1, row: "lb", tree: false }),
    );
    const columnCount =
      Math.max(0, ...cells.map((cell) => cell.column + 1)) || 1;
    if (hasGF) {
      cells.push({
        section: "GF",
        column: columnCount,
        row: "gf",
        tree: false,
      });
    }
    return { cells, columnCount: hasGF ? columnCount + 1 : columnCount };
  }, [presentWB, presentLB, hasGF]);

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
      const next: Record<
        string,
        { x: number; y: number; w: number; h: number }
      > = {};
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
    <div className={cn("flex flex-col", DENSITY[density].card)}>
      <RoundHeader
        title={SECTION_LABELS[section] || section}
        count={bySec[section]?.length || 0}
        isFinal={section === "GF" || section.endsWith("_F")}
        density={density}
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
                density={density}
                innerRef={registerCard(`${section}:${index}`)}
              />
            </BracketCell>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col justify-around",
            density === "compact"
              ? "min-h-[72px] gap-2"
              : "min-h-[188px] gap-5",
          )}
        >
          {bySec[section]?.map((match, index) => (
            <MatchCard
              key={match.id}
              match={match}
              onMatchClick={onMatchClick}
              density={density}
              innerRef={registerCard(`${section}:${index}`)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-max">
      {/* isolate로 자체 stacking context 생성 → svg(z-0)는 보드 위·카드(z-10) 아래에 안전히 깔린다. */}
      <div ref={containerRef} className="relative isolate min-w-max p-2 md:p-4">
        {/* 연결선 SVG (카드 뒤, 보드 위) */}
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          aria-hidden
        >
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

        {/* 조 구분 범례 — 행 라벨을 따로 두지 않고 여기서 색만 알려준다 */}
        <div className="relative z-10 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent-gold">
            <Trophy className="h-3.5 w-3.5" />
            승자조
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent-danger">
            <ShieldX className="h-3.5 w-3.5" />
            패자조
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <span className="h-px w-5 bg-accent-primary/60" />
            승자 진출
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <span
              className="h-px w-5"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, currentColor 0 5px, transparent 5px 9px)",
              }}
            />
            패자 하강
          </span>
        </div>

        {/*
          승자조는 윗줄, 패자조는 아랫줄, 그랜드파이널은 마지막 열에서 두 줄에
          걸친다. 열이 곧 라운드라 "이 라운드에서 진 팀이 어디로 가는지"가
          같은 세로선 위에서 읽힌다.
        */}
        <div
          className="relative z-10 grid"
          style={{
            gridTemplateColumns: `repeat(${layout.columnCount}, max-content)`,
            columnGap: density === "compact" ? 20 : 48,
            rowGap: density === "compact" ? 20 : 40,
          }}
        >
          {layout.cells.map((cell) => (
            <div
              key={cell.section}
              style={
                cell.row === "gf"
                  ? {
                      gridColumn: cell.column + 1,
                      gridRow: "1 / span 2",
                      alignSelf: "center",
                    }
                  : {
                      gridColumn: cell.column + 1,
                      gridRow: cell.row === "wb" ? 1 : 2,
                    }
              }
            >
              {renderSection(cell.section, {
                tree: cell.tree,
                index: cell.column,
                count: layout.columnCount,
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 화면 맞춤이 줄일 수 있는 하한 — 이보다 작으면 팀명이 안 읽힌다. */
const MIN_ZOOM = 0.45;

// --- Main BracketView ---
export function BracketView({
  matches,
  rounds,
  onMatchClick,
}: BracketViewProps) {
  const isDoubleElim = matches.some(
    (m) => m.bracketSection?.startsWith("LB") || m.bracketSection === "GF",
  );

  // 대진이 클수록 상세 카드로는 한 화면에 안 들어온다. 8팀 더블 엘리미네이션은
  // 상세 기준 세로 2500px 이라 처음부터 컴팩트로 연다.
  const isLarge = isDoubleElim || matches.length > 4;
  const [density, setDensity] = React.useState<Density>(
    isLarge ? "compact" : "detailed",
  );
  const [zoom, setZoom] = React.useState(1);

  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  // 축소하면 transform 이 레이아웃 높이를 줄여주지 않아 아래에 빈 공간이 남는다.
  // 실제 높이를 재서 래퍼에 배율을 곱한 높이를 준다.
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setContentHeight(content.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
    // ResizeObserver 가 내용 변화까지 잡아주므로 matches 는 의존성에 넣지 않는다
    // (매 렌더 새 배열이라 넣으면 구독만 계속 다시 만든다).
  }, [density]);

  /**
   * 대진 전체가 보이도록 배율을 맞춘다.
   *
   * 컴팩트로 줄여도 팀이 많으면 가로가 남는다. 그때는 축소가 유일한 수단이라
   * 폭 비율로 배율을 정하고, 이름이 안 읽힐 만큼은 줄이지 않는다(MIN_ZOOM).
   */
  const fitToScreen = React.useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    // 지금 배율을 걷어낸 실제 콘텐츠 폭
    const naturalWidth = content.scrollWidth;
    if (naturalWidth <= 0) return;
    const next = (viewport.clientWidth - 8) / naturalWidth;
    setZoom(Math.max(MIN_ZOOM, Math.min(1, next)));
  }, []);

  // 밀도를 바꾸면 콘텐츠 폭이 달라지므로 배율을 되돌린다.
  React.useEffect(() => setZoom(1), [density]);

  const inner = isDoubleElim ? (
    <DoubleEliminationBracket
      matches={matches}
      onMatchClick={onMatchClick}
      density={density}
    />
  ) : (
    <StandardBracket
      matches={matches}
      rounds={rounds}
      onMatchClick={onMatchClick}
      density={density}
    />
  );

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2 px-2">
        <div className="flex items-center rounded-lg border border-bg-tertiary bg-bg-secondary p-0.5">
          {(["compact", "detailed"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDensity(value)}
              title={
                value === "compact"
                  ? "한 화면에 담기 — 팀명과 점수만 표시"
                  : "자세히 보기 — 매치 정보를 모두 표시"
              }
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                density === value
                  ? "bg-bg-tertiary text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              {value === "compact" ? "간략히" : "자세히"}
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-lg border border-bg-tertiary bg-bg-secondary p-0.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
            disabled={zoom <= MIN_ZOOM}
            title="축소"
            className="rounded-md px-2 py-1 text-xs font-bold text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            onClick={fitToScreen}
            title="전체가 보이도록 배율을 맞춥니다"
            className="min-w-[52px] rounded-md px-2 py-1 text-xs font-bold tabular-nums text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          >
            {zoom === 1 ? "맞춤" : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1, z + 0.1))}
            disabled={zoom >= 1}
            title="확대"
            className="rounded-md px-2 py-1 text-xs font-bold text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/*
        축소는 transform 으로 한다 — 레이아웃을 다시 계산하지 않으므로 연결선
        측정값이 흔들리지 않는다. 대신 축소한 만큼 아래에 빈 공간이 남으므로
        래퍼 높이를 배율에 맞춰 줄인다.
      */}
      <div ref={viewportRef} className="w-full overflow-x-auto">
        <div
          style={
            zoom === 1 || contentHeight === 0
              ? undefined
              : { height: contentHeight * zoom }
          }
        >
          <div
            ref={contentRef}
            style={
              zoom === 1
                ? undefined
                : { transform: `scale(${zoom})`, transformOrigin: "top left" }
            }
          >
            {inner}
          </div>
        </div>
      </div>
    </div>
  );
}
