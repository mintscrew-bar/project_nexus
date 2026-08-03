"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type GuidedTourStep = {
  selector?: string;
  eyebrow?: string;
  title: string;
  description: string;
};

type GuidedTourProps = {
  ariaLabel: string;
  steps: GuidedTourStep[];
  storageKey: string;
  prerequisiteStorageKey?: string;
  startEvent?: string;
  startDelay?: number;
  startOnMount?: boolean;
};

const TOOLTIP_HEIGHT = 240;
const VIEWPORT_GAP = 16;

function findVisibleTarget(selector?: string) {
  if (!selector) return null;

  return (
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    }) ?? null
  );
}

export function GuidedTour({
  ariaLabel,
  steps,
  storageKey,
  prerequisiteStorageKey,
  startEvent,
  startDelay = 400,
  startOnMount = true,
}: GuidedTourProps) {
  const [mounted, setMounted] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    window.localStorage.setItem(storageKey, "1");
    setIsActive(false);
    setStepIndex(0);
  }, [storageKey]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let startTimer: number | null = null;
    let targetAttempts = 0;

    const activateWhenTargetReady = () => {
      const firstTarget = findVisibleTarget(steps[0]?.selector);
      if (!steps[0]?.selector || firstTarget || targetAttempts >= 40) {
        setStepIndex(0);
        setIsActive(true);
        return;
      }

      targetAttempts += 1;
      startTimer = window.setTimeout(activateWhenTargetReady, 250);
    };

    const startIfReady = () => {
      if (window.localStorage.getItem(storageKey)) return;
      if (
        prerequisiteStorageKey &&
        !window.localStorage.getItem(prerequisiteStorageKey)
      ) {
        return;
      }

      startTimer = window.setTimeout(() => {
        activateWhenTargetReady();
      }, startDelay);
    };

    if (startOnMount) startIfReady();
    if (startEvent) window.addEventListener(startEvent, startIfReady);

    return () => {
      if (startTimer !== null) window.clearTimeout(startTimer);
      if (startEvent) window.removeEventListener(startEvent, startIfReady);
    };
  }, [
    prerequisiteStorageKey,
    startDelay,
    startEvent,
    startOnMount,
    steps,
    storageKey,
  ]);

  const updateTarget = useCallback(() => {
    if (!isActive) return;
    const target = findVisibleTarget(steps[stepIndex]?.selector);
    setTargetRect(target?.getBoundingClientRect() ?? null);
  }, [isActive, stepIndex, steps]);

  useLayoutEffect(() => {
    if (!isActive) return;

    const target = findVisibleTarget(steps[stepIndex]?.selector);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    updateTarget();

    const settledUpdate = window.setTimeout(updateTarget, 350);
    const targetRetry = window.setInterval(updateTarget, 500);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);

    return () => {
      window.clearTimeout(settledUpdate);
      window.clearInterval(targetRetry);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [isActive, stepIndex, steps, updateTarget]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") {
        setStepIndex((current) => Math.min(current + 1, steps.length - 1));
      }
      if (event.key === "ArrowLeft") {
        setStepIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finish, isActive, steps.length]);

  const geometry = useMemo(() => {
    if (!mounted || !isActive) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = Math.min(360, viewportWidth - VIEWPORT_GAP * 2);
    const placeBelow =
      !targetRect ||
      targetRect.bottom + VIEWPORT_GAP + TOOLTIP_HEIGHT <= viewportHeight ||
      targetRect.top < TOOLTIP_HEIGHT + VIEWPORT_GAP;

    const tooltipTop = targetRect
      ? placeBelow
        ? Math.min(
            targetRect.bottom + VIEWPORT_GAP,
            viewportHeight - TOOLTIP_HEIGHT - VIEWPORT_GAP,
          )
        : Math.max(
            VIEWPORT_GAP,
            targetRect.top - TOOLTIP_HEIGHT - VIEWPORT_GAP,
          )
      : Math.max(VIEWPORT_GAP, (viewportHeight - TOOLTIP_HEIGHT) / 2);
    const tooltipLeft = targetRect
      ? Math.min(
          Math.max(
            VIEWPORT_GAP,
            targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
          ),
          viewportWidth - tooltipWidth - VIEWPORT_GAP,
        )
      : (viewportWidth - tooltipWidth) / 2;

    return {
      tooltipTop,
      tooltipLeft,
      tooltipWidth,
      highlight: targetRect
        ? {
            top: Math.max(4, targetRect.top - 6),
            left: Math.max(4, targetRect.left - 6),
            width: Math.min(viewportWidth - 8, targetRect.width + 12),
            height: Math.min(viewportHeight - 8, targetRect.height + 12),
          }
        : null,
    };
  }, [isActive, mounted, targetRect]);

  if (!mounted || !isActive || !geometry || steps.length === 0) return null;

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {geometry.highlight ? (
        <div
          className="pointer-events-none fixed rounded-xl border-2 border-accent-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.74),0_0_28px_rgba(99,102,241,0.65)] transition-all duration-300"
          style={geometry.highlight}
        />
      ) : (
        <div className="absolute inset-0 bg-black/70" />
      )}

      <div
        className="fixed rounded-2xl border border-accent-primary/30 bg-bg-secondary p-5 shadow-2xl transition-[top,left] duration-300"
        style={{
          top: geometry.tooltipTop,
          left: geometry.tooltipLeft,
          width: geometry.tooltipWidth,
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-bold text-accent-primary">
              {step.eyebrow ?? "NEXUS 사용 가이드"} · {stepIndex + 1}/
              {steps.length}
            </p>
            <h2 className="text-lg font-bold text-text-primary">{step.title}</h2>
          </div>
          <button
            type="button"
            onClick={finish}
            className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            aria-label="가이드 닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-text-secondary">
          {step.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-text-tertiary transition-colors hover:text-text-primary"
          >
            건너뛰기
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((current) => current - 1)}
                className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                이전
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLastStep) finish();
                else setStepIndex((current) => current + 1);
              }}
              className="inline-flex items-center rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {isLastStep ? "완료" : "다음"}
              {!isLastStep && <ChevronRight className="ml-1 h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
