"use client";

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal'; // Use custom Modal
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils'; // For button styling

// Verification step modal
export interface RiotVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationData: {
    gameName: string;
    tagLine: string;
    requiredIconId: number;
    currentIconId: number;
  };
  onVerify: () => Promise<void>;
  canGoBack?: boolean; // New prop to indicate if a "Go Back" option should be shown
  onGoBack?: () => void; // Callback for going back
}

export function RiotVerificationModal({
  isOpen,
  onClose,
  verificationData,
  onVerify,
  canGoBack = false,
  onGoBack,
}: RiotVerificationModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    setIsLoading(true);
    setError('');
    try {
      await onVerify();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="아이콘 인증">
      <p className="text-text-secondary mb-4">
        <span className="font-bold text-accent-primary">
          {verificationData.gameName}#{verificationData.tagLine}
        </span>
        님의 계정을 인증하려면 아래 단계를 따라주세요:
      </p>

      <div className="bg-bg-tertiary rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-accent-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
            1
          </span>
          <p className="text-text-primary text-sm">
            리그 오브 레전드 클라이언트를 실행하세요
          </p>
        </div>

        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-accent-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
            2
          </span>
          <p className="text-text-primary text-sm">
            프로필 아이콘을{' '}
            <span className="font-bold text-accent-gold">
              {verificationData.requiredIconId}번
            </span>
            으로 변경하세요
          </p>
        </div>

        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-accent-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
            3
          </span>
          <p className="text-text-primary text-sm">
            아래 &quot;인증 완료&quot; 버튼을 클릭하세요
          </p>
        </div>
      </div>

      <p className="text-xs text-text-tertiary mt-3">
        현재 아이콘: {verificationData.currentIconId}번 → 필요한 아이콘: {verificationData.requiredIconId}번
      </p>

      {error && (
        <div className="mb-4 p-3 bg-accent-danger/10 border border-accent-danger rounded-lg">
          <p className="text-sm text-accent-danger">{error}</p>
        </div>
      )}

      <div className="flex gap-3 justify-end mt-4">
        {canGoBack && (
          <Button
            variant="outline"
            onClick={onGoBack}
            disabled={isLoading}
            className="w-full sm:w-auto mb-2 sm:mb-0"
          >
            뒤로
          </Button>
        )}
        <Button
          variant="primary"
          onClick={handleVerify}
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            '인증 완료'
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={onClose}
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          나중에
        </Button>
      </div>
    </Modal>
  );
}