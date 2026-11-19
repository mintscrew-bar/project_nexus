"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Check, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { medalApi, type AttendanceStatus } from "@/lib/api-client";
import { MEDAL_LABEL } from "./catalog";

/** 출석 현황 쿼리 키 — 메달 칩(점 표시)과 이 카드가 같이 본다 */
export const ATTENDANCE_QUERY_KEY = ["medals", "attendance"] as const;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 출석 체크 카드 — 메달 칩을 누르면 맨 위에 뜬다.
 *
 * - 하루 한 번 「출석하고 +10 받기」. 7일 연속마다 보너스 +50(그날이면 버튼에 같이 적는다).
 * - 7칸 진행 막대로 다음 보너스까지 얼마나 남았는지, 작은 달력으로 이번 달 출석한 날을 보여 준다.
 * - 받으면 잔액 쿼리를 무효화해 칩 위로 「+N」이 떠오른다(메달 칩의 받은 메달 알림을 그대로 쓴다).
 */
export function AttendanceCard({
  status,
  onGranted,
}: {
  status: AttendanceStatus;
  /** 받은 직후(잔액 다시 읽기 등) */
  onGranted?: () => void;
}) {
  const queryClient = useQueryClient();
  // 방금 받은 양 — 버튼 자리에 잠깐 보여 준다
  const [justGot, setJustGot] = useState<number | null>(null);
  const checkIn = useMutation({
    mutationFn: medalApi.checkIn,
    onSuccess: (res) => {
      queryClient.setQueryData(ATTENDANCE_QUERY_KEY, res);
      if (res.granted + res.bonus > 0) setJustGot(res.granted + res.bonus);
      onGranted?.();
    },
  });

  const {
    checkedToday,
    streak,
    streakEvery,
    streakBonus,
    reward,
    daysToBonus,
    today,
  } = status;
  // 7칸 진행 — 이번 묶음에서 채운 칸 수. 보너스 날을 막 채웠으면 7칸 모두
  const filled =
    streak === 0
      ? 0
      : streak % streakEvery === 0 && checkedToday
        ? streakEvery
        : streak % streakEvery;
  const bonusToday = !checkedToday && daysToBonus === 0;

  // 이번 달 작은 달력
  const [y, m] = today.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const attended = new Set(status.monthDays);
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];
  const dayKey = (d: number) =>
    `${today.slice(0, 7)}-${String(d).padStart(2, "0")}`;

  return (
    <div className="rounded-lg bg-bg-tertiary/50 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
          <CalendarCheck className="h-4 w-4 text-amber-300" />
          출석 체크
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-text-secondary">
          <Flame
            className={cn(
              "h-3.5 w-3.5",
              streak > 0 ? "text-orange-400" : "text-text-tertiary",
            )}
          />
          연속 {streak}일
        </span>
      </div>

      {/* 다음 보너스까지 7칸 */}
      <div
        className="mt-2 flex gap-1"
        aria-label={`${streakEvery}일 중 ${filled}일`}
      >
        {Array.from({ length: streakEvery }, (_, i) => {
          const done = i < filled;
          const isBonus = i === streakEvery - 1;
          return (
            <div
              key={i}
              className={cn(
                "flex h-6 flex-1 items-center justify-center rounded text-[10px] font-black",
                done
                  ? "bg-amber-400/80 text-black"
                  : "bg-bg-primary/60 text-text-tertiary",
              )}
            >
              {done ? (
                <Check className="h-3 w-3" />
              ) : isBonus ? (
                `+${streakBonus}`
              ) : (
                i + 1
              )}
            </div>
          );
        })}
      </div>

      {checkedToday ? (
        <div className="mt-2 flex h-9 items-center justify-center rounded-lg bg-bg-primary/50 text-xs font-bold text-text-secondary">
          {justGot
            ? `+${justGot} ${MEDAL_LABEL} 받았어요!`
            : `오늘 출석 완료 · 보너스까지 ${daysToBonus === 0 ? streakEvery : daysToBonus}일`}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => checkIn.mutate()}
          disabled={checkIn.isPending}
          className="mt-2 flex h-9 w-full items-center justify-center rounded-lg bg-amber-400 text-sm font-black text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {checkIn.isPending
            ? "받는 중…"
            : bonusToday
              ? `출석하고 +${reward + streakBonus} 받기 (${streakEvery}일 보너스!)`
              : `출석하고 +${reward} 받기`}
        </button>
      )}
      {checkIn.isError && (
        <p className="mt-1 text-center text-[11px] text-accent-danger">
          출석하지 못했어요. 잠시 뒤 다시 눌러 주세요.
        </p>
      )}

      {/* 이번 달 */}
      <div className="mt-3 grid grid-cols-7 gap-0.5 text-center text-[10px]">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-text-tertiary">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <span
              key={d}
              className={cn(
                "flex h-5 items-center justify-center rounded tabular-nums",
                attended.has(dayKey(d))
                  ? "bg-amber-400/25 font-bold text-amber-200"
                  : "text-text-tertiary",
                dayKey(d) === today && "ring-1 ring-amber-300/70",
              )}
            >
              {d}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
