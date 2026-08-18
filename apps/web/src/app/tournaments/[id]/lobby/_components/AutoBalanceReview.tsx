"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dices,
  Lock,
  Unlock,
  Check,
  ArrowLeftRight,
  RotateCcw,
} from "lucide-react";
import { PositionIcon, POSITION_LABELS } from "./icons";

interface ReviewMember {
  userId: string;
  username: string;
  assignedRole: string | null;
  /** 배정된 라인 기준 밸런스 점수 */
  score: number | null;
  /** 교체될 라인 기준 예상 점수를 계산하기 위한 전체 라인 점수 */
  scoresByRole: Record<string, number> | null;
}

interface ReviewTeam {
  id: string;
  name: string;
  color?: string | null;
  balanceTotal: number | null;
  members: ReviewMember[];
}

/** 라인 칸을 고정된 순서로 둔다 — 교체해도 사람만 바뀌고 행 위치는 그대로 유지된다. */
const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

function sortByRoleSlot(members: ReviewMember[]): ReviewMember[] {
  return [...members].sort((a, b) => {
    const indexA = a.assignedRole ? ROLE_ORDER.indexOf(a.assignedRole) : -1;
    const indexB = b.assignedRole ? ROLE_ORDER.indexOf(b.assignedRole) : -1;
    return (
      (indexA === -1 ? ROLE_ORDER.length : indexA) -
      (indexB === -1 ? ROLE_ORDER.length : indexB)
    );
  });
}

/** 특정 라인으로 옮겼을 때 해당 인원의 예상 점수 */
function scoreAtRole(member: ReviewMember, role: string | null) {
  if (!role || !member.scoresByRole) return null;
  const value = member.scoresByRole[role];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface AutoBalanceReviewProps {
  teams: ReviewTeam[];
  isHost: boolean;
  onReroll: (pinnedUserIds: string[]) => Promise<void>;
  onConfirm: () => Promise<void>;
  onSwap: (userIdA: string, userIdB: string) => Promise<void>;
  onUndo: () => Promise<void>;
  /** 남은 되감기 횟수 — 0이면 버튼 비활성 */
  undoDepth: number;
  /** 다시 돌린 횟수 — 참가자 전원에게 보인다 */
  rerollCount: number;
}

/**
 * 자동 밸런스 편성 확인 화면.
 *
 * 편성은 팀 점수 차와 라인 선호 페널티를 함께 최소화하지만 완벽할 수는 없다.
 * 방장이 결과를 보고 마음에 드는 인원만 고정한 뒤 나머지를 다시 돌리거나,
 * 그대로 확정해 대진표로 넘어간다.
 */
export function AutoBalanceReview({
  teams,
  isHost,
  onReroll,
  onConfirm,
  onSwap,
  onUndo,
  undoDepth,
  rerollCount,
}: AutoBalanceReviewProps) {
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<
    "reroll" | "confirm" | "swap" | "undo" | null
  >(null);
  // ─── 드래그 교체 ───
  //
  // 마우스는 누르는 즉시, 터치는 짧게 누른 뒤 카드를 집는다.
  //   - 이름뿐 아니라 선수 행 전체가 드래그·드롭 영역이다
  //   - 터치에서 집히기 전에 크게 움직이면 스크롤로 보고 취소한다
  //   - 대상 행 어느 위치에 놓아도 교체된다
  //   - ESC·포인터 취소·유효하지 않은 위치는 전부 취소
  const TOUCH_HOLD_TO_PICK_MS = 140;
  const HOLD_MOVE_TOLERANCE_PX = 14;

  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; userId: string } | null>(
    null,
  );
  const draggingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const resolveDropTarget = (clientX: number, clientY: number) => {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-swap-user]");
    if (!element) return null;

    return element.dataset.swapUser ?? null;
  };

  const cancelDrag = useCallback(() => {
    clearHoldTimer();
    dragOrigin.current = null;
    draggingRef.current = false;
    setSwapFrom(null);
    setDropTarget(null);
    setDragPosition(null);
  }, [clearHoldTimer]);

  const beginDrag = (origin: { x: number; y: number; userId: string }) => {
    draggingRef.current = true;
    setSwapFrom(origin.userId);
    setDragPosition({ x: origin.x, y: origin.y });
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    userId: string,
  ) => {
    if (busy !== null || event.button !== 0) return;
    dragOrigin.current = { x: event.clientX, y: event.clientY, userId };
    event.currentTarget.setPointerCapture(event.pointerId);

    clearHoldTimer();
    if (event.pointerType === "mouse") {
      event.preventDefault();
      beginDrag(dragOrigin.current);
      return;
    }

    // 터치는 스크롤과 충돌하지 않도록 짧은 홀드 뒤 집는다.
    holdTimerRef.current = setTimeout(() => {
      if (!dragOrigin.current) return;
      beginDrag(dragOrigin.current);
    }, TOUCH_HOLD_TO_PICK_MS);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;

    if (!draggingRef.current) {
      // 아직 집히기 전. 이 시점의 움직임은 스크롤 의도로 보고 집기를 취소한다.
      const moved = Math.hypot(
        event.clientX - origin.x,
        event.clientY - origin.y,
      );
      if (moved > HOLD_MOVE_TOLERANCE_PX) cancelDrag();
      return;
    }

    event.preventDefault();
    setDragPosition({ x: event.clientX, y: event.clientY });
    const target = resolveDropTarget(event.clientX, event.clientY);
    setDropTarget(target && target !== origin.userId ? target : null);
  };

  const handlePointerUp = async (event: React.PointerEvent<HTMLElement>) => {
    clearHoldTimer();
    const origin = dragOrigin.current;
    const wasDragging = draggingRef.current;
    dragOrigin.current = null;
    draggingRef.current = false;

    if (!origin || !wasDragging) {
      setSwapFrom(null);
      setDropTarget(null);
      setDragPosition(null);
      return;
    }

    const target = resolveDropTarget(event.clientX, event.clientY);
    setSwapFrom(null);
    setDropTarget(null);
    setDragPosition(null);

    // 유효한 대상 위에서 놓았을 때만 교체한다.
    if (!target || target === origin.userId) return;

    setBusy("swap");
    try {
      await onSwap(origin.userId, target);
    } finally {
      setBusy(null);
    }
  };

  const togglePin = (userId: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const totals = teams
    .map((team) => team.balanceTotal)
    .filter((total): total is number => typeof total === "number");
  // 팀 간 격차가 편성 품질의 핵심 지표라 가장 크게 보여준다.
  const spread =
    totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : null;

  /**
   * 교체 결과 미리보기.
   *
   * 서버를 다녀오지 않고 계산한다 — 라인별 점수를 이미 갖고 있으므로, 두 자리를
   * 바꿨을 때의 팀 합계 변화를 그대로 구할 수 있다. 실수로 밸런스를 크게
   * 망가뜨리는 걸 누르기 전에 막는 것이 목적이다.
   */
  const swapPreview = (() => {
    if (!swapFrom || !dropTarget || swapFrom === dropTarget) return null;

    const locate = (userId: string) => {
      for (const team of teams) {
        const member = team.members.find((m) => m.userId === userId);
        if (member) return { team, member };
      }
      return null;
    };

    const from = locate(swapFrom);
    const to = locate(dropTarget);
    if (
      !from ||
      !to ||
      from.member.score === null ||
      to.member.score === null
    ) {
      return null;
    }

    const fromNextScore = scoreAtRole(from.member, to.member.assignedRole);
    const toNextScore = scoreAtRole(to.member, from.member.assignedRole);
    if (fromNextScore === null || toNextScore === null) return null;

    const projectedTotals: Record<string, number> = {};
    for (const team of teams) {
      if (team.balanceTotal === null) return null;
      projectedTotals[team.id] = team.balanceTotal;
    }

    if (from.team.id === to.team.id) {
      projectedTotals[from.team.id] =
        projectedTotals[from.team.id] -
        from.member.score -
        to.member.score +
        fromNextScore +
        toNextScore;
    } else {
      projectedTotals[from.team.id] =
        projectedTotals[from.team.id] - from.member.score + toNextScore;
      projectedTotals[to.team.id] =
        projectedTotals[to.team.id] - to.member.score + fromNextScore;
    }

    const values = Object.values(projectedTotals);
    return {
      spread: Math.max(...values) - Math.min(...values),
      totals: projectedTotals,
    };
  })();
  const draggedMember = swapFrom
    ? teams
        .flatMap((team) => team.members)
        .find((member) => member.userId === swapFrom)
    : null;

  // 잡고 있는 카드가 다른 라인 위로 올라가면, 그 라인 기준 예상 점수로 바꿔 보여준다.
  const dropTargetMember = dropTarget
    ? teams.flatMap((team) => team.members).find((m) => m.userId === dropTarget)
    : null;
  const draggedPreview = (() => {
    if (!draggedMember) return null;
    if (!dropTargetMember) {
      return { role: draggedMember.assignedRole, score: draggedMember.score };
    }
    const projected = scoreAtRole(draggedMember, dropTargetMember.assignedRole);
    return {
      role: dropTargetMember.assignedRole,
      score: projected ?? draggedMember.score,
    };
  })();

  // 언마운트 시 대기 중인 집기 타이머를 정리한다.
  useEffect(() => clearHoldTimer, [clearHoldTimer]);

  // 드래그 도중 ESC 로 취소할 수 있게 한다.
  useEffect(() => {
    if (!swapFrom) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [swapFrom, cancelDrag]);

  const handleReroll = async () => {
    setBusy("reroll");
    try {
      await onReroll([...pinned]);
    } finally {
      setBusy(null);
    }
  };

  const handleUndo = async () => {
    setBusy("undo");
    try {
      await onUndo();
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = async () => {
    setBusy("confirm");
    try {
      await onConfirm();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-text-primary">
            자동 편성 결과 확인
          </h3>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {isHost
              ? "선수 카드를 끌어 교체하고, 자물쇠로 고정한 뒤 다시 돌릴 수 있습니다."
              : "방장이 편성을 확정하면 대진표로 넘어갑니다."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/*
            재편성 횟수는 방장뿐 아니라 참가자 전원에게 보인다.
            횟수를 제한하면 정당한 재편성까지 막히므로, 대신 드러내 투명하게 한다.
          */}
          {rerollCount > 0 && (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                다시 돌림
              </p>
              <p className="text-lg font-black tabular-nums text-text-secondary">
                {rerollCount}회
              </p>
            </div>
          )}
          {spread !== null && (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                팀 점수 차
              </p>
              <p
                className={`text-lg font-black tabular-nums ${
                  spread <= 2
                    ? "text-accent-success"
                    : spread <= 5
                      ? "text-text-primary"
                      : "text-accent-warning"
                }`}
              >
                {spread.toFixed(1)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((team) => {
          const projectedTotal = swapPreview?.totals[team.id] ?? null;
          return (
            <div
              key={team.id}
              className="overflow-hidden rounded-lg border border-bg-tertiary bg-bg-primary"
            >
              <div
                className="flex items-center justify-between gap-2 px-3 py-2"
                style={{ backgroundColor: `${team.color ?? "#667eea"}1a` }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: team.color ?? "#667eea" }}
                  />
                  <span className="truncate text-xs font-bold text-text-primary">
                    {team.name}
                  </span>
                </span>
                {team.balanceTotal !== null && (
                  <span className="flex flex-shrink-0 items-center gap-1.5 text-xs font-black tabular-nums">
                    <span
                      className={
                        projectedTotal !== null
                          ? "text-text-tertiary line-through"
                          : "text-text-secondary"
                      }
                    >
                      {team.balanceTotal.toFixed(1)}
                    </span>
                    {projectedTotal !== null && (
                      <>
                        <span className="text-text-muted">→</span>
                        <span className="text-accent-primary">
                          {projectedTotal.toFixed(1)}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>

              <ul className="divide-y divide-bg-tertiary/60">
                {sortByRoleSlot(team.members).map((member) => {
                  const isPinned = pinned.has(member.userId);
                  return (
                    <li
                      key={member.userId}
                      data-swap-user={isHost ? member.userId : undefined}
                      onPointerDown={
                        isHost
                          ? (event) => handlePointerDown(event, member.userId)
                          : undefined
                      }
                      onPointerMove={isHost ? handlePointerMove : undefined}
                      onPointerUp={isHost ? handlePointerUp : undefined}
                      onPointerCancel={isHost ? cancelDrag : undefined}
                      title={
                        isHost
                          ? "선수 카드를 끌어 바꿀 인원 위에 놓으세요"
                          : undefined
                      }
                      className={`relative flex items-center gap-2 px-3 py-2 transition-[opacity,transform,box-shadow,background-color] duration-150 ${
                        isHost
                          ? `select-none ${swapFrom ? "touch-none" : "touch-pan-y"} cursor-grab active:cursor-grabbing`
                          : ""
                      } ${
                        swapFrom === member.userId
                          ? "z-10 scale-[1.015] bg-accent-warning/12 opacity-45 shadow-lg ring-1 ring-accent-warning/50"
                          : dropTarget === member.userId
                            ? "scale-[0.985] bg-accent-primary/18 opacity-60 ring-2 ring-inset ring-accent-primary"
                            : isHost
                              ? "hover:bg-bg-tertiary/70"
                              : ""
                      }`}
                    >
                      {member.assignedRole ? (
                        <PositionIcon
                          position={member.assignedRole}
                          className="!h-4 !w-4 flex-shrink-0"
                        />
                      ) : (
                        <span className="h-4 w-4 flex-shrink-0" />
                      )}
                      <span className="w-7 flex-shrink-0 text-[10px] text-text-tertiary">
                        {member.assignedRole
                          ? (POSITION_LABELS[member.assignedRole] ??
                            member.assignedRole)
                          : "-"}
                      </span>
                      {isHost ? (
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text-primary">
                          {member.username}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                          {member.username}
                        </span>
                      )}
                      <span className="w-10 flex-shrink-0 text-right text-xs font-bold tabular-nums text-text-secondary">
                        {member.score !== null ? member.score.toFixed(1) : "–"}
                      </span>
                      {isHost && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => togglePin(member.userId)}
                          title={
                            isPinned
                              ? "고정 해제 — 다시 돌릴 때 자리가 바뀔 수 있습니다"
                              : "이 자리 고정 — 다시 돌려도 팀과 라인이 유지됩니다"
                          }
                          className={`flex-shrink-0 rounded p-1 transition-colors ${
                            isPinned
                              ? "bg-accent-primary/20 text-accent-primary"
                              : "text-text-muted hover:bg-bg-tertiary hover:text-text-secondary"
                          }`}
                        >
                          {isPinned ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {dragPosition && draggedMember && draggedPreview && (
        <div
          className="pointer-events-none fixed z-[100] flex min-w-48 items-center gap-3 rounded-lg border border-accent-warning/70 bg-bg-elevated/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-sm"
          style={{
            left: dragPosition.x,
            top: dragPosition.y,
            transform: "translate(-50%, calc(-100% - 14px)) rotate(-1deg)",
          }}
        >
          <ArrowLeftRight className="h-4 w-4 flex-shrink-0 text-accent-warning" />
          {draggedPreview.role ? (
            <PositionIcon
              position={draggedPreview.role}
              className="!h-4 !w-4 flex-shrink-0"
            />
          ) : null}
          <span className="max-w-44 truncate font-black text-text-primary">
            {draggedMember.username}
          </span>
          <span
            className={`font-black tabular-nums ${
              dropTargetMember ? "text-accent-primary" : "text-text-secondary"
            }`}
          >
            {draggedPreview.score !== null
              ? draggedPreview.score.toFixed(1)
              : "–"}
          </span>
        </div>
      )}

      {swapPreview && spread !== null && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-4 py-3">
          <span className="text-xs font-bold text-text-secondary">
            교체 후 예상 팀 점수 차
          </span>
          <span className="flex items-center gap-2 text-lg font-black tabular-nums">
            <span className="text-text-tertiary line-through">
              {spread.toFixed(1)}
            </span>
            <span className="text-text-muted">→</span>
            <span
              className={
                swapPreview.spread <= spread
                  ? "text-accent-success"
                  : "text-accent-warning"
              }
            >
              {swapPreview.spread.toFixed(1)}
            </span>
          </span>
        </div>
      )}

      {isHost && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-tertiary">
            {swapFrom ? (
              <span className="inline-flex items-center gap-1 text-accent-warning">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {dropTarget
                  ? "여기에 놓으면 교체됩니다"
                  : "바꿀 인원 위로 끌어다 놓으세요 (ESC 취소)"}
              </span>
            ) : pinned.size > 0 ? (
              `${pinned.size}명 고정 — 나머지만 다시 배치됩니다`
            ) : (
              "선수 카드를 끌어 다른 선수 위에 놓으면 교체됩니다"
            )}
          </p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={handleUndo}
              disabled={busy !== null || undoDepth === 0}
              title={
                undoDepth === 0
                  ? "되감을 이전 편성이 없습니다"
                  : `직전 편성으로 되감기 (${undoDepth}단계 남음)`
              }
              className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-bg-elevated px-3 text-sm font-bold text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              {busy === "undo" ? "되감는 중..." : "뒤로"}
              {undoDepth > 0 && (
                <span className="text-[10px] tabular-nums opacity-70">
                  {undoDepth}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleReroll}
              disabled={busy !== null}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-bg-elevated bg-bg-tertiary px-4 text-sm font-bold text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-50"
            >
              <Dices className="h-4 w-4" />
              {busy === "reroll" ? "편성 중..." : "다시 돌리기"}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy !== null}
              className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-success px-5 text-sm font-bold text-white transition-colors hover:bg-accent-success/90 disabled:opacity-50 sm:col-span-1"
            >
              <Check className="h-4 w-4" />
              {busy === "confirm" ? "확정 중..." : "확정하고 대진표로"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
