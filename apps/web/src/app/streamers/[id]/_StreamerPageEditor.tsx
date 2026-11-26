"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { streamerApi, type StreamerPageSettings } from "@/lib/api-client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 스트리머 페이지 꾸미기 — 한마디·정기 방송 요일과 시각·비공개 방 기록 공개.
 * 공지사항은 페이지의 공지 칸에서 바로 쓴다.
 */
export function StreamerPageEditor({
  isOpen,
  onClose,
  streamerId,
  settings,
}: {
  isOpen: boolean;
  onClose: () => void;
  streamerId: string;
  settings: StreamerPageSettings;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [tagline, setTagline] = useState(settings.tagline ?? "");
  const [days, setDays] = useState<number[]>(settings.scheduleDays);
  const [time, setTime] = useState(settings.scheduleTime ?? "");
  const [showPrivate, setShowPrivate] = useState(settings.showPrivateRooms);

  const save = useMutation({
    mutationFn: () =>
      streamerApi.updatePage({
        tagline,
        scheduleDays: days,
        scheduleTime: time || null,
        showPrivateRooms: showPrivate,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["streamer-page", streamerId],
      });
      addToast("페이지를 저장했어요.", "success");
      onClose();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? "저장하지 못했어요.";
      addToast(Array.isArray(message) ? message[0] : message, "error");
    },
  });

  const toggleDay = (day: number) =>
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="페이지 꾸미기" size="md">
      <div className="space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-text-primary">
            한마디
          </label>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={120}
            placeholder="예: 화·목 21시 내전! 처음 오신 분도 환영해요"
            className="w-full rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-text-muted">
            {tagline.length}/120
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-text-primary">
            정기 방송 일정
          </label>
          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(i)}
                aria-pressed={days.includes(i)}
                className={cn(
                  "rounded-lg py-2 text-sm font-bold transition-colors",
                  days.includes(i)
                    ? "bg-accent-primary text-accent-on"
                    : "bg-bg-tertiary text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
            />
            <span className="text-xs text-text-tertiary">
              시작 시각 (비워 두면 요일만 보여요)
            </span>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg bg-bg-tertiary p-3">
          <div>
            <p className="text-sm font-bold text-text-primary">
              비공개 방 기록도 보여 주기
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              비밀번호로 연 내전도 방송 내전 기록에 올려요. 참가한 사람 이름이
              보이니, 참가자들이 괜찮을 때만 켜 주세요.
            </p>
          </div>
          <Switch checked={showPrivate} onCheckedChange={setShowPrivate} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button
            size="sm"
            isLoading={save.isPending}
            onClick={() => save.mutate()}
          >
            저장
          </Button>
        </div>
      </div>
    </Modal>
  );
}
