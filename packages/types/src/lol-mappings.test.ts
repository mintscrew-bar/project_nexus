/**
 * LoL Game Elements Mapping Tests
 * 챔피언, 아이템, 룬 매핑 함수 테스트
 */

import {
  CHAMPION_MAPPINGS,
  ITEM_MAPPINGS,
  RUNE_MAPPINGS,
  getChampionKoreanName,
  getChampionEnglishName,
  getItemKoreanName,
  getItemEnglishName,
  getRuneKoreanName,
  getRuneEnglishName,
  getAllChampionNames,
  getAllChampionKoreanNames,
  getAllItemNames,
  getAllItemKoreanNames,
  getAllRuneNames,
  getAllRuneKoreanNames,
} from './lol-mappings';

describe('LoL Mappings', () => {
  describe('Champions', () => {
    test('getChampionKoreanName should return korean name', () => {
      expect(getChampionKoreanName('Ahri')).toBe('아리');
      expect(getChampionKoreanName('LeeSin')).toBe('리 신');
      expect(getChampionKoreanName('DrMundo')).toBe('문도 박사');
    });

    test('getChampionKoreanName should return original name if not found', () => {
      expect(getChampionKoreanName('UnknownChampion')).toBe('UnknownChampion');
    });

    test('getChampionEnglishName should return english name', () => {
      expect(getChampionEnglishName('아리')).toBe('Ahri');
      expect(getChampionEnglishName('리 신')).toBe('LeeSin');
      expect(getChampionEnglishName('문도 박사')).toBe('DrMundo');
    });

    test('getChampionEnglishName should return undefined if not found', () => {
      expect(getChampionEnglishName('존재하지않는챔피언')).toBeUndefined();
    });

    test('getAllChampionNames should return all champion keys', () => {
      const names = getAllChampionNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('Ahri');
      expect(names).toContain('LeeSin');
    });

    test('getAllChampionKoreanNames should return all korean names', () => {
      const names = getAllChampionKoreanNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('아리');
      expect(names).toContain('리 신');
    });

    test('Champion mappings should have no duplicate values', () => {
      const values = Object.values(CHAMPION_MAPPINGS);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });

    test('All champions should have english names', () => {
      Object.keys(CHAMPION_MAPPINGS).forEach((englishName) => {
        const koreanName = CHAMPION_MAPPINGS[englishName];
        expect(koreanName).toBeTruthy();
        expect(koreanName.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Items', () => {
    test('getItemKoreanName should return korean name', () => {
      expect(getItemKoreanName('B.F. Sword')).toBe('B.F. 대검');
      expect(getItemKoreanName('Doran\'s Blade')).toBe('도란의 검');
      expect(getItemKoreanName('Abyssal Mask')).toBe('심연의 가면');
    });

    test('getItemKoreanName should return original name if not found', () => {
      expect(getItemKoreanName('UnknownItem')).toBe('UnknownItem');
    });

    test('getItemEnglishName should return english name', () => {
      expect(getItemEnglishName('B.F. 대검')).toBe('B.F. Sword');
      expect(getItemEnglishName('도란의 검')).toBe('Doran\'s Blade');
      expect(getItemEnglishName('심연의 가면')).toBe('Abyssal Mask');
    });

    test('getItemEnglishName should return undefined if not found', () => {
      expect(getItemEnglishName('존재하지않는아이템')).toBeUndefined();
    });

    test('getAllItemNames should return all item keys', () => {
      const names = getAllItemNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('B.F. Sword');
    });

    test('getAllItemKoreanNames should return all korean names', () => {
      const names = getAllItemKoreanNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('B.F. 대검');
    });

    test('Item mappings should have no duplicate values', () => {
      const values = Object.values(ITEM_MAPPINGS);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });
  });

  describe('Runes', () => {
    test('getRuneKoreanName should return korean name', () => {
      expect(getRuneKoreanName('Electrocute')).toBe('감전');
      expect(getRuneKoreanName('Conqueror')).toBe('정복자');
      expect(getRuneKoreanName('First Strike')).toBe('선제공격');
    });

    test('getRuneKoreanName should return original name if not found', () => {
      expect(getRuneKoreanName('UnknownRune')).toBe('UnknownRune');
    });

    test('getRuneEnglishName should return english name', () => {
      expect(getRuneEnglishName('감전')).toBe('Electrocute');
      expect(getRuneEnglishName('정복자')).toBe('Conqueror');
      expect(getRuneEnglishName('선제공격')).toBe('First Strike');
    });

    test('getRuneEnglishName should return undefined if not found', () => {
      expect(getRuneEnglishName('존재하지않는룬')).toBeUndefined();
    });

    test('getAllRuneNames should return all rune keys', () => {
      const names = getAllRuneNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('Electrocute');
      expect(names).toContain('Conqueror');
    });

    test('getAllRuneKoreanNames should return all korean names', () => {
      const names = getAllRuneKoreanNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('감전');
      expect(names).toContain('정복자');
    });

    test('Rune mappings should have no duplicate values', () => {
      const values = Object.values(RUNE_MAPPINGS);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });
  });

  describe('Real-world usage', () => {
    test('should work with auction participant display', () => {
      // 경매 참여자가 선택한 챔피언
      const selectedChampion = 'Ahri';
      const displayName = getChampionKoreanName(selectedChampion);
      expect(displayName).toBe('아리');
    });

    test('should work with item build display', () => {
      // 아이템 빌드 경로
      const itemBuild = ['B.F. Sword', 'Needlessly Large Rod', 'Abyssal Mask'];
      const koreanBuild = itemBuild.map((item) => getItemKoreanName(item));
      expect(koreanBuild).toEqual(['B.F. 대검', '쓸데없이 큰 지팡이', '심연의 가면']);
    });

    test('should work with rune set display', () => {
      // 룬 설정
      const runes = {
        primary: 'Electrocute',
        secondary: 'Absolute Focus',
      };
      const displayRunes = {
        primary: getRuneKoreanName(runes.primary),
        secondary: getRuneKoreanName(runes.secondary),
      };
      expect(displayRunes).toEqual({
        primary: '감전',
        secondary: '절대 집중',
      });
    });

    test('should handle batch conversion', () => {
      // 여러 챔피언 일괄 변환
      const champions = ['Ahri', 'LeeSin', 'Yasuo'];
      const koreanChampions = champions.map((c) => getChampionKoreanName(c));
      expect(koreanChampions).toEqual(['아리', '리 신', '야스오']);
    });

    test('should handle reverse conversion', () => {
      // 한글 선택지를 영문으로 변환
      const selectedKorean = '아리';
      const englishName = getChampionEnglishName(selectedKorean);
      expect(englishName).toBe('Ahri');
    });
  });

  describe('Data integrity', () => {
    test('Champion mappings should contain major champions', () => {
      const requiredChampions = [
        'Ahri',
        'Ahri',
        'LeeSin',
        'Yasuo',
        'Garen',
        'Annie',
        'Lux',
        'Teemo',
      ];
      requiredChampions.forEach((champ) => {
        expect(CHAMPION_MAPPINGS).toHaveProperty(champ);
      });
    });

    test('Item mappings should contain basic items', () => {
      const basicItems = [
        'Doran\'s Shield',
        'Doran\'s Blade',
        'Doran\'s Ring',
        'B.F. Sword',
        'Needlessly Large Rod',
      ];
      basicItems.forEach((item) => {
        expect(ITEM_MAPPINGS).toHaveProperty(item);
      });
    });

    test('Rune mappings should contain major runes', () => {
      const majorRunes = [
        'Electrocute',
        'Conqueror',
        'Lethal Tempo',
        'Grasp of the Undying',
        'Phase Rush',
      ];
      majorRunes.forEach((rune) => {
        expect(RUNE_MAPPINGS).toHaveProperty(rune);
      });
    });

    test('All korean names should be non-empty strings', () => {
      Object.values(CHAMPION_MAPPINGS).forEach((name) => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });

      Object.values(ITEM_MAPPINGS).forEach((name) => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });

      Object.values(RUNE_MAPPINGS).forEach((name) => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });
  });
});
