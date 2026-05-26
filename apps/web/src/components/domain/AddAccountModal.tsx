import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { useRiotStore } from '@/stores/riot-store';
import { useDdragonStore, Champion } from '@/stores/ddragon-store';
import { X, Loader2, AlertCircle, ArrowRight, ChevronDown, Info } from 'lucide-react';
import { ChampionSelector } from './ChampionSelector';
import { PeakTierSelector } from './PeakTierSelector';
import Image from 'next/image';

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
    registerAccount,
    isLoading: storeLoading,
    error: storeError,
    reset: resetRiotStore,
    clearError: clearRiotStoreError,
  } = useRiotStore();

  const { champions, fetchChampions, isLoading: championsLoading } = useDdragonStore();

  // step: Riot ID -> 과거 최고 티어(선택) -> 역할/챔피언
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  // 등록 시 사용할 라이엇 ID 스냅샷 — step 1 통과 후 step 3 에서 그대로 전달
  const [pendingRiotId, setPendingRiotId] = useState<{
    gameName: string;
    tagLine: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [peakTier, setPeakTier] = useState('');
  const [peakRank, setPeakRank] = useState('');

  // 역할 & 챔피언 선택 상태
  const [mainRole, setMainRole] = useState<Role>('MID');
  const [subRole, setSubRole] = useState<Role>('ADC');
  const [championsByRole, setChampionsByRole] = useState<Record<Role, string[]>>({
    TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: []
  });
  // 현재 펼쳐진 섹션 — null이면 전부 접힘
  const [openSection, setOpenSection] = useState<Role | null>('MID');
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (isOpen) {
      fetchChampions();
    } else {
      setStep(1);
      setGameName('');
      setTagLine('');
      setLocalError(null);
      setPendingRiotId(null);
      setIsSubmitting(false);
      setPeakTier('');
      setPeakRank('');
      setMainRole('MID');
      setSubRole('ADC');
      setChampionsByRole({ TOP: [], JUNGLE: [], MID: [], ADC: [], SUPPORT: [] });
      setOpenSection('MID');
      resetRiotStore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  
  useEffect(() => {
    setLocalError(storeError);
  }, [storeError]);

  const handleClearError = () => {
    setLocalError(null);
    setShowCloseWarning(false);
    clearRiotStoreError();
  };

  // step 1: 입력값 검증만 하고 바로 step 3 로 이동. 백엔드 소환사 존재 여부 검증은
  // 최종 등록(registerAccount) 단계에서 puuid 조회 실패 시 명확한 에러로 표면화됨.
  // 추가 라이엇 API 호출을 step 1 에서 미리 하지 않음으로써 단계를 단순화.
  const handleSummonerSubmit = () => {
    handleClearError();
    // 사용자가 "이름#태그"를 통째로 한 칸에 붙여 넣은 경우를 살짝 구제
    const cleanedGameName = gameName.replace(/^#/, '').trim();
    const cleanedTagLine = tagLine.replace(/^#/, '').trim();
    if (!cleanedGameName || !cleanedTagLine) {
      setLocalError('소환사 이름과 태그라인을 입력해주세요.');
      return;
    }
    setPendingRiotId({ gameName: cleanedGameName, tagLine: cleanedTagLine });
    setStep(2);
  };

  const handleGoBackToStep1 = () => {
    setStep(1);
    setPendingRiotId(null);
    handleClearError();
  };

  const handleGoBack = () => {
    if (step === 3) {
      setStep(2);
      handleClearError();
      return;
    }
    handleGoBackToStep1();
  };

  const handleGoToRoleSelection = () => {
    setStep(3);
    handleClearError();
  };

  // 주/부 역할 변경 시 새 주 역할로 이동
  const updateExpandedForRoles = (main: Role, _sub: Role) => {
    setOpenSection(main);
  };

  const toggleSection = (role: Role) => {
    setOpenSection(prev => (prev === role ? null : role));
  };

  // 주/부 역할별 최소 3개 충족 여부
  const mainRoleSatisfied = championsByRole[mainRole].length >= 3;
  const subRoleSatisfied = championsByRole[subRole].length >= 3;
  const canSubmit = mainRoleSatisfied && subRoleSatisfied && mainRole !== subRole;

  const [showCloseWarning, setShowCloseWarning] = useState(false);

  const handleClose = () => {
    if (step === 3) {
      if (!showCloseWarning) {
        setShowCloseWarning(true);
        setLocalError('역할 및 챔피언 선택을 완료하지 않으면 내전에 참여할 수 없습니다. 다시 열면 이 단계부터 이어서 진행할 수 있습니다.');
        return;
      }
      setShowCloseWarning(false);
      onClose();
      return;
    }
    onClose();
  };

  const handleRoleSubmit = async () => {
    handleClearError();
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
    if (!pendingRiotId) {
      setLocalError('소환사 정보가 비어 있습니다. 처음부터 다시 시도해주세요.');
      setStep(1);
      return;
    }
    setIsSubmitting(true);
    try {
      await registerAccount({
        gameName: pendingRiotId.gameName,
        tagLine: pendingRiotId.tagLine,
        mainRole: mainRole,
        subRole: subRole,
        championsByRole: championsByRole,
        peakTier: peakTier || undefined,
        peakRank: peakTier ? peakRank || undefined : undefined,
      });
      onAccountAdded();
      onClose();
    } catch (err: any) {
      // 백엔드 에러 메시지 우선 (axios "Request failed with status code 400" 대신 실제 사유 노출)
      const msg = err?.response?.data?.message || err?.message;
      setLocalError(
        Array.isArray(msg) ? msg.join('\n') : (msg || '계정 등록에 실패했습니다.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleChampionSelectionChange = (role: Role, selectedKeys: string[]) => {
      setChampionsByRole(prev => ({ ...prev, [role]: selectedKeys }));
  };

  const isLoading = isSubmitting || storeLoading;

  const modalTitle = () => {
    switch (step) {
      case 1: return 'Riot 계정 추가 (1/3)';
      case 2: return '최고 티어 입력 (2/3)';
      case 3: return '역할 및 챔피언 선택 (3/3)';
      default: return 'Riot 계정 추가';
    }
  };

  const modalDescription = () => {
    switch (step) {
      case 1: return '소환사 이름과 태그라인을 입력하여 Riot 계정을 연동합니다.';
      case 2: return '과거 시즌에 달성한 최고 티어가 있으면 입력해주세요.';
      case 3: return '주로 플레이하는 역할과 선호 챔피언을 선택해주세요.';
      default: return '';
    }
  };

  const stepHint = () => {
    switch (step) {
      case 1:
        return 'Riot ID는 게임 이름과 태그라인을 나눠서 입력합니다. 예: Hide on bush#KR1';
      case 2:
        return '입력은 선택 사항입니다. 등록 후 계정 수정에서도 추가할 수 있습니다.';
      case 3:
        return '역할과 선호 챔피언은 내전 팀 배정과 밸런싱에 사용됩니다. 처음 한 번만 설정하면 됩니다.';
      default:
        return '';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle()} size="lg">
      {localError && (
        <div className="mb-4 p-3 bg-accent-danger/10 border border-accent-danger rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-accent-danger" />
          <p className="text-sm text-accent-danger whitespace-pre-line">{localError}</p>
        </div>
      )}

      <p className="text-text-secondary mb-4">{modalDescription()}</p>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-accent-primary/25 bg-accent-primary/10 p-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-primary" />
        <p className="text-sm leading-5 text-text-secondary">{stepHint()}</p>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <Label htmlFor="gameName" className="text-text-primary">
                소환사 이름
              </Label>
              <InlineHelp text="Riot ID에서 # 앞에 있는 이름입니다." />
            </div>
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
            <div className="mb-1 flex items-center gap-1.5">
              <Label htmlFor="tagLine" className="text-text-primary">
                태그라인
              </Label>
              <InlineHelp text="Riot ID에서 # 뒤에 있는 값입니다. KR 서버 계정은 보통 KR1 형태입니다." />
            </div>
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

      {step === 3 && (
        <div className="space-y-4">
          {/* ── 역할 선택: 버튼 그룹 ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Label className="text-xs text-text-tertiary">주 역할</Label>
                <InlineHelp text="가장 자주 하거나 가장 자신 있는 포지션입니다. 팀 배정에서 우선 참고합니다." />
              </div>
              <div className="flex gap-1.5">
                {ROLES.map(r => (
                  <button
                    key={r}
                    type="button"
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
              <div className="mb-1.5 flex items-center gap-1.5">
                <Label className="text-xs text-text-tertiary">부 역할</Label>
                <InlineHelp text="주 역할을 못 가는 경우 참고할 대체 포지션입니다." />
              </div>
              <div className="flex gap-1.5">
                {ROLES.map(r => (
                  <button
                    key={r}
                    type="button"
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

          <div className="rounded-lg bg-bg-tertiary/70 px-3 py-2 text-xs leading-5 text-text-secondary">
            주 역할과 부 역할은 각각 선호 챔피언을 최소 3개 선택해야 합니다. 최근에 자주 쓰는 챔피언 위주로 골라도 됩니다.
          </div>

          {/* ── 아코디언 섹션: 주/부 역할 펼침, 나머지 접힘 ── */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {/* 주 역할 섹션 — 자동포커스 대상 */}
            <RoleAccordionSection
              role={mainRole}
              label="주 역할"
              isExpanded={openSection === mainRole}
              onToggle={() => toggleSection(mainRole)}
              isRequired
              autoFocusSearch
              champions={champions}
              championsLoading={championsLoading}
              selectedChampions={championsByRole[mainRole]}
              onSelectionChange={(keys) => handleChampionSelectionChange(mainRole, keys)}
            />
            {/* 주 역할 완료 버튼 */}
            {openSection === mainRole && mainRoleSatisfied && (
              <button
                type="button"
                onClick={() => setOpenSection(subRole)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold text-white bg-accent-primary hover:bg-accent-hover rounded-lg transition-colors"
              >
                주 역할 완료 — 부 역할 선택하기
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* 부 역할 섹션 */}
            {mainRole !== subRole && (
              <RoleAccordionSection
                role={subRole}
                label="부 역할"
                isExpanded={openSection === subRole}
                onToggle={() => toggleSection(subRole)}
                isRequired
                champions={champions}
                championsLoading={championsLoading}
                selectedChampions={championsByRole[subRole]}
                onSelectionChange={(keys) => handleChampionSelectionChange(subRole, keys)}
              />
            )}
            {/* 부 역할 완료 버튼 */}
            {openSection === subRole && subRoleSatisfied && (
              <button
                type="button"
                onClick={() => setOpenSection(null)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold text-white bg-accent-primary hover:bg-accent-hover rounded-lg transition-colors"
              >
                부 역할 완료
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* 나머지 역할 — 선택 사항, 접힌 상태 */}
            {ROLES.filter(r => r !== mainRole && r !== subRole).map(role => (
              <RoleAccordionSection
                key={role}
                role={role}
                label="기타"
                isExpanded={openSection === role}
                onToggle={() => toggleSection(role)}
                isRequired={false}
                champions={champions}
                championsLoading={championsLoading}
                selectedChampions={championsByRole[role]}
                onSelectionChange={(keys) => handleChampionSelectionChange(role, keys)}
              />
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <PeakTierSelector
          peakTier={peakTier}
          peakRank={peakRank}
          onTierChange={setPeakTier}
          onRankChange={setPeakRank}
          disabled={isLoading}
        />
      )}

      <div className="flex justify-end gap-3 pt-4">
        {(step === 2 || step === 3) && (
          <Button variant="outline" onClick={handleGoBack} disabled={isLoading}>
            뒤로
          </Button>
        )}
        <Button variant="outline" onClick={step === 3 ? handleClose : onClose} disabled={isLoading}>
          <X className="w-4 h-4 mr-2" />
          취소
        </Button>
        {step === 1 && (
          <Button onClick={handleSummonerSubmit} disabled={!gameName.trim() || !tagLine.trim() || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            다음
          </Button>
        )}
        {step === 2 && (
          <Button onClick={handleGoToRoleSelection} disabled={isLoading}>
            다음
          </Button>
        )}
        {step === 3 && (
          <Button onClick={handleRoleSubmit} disabled={isLoading || !canSubmit}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            계정 등록
          </Button>
        )}
      </div>
    </Modal>
  );
}

function InlineHelp({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
        aria-label={text}
        title={text}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-56 -translate-x-1/2 rounded-lg border border-bg-tertiary bg-bg-elevated px-3 py-2 text-xs leading-5 text-text-secondary shadow-xl group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoleAccordionSection — 역할별 아코디언 섹션
// ─────────────────────────────────────────────────────────────────────────────

const POSITION_ICON_MAP: Record<string, string> = {
  TOP: "/icons/positions/position-top.svg",
  JUNGLE: "/icons/positions/position-jungle.svg",
  MID: "/icons/positions/position-middle.svg",
  ADC: "/icons/positions/position-bottom.svg",
  SUPPORT: "/icons/positions/position-utility.svg",
};

const POSITION_LABEL: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};

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
  onComplete,
}: {
  role: string;
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  isRequired: boolean;
  /** 검색창 자동포커스 — 주 역할 섹션에만 true */
  autoFocusSearch?: boolean;
  champions: Champion[];
  championsLoading: boolean;
  selectedChampions: string[];
  onSelectionChange: (keys: string[]) => void;
  /** 3개 이상 선택 완료 후 다음 섹션으로 이동 */
  onComplete?: () => void;
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
        {/* 포지션 아이콘 */}
        <Image
          src={POSITION_ICON_MAP[role] || ""}
          alt={role}
          width={20}
          height={20}
          className="opacity-80"
          unoptimized
        />

        {/* 역할 이름 + 라벨 */}
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

        {/* 선택 상태 뱃지 */}
        {count > 0 && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            isSatisfied
              ? 'text-accent-success bg-accent-success/10'
              : 'text-accent-warning bg-accent-warning/10'
          }`}>
            {count}/{isRequired ? '3+' : '5'}
          </span>
        )}

        {/* 필수 미충족 경고 점 */}
        {isRequired && !isSatisfied && (
          <span className="w-2 h-2 rounded-full bg-accent-warning animate-pulse" />
        )}

        {/* 화살표 */}
        <ChevronDown className={`w-4 h-4 text-text-muted ml-auto transition-transform duration-200 ${
          isExpanded ? 'rotate-180' : ''
        }`} />
      </button>

      {/* 아코디언 본문 — 펼침 시 */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {championsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-text-tertiary" />
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs leading-5 text-text-tertiary">
                {isRequired
                  ? '필수 역할은 최소 3개를 선택해야 등록할 수 있습니다.'
                  : '기타 역할은 선택 사항입니다. 가능한 챔피언이 있으면 추가해도 됩니다.'}
              </p>
              <ChampionSelector
                allChampions={champions}
                selectedChampions={selectedChampions}
                onSelectionChange={onSelectionChange}
                maxSelection={5}
                minSelection={isRequired ? 3 : 1}
                isExpanded={isExpanded}
                autoFocus={autoFocusSearch}
                role={role}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
