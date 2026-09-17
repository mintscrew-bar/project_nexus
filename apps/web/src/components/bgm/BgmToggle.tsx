"use client";

import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { BGM_TRACKS } from "@/lib/bgm/playlist";
import { useBgmStore } from "@/stores/bgm-store";

/**
 * 배경음악 켜기/끄기 버튼.
 *
 * 앱 헤더와 랜딩 헤더에 하나씩 둔다. 앱 헤더는 경매·드래프트·역할 선택
 * 화면에서도 그대로 보이므로, 진행 중에도 바로 끌 수 있다.
 *
 * 저장된 설정을 읽기 전에는 그리지 않는다 — 서버 렌더와 첫 렌더가 어긋난다.
 * 곡이 하나도 없으면 누를 이유가 없으니 숨긴다.
 */
export function BgmToggle({ className }: { className?: string }) {
  const muted = useBgmStore((s) => s.muted);
  const hydrated = useBgmStore((s) => s.hydrated);
  const toggleMuted = useBgmStore((s) => s.toggleMuted);

  if (!hydrated || BGM_TRACKS.length === 0) return null;

  const label = muted ? "배경음악 켜기" : "배경음악 끄기";

  return (
    <button
      type="button"
      onClick={toggleMuted}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
        className,
      )}
      title={label}
      aria-label={label}
      aria-pressed={!muted}
    >
      {muted ? (
        <VolumeX className="h-5 w-5" />
      ) : (
        <Volume2 className="h-5 w-5" />
      )}
    </button>
  );
}
