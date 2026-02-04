"use client";

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, ArrowRight, User } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

// Data Dragon version for profile icons
const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || '16.2.1';

// Helper to get profile icon URL
const getProfileIconUrl = (iconId: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${iconId}.png`;

// Profile icon component with error fallback
function ProfileIcon({
  iconId,
  alt,
  className = ''
}: {
  iconId: number;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className={`flex items-center justify-center bg-bg-elevated ${className}`}>
        <User className="w-8 h-8 text-text-tertiary" />
      </div>
    );
  }

  return (
    <Image
      src={getProfileIconUrl(iconId)}
      alt={alt}
      width={64}
      height={64}
      className={`object-cover ${className}`}
      onError={() => setHasError(true)}
      unoptimized
    />
  );
}

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
  canGoBack?: boolean;
  onGoBack?: () => void;
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
    <Modal isOpen={isOpen} onClose={onClose} title="계정 인증">
      <p className="text-text-secondary mb-4">
        <span className="font-bold text-accent-primary">
          {verificationData.gameName}#{verificationData.tagLine}
        </span>
        님의 계정을 인증하려면 아래 단계를 따라주세요:
      </p>

      {/* Icon comparison display */}
      <div className="flex items-center justify-center gap-6 py-4 mb-4 bg-bg-tertiary rounded-lg">
        <div className="text-center">
          <p className="text-xs text-text-tertiary mb-2">현재 아이콘</p>
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-bg-elevated mx-auto">
            <ProfileIcon
              iconId={verificationData.currentIconId}
              alt="현재 프로필 아이콘"
              className="w-full h-full"
            />
          </div>
          <p className="text-xs text-text-tertiary mt-1">#{verificationData.currentIconId}</p>
        </div>
        <ArrowRight className="w-6 h-6 text-text-tertiary flex-shrink-0" />
        <div className="text-center">
          <p className="text-xs text-accent-gold mb-2 font-semibold">변경할 아이콘</p>
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-accent-gold ring-2 ring-accent-gold/30 mx-auto">
            <ProfileIcon
              iconId={verificationData.requiredIconId}
              alt="필요한 프로필 아이콘"
              className="w-full h-full"
            />
          </div>
          <p className="text-xs text-accent-gold mt-1 font-semibold">#{verificationData.requiredIconId}</p>
        </div>
      </div>

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
            프로필 아이콘을 위에 표시된 <span className="font-bold text-accent-gold">노란색 테두리</span> 아이콘으로 변경하세요
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

      <p className="text-xs text-text-tertiary mt-3 text-center">
        이 아이콘이 없다면 &apos;나중에&apos;를 누르고 다시 시도하면 다른 아이콘이 지정됩니다.
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