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
  /** 등록해 둔 주라인 — 편성 근거의 선호 충족 계산에 쓴다 */
  mainRole: string | null;
  /** 등록해 둔 부라인 */
  subRole: string | null;
  /** 라인별 티어를 등록해 둔 라인들 — 주·부라인 다음가는 약한 선호 */
  registeredRoles: string[];
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

/**
 * 라인 선호 페널티 — 서버(room.service.ts getRolePreferencePenalty)와 같은 값이다.
 * 추천 교체가 "점수는 맞지만 다들 비선호 라인" 같은 결과를 밀지 않도록 쓴다.
 */
function rolePenalty(member: ReviewMember, role: string | null): number {
  if (!role) return 4;
  if (member.mainRole === role) return 0;
  if (member.subRole === role) return 0.75;
  if (member.registeredRoles.includes(role)) return 1.25;
  if (!member.mainRole && !member.subRole) return 1.5;
  return 4;
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

  /**
   * 편성 근거 ① 추천 교체.
   *
   * 지금 배치에서 두 사람을 맞바꿨을 때 팀 점수 차가 얼마나 줄어드는지를
   * 모든 짝에 대해 계산해 상위 3개만 보여준다. 40인(8팀)이라도 짝은 780개,
   * 짝마다 팀 합계 갱신 두 번이라 렌더마다 돌려도 부담이 없다.
   *
   * 점수만 보고 밀면 다들 비선호 라인으로 가버리므로, 선호 페널티 변화도
   * 같이 계산해 순위에 반영하고 화면에도 함께 적는다.
   */
  const swapSuggestions = (() => {
    if (spread === null) return [];

    const entries: { team: ReviewTeam; member: ReviewMember }[] = [];
    const baseTotals: Record<string, number> = {};
    for (const team of teams) {
      // 한 팀이라도 합계를 못 읽으면 비교 자체가 성립하지 않는다.
      if (team.balanceTotal === null) return [];
      baseTotals[team.id] = team.balanceTotal;
      for (const member of team.members) {
        if (member.assignedRole && member.score !== null) {
          entries.push({ team, member });
        }
      }
    }

    const found: {
      key: string;
      from: { team: ReviewTeam; member: ReviewMember };
      to: { team: ReviewTeam; member: ReviewMember };
      fromRole: string;
      toRole: string;
      nextSpread: number;
      gain: number;
      preferenceGain: number;
    }[] = [];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const from = entries[i];
        const to = entries[j];
        const fromRole = from.member.assignedRole;
        const toRole = to.member.assignedRole;
        const fromScore = from.member.score;
        const toScore = to.member.score;
        if (!fromRole || !toRole || fromScore === null || toScore === null) {
          continue;
        }
        // 같은 팀·같은 라인이면 바꿔도 달라지는 게 없다.
        if (from.team.id === to.team.id && fromRole === toRole) continue;

        const fromNext = scoreAtRole(from.member, toRole);
        const toNext = scoreAtRole(to.member, fromRole);
        if (fromNext === null || toNext === null) continue;

        const totals = { ...baseTotals };
        if (from.team.id === to.team.id) {
          totals[from.team.id] += fromNext + toNext - fromScore - toScore;
        } else {
          totals[from.team.id] += toNext - fromScore;
          totals[to.team.id] += fromNext - toScore;
        }

        const values = Object.values(totals);
        const nextSpread = Math.max(...values) - Math.min(...values);
        const gain = spread - nextSpread;
        const preferenceGain =
          rolePenalty(from.member, fromRole) +
          rolePenalty(to.member, toRole) -
          rolePenalty(from.member, toRole) -
          rolePenalty(to.member, fromRole);

        // 점수가 좋아지거나, 점수를 크게 해치지 않으면서 선호가 좋아지는 것만.
        const meaningful = gain > 0.05 || (preferenceGain > 0 && gain > -0.3);
        if (!meaningful) continue;

        found.push({
          key: `${from.member.userId}:${to.member.userId}`,
          from,
          to,
          fromRole,
          toRole,
          nextSpread,
          gain,
          preferenceGain,
        });
      }
    }

    found.sort(
      (a, b) =>
        b.gain + b.preferenceGain * 0.25 - (a.gain + a.preferenceGain * 0.25),
    );
    return found.slice(0, 3);
  })();

  /**
   * 편성 근거 ② 선호 라인 충족.
   *
   * 자동 편성은 팀 점수 차와 라인 선호를 함께 최소화하므로, 점수가 맞아도
   * 누군가는 비선호 라인에 간다. 몇 명이 어긋났는지와 누구인지를 같이 보여줘
   * 방장이 교체 대상을 바로 고르게 한다.
   */
  const preferenceSummary = (() => {
    let main = 0;
    let sub = 0;
    let unknown = 0;
    const offRole: { userId: string; username: string; role: string }[] = [];

    for (const team of teams) {
      for (const member of team.members) {
        if (!member.assignedRole) continue;
        if (!member.mainRole && !member.subRole) {
          // 주·부라인을 등록하지 않은 사람은 어긋난 것으로 세지 않는다.
          unknown += 1;
        } else if (member.mainRole === member.assignedRole) {
          main += 1;
        } else if (member.subRole === member.assignedRole) {
          sub += 1;
        } else {
          offRole.push({
            userId: member.userId,
            username: member.username,
            role: member.assignedRole,
          });
        }
      }
    }

    const total = main + sub + unknown + offRole.length;
    if (total === 0) return null;
    return { main, sub, unknown, offRole, total };
  })();

  // 팀 카드는 폭에 맞춰 자동으로 열을 만든다 — 2팀이면 2열로 넓게, 8팀이면
  // 4열 × 2행으로 접혀서 팀이 늘어도 세로로만 길어지지 않는다.
  const teamGridStyle = {
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
  };

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
    // 편성 확인 단계의 본 화면 — 로비 폭 전체를 쓰므로 카드 하나가 화면을 채운다.
    <div className="flex min-h-full flex-col rounded-xl border border-bg-tertiary bg-bg-secondary p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-text-primary">
            자동 편성 결과 확인
          </h3>
          <p className="mt-1 text-sm text-text-tertiary">
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
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                다시 돌림
              </p>
              <p className="text-2xl font-black tabular-nums text-text-secondary">
                {rerollCount}회
              </p>
            </div>
          )}
          {spread !== null && (
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                팀 점수 차
              </p>
              <p
                className={`text-2xl font-black tabular-nums ${
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

      <div
        className="grid flex-shrink-0 content-start gap-4"
        style={teamGridStyle}
      >
        {teams.map((team) => {
          const projectedTotal = swapPreview?.totals[team.id] ?? null;
          return (
            <div
              key={team.id}
              className="overflow-hidden rounded-lg border border-bg-tertiary bg-bg-primary"
            >
              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5"
                style={{ backgroundColor: `${team.color ?? "#667eea"}1a` }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: team.color ?? "#667eea" }}
                  />
                  <span className="truncate text-sm font-bold text-text-primary">
                    {team.name}
                  </span>
                </span>
                {team.balanceTotal !== null && (
                  <span className="flex flex-shrink-0 items-center gap-1.5 text-sm font-black tabular-nums">
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
                      className={`relative flex items-center gap-3 px-4 py-3 transition-[opacity,transform,box-shadow,background-color] duration-150 ${
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
                          className="!h-5 !w-5 flex-shrink-0"
                        />
                      ) : (
                        <span className="h-5 w-5 flex-shrink-0" />
                      )}
                      <span className="w-9 flex-shrink-0 text-xs text-text-tertiary">
                        {member.assignedRole
                          ? (POSITION_LABELS[member.assignedRole] ??
                            member.assignedRole)
                          : "-"}
                      </span>
                      {isHost ? (
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                          {member.username}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                          {member.username}
                        </span>
                      )}
                      <span className="w-14 flex-shrink-0 text-right text-sm font-bold tabular-nums text-text-secondary">
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
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Unlock className="h-4 w-4" />
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

      {/*
        편성 근거 — 팀 목록 아래 남는 높이를 채운다.
        행 수가 라인 수(5)로 고정이라 2팀이든 8팀(40인)이든 이 영역의 높이는
        같고, 팀이 많아 목록이 길어지면 자연스럽게 아래로 밀린다.
      */}
      {teams.length > 0 && (
        <div className="mt-4 flex flex-1 flex-col gap-3 rounded-lg border border-bg-tertiary bg-bg-primary/60 p-4">
          {/* ─── 추천 교체 ─── 행 수가 3개로 고정이라 팀이 늘어도 높이는 그대로다 */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h4 className="text-sm font-black text-text-primary">
                추천 교체
              </h4>
              <p className="text-xs text-text-tertiary">
                점수 차를 가장 많이 줄이는 조합
              </p>
            </div>

            {swapSuggestions.length === 0 ? (
              <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-bg-tertiary px-3 py-4 text-center text-xs text-text-tertiary">
                지금 배치보다 나아지는 교체가 없습니다 — 이대로 확정해도
                좋습니다
              </p>
            ) : (
              <ul className="flex flex-1 flex-col gap-1.5">
                {swapSuggestions.map((suggestion) => (
                  <li
                    key={suggestion.key}
                    className="flex min-h-11 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              suggestion.from.team.color ?? "#667eea",
                          }}
                        />
                        <PositionIcon
                          position={suggestion.fromRole}
                          className="!h-3.5 !w-3.5 flex-shrink-0"
                        />
                        <span className="truncate text-xs font-bold text-text-primary">
                          {suggestion.from.member.username}
                        </span>
                      </span>
                      <ArrowLeftRight className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              suggestion.to.team.color ?? "#667eea",
                          }}
                        />
                        <PositionIcon
                          position={suggestion.toRole}
                          className="!h-3.5 !w-3.5 flex-shrink-0"
                        />
                        <span className="truncate text-xs font-bold text-text-primary">
                          {suggestion.to.member.username}
                        </span>
                      </span>
                    </span>

                    <span
                      title="교체 후 팀 점수 차"
                      className="flex flex-shrink-0 items-center gap-1 text-xs font-black tabular-nums"
                    >
                      <span className="text-text-tertiary line-through">
                        {spread !== null ? spread.toFixed(1) : "–"}
                      </span>
                      <span className="text-text-muted">→</span>
                      <span
                        className={
                          suggestion.gain > 0
                            ? "text-accent-success"
                            : "text-text-secondary"
                        }
                      >
                        {suggestion.nextSpread.toFixed(1)}
                      </span>
                    </span>

                    {suggestion.preferenceGain !== 0 && (
                      <span
                        title="교체 후 선호 라인 만족도 변화"
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          suggestion.preferenceGain > 0
                            ? "bg-accent-success/15 text-accent-success"
                            : "bg-accent-warning/15 text-accent-warning"
                        }`}
                      >
                        선호 {suggestion.preferenceGain > 0 ? "개선" : "악화"}
                      </span>
                    )}

                    {isHost && (
                      <button
                        type="button"
                        onClick={async () => {
                          setBusy("swap");
                          try {
                            await onSwap(
                              suggestion.from.member.userId,
                              suggestion.to.member.userId,
                            );
                          } finally {
                            setBusy(null);
                          }
                        }}
                        disabled={busy !== null}
                        className="flex-shrink-0 rounded-md border border-bg-elevated bg-bg-tertiary px-2.5 py-1 text-xs font-bold text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-40"
                      >
                        교체
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {preferenceSummary && (
            <div className="flex flex-shrink-0 flex-col gap-2 border-t border-bg-tertiary pt-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  선호 라인 충족
                </span>
                <span className="text-xs font-bold tabular-nums text-text-secondary">
                  주라인 {preferenceSummary.main} · 부라인{" "}
                  {preferenceSummary.sub} · 비선호{" "}
                  {preferenceSummary.offRole.length}
                  {preferenceSummary.unknown > 0
                    ? ` · 미등록 ${preferenceSummary.unknown}`
                    : ""}
                  <span className="text-text-tertiary">
                    {" "}
                    / {preferenceSummary.total}명
                  </span>
                </span>
              </div>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-bg-tertiary">
                {[
                  {
                    key: "main",
                    label: "주라인",
                    value: preferenceSummary.main,
                    className: "bg-accent-success",
                  },
                  {
                    key: "sub",
                    label: "부라인",
                    value: preferenceSummary.sub,
                    className: "bg-accent-primary",
                  },
                  {
                    key: "off",
                    label: "비선호 라인",
                    value: preferenceSummary.offRole.length,
                    className: "bg-accent-warning",
                  },
                  {
                    key: "unknown",
                    label: "주·부라인 미등록",
                    value: preferenceSummary.unknown,
                    className: "bg-bg-elevated",
                  },
                ]
                  .filter((segment) => segment.value > 0)
                  .map((segment) => (
                    <span
                      key={segment.key}
                      title={`${segment.label} ${segment.value}명`}
                      className={segment.className}
                      style={{
                        width: `${(segment.value / preferenceSummary.total) * 100}%`,
                      }}
                    />
                  ))}
              </div>
              {/* 비선호 라인으로 간 인원 — 교체 후보를 바로 집게 이름을 드러낸다 */}
              {preferenceSummary.offRole.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {preferenceSummary.offRole.slice(0, 12).map((entry) => (
                    <span
                      key={entry.userId}
                      title={`${entry.username} — 선호하지 않는 라인에 배정됨`}
                      className="inline-flex max-w-40 items-center gap-1 rounded-full border border-accent-warning/30 bg-accent-warning/10 px-2 py-0.5 text-[11px] text-text-secondary"
                    >
                      <PositionIcon
                        position={entry.role}
                        className="!h-3 !w-3 flex-shrink-0"
                      />
                      <span className="truncate font-semibold">
                        {entry.username}
                      </span>
                    </span>
                  ))}
                  {preferenceSummary.offRole.length > 12 && (
                    <span className="inline-flex items-center px-1 text-[11px] font-semibold text-text-tertiary">
                      +{preferenceSummary.offRole.length - 12}명
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

      {/* 하단 고정 영역 — 카드가 화면을 채우므로 조작부는 항상 바닥에 붙인다 */}
      <div className="mt-auto pt-4">
        {swapPreview && spread !== null && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-4 py-3">
            <span className="text-sm font-bold text-text-secondary">
              교체 후 예상 팀 점수 차
            </span>
            <span className="flex items-center gap-2 text-xl font-black tabular-nums">
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-tertiary">
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
    </div>
  );
}
