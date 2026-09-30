"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BGM_TRACKS } from "@/lib/bgm/playlist";
import { useBgmStore } from "@/stores/bgm-store";

/**
 * 배경음악 버튼 + 재생목록 패널.
 *
 * 앱 헤더와 랜딩 헤더에 하나씩 둔다. 앱 헤더는 경매·드래프트·역할 선택
 * 화면에서도 그대로 보이므로, 진행 중에도 바로 끄거나 줄일 수 있다.
 *
 * 버튼을 누르면 패널이 열린다. 패널에서 음소거·볼륨·곡 선택·앞뒤 곡을 다룬다.
 * 예전에는 버튼 한 번이 곧 음소거였는데, 볼륨과 곡 선택이 붙으면서 한 곳에 모았다.
 *
 * 저장된 설정을 읽기 전에는 그리지 않는다 — 서버 렌더와 첫 렌더가 어긋난다.
 * 곡이 하나도 없으면 누를 이유가 없으니 숨긴다.
 */
export function BgmToggle({ className }: { className?: string }) {
  const muted = useBgmStore((s) => s.muted);
  const hydrated = useBgmStore((s) => s.hydrated);
  const volume = useBgmStore((s) => s.volume);
  const currentTrackId = useBgmStore((s) => s.currentTrackId);
  const toggleMuted = useBgmStore((s) => s.toggleMuted);
  const setVolume = useBgmStore((s) => s.setVolume);
  const playTrack = useBgmStore((s) => s.playTrack);
  const playNext = useBgmStore((s) => s.playNext);
  const playPrev = useBgmStore((s) => s.playPrev);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // 바깥을 누르거나 Esc 를 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!hydrated || BGM_TRACKS.length === 0) return null;

  // 볼륨 0 도 사실상 꺼진 것이라 아이콘을 같이 바꾼다.
  const silent = muted || volume <= 0;
  const currentTrack = BGM_TRACKS.find((t) => t.id === currentTrackId) ?? null;
  const volumePercent = Math.round(volume * 100);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        title="배경음악"
        aria-label="배경음악 설정"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        {silent ? (
          <VolumeX className="h-5 w-5" />
        ) : (
          <Volume2 className="h-5 w-5" />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="배경음악"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-bg-tertiary bg-bg-secondary p-4 shadow-xl"
        >
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 shrink-0 text-accent-primary" />
            <p className="text-sm font-semibold text-text-primary">배경음악</p>
          </div>

          {/* 지금 곡 + 시간 바 + 재생 조작 */}
          <div className="mt-3 rounded-lg bg-bg-tertiary px-3 pb-2 pt-2.5">
            <p className="truncate text-center text-xs font-medium text-text-primary">
              {currentTrack?.title ?? "첫 클릭 후 재생됩니다"}
            </p>
            <BgmSeekBar />
            <div className="mt-1 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={playPrev}
                className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                aria-label="이전 곡"
                title="이전 곡"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              {/*
                재생/일시정지는 켜기·끄기와 같은 값(muted)을 쓴다. 일시정지하면 곡이
                그 자리에서 멈추고, 다시 누르면 멈춘 곳부터 이어진다. 다음 방문에도
                일시정지 상태가 유지된다.
              */}
              <button
                type="button"
                onClick={toggleMuted}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-primary text-white transition-opacity hover:opacity-90"
                aria-label={muted ? "재생" : "일시정지"}
                title={muted ? "재생" : "일시정지"}
              >
                {muted ? (
                  <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                ) : (
                  <Pause className="h-4 w-4" fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                onClick={playNext}
                className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                aria-label="다음 곡"
                title="다음 곡"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 볼륨 */}
          <div className={cn("mt-4", muted && "opacity-45")}>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor={`${panelId}-volume`}
                className="text-xs font-medium text-text-secondary"
              >
                크기
              </label>
              <span className="text-xs font-semibold tabular-nums text-text-secondary">
                {volumePercent}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <VolumeX className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <input
                id={`${panelId}-volume`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={volumePercent}
                disabled={muted}
                onChange={(event) =>
                  setVolume(Number(event.target.value) / 100)
                }
                className="h-2 w-full cursor-pointer accent-accent-primary disabled:cursor-not-allowed"
              />
              <Volume2 className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            </div>
            <p className="mt-1.5 text-[11px] text-text-muted">
              경매·드래프트 중에는 효과음이 들리도록 자동으로 더 작아집니다.
            </p>
          </div>

          {/* 재생목록 */}
          <ul className="mt-3 max-h-56 space-y-0.5 overflow-y-auto">
            {BGM_TRACKS.map((track, index) => {
              const active = track.id === currentTrackId;
              return (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => playTrack(track.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      active
                        ? "bg-accent-primary/10 text-accent-primary"
                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                    )}
                  >
                    <span className="w-4 shrink-0 text-center text-xs tabular-nums">
                      {active && !muted ? (
                        <Volume2 className="h-3.5 w-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0 truncate">{track.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 초 → "m:ss" */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * 곡 시간 바.
 *
 * 따로 떼어 둔 이유: 재생 위치는 초당 몇 번씩 바뀐다. 패널 전체가 그 값을
 * 구독하면 곡 목록까지 계속 다시 그려진다.
 *
 * 끄는 동안에는 손가락 위치를 보여주기만 하고, 놓는 순간 한 번 옮긴다.
 * 끄는 내내 옮기면 곡이 잘게 끊겨 들린다.
 */
function BgmSeekBar() {
  const position = useBgmStore((s) => s.position);
  const duration = useBgmStore((s) => s.duration);
  const seekTo = useBgmStore((s) => s.seekTo);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const ready = duration > 0;
  const shown = dragValue ?? position;

  const commit = () => {
    if (dragValue === null) return;
    seekTo(dragValue);
    setDragValue(null);
  };

  return (
    <div className="mt-2">
      <input
        type="range"
        min={0}
        max={ready ? duration : 1}
        step={0.1}
        value={ready ? Math.min(shown, duration) : 0}
        disabled={!ready}
        aria-label="재생 위치"
        onChange={(event) => setDragValue(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="h-1.5 w-full cursor-pointer accent-accent-primary disabled:cursor-default"
      />
      <div className="flex justify-between text-[10px] tabular-nums text-text-muted">
        <span>{formatTime(ready ? shown : 0)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
