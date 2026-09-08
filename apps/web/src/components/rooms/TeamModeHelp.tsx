"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentGame } from "@/hooks/useCurrentGame";
import type { GameTitle } from "@nexus/types";

export type TeamMode =
  "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";

interface TeamModeGuide {
  label: string;
  summary: string;
  flow: string;
  details: string[];
}

const LOL_GUIDES: Record<TeamMode, TeamModeGuide> = {
  AUCTION: {
    label: "경매 드래프트",
    summary: "팀장이 보유 포인트로 선수를 입찰해 팀을 구성합니다.",
    flow: "팀장 선정 → 선수 경매 → 라인 선택 → 대진표",
    details: [
      "자동·직접 지명·자원 모집 중 팀장 선정 방식을 고를 수 있습니다.",
      "최고 입찰 팀이 선수를 영입하며, 팀별 잔여 포인트가 실시간 반영됩니다.",
      "팀 편성 뒤 각 팀원이 플레이할 라인을 선택합니다.",
    ],
  },
  SNAKE_DRAFT: {
    label: "스네이크 드래프트",
    summary: "팀장이 순서를 번갈아 가며 선수를 지명합니다.",
    flow: "팀장 선정 → 교차 지명 → 라인 선택 → 대진표",
    details: [
      "라운드마다 지명 순서가 반대로 바뀌어 선픽 이점을 보정합니다.",
      "팀장은 랜덤 또는 티어 기준으로 선정할 수 있습니다.",
      "팀 편성 뒤 각 팀원이 플레이할 라인을 선택합니다.",
    ],
  },
  AUTO_BALANCE: {
    label: "자동 밸런스",
    summary: "라인별 실력과 선호도를 계산해 팀과 역할을 함께 편성합니다.",
    flow: "전원 준비 → 자동 편성 → 방장 검토·재편성 → 확정",
    details: [
      "설정한 정원이 모두 참가하고 준비해야 시작할 수 있습니다.",
      "티어·랭크·내전 기록과 주/부 라인을 함께 반영합니다.",
      "방장이 결과를 검토해 재편성하거나 확정하며 라인 선택 단계는 생략합니다.",
    ],
  },
  MANUAL_TEAM: {
    label: "자유 팀 선택",
    summary: "참가자가 로비에서 원하는 팀으로 직접 이동합니다.",
    flow: "팀 직접 선택 → 전원 준비 → 라인 선택 → 대진표",
    details: [
      "설정한 정원이 모두 참가하고 각 팀을 5명씩 채워야 합니다.",
      "팀을 이동하거나 대기석으로 나오면 준비 상태가 해제됩니다.",
      "팀 확정 뒤 각 팀원이 플레이할 라인을 선택합니다.",
    ],
  },
};

interface TeamModeHelpProps {
  mode: TeamMode;
  compact?: boolean;
  className?: string;
}

/** 팀 구성 방식과 무관하게 공통으로 진입하는 역할 선택 단계 안내 */

/**
 * 배그 문안.
 *
 * 롤 설명을 그대로 쓰면 툴팁이 "라인 선택 → 대진표"를 안내하는데 배그에는
 * 둘 다 없다. 팀 정원도 5명이 아니라 4인 스쿼드다.
 */
const PUBG_GUIDES: Record<TeamMode, TeamModeGuide> = {
  AUCTION: {
    label: "경매 드래프트",
    summary: "팀장이 보유 포인트로 팀원을 입찰해 스쿼드를 구성합니다.",
    flow: "팀장 선정 → 팀원 경매 → 경기",
    details: [
      "자동·직접 지명·자원 모집 중 팀장 선정 방식을 고를 수 있습니다.",
      "최고 입찰 팀이 팀원을 영입하며, 팀별 잔여 포인트가 실시간 반영됩니다.",
      "배그는 라인 선택이 없어 편성이 끝나면 바로 경기로 넘어갑니다.",
    ],
  },
  SNAKE_DRAFT: {
    label: "스네이크 드래프트",
    summary: "팀장이 순서를 번갈아 가며 팀원을 지명합니다.",
    flow: "팀장 선정 → 픽 순서 추첨 → 교차 지명 → 경기",
    details: [
      "라운드마다 지명 순서가 반대로 바뀌어 선픽 이점을 보정합니다.",
      "픽 순서는 사다리타기로 뽑아 모두에게 같은 화면으로 보여줍니다.",
      "배그는 라인 선택이 없어 편성이 끝나면 바로 경기로 넘어갑니다.",
    ],
  },
  AUTO_BALANCE: {
    label: "자동 밸런스",
    summary: "NEXUS 편성 점수로 스쿼드를 고르게 나눕니다.",
    flow: "전원 준비 → 자동 편성 → 방장 검토·재편성 → 확정",
    details: [
      "설정한 정원이 모두 참가하고 준비해야 시작할 수 있습니다.",
      "라인별 점수가 아니라 NEXUS 편성 점수를 뱀 순서로 나눠 담습니다.",
      "점수가 없는 참가자는 참가자 평균으로 두고 몇 명이었는지 알려줍니다.",
    ],
  },
  MANUAL_TEAM: {
    label: "자유 팀 선택",
    summary: "참가자가 로비에서 원하는 스쿼드로 직접 이동합니다.",
    flow: "스쿼드 직접 선택 → 전원 준비 → 경기",
    details: [
      "설정한 정원이 모두 참가하고 각 스쿼드를 4명씩 채워야 합니다.",
      "팀을 이동하거나 대기석으로 나오면 준비 상태가 해제됩니다.",
      "배그는 라인 선택이 없어 확정 뒤 바로 경기로 넘어갑니다.",
    ],
  },
};

const GUIDES_BY_GAME: Record<GameTitle, Record<TeamMode, TeamModeGuide>> = {
  LOL: LOL_GUIDES,
  PUBG: PUBG_GUIDES,
};

/** 그 게임의 팀 구성 설명. 방 만들기·설정 화면의 모드 목록이 쓴다. */
export function teamModeGuides(
  game: GameTitle,
): Record<TeamMode, TeamModeGuide> {
  return GUIDES_BY_GAME[game] ?? LOL_GUIDES;
}

/**
 * 게임을 특정할 수 없는 자리에서 쓰는 기본값.
 * 화면 안에서는 `teamModeGuides(game)` 를 쓴다.
 */
export const TEAM_MODE_GUIDES = LOL_GUIDES;

export function RoleSelectionHelp({ compact = false }: { compact?: boolean }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="역할 선택 단계 자세히 보기"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          compact ? "h-7 w-7" : "h-9 w-9",
        )}
      >
        <HelpCircle className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-[100] mt-2 w-72 rounded-xl border border-bg-elevated bg-bg-secondary p-4 text-left text-xs leading-5 text-text-secondary shadow-2xl"
        >
          <strong className="block text-sm text-text-primary">역할 선택</strong>
          <span className="mt-1 block">
            팀에서 플레이할 라인을 선택하는 마지막 팀 편성 단계입니다.
          </span>
          <span className="mt-3 block rounded-md bg-accent-primary/10 px-2.5 py-2 font-semibold text-accent-primary">
            역할 선택 → 모든 팀장 준비 → 대진표
          </span>
          <span className="mt-2 block">
            시간이 끝나면 설정한 주/부 라인을 기준으로 미선택 역할이 자동
            배정됩니다.
          </span>
        </span>
      )}
    </span>
  );
}

export function TeamModeHelp({
  mode,
  compact = false,
  className,
}: TeamModeHelpProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  // 툴팁은 화면 안에서만 뜬다. 경로로 게임을 알 수 있다.
  const guide = teamModeGuides(useCurrentGame())[mode];

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8),
    );
    const showAbove = window.innerHeight - rect.bottom < 230 && rect.top > 230;

    setPosition(
      showAbove
        ? { width, left, bottom: window.innerHeight - rect.top + 8 }
        : { width, left, top: rect.bottom + 8 },
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const closePinned = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => {
      if (pinned) updatePosition();
      else setOpen(false);
    };

    document.addEventListener("pointerdown", closePinned);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closePinned);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open, pinned, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${guide.label} 방식 자세히 보기`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          const nextPinned = !pinned;
          setPinned(nextPinned);
          setOpen(nextPinned);
        }}
        onPointerEnter={() => {
          updatePosition();
          setOpen(true);
        }}
        onPointerLeave={() => {
          if (!pinned) setOpen(false);
        }}
        onFocus={() => {
          updatePosition();
          setOpen(true);
        }}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        className={cn(
          "inline-flex flex-shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          compact ? "h-6 w-6" : "h-9 w-9",
          className,
        )}
      >
        <HelpCircle className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={position}
            className="pointer-events-none fixed z-[100] rounded-xl border border-bg-elevated bg-bg-secondary/98 p-4 text-left shadow-2xl backdrop-blur-md"
          >
            <p className="text-sm font-bold text-text-primary">{guide.label}</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {guide.summary}
            </p>
            <p className="mt-3 rounded-md bg-accent-primary/10 px-2.5 py-2 text-xs font-semibold text-accent-primary">
              {guide.flow}
            </p>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-text-secondary">
              {guide.details.map((detail) => (
                <li key={detail} className="flex gap-2">
                  <span className="text-accent-primary" aria-hidden>
                    •
                  </span>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
