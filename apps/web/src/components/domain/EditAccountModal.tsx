import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { useRiotStore, RiotAccount } from '@/stores/riot-store';
import { useDdragonStore, Champion } from '@/stores/ddragon-store';
import { X, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { ChampionSelector } from './ChampionSelector';
import { PeakTierSelector } from './PeakTierSelector';
import Image from 'next/image';

type Role = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

// 포지션 아이콘 / 한글명 매핑
const POSITION_ICON_MAP: Record<string, string> = {
  TOP: "/icons/positions/position-top.svg",
  JUNGLE: "/icons/positions/position-jungle.svg",
  MID: "/icons/positions/position-middle.svg",
  ADC: "/icons/positions/position-bottom.svg",
  SUPPORT: "/icons/positions/position-utility.svg",
};
const POSITION_LABEL: Record<string, string> = {
  TOP: "탑", JUNGLE: "정글", MID: "미드", ADC: "원딜", SUPPORT: "서폿",
};

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
  const [expandedSections, setExpandedSections] = useState<Set<Role>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [peakTier, setPeakTier] = useState('');
  const [peakRank, setPeakRank] = useState('');

  // account가 바뀌거나 모달이 열릴 때 초기값 세팅
  useEffect(() => {
    if (isOpen && account) {
      fetchChampions();
      const main = (account.mainRole as Role) || 'MID';
      const sub = (account.subRole as Role) || 'ADC';
      const initialPeakTier = account.peakTier && account.peakTier !== 'UNRANKED' ? account.peakTier : '';
      setMainRole(main);
      setSubRole(sub);
      setStep(1);
      setPeakTier(initialPeakTier);
      setPeakRank(initialPeakTier && !APEX_TIERS.has(initialPeakTier) ? account.peakRank || 'IV' : '');
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

      // 주/부 역할 아코디언 펼침
      setExpandedSections(new Set([main, sub]));
    }
    if (!isOpen) {
      setLocalError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, account, fetchChampions, clearError]);

  useEffect(() => {
    if (storeError) setLocalError(storeError);
  }, [storeError]);

  // 주/부 역할별 최소 3개 충족 여부
  const mainRoleSatisfied = championsByRole[mainRole].length >= 3;
  const subRoleSatisfied = championsByRole[subRole].length >= 3;
  const canSubmit = mainRoleSatisfied && subRoleSatisfied && mainRole !== subRole;

  const handleSubmit = async () => {
    if (!account) return;
    if (mainRole === subRole) {
      setLocalError('주 역할과 부 역할은 동일할 수 없습니다.');
      return;
    }
    if (!mainRoleSatisfied || !subRoleSatisfied) {
      const missing: string[] = [];
      if (!mainRoleSatisfied) missing.push(`주 역할(${mainRole}): ${championsByRole[mainRole].length}/3`);
      if (!subRoleSatisfied) missing.push(`부 역할(${subRole}): ${championsByRole[subRole].length}/3`);
      setLocalError(`선호 챔피언을 역할별 최소 3개 선택해주세요. ${missing.join(', ')}`);
      return;
    }
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await updateAccount(account.id, {
        mainRole,
        subRole,
        championsByRole,
        peakTier: peakTier || undefined,
        peakRank: peakTier ? peakRank || undefined : undefined,
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

  const toggleSection = (role: Role) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const updateExpandedForRoles = (main: Role, sub: Role) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.add(main);
      next.add(sub);
      return next;
    });
  };

  const handleChampionSelectionChange = (role: Role, keys: string[]) => {
    setChampionsByRole(prev => ({ ...prev, [role]: keys }));
  };

  if (!account) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`계정 수정 (${step}/2) — ${account.gameName}#${account.tagLine}`}
      size="lg"
    >
      {localError && (
        <div className="mb-4 p-3 bg-accent-danger/10 border border-accent-danger rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
          <p className="text-sm text-accent-danger">{localError}</p>
        </div>
      )}

      <p className="text-text-secondary mb-4">
        {step === 1
          ? '과거 시즌에 달성한 최고 티어가 있으면 입력해주세요.'
          : '역할과 선호 챔피언을 수정할 수 있습니다. 주/부 역할별 최소 3개씩 선택해주세요.'}
      </p>

      {step === 1 && (
        <PeakTierSelector
          peakTier={peakTier}
          peakRank={peakRank}
          onTierChange={setPeakTier}
          onRankChange={setPeakRank}
          disabled={isLoading}
          allowEmpty={!account.peakTier || account.peakTier === 'UNRANKED'}
        />
      )}

      {step === 2 && <div className="space-y-4">
        {/* ── 역할 선택: 버튼 그룹 ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-text-tertiary mb-1.5 block">주 역할</Label>
            <div className="flex gap-1.5">
              {ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setMainRole(r);
                    updateExpandedForRoles(r, subRole);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    mainRole === r
                      ? 'bg-accent-primary text-white shadow-sm'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-text-tertiary mb-1.5 block">부 역할</Label>
            <div className="flex gap-1.5">
              {ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setSubRole(r);
                    updateExpandedForRoles(mainRole, r);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    subRole === r
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mainRole === subRole && (
          <p className="text-xs text-accent-danger">주 역할과 부 역할은 달라야 합니다.</p>
        )}

        {/* ── 아코디언 섹션: 역할별 챔피언 선택 ── */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {/* 주 역할 — 자동포커스 대상 */}
          <RoleAccordionSection
            role={mainRole}
            label="주 역할"
            isExpanded={expandedSections.has(mainRole)}
            onToggle={() => toggleSection(mainRole)}
            isRequired
            autoFocusSearch
            champions={champions}
            championsLoading={championsLoading}
            selectedChampions={championsByRole[mainRole]}
            onSelectionChange={(keys) => handleChampionSelectionChange(mainRole, keys)}
          />

          {/* 부 역할 */}
          {mainRole !== subRole && (
            <RoleAccordionSection
              role={subRole}
              label="부 역할"
              isExpanded={expandedSections.has(subRole)}
              onToggle={() => toggleSection(subRole)}
              isRequired
              champions={champions}
              championsLoading={championsLoading}
              selectedChampions={championsByRole[subRole]}
              onSelectionChange={(keys) => handleChampionSelectionChange(subRole, keys)}
            />
          )}

          {/* 나머지 역할 — 선택 사항 */}
          {ROLES.filter(r => r !== mainRole && r !== subRole).map(role => (
            <RoleAccordionSection
              key={role}
              role={role}
              label="기타"
              isExpanded={expandedSections.has(role)}
              onToggle={() => toggleSection(role)}
              isRequired={false}
              champions={champions}
              championsLoading={championsLoading}
              selectedChampions={championsByRole[role]}
              onSelectionChange={(keys) => handleChampionSelectionChange(role, keys)}
            />
          ))}
        </div>
      </div>}

      <div className="flex justify-end gap-3 pt-4">
        {step === 2 && (
          <Button variant="outline" onClick={() => setStep(1)} disabled={isLoading}>
            뒤로
          </Button>
        )}
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          <X className="w-4 h-4 mr-2" />
          취소
        </Button>
        {step === 1 ? (
          <Button onClick={() => setStep(2)} disabled={isLoading}>
            다음
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isLoading || !canSubmit}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoleAccordionSection — 역할별 아코디언 섹션
// ─────────────────────────────────────────────────────────────────────────────

function RoleAccordionSection({
  role,
  label,
  isExpanded,
  onToggle,
  isRequired,
  autoFocusSearch = false,
  champions,
  championsLoading,
  selectedChampions,
  onSelectionChange,
}: {
  role: string;
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  isRequired: boolean;
  autoFocusSearch?: boolean;
  champions: Champion[];
  championsLoading: boolean;
  selectedChampions: string[];
  onSelectionChange: (keys: string[]) => void;
}) {
  const count = selectedChampions.length;
  const isSatisfied = count >= 3;

  return (
    <div className={`rounded-xl border transition-colors ${
      isExpanded ? 'border-bg-elevated bg-bg-secondary/50' : 'border-bg-tertiary'
    }`}>
      {/* 아코디언 헤더 */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2.5 w-full px-4 py-3 text-left"
      >
        <Image
          src={POSITION_ICON_MAP[role] || ""}
          alt={role}
          width={20}
          height={20}
          className="opacity-80"
          unoptimized
        />
        <span className="text-sm font-bold text-text-primary">
          {POSITION_LABEL[role] || role}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          isRequired
            ? 'text-accent-primary bg-accent-primary/10'
            : 'text-text-muted bg-bg-tertiary'
        }`}>
          {label}
        </span>

        {count > 0 && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            isSatisfied
              ? 'text-accent-success bg-accent-success/10'
              : 'text-accent-warning bg-accent-warning/10'
          }`}>
            {count}/{isRequired ? '3+' : '5'}
          </span>
        )}

        {isRequired && !isSatisfied && (
          <span className="w-2 h-2 rounded-full bg-accent-warning animate-pulse" />
        )}

        <ChevronDown className={`w-4 h-4 text-text-muted ml-auto transition-transform duration-200 ${
          isExpanded ? 'rotate-180' : ''
        }`} />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {championsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-text-tertiary" />
            </div>
          ) : (
            <ChampionSelector
              allChampions={champions}
              selectedChampions={selectedChampions}
              onSelectionChange={onSelectionChange}
              maxSelection={5}
              minSelection={isRequired ? 3 : 1}
              isExpanded={isExpanded}
              autoFocus={autoFocusSearch}
            />
          )}
        </div>
      )}
    </div>
  );
}
