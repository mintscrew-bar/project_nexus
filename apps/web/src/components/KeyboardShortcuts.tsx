'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui';
import {
  useKeyboardShortcuts,
  useSequentialShortcuts,
  GLOBAL_SHORTCUTS,
  NAVIGATION_SHORTCUTS,
  ACTION_SHORTCUTS,
} from '@/hooks/useKeyboardShortcuts';
import { Keyboard } from 'lucide-react';

interface KeyboardShortcutsContextType {
  showHelp: () => void;
  hideHelp: () => void;
  isHelpOpen: boolean;
  focusSearch: () => void;
  triggerAction: () => void;
  setActionHandler: (handler: (() => void) | null) => void;
  setSearchRef: (ref: HTMLInputElement | null) => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextType | null>(null);

export function useKeyboardShortcutsContext() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcutsContext must be used within KeyboardShortcutsProvider');
  }
  return context;
}

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  const router = useRouter();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [searchRef, setSearchRef] = useState<HTMLInputElement | null>(null);
  const [actionHandler, setActionHandler] = useState<(() => void) | null>(null);

  const showHelp = useCallback(() => setIsHelpOpen(true), []);
  const hideHelp = useCallback(() => setIsHelpOpen(false), []);

  const focusSearch = useCallback(() => {
    if (searchRef) {
      searchRef.focus();
      searchRef.select();
    }
  }, [searchRef]);

  const triggerAction = useCallback(() => {
    if (actionHandler) {
      actionHandler();
    }
  }, [actionHandler]);

  // Navigation helper that defers to next tick to avoid render-phase state updates
  const navigate = useCallback((path: string) => {
    setTimeout(() => router.push(path), 0);
  }, [router]);

  // Global shortcuts
  useKeyboardShortcuts([
    {
      key: '?',
      shift: true,
      handler: showHelp,
      description: '단축키 도움말',
    },
    {
      key: 'Escape',
      handler: hideHelp,
      description: '모달 닫기',
      ignoreInputs: false,
    },
    {
      key: '/',
      handler: focusSearch,
      description: '검색 포커스',
    },
    {
      key: 'k',
      ctrl: true,
      handler: focusSearch,
      description: '검색 포커스',
    },
    {
      key: 'n',
      handler: triggerAction,
      description: '새로 만들기',
    },
  ]);

  // Sequential navigation shortcuts (g + key)
  useSequentialShortcuts([
    {
      keys: ['g', 'h'],
      handler: () => navigate('/'),
      description: '홈으로 이동',
    },
    {
      keys: ['g', 'd'],
      handler: () => navigate('/profile'),
      description: '프로필로 이동',
    },
    {
      keys: ['g', 't'],
      handler: () => navigate('/tournaments'),
      description: '내전 목록으로 이동',
    },
    {
      keys: ['g', 'c'],
      handler: () => navigate('/community'),
      description: '커뮤니티로 이동',
    },
    {
      keys: ['g', 'f'],
      handler: () => navigate('/friends'),
      description: '친구 목록으로 이동',
    },
    {
      keys: ['g', 's'],
      handler: () => navigate('/settings'),
      description: '설정으로 이동',
    },
  ]);

  const contextValue: KeyboardShortcutsContextType = {
    showHelp,
    hideHelp,
    isHelpOpen,
    focusSearch,
    triggerAction,
    setActionHandler,
    setSearchRef,
  };

  return (
    <KeyboardShortcutsContext.Provider value={contextValue}>
      {children}
      <KeyboardShortcutsHelp isOpen={isHelpOpen} onClose={hideHelp} />
    </KeyboardShortcutsContext.Provider>
  );
}

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="키보드 단축키" size="md">
      <div className="space-y-6">
        {/* Global */}
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            전역
          </h3>
          <div className="space-y-2">
            {GLOBAL_SHORTCUTS.map((shortcut, i) => (
              <ShortcutRow key={i} keys={shortcut.keys} description={shortcut.description} />
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">네비게이션</h3>
          <div className="space-y-2">
            {NAVIGATION_SHORTCUTS.map((shortcut, i) => (
              <ShortcutRow key={i} keys={shortcut.keys} description={shortcut.description} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <h3 className="text-sm font-semibold text-text-secondary mb-3">액션</h3>
          <div className="space-y-2">
            {ACTION_SHORTCUTS.map((shortcut, i) => (
              <ShortcutRow key={i} keys={shortcut.keys} description={shortcut.description} />
            ))}
          </div>
        </div>

        <p className="text-xs text-text-tertiary pt-2 border-t border-bg-tertiary">
          입력 필드에서는 대부분의 단축키가 비활성화됩니다. ESC는 항상 작동합니다.
        </p>
      </div>
    </Modal>
  );
}

interface ShortcutRowProps {
  keys: string[];
  description: string;
}

function ShortcutRow({ keys, description }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-primary">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-tertiary text-xs mx-1">또는</span>}
            <kbd className="px-2 py-1 bg-bg-tertiary border border-bg-elevated rounded text-xs font-mono text-text-secondary">
              {formatKey(key)}
            </kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

function formatKey(key: string): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return key
    .replace('Ctrl+', isMac ? '⌘' : 'Ctrl+')
    .replace('Alt+', isMac ? '⌥' : 'Alt+')
    .replace('Shift+', isMac ? '⇧' : 'Shift+')
    .replace('Escape', 'Esc');
}
