"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/Input';
import { Champion } from '@/stores/ddragon-store';
import { X } from 'lucide-react';
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
// ChampionSelector — 슬롯 시각화 + 자동포커스 검색 + 키보드 지원
// ─────────────────────────────────────────────────────────────────────────────

interface ChampionSelectorProps {
  allChampions: Champion[];
  selectedChampions: string[];       // 선택된 챔피언 key 배열
  onSelectionChange: (selectedKeys: string[]) => void;
  maxSelection?: number;
  minSelection?: number;
  /** 포지션 이름 — 슬롯 헤더에 표시 */
  positionKey?: string;
  /** 섹션이 펼쳐진 상태인지 (자동포커스 제어용) */
  isExpanded?: boolean;
  /** 자동포커스 활성화 여부 */
  autoFocus?: boolean;
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
}: ChampionSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // 섹션이 펼쳐질 때 검색창 포커스
  useEffect(() => {
    if (isExpanded && autoFocus && searchRef.current) {
      // 약간의 딜레이로 아코디언 애니메이션 이후 포커스
      const timer = setTimeout(() => searchRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, autoFocus]);

  const filteredChampions = allChampions.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 챔피언 선택/해제 핸들러 — 선택 후 검색 초기화 + 재포커스
  const handleSelectChampion = useCallback((championKey: string) => {
    if (selectedChampions.includes(championKey)) {
      onSelectionChange(selectedChampions.filter(key => key !== championKey));
    } else if (selectedChampions.length < maxSelection) {
      onSelectionChange([...selectedChampions, championKey]);
      // 선택 후 검색 초기화 + 재포커스 (연속 입력 UX)
      setSearchTerm('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [selectedChampions, onSelectionChange, maxSelection]);

  // 슬롯에서 챔피언 제거
  const handleRemoveFromSlot = useCallback((championKey: string) => {
    onSelectionChange(selectedChampions.filter(key => key !== championKey));
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [selectedChampions, onSelectionChange]);

  // Enter 키로 첫 번째 검색 결과 선택
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredChampions.length > 0 && searchTerm.trim()) {
      e.preventDefault();
      // 이미 선택된 건 건너뛰고 첫 번째 미선택 챔피언 선택
      const firstUnselected = filteredChampions.find(
        c => !selectedChampions.includes(c.key)
      );
      if (firstUnselected) {
        handleSelectChampion(firstUnselected.key);
      }
    }
  }, [filteredChampions, searchTerm, selectedChampions, handleSelectChampion]);

  // 선택된 챔피언의 Champion 객체 조회
  const getChampionByKey = (key: string) =>
    allChampions.find(c => c.key === key);

  const isFull = selectedChampions.length >= maxSelection;
  const isSatisfied = selectedChampions.length >= minSelection;

  return (
    <div>
      {/* ── 슬롯 시각화: 빈 칸이 챡챡 채워지는 UI ── */}
      <div className="flex items-center gap-2 mb-3">
        {/* 포지션 아이콘 + 이름 */}
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

        {/* 슬롯 칸들 */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: maxSelection }).map((_, i) => {
            const championKey = selectedChampions[i];
            const champion = championKey ? getChampionByKey(championKey) : null;

            if (champion) {
              // 채워진 슬롯 — 챔피언 아이콘 + X 버튼
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
                  {/* 호버 시 X 오버레이 */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center justify-center">
                    <X className="w-4 h-4 text-accent-danger" />
                  </div>
                </button>
              );
            }

            // 빈 슬롯
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

        {/* 달성 상태 표시 */}
        <span className={`text-xs font-medium ml-auto shrink-0 px-2 py-0.5 rounded-full ${
          isFull
            ? 'text-accent-primary bg-accent-primary/10'
            : isSatisfied
              ? 'text-accent-success bg-accent-success/10'
              : 'text-accent-warning bg-accent-warning/10'
        }`}>
          {selectedChampions.length}/{minSelection}+
        </span>
      </div>

      {/* ── 검색창 — 자동포커스 + Enter 선택 ── */}
      <Input
        ref={searchRef}
        placeholder="챔피언 이름 검색 → Enter로 빠른 선택"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown}
        className="mb-3"
      />

      {/* ── 챔피언 그리드 — 확장된 높이 ── */}
      <div className="grid grid-cols-6 sm:grid-cols-7 md:grid-cols-8 gap-1.5 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
        {filteredChampions.map(champion => {
          const isSelected = selectedChampions.includes(champion.key);
          const isDisabled = !isSelected && isFull;

          return (
            <button
              key={champion.key}
              type="button"
              disabled={isDisabled}
              className={`relative rounded-lg overflow-hidden border-2 transition-all duration-150 ${
                isSelected
                  ? 'border-accent-primary ring-1 ring-accent-primary/30 scale-95'
                  : isDisabled
                    ? 'border-transparent opacity-30 cursor-not-allowed'
                    : 'border-transparent hover:border-text-muted/30 hover:scale-105'
              }`}
              onClick={() => handleSelectChampion(champion.key)}
              title={champion.name}
            >
              <Image
                src={`/icons/champions/${champion.image.full}`}
                alt={champion.name}
                width={48}
                height={48}
                className="w-full h-auto"
                unoptimized
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              {/* 선택된 챔피언 체크 오버레이 */}
              {isSelected && (
                <div className="absolute inset-0 bg-accent-primary/20 flex items-center justify-center">
                  <div className="w-5 h-5 bg-accent-primary rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                </div>
              )}
              {/* 호버 시 이름 표시 */}
              {!isSelected && !isDisabled && (
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-0.5">
                  <p className="text-white text-[9px] font-bold leading-tight text-center truncate px-0.5">
                    {champion.name}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
