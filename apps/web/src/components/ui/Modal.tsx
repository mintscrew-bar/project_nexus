'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  showCloseButton?: boolean;
  /** true면 배경 클릭 및 ESC로 닫히지 않음 */
  disableBackdropClose?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className,
  showCloseButton = true,
  disableBackdropClose = false,
}: ModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !disableBackdropClose) {
      onClose();
    }
  }, [onClose, disableBackdropClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={disableBackdropClose ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={cn(
          'relative flex max-h-[calc(100dvh-1rem)] w-full flex-col bg-bg-secondary border border-bg-tertiary rounded-xl shadow-2xl animate-scale-in sm:max-h-[90vh]',
          sizeStyles[size],
          className
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 border-b border-bg-tertiary flex-shrink-0">
            {title && (
              <h2 id="modal-title" className="text-base sm:text-xl font-semibold text-text-primary">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;

  return createPortal(modalContent, document.body);
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** dontAskAgainLabel을 쓰면 체크 여부가 인자로 전달된다 */
  onConfirm: (dontAskAgain?: boolean) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  isLoading?: boolean;
  /** "다시 보지 않기" 체크박스 라벨 — 지정하면 체크박스가 표시된다 */
  dontAskAgainLabel?: string;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'default',
  isLoading = false,
  dontAskAgainLabel,
}: ConfirmModalProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  // 열 때마다 체크 상태 초기화 — 이전에 켜둔 체크가 남지 않게
  useEffect(() => {
    if (isOpen) setDontAskAgain(false);
  }, [isOpen]);

  const confirmButtonStyles = {
    danger: 'bg-accent-danger hover:bg-accent-danger/90',
    warning: 'bg-accent-warning hover:bg-accent-warning/90',
    default: 'bg-accent-primary hover:bg-accent-hover',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className={cn('text-text-secondary', dontAskAgainLabel ? 'mb-3' : 'mb-6')}>
        {message}
      </p>
      {dontAskAgainLabel && (
        <label className="mb-6 flex cursor-pointer select-none items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(event) => setDontAskAgain(event.target.checked)}
            className="accent-accent-primary"
          />
          {dontAskAgainLabel}
        </label>
      )}
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-bg-tertiary hover:bg-bg-elevated text-text-primary rounded-lg transition-colors"
          disabled={isLoading}
        >
          {cancelText}
        </button>
        <button
          onClick={() => onConfirm(dontAskAgain)}
          className={cn(
            'px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50',
            confirmButtonStyles[variant]
          )}
          disabled={isLoading}
        >
          {isLoading ? '처리 중...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
