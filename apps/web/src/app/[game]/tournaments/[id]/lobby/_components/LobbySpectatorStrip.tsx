"use client";

import Image from "next/image";
import { Crown, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 로비 데스크톱 아래쪽 "운영·관전" 띠.
 *
 * 선수가 아닌 사람을 역할로 나눠 보여준다.
 * - 운영자: 선수로 뛰지 않고 관전석으로 빠진 방장. 한 명뿐이라 초상화를 크게
 *   따로 보여준다. 방장이 선수로 뛰면 이 칸은 숨긴다 (참가자 카드 왕관으로 보인다).
 * - 관전자: 초상화와 이름을 함께.
 *
 * 내 자리 전환 버튼도 여기 한 곳에 모은다. 문구는 내 상태에 따라 바뀐다.
 *   일반 선수 → 「나도 관전하기」, 일반 관전자 → 「선수로 참여」,
 *   선수로 뛰는 방장 → 「운영자로 빠지기」, 운영자 → 「선수로 참여」.
 * 선수로 들어갈 빈 자리가 없으면 서버가 거절하므로 미리 「빈 자리 없음」으로 막는다.
 */
export function LobbySpectatorStrip({
  room,
  spectators,
  currentUser,
  currentUserParticipant,
  currentUserIsSpectator,
  isCurrentUserHost,
  emptySlots,
  toggleSpectator,
  addToast,
}: {
  room: any;
  spectators: any[];
  currentUser: any;
  currentUserParticipant: any;
  currentUserIsSpectator: boolean;
  isCurrentUserHost: boolean;
  emptySlots: number;
  toggleSpectator: (onError?: (message: string) => void) => void;
  addToast: (
    message: string,
    type: "success" | "error" | "info" | "warning",
  ) => void;
}) {
  // 관전석에 있는 방장 = 운영자
  const operator = spectators.find((s: any) => s.isHost);
  const watchers = spectators.filter((s: any) => !s.isHost);

  // 전환 버튼은 대기 중일 때만. 관전 비허용 방이어도 방장은 운영자로 갈 수 있다.
  const canSwitch =
    (room.allowSpectators || isCurrentUserHost) &&
    room.status === "WAITING" &&
    Boolean(currentUserParticipant);
  const goingToPlayer = currentUserIsSpectator;
  const noSeat = goingToPlayer && emptySlots <= 0;
  const switchLabel = noSeat
    ? "빈 자리 없음"
    : goingToPlayer
      ? "선수로 참여"
      : isCurrentUserHost
        ? "운영자로 빠지기"
        : "나도 관전하기";

  const handleSwitch = () =>
    toggleSpectator((err) =>
      addToast(err.includes("::") ? (err.split("::")[1] ?? err) : err, "error"),
    );

  return (
    <div className="flex gap-3">
      {/* 운영자 칸 — 누가 진행하는지 바로 보이게 */}
      {operator && (
        <div className="flex w-[240px] flex-shrink-0 items-center gap-3 rounded-xl bg-accent-gold/[0.08] p-3">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-bg-elevated">
            <Image
              src={operator.avatar || "/images/placeholders/non-avatar-128.png"}
              alt=""
              fill
              unoptimized
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] font-black text-accent-gold">
              <Crown className="h-3.5 w-3.5" /> 운영자
            </div>
            <div className="truncate text-base font-black text-text-primary">
              {operator.username}
              {operator.userId === currentUser?.id && (
                <span className="ml-1 text-[11px] font-bold text-accent-primary">
                  나
                </span>
              )}
            </div>
            <div className="text-[11px] text-text-tertiary">
              선수로 뛰지 않고 진행만 맡아요
            </div>
          </div>
        </div>
      )}

      {/* 관전자 칸 */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 rounded-xl bg-bg-tertiary/30 p-3">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="text-xs font-black text-text-secondary">
            관전 {watchers.length}명
          </span>
          <span className="truncate text-[11px] text-text-tertiary">
            {room.allowSpectators
              ? "대진·경매를 보기만 해요"
              : "이 방은 관전을 받지 않아요"}
          </span>
          {canSwitch && (
            <button
              type="button"
              onClick={handleSwitch}
              disabled={noSeat}
              className="ml-auto flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-bg-tertiary px-2.5 py-1 text-xs font-semibold text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {goingToPlayer ? (
                switchLabel
              ) : (
                <>
                  {isCurrentUserHost ? (
                    <Crown className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {switchLabel}
                </>
              )}
            </button>
          )}
        </div>
        {watchers.length > 0 ? (
          <div className="flex max-h-[76px] flex-wrap gap-2 overflow-y-auto">
            {watchers.map((s: any) => (
              <span
                key={s.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-bg-tertiary/70 py-1 pl-1 pr-3 text-sm text-text-secondary",
                  s.userId === currentUser?.id &&
                    "ring-1 ring-inset ring-accent-primary/60",
                )}
              >
                <span className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-md bg-bg-elevated">
                  <Image
                    src={s.avatar || "/images/placeholders/non-avatar-64.png"}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </span>
                <span className="max-w-[120px] truncate">{s.username}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">
            {room.allowSpectators ? "아직 관전자가 없어요" : "관전 비허용"}
          </p>
        )}
      </div>
    </div>
  );
}
