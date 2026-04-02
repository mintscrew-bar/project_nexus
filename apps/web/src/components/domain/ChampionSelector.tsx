"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/Input';
import { Champion } from '@/stores/ddragon-store';
import { X, ArrowRight } from 'lucide-react';
import Image from 'next/image';

// ─────────────────────────────────────────────────────────────────────────────
// 포지션 아이콘 매핑
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

// ─────────────────────────────────────────────────────────────────────────────
// DDragon 태그 → 한글 라벨
// ─────────────────────────────────────────────────────────────────────────────
const TAG_LABELS: Record<string, string> = {
  Fighter:  '전사',
  Tank:     '탱커',
  Mage:     '마법사',
  Assassin: '암살자',
  Marksman: '원거리딜러',
  Support:  '서포터',
};

// 라인별 기본 선택 탭 (해당 라인과 가장 관련 깊은 태그)
const ROLE_DEFAULT_TAG: Record<string, string> = {
  TOP:     'Fighter',
  JUNGLE:  'Fighter',
  MID:     'Mage',
  ADC:     'Marksman',
  SUPPORT: 'Support',
};

// ─────────────────────────────────────────────────────────────────────────────
// ChampionSelector — 카테고리 탭 + 슬롯 + 검색
// ─────────────────────────────────────────────────────────────────────────────

interface ChampionSelectorProps {
  allChampions: Champion[];
  selectedChampions: string[];
  onSelectionChange: (selectedKeys: string[]) => void;
  maxSelection?: number;
  minSelection?: number;
  /** 포지션 이름 — 슬롯 헤더에 표시 */
  positionKey?: string;
  /** 섹션이 펼쳐진 상태인지 (자동포커스 제어용) */
  isExpanded?: boolean;
  /** 자동포커스 활성화 여부 */
  autoFocus?: boolean;
  /** 라인 이름 — 기본 선택 탭 결정에 사용 */
  role?: string;
}

export function ChampionSelector({
  allChampions,
  selectedChampions,
  onSelectionChange,
  maxSelection = 5,
  minSelection = 3,
  positionKey,
  isExpanded = true,
  autoFocus = false,
  role,
}: ChampionSelectorProps) {
  // 기본 탭: 라인에 맞는 태그, 없으면 '전체'
  const defaultTag = role ? (ROLE_DEFAULT_TAG[role] ?? 'all') : 'all';
  const [activeTag, setActiveTag] = useState<string>(defaultTag);
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // 라인이 바뀌면 탭 초기화
  useEffect(() => {
    setActiveTag(role ? (ROLE_DEFAULT_TAG[role] ?? 'all') : 'all');
  }, [role]);

  // 섹션 펼쳐질 때 검색창 포커스
  useEffect(() => {
    if (isExpanded && autoFocus && searchRef.current) {
      const timer = setTimeout(() => searchRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, autoFocus]);

  // 실제 존재하는 태그만 탭으로 표시
  const availableTags = Object.keys(TAG_LABELS).filter(tag =>
    allChampions.some(c => c.tags.includes(tag))
  );

  // 검색어 + 탭 필터 적용
  const displayedChampions = allChampions.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = activeTag === 'all' || c.tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  // 챔피언 선택/해제 — 선택 후 검색 초기화 + 재포커스
  const handleSelectChampion = useCallback((championKey: string) => {
    if (selectedChampions.includes(championKey)) {
      onSelectionChange(selectedChampions.filter(k => k !== championKey));
    } else if (selectedChampions.length < maxSelection) {
      onSelectionChange([...selectedChampions, championKey]);
      setSearchTerm('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [selectedChampions, onSelectionChange, maxSelection]);

  // 슬롯에서 제거
  const handleRemoveFromSlot = useCallback((championKey: string) => {
    onSelectionChange(selectedChampions.filter(k => k !== championKey));
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [selectedChampions, onSelectionChange]);

  // Enter 키로 첫 번째 검색 결과 선택
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && displayedChampions.length > 0 && searchTerm.trim()) {
      e.preventDefault();
      const firstUnselected = displayedChampions.find(c => !selectedChampions.includes(c.key));
      if (firstUnselected) handleSelectChampion(firstUnselected.key);
    }
  }, [displayedChampions, searchTerm, selectedChampions, handleSelectChampion]);

  const getChampionByKey = (key: string) => allChampions.find(c => c.key === key);
  const isFull = selectedChampions.length >= maxSelection;
  const isSatisfied = selectedChampions.length >= minSelection;

  return (
    <div>
      {/* ── 슬롯 시각화 ── */}
      <div className="flex items-center gap-2 mb-3">
        {positionKey && (
          <div className="flex items-center gap-1.5 mr-1 shrink-0">
            <Image
              src={POSITION_ICON_MAP[positionKey] || ""}
              alt={positionKey}
              width={18}
              height={18}
              className="opacity-70"
              unoptimized
            />
            <span className="text-xs font-bold text-text-secondary">
              {POSITION_LABEL[positionKey] || positionKey}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {Array.from({ length: maxSelection }).map((_, i) => {
            const championKey = selectedChampions[i];
            const champion = championKey ? getChampionByKey(championKey) : null;

            if (champion) {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleRemoveFromSlot(champion.key)}
                  className="group/slot relative w-10 h-10 rounded-lg overflow-hidden border-2 border-accent-primary/60 hover:border-accent-danger transition-colors"
                  title={`${champion.name} 제거`}
                >
                  <Image
                    src={`/icons/champions/${champion.image.full}`}
                    alt={champion.name}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center justify-center">
                    <X className="w-4 h-4 text-accent-danger" />
                  </div>
                </button>
              );
            }

            return (
              <div
                key={i}
                className={`w-10 h-10 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${
                  i < minSelection
                    ? 'border-text-muted/40 bg-bg-tertiary/50'
                    : 'border-text-muted/20 bg-bg-tertiary/30'
                }`}
              >
                <span className="text-[10px] text-text-muted/40">{i + 1}</span>
              </div>
            );
          })}
        </div>

      </div>

      {/* ── 카테고리 탭 ── */}
      <div className="flex flex-wrap gap-1 mb-2">
        <button
          type="button"
          onClick={() => setActiveTag('all')}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            activeTag === 'all'
              ? 'bg-accent-primary text-white'
              : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
          }`}
        >
          전체
        </button>
        {availableTags.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveTag(tag)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
              activeTag === tag
                ? 'bg-accent-primary text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            {TAG_LABELS[tag]}
          </button>
        ))}
      </div>

      {/* ── 검색창 ── */}
      <Input
        ref={searchRef}
        placeholder="챔피언 이름 검색 → Enter로 빠른 선택"
        value={searchTerm}
        onChange={e => {
          setSearchTerm(e.target.value);
          // 검색 시작하면 전체 탭으로 전환 (원하는 챔피언을 카테고리 상관없이)
          if (e.target.value) setActiveTag('all');
        }}
        onKeyDown={handleKeyDown}
        className="mb-2"
      />

      {/* ── 챔피언 그리드 ── */}
      <div className="grid grid-cols-6 sm:grid-cols-7 md:grid-cols-8 gap-1.5 max-h-[320px] overflow-y-scroll pr-1 scrollbar-thin" style={{ scrollbarGutter: 'stable' }}>
        {displayedChampions.length === 0 ? (
          <p className="col-span-full text-center text-sm text-text-muted py-6">
            검색 결과가 없습니다
          </p>
        ) : (
          displayedChampions.map(c => (
            <ChampionButton
              key={c.key}
              champion={c}
              isSelected={selectedChampions.includes(c.key)}
              isDisabled={!selectedChampions.includes(c.key) && isFull}
              onSelect={handleSelectChampion}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChampionButton — 챔피언 그리드 셀
// ─────────────────────────────────────────────────────────────────────────────
function ChampionButton({
  champion,
  isSelected,
  isDisabled,
  onSelect,
}: {
  champion: Champion;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`relative rounded-lg overflow-hidden border-2 transition-all duration-150 ${
        isSelected
          ? 'border-accent-primary ring-1 ring-accent-primary/30 brightness-110'
          : isDisabled
            ? 'border-transparent opacity-30 cursor-not-allowed'
            : 'border-transparent hover:border-text-muted/40 hover:brightness-110'
      }`}
      onClick={() => onSelect(champion.key)}
      title={champion.name}
    >
      <Image
        src={`/icons/champions/${champion.image.full}`}
        alt={champion.name}
        width={48}
        height={48}
        className="w-full h-auto"
        unoptimized
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      {isSelected && (
        <div className="absolute inset-0 bg-accent-primary/20 flex items-center justify-center">
          <div className="w-5 h-5 bg-accent-primary rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">✓</span>
          </div>
        </div>
      )}
      {!isSelected && !isDisabled && (
        <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-0.5">
          <p className="text-white text-[9px] font-bold leading-tight text-center truncate px-0.5">
            {champion.name}
          </p>
        </div>
      )}
    </button>
  );
}
