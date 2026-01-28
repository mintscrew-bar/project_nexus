"use client";

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Champion } from '@/stores/ddragon-store';
import Image from 'next/image';

interface ChampionSelectorProps {
  allChampions: Champion[];
  selectedChampions: string[]; // Array of champion keys
  onSelectionChange: (selectedKeys: string[]) => void;
  maxSelection?: number;
}

const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com/cdn";
const version = "13.24.1"; // This should come from ddragon-store

export function ChampionSelector({
  allChampions,
  selectedChampions,
  onSelectionChange,
  maxSelection = 5,
}: ChampionSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredChampions = allChampions.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectChampion = (championKey: string) => {
    if (selectedChampions.includes(championKey)) {
      onSelectionChange(selectedChampions.filter(key => key !== championKey));
    } else if (selectedChampions.length < maxSelection) {
      onSelectionChange([...selectedChampions, championKey]);
    }
  };

  return (
    <div>
      <Input
        placeholder="챔피언 검색..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="mb-4"
      />
      <div className="grid grid-cols-5 md:grid-cols-7 gap-2 max-h-[300px] overflow-y-auto pr-2">
        {filteredChampions.map(champion => (
          <div
            key={champion.key}
            className={`relative rounded-md overflow-hidden cursor-pointer border-2 ${
              selectedChampions.includes(champion.key)
                ? 'border-accent-primary'
                : 'border-transparent'
            }`}
            onClick={() => handleSelectChampion(champion.key)}
          >
            <Image
              src={`${DDRAGON_BASE_URL}/${version}/img/champion/${champion.image.full}`}
              alt={champion.name}
              width={64}
              height={64}
              className="w-full h-auto transition-transform duration-200 hover:scale-110"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-xs text-center font-bold">{champion.name}</p>
            </div>
            {selectedChampions.includes(champion.key) && (
              <div className="absolute top-0 right-0 w-4 h-4 bg-accent-primary text-white flex items-center justify-center text-xs rounded-bl-md">
                ✓
              </div>
            )}
          </div>
        ))}
      </div>
       <p className="text-xs text-right mt-2 text-text-secondary">
        {selectedChampions.length} / {maxSelection}
      </p>
    </div>
  );
}
