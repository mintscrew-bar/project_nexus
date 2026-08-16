"use client";

import { useEffect, useRef, useState } from "react";
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
}

interface ReviewTeam {
  id: string;
  name: string;
  color?: string | null;
  balanceTotal: number | null;
  members: ReviewMember[];
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
  // 교체는 두 번 눌러 완성한다. 첫 번째 선택을 여기 담아 둔다.
  // ─── 드래그 교체 ───
  //
  // 실수로 밸런스가 바뀌면 안 되므로 "집는" 동작부터 분명해야 한다.
  // 이동 거리로 판정하면 목록을 스크롤하려다 집히거나, 손이 살짝 밀린 것을
  // 드래그로 오인한다. 그래서 **누르고 있어야** 집히도록 했다.
  //   - HOLD_TO_PICK_MS 동안 누르고 있어야 집힌다 (짧은 클릭·탭은 무시)
  //   - 집히기 전에 움직이면 스크롤로 보고 취소한다
  //   - 대상 행의 세로 중앙 영역 안에서 놓아야 교체 (가장자리는 무효)
  //   - ESC·포인터 취소·유효하지 않은 위치는 전부 취소
  const HOLD_TO_PICK_MS = 250;
  const HOLD_MOVE_TOLERANCE_PX = 10;
  const DROP_SAFE_RATIO = 0.6; // 행 높이의 가운데 60%만 유효

  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; userId: string } | null>(
    null,
  );
  const draggingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const resolveDropTarget = (clientX: number, clientY: number) => {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-swap-user]");
    if (!element) return null;

    // 행 경계 근처는 어느 쪽을 노렸는지 모호하다. 가운데만 유효로 본다.
    const rect = element.getBoundingClientRect();
    const margin = (rect.height * (1 - DROP_SAFE_RATIO)) / 2;
    if (clientY < rect.top + margin || clientY > rect.bottom - margin) {
      return null;
    }
    return element.dataset.swapUser ?? null;
  };

  const cancelDrag = () => {
    clearHoldTimer();
    dragOrigin.current = null;
    draggingRef.current = false;
    setSwapFrom(null);
    setDropTarget(null);
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    userId: string,
  ) => {
    if (busy !== null) return;
    dragOrigin.current = { x: event.clientX, y: event.clientY, userId };
    event.currentTarget.setPointerCapture(event.pointerId);

    // 누르고 있는 동안만 집힌다. 짧게 누르면 아무 일도 일어나지 않는다.
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      if (!dragOrigin.current) return;
      draggingRef.current = true;
      setSwapFrom(dragOrigin.current.userId);
    }, HOLD_TO_PICK_MS);
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
      return;
    }

    const target = resolveDropTarget(event.clientX, event.clientY);
    setSwapFrom(null);
    setDropTarget(null);

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
  const previewSpread = (() => {
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
    // 같은 팀이면 라인만 바뀌어 합계가 그대로다.
    if (from.team.id === to.team.id) return null;

    const totals = teams.map((team) => {
      if (team.balanceTotal === null) return null;
      if (team.id === from.team.id) {
        return team.balanceTotal - from.member.score! + to.member.score!;
      }
      if (team.id === to.team.id) {
        return team.balanceTotal - to.member.score! + from.member.score!;
      }
      return team.balanceTotal;
    });

    if (totals.some((total) => total === null)) return null;
    const values = totals as number[];
    return Math.max(...values) - Math.min(...values);
  })();

  // 언마운트 시 대기 중인 집기 타이머를 정리한다.
  useEffect(() => clearHoldTimer, []);

  // 드래그 도중 ESC 로 취소할 수 있게 한다.
  useEffect(() => {
    if (!swapFrom) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [swapFrom]);

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
              ? "이름을 꾹 눌러 옮기면 교체되고, 자물쇠로 고정한 뒤 다시 돌릴 수 있습니다."
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
        {teams.map((team) => (
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
                <span className="flex-shrink-0 text-xs font-black tabular-nums text-text-secondary">
                  {team.balanceTotal.toFixed(1)}
                </span>
              )}
            </div>

            <ul className="divide-y divide-bg-tertiary/60">
              {team.members.map((member) => {
                const isPinned = pinned.has(member.userId);
                return (
                  <li
                    key={member.userId}
                    className="flex items-center gap-2 px-3 py-1.5"
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
                      <span
                        // 드롭 판정에 쓰는 표식. elementFromPoint 로 이 속성을 찾는다.
                        data-swap-user={member.userId}
                        onPointerDown={(event) =>
                          handlePointerDown(event, member.userId)
                        }
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={cancelDrag}
                        title="꾹 눌러 집은 뒤 바꿀 인원 위에 놓으세요"
                        // touch-pan-y: 세로 스크롤은 그대로 통과시킨다. 이름이 행에서 가장 넓은
                        // 영역이라 여기서 스크롤이 막히면 모바일에서 목록을 못 넘긴다.
                        // 스크롤 의도는 집기 전 이동으로 감지해 취소한다.
                        className={`min-w-0 flex-1 cursor-grab touch-pan-y select-none truncate rounded px-1 py-0.5 text-xs transition-colors active:cursor-grabbing ${
                          swapFrom === member.userId
                            ? "bg-accent-warning/20 text-accent-warning"
                            : dropTarget === member.userId
                              ? "bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary/40"
                              : "text-text-primary hover:bg-bg-tertiary"
                        }`}
                      >
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
        ))}
      </div>

      {isHost && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-tertiary">
            {swapFrom ? (
              <span className="inline-flex items-center gap-1 text-accent-warning">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {dropTarget
                  ? "여기에 놓으면 교체됩니다"
                  : "바꿀 인원 위로 끌어다 놓으세요 (ESC 취소)"}
                {previewSpread !== null && spread !== null && (
                  <span className="ml-1 font-bold tabular-nums">
                    · 점수 차 {spread.toFixed(1)} → {previewSpread.toFixed(1)}
                  </span>
                )}
              </span>
            ) : pinned.size > 0 ? (
              `${pinned.size}명 고정 — 나머지만 다시 배치됩니다`
            ) : (
              "이름을 꾹 눌러 집은 뒤 옮기면 교체됩니다"
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={busy !== null || undoDepth === 0}
              title={
                undoDepth === 0
                  ? "되감을 이전 편성이 없습니다"
                  : `직전 편성으로 되감기 (${undoDepth}단계 남음)`
              }
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-bg-elevated px-3 text-sm font-bold text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"
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
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-bg-elevated bg-bg-tertiary px-4 text-sm font-bold text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-50"
            >
              <Dices className="h-4 w-4" />
              {busy === "reroll" ? "편성 중..." : "다시 돌리기"}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy !== null}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-accent-success px-5 text-sm font-bold text-white transition-colors hover:bg-accent-success/90 disabled:opacity-50"
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
