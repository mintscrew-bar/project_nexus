"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Modal } from "@/components/ui";

export interface ConfirmOptions {
  title: string;
  /** 무엇이 일어나는지. 대상 이름을 넣어 무엇을 지우는지 보이게 한다. */
  message: ReactNode;
  confirmLabel?: string;
  /** 되돌릴 수 없는 조치. 확인 버튼이 위험색이 된다. */
  danger?: boolean;
  /**
   * 이 글자를 그대로 입력해야 확인이 켜진다. 방·클랜처럼 실수로 지우면 큰 조치에 쓴다.
   * 대상 이름을 넘기면 "엉뚱한 줄의 삭제 버튼을 눌렀다" 를 입력 단계에서 알아챈다.
   */
  requireText?: string;
}

/**
 * 관리자 파괴적 조치용 확인 창.
 *
 * 브라우저 `confirm()` 은 무엇을 지우는지 맥락이 없고(줄 바꿈·강조 불가), 습관적으로
 * Enter 를 누르게 된다. 대상 이름을 보여 주고, 필요하면 이름을 입력하게 한다.
 *
 * 사용: `const { confirm, dialog } = useConfirm();` — `dialog` 를 화면 어디든 한 번
 * 렌더하고, 핸들러에서 `if (!(await confirm({...}))) return;`.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    // 이전 창이 열린 채 또 부르면 이전 것은 취소로 끝낸다.
    resolver.current?.(false);
    setTyped("");
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  const needsText = !!options?.requireText;
  const canConfirm = !needsText || typed.trim() === options?.requireText;

  const dialog = options ? (
    <Modal isOpen onClose={() => settle(false)} title={options.title} size="sm">
      <div className="space-y-4">
        <div className="text-sm text-text-secondary">{options.message}</div>
        {needsText && (
          <label className="block text-xs text-text-tertiary">
            확인하려면{" "}
            <b className="text-text-primary">{options.requireText}</b>
            을(를) 입력하세요
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-bg-tertiary bg-bg-secondary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => settle(false)}>
            취소
          </Button>
          <Button
            size="sm"
            variant={options.danger ? "danger" : "primary"}
            disabled={!canConfirm}
            onClick={() => settle(true)}
          >
            {options.confirmLabel ?? "확인"}
          </Button>
        </div>
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
