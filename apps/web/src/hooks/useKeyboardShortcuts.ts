import { useEffect, useCallback, useRef } from 'react';

type KeyHandler = () => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: KeyHandler;
  description?: string;
  // Prevent triggering when typing in inputs
  ignoreInputs?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

/**
 * Hook for handling keyboard shortcuts
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        // Skip if typing in input and shortcut should ignore inputs
        if (isInputField && shortcut.ignoreInputs !== false) {
          // Allow ESC to work even in inputs
          if (shortcut.key.toLowerCase() !== 'escape') {
            continue;
          }
        }

        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * Hook for sequential key shortcuts (e.g., g then h for "go home")
 */
export function useSequentialShortcuts(
  sequences: Array<{
    keys: string[];
    handler: KeyHandler;
    description?: string;
  }>,
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true } = options;
  const pressedKeys = useRef<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetSequence = useCallback(() => {
    pressedKeys.current = [];
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInputField) return;

      // Add key to sequence
      pressedKeys.current.push(event.key.toLowerCase());

      // Reset after 1 second of no input
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(resetSequence, 1000);

      // Check for matching sequences
      for (const sequence of sequences) {
        const pressed = pressedKeys.current.join(',');
        const target = sequence.keys.join(',').toLowerCase();

        if (pressed === target) {
          event.preventDefault();
          sequence.handler();
          resetSequence();
          return;
        }
      }

      // Reset if pressed keys exceed max sequence length
      const maxLength = Math.max(...sequences.map(s => s.keys.length));
      if (pressedKeys.current.length >= maxLength) {
        resetSequence();
      }
    },
    [sequences, enabled, resetSequence]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [handleKeyDown, enabled]);
}

// Predefined shortcut descriptions for help modal
export const GLOBAL_SHORTCUTS = [
  { keys: ['?'], description: '단축키 도움말' },
  { keys: ['Escape'], description: '모달/팝업 닫기' },
  { keys: ['/', 'Ctrl+K'], description: '검색 포커스' },
];

export const NAVIGATION_SHORTCUTS = [
  { keys: ['g', 'h'], description: '홈으로 이동' },
  { keys: ['g', 'd'], description: '프로필로 이동' },
  { keys: ['g', 't'], description: '내전 목록으로 이동' },
  { keys: ['g', 'c'], description: '커뮤니티로 이동' },
  { keys: ['g', 'f'], description: '친구 목록으로 이동' },
  { keys: ['g', 's'], description: '설정으로 이동' },
];

export const ACTION_SHORTCUTS = [
  { keys: ['n'], description: '새로 만들기 (방 생성, 글쓰기 등)' },
];
