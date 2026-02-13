import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal'; // Use custom Modal
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { useRiotStore } from '@/stores/riot-store';
import { useDdragonStore } from '@/stores/ddragon-store';
import { X, Loader2, CheckCircle, AlertCircle, Info, Sword, Shield, ArrowRight, User } from 'lucide-react';
import { ChampionSelector } from './ChampionSelector';
import Image from 'next/image';

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || '16.2.1';
const getProfileIconUrl = (iconId: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${iconId}.png`;

// Define specific props for the new AddAccountModal
interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded: () => void; // Callback when an account is successfully added
}

type Role = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

export function AddAccountModal({ isOpen, onClose, onAccountAdded }: AddAccountModalProps) {
  const {
    startVerification,
    checkVerification,
    registerAccount,
    isVerifying,
    isLoading: storeLoading,
    error: storeError,
    reset: resetRiotStore,
    clearError: clearRiotStoreError,
  } = useRiotStore();

  const { champions, fetchChampions, isLoading: championsLoading } = useDdragonStore();

  const [step, setStep] = useState(1); // 1: Input, 2: Verify, 3: Role Selection
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<{
    gameName: string;
    tagLine: string;
    requiredIconId: number;
    currentIconId: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Role & Champion Selection State
  const [mainRole, setMainRole] = useState<Role>('MID');
  const [subRole, setSubRole] = useState<Role>('ADC');
  const [championsByRole, setChampionsByRole] = useState<Record<Role, string[]>>({
    TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: []
  });
  const [activeRoleTab, setActiveRoleTab] = useState<Role>('TOP');

  useEffect(() => {
    if (isOpen) {
        fetchChampions();
    } else {
      // Reset all state when modal closes
      setStep(1);
      setGameName('');
      setTagLine('');
      setLocalError(null);
      setVerificationData(null);
      setIsSubmitting(false);
      setMainRole('MID');
      setSubRole('ADC');
      setChampionsByRole({ TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [] });
      resetRiotStore();
    }
  }, [isOpen, fetchChampions, resetRiotStore]);
  
  useEffect(() => {
    setLocalError(storeError);
  }, [storeError]);

  const handleClearError = () => {
    setLocalError(null);
    clearRiotStoreError();
  };

  const handleSummonerSubmit = async () => {
    handleClearError();
    if (!gameName.trim() || !tagLine.trim()) {
      setLocalError('소환사 이름과 태그라인을 입력해주세요.');
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await startVerification(gameName.trim(), tagLine.trim());
      setVerificationData(data);
      setStep(2);
    } catch (err: any) {
      setLocalError(err.message || '소환사를 찾을 수 없거나 이미 연동된 계정입니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoBackToStep1 = () => {
    setStep(1);
    setVerificationData(null);
    handleClearError();
  };

  const handleVerifyIcon = async () => {
    handleClearError();
    if (!verificationData) return;
    setIsSubmitting(true);
    try {
      const checkResult = await checkVerification();
      if (!checkResult.verified) {
        setLocalError(`아이콘을 ${verificationData.requiredIconId}번으로 변경해주세요. 현재 아이콘: ${checkResult.current}`);
        return;
      }
      setStep(3);
    } catch (err: any) {
      setLocalError(err.message || '인증 확인에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleSubmit = async () => {
    handleClearError();
    if (mainRole === subRole) {
      setLocalError('주 역할과 부 역할은 동일할 수 없습니다.');
      return;
    }
    setIsSubmitting(true);
    try {
      await registerAccount({
        gameName: verificationData!.gameName,
        tagLine: verificationData!.tagLine,
        mainRole: mainRole,
        subRole: subRole,
        championsByRole: championsByRole,
      });
      onAccountAdded();
      onClose(); // Close modal on success
    } catch (err: any) {
      setLocalError(err.message || '계정 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleChampionSelectionChange = (role: Role, selectedKeys: string[]) => {
      setChampionsByRole(prev => ({ ...prev, [role]: selectedKeys }));
  };

  const isLoading = isSubmitting || isVerifying || storeLoading;

  const modalTitle = () => {
    switch (step) {
      case 1: return 'Riot 계정 추가 (1/3)';
      case 2: return '아이콘 인증 (2/3)';
      case 3: return '역할 및 챔피언 선택 (3/3)';
      default: return 'Riot 계정 추가';
    }
  };

  const modalDescription = () => {
    switch (step) {
      case 1: return '소환사 이름과 태그라인을 입력하여 Riot 계정을 연동합니다.';
      case 2: return 'Riot 클라이언트에서 아이콘을 변경하여 본인임을 인증합니다.';
      case 3: return '주로 플레이하는 역할과 선호 챔피언을 선택해주세요.';
      default: return '';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle()} size="lg">
      {localError && (
        <div className="mb-4 p-3 bg-accent-danger/10 border border-accent-danger rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-accent-danger" />
          <p className="text-sm text-accent-danger">{localError}</p>
        </div>
      )}

      <p className="text-text-secondary mb-4">{modalDescription()}</p>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="gameName" className="text-text-primary">
              소환사 이름
            </Label>
            <Input
              id="gameName"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="예: Hide on bush"
              className="mt-1"
              disabled={isLoading}
            />
          </div>
          <div>
            <Label htmlFor="tagLine" className="text-text-primary">
              태그라인
            </Label>
            <Input
              id="tagLine"
              value={tagLine}
              onChange={(e) => setTagLine(e.target.value)}
              placeholder="예: KR1"
              className="mt-1"
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      {step === 2 && verificationData && (
        <div className="space-y-4">
          <p className="text-text-secondary">
            <span className="font-bold text-accent-primary">
              {verificationData.gameName}#{verificationData.tagLine}
            </span>
            님의 계정을 인증하려면 아래 단계를 따라주세요:
          </p>

          {/* Icon comparison display */}
          <div className="flex items-center justify-center gap-6 py-4 bg-bg-tertiary rounded-lg">
            <div className="text-center">
              <p className="text-xs text-text-tertiary mb-2">현재 아이콘</p>
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-bg-elevated mx-auto">
                <Image
                  src={getProfileIconUrl(verificationData.currentIconId)}
                  alt="현재 프로필 아이콘"
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <p className="text-xs text-text-tertiary mt-1">#{verificationData.currentIconId}</p>
            </div>
            <ArrowRight className="w-6 h-6 text-text-tertiary flex-shrink-0" />
            <div className="text-center">
              <p className="text-xs text-accent-gold mb-2 font-semibold">변경할 아이콘</p>
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-accent-gold ring-2 ring-accent-gold/30 mx-auto">
                <Image
                  src={getProfileIconUrl(verificationData.requiredIconId)}
                  alt="필요한 프로필 아이콘"
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                  unoptimized
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

          <p className="text-xs text-text-tertiary text-center">
            이 아이콘이 없다면 &apos;뒤로&apos;를 누르고 다시 시도하면 다른 아이콘이 지정됩니다.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="mainRole">주 역할</Label>
              <select id="mainRole" value={mainRole} onChange={(e) => setMainRole(e.target.value as Role)} className="w-full p-2 mt-1 border rounded-md bg-bg-secondary">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="subRole">부 역할</Label>
              <select id="subRole" value={subRole} onChange={(e) => setSubRole(e.target.value as Role)} className="w-full p-2 mt-1 border rounded-md bg-bg-secondary">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>선호 챔피언 (역할별 최대 5개)</Label>
            <div className="mt-2 border rounded-lg p-2">
              <div className="flex border-b mb-2">
                {ROLES.map(role => (
                  <button key={role} onClick={() => setActiveRoleTab(role)} className={`px-4 py-2 text-sm font-medium ${activeRoleTab === role ? 'border-b-2 border-accent-primary text-accent-primary' : 'text-text-secondary'}`}>
                    {role}
                  </button>
                ))}
              </div>
              {championsLoading ? <Loader2 className="animate-spin mx-auto"/> : (
                <ChampionSelector
                  allChampions={champions}
                  selectedChampions={championsByRole[activeRoleTab]}
                  onSelectionChange={(keys) => handleChampionSelectionChange(activeRoleTab, keys)}
                />
              )}
            </div>
          </div>
        </div>
      )}
      
      <div className="flex justify-end gap-3 pt-4">
        {step === 2 && (
          <Button variant="outline" onClick={handleGoBackToStep1} disabled={isLoading}>
            뒤로
          </Button>
        )}
        {step !== 2 && (
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            <X className="w-4 h-4 mr-2" />
            취소
          </Button>
        )}
        {step === 1 && (
          <Button onClick={handleSummonerSubmit} disabled={!gameName.trim() || !tagLine.trim() || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            다음
          </Button>
        )}
        {step === 2 && (
          <Button onClick={handleVerifyIcon} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            인증 완료
          </Button>
        )}
        {step === 3 && (
          <Button onClick={handleRoleSubmit} disabled={isLoading || mainRole === subRole}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            계정 등록
          </Button>
        )}
      </div>
    </Modal>
  );
}