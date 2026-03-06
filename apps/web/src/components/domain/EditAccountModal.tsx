import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { useRiotStore, RiotAccount } from '@/stores/riot-store';
import { useDdragonStore } from '@/stores/ddragon-store';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { ChampionSelector } from './ChampionSelector';

type Role = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountUpdated: () => void;
  account: RiotAccount | null;
}

export function EditAccountModal({ isOpen, onClose, onAccountUpdated, account }: EditAccountModalProps) {
  const { updateAccount, isLoading: storeLoading, error: storeError, clearError } = useRiotStore();
  const { champions, fetchChampions, isLoading: championsLoading } = useDdragonStore();

  const [mainRole, setMainRole] = useState<Role>('MID');
  const [subRole, setSubRole] = useState<Role>('ADC');
  const [championsByRole, setChampionsByRole] = useState<Record<Role, string[]>>({
    TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [],
  });
  const [activeRoleTab, setActiveRoleTab] = useState<Role>('TOP');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // account가 바뀌거나 모달이 열릴 때 초기값 세팅
  useEffect(() => {
    if (isOpen && account) {
      fetchChampions();
      setMainRole((account.mainRole as Role) || 'MID');
      setSubRole((account.subRole as Role) || 'ADC');
      clearError();
      setLocalError(null);

      // championPreferences → championsByRole 변환
      const byRole: Record<Role, string[]> = { TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [] };
      if (account.championPreferences) {
        for (const pref of account.championPreferences) {
          const role = pref.role as Role;
          if (byRole[role] !== undefined) {
            byRole[role].push(pref.championId);
          }
        }
      }
      setChampionsByRole(byRole);
    }
    if (!isOpen) {
      setLocalError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, account, fetchChampions, clearError]);

  useEffect(() => {
    if (storeError) setLocalError(storeError);
  }, [storeError]);

  const handleSubmit = async () => {
    if (!account) return;
    if (mainRole === subRole) {
      setLocalError('주 역할과 부 역할은 동일할 수 없습니다.');
      return;
    }
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await updateAccount(account.id, {
        mainRole,
        subRole,
        championsByRole,
      });
      onAccountUpdated();
      onClose();
    } catch (err: any) {
      setLocalError(err.message || '계정 수정에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isSubmitting || storeLoading;

  if (!account) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`계정 수정 — ${account.gameName}#${account.tagLine}`}
      size="lg"
    >
      {localError && (
        <div className="mb-4 p-3 bg-accent-danger/10 border border-accent-danger rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
          <p className="text-sm text-accent-danger">{localError}</p>
        </div>
      )}

      <p className="text-text-secondary mb-4">
        이미 인증된 계정입니다. 역할과 선호 챔피언을 수정할 수 있습니다.
      </p>

      <div className="space-y-4">
        {/* 역할 선택 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="edit-mainRole">주 역할</Label>
            <select
              id="edit-mainRole"
              value={mainRole}
              onChange={(e) => setMainRole(e.target.value as Role)}
              className="w-full p-2 mt-1 border border-bg-tertiary rounded-md bg-bg-secondary text-text-primary"
              disabled={isLoading}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="edit-subRole">부 역할</Label>
            <select
              id="edit-subRole"
              value={subRole}
              onChange={(e) => setSubRole(e.target.value as Role)}
              className="w-full p-2 mt-1 border border-bg-tertiary rounded-md bg-bg-secondary text-text-primary"
              disabled={isLoading}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* 챔피언 선택 */}
        <div>
          <Label>선호 챔피언 (역할별 최대 5개, 최소 3개)</Label>
          <div className="mt-2 border border-bg-tertiary rounded-lg p-2">
            <div className="flex border-b border-bg-tertiary mb-2">
              {ROLES.map(role => (
                <button
                  key={role}
                  onClick={() => setActiveRoleTab(role)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeRoleTab === role
                      ? 'border-b-2 border-accent-primary text-accent-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {role}
                  {championsByRole[role].length > 0 && (
                    <span className="ml-1 text-xs text-text-tertiary">
                      ({championsByRole[role].length})
                    </span>
                  )}
                </button>
              ))}
            </div>
            {championsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-text-tertiary" />
              </div>
            ) : (
              <ChampionSelector
                allChampions={champions}
                selectedChampions={championsByRole[activeRoleTab]}
                onSelectionChange={(keys) =>
                  setChampionsByRole(prev => ({ ...prev, [activeRoleTab]: keys }))
                }
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          <X className="w-4 h-4 mr-2" />
          취소
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || mainRole === subRole}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          저장
        </Button>
      </div>
    </Modal>
  );
}
