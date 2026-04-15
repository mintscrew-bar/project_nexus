/**
 * LoL Game Elements Mapping Tests
 * 챔피언, 아이템, 룬 매핑 함수 테스트
 */

import {
  CHAMPION_MAPPINGS,
  ITEM_MAPPINGS,
  RUNE_MAPPINGS,
  SUMMONER_SPELL_MAPPINGS,
  getChampionKoreanName,
  getChampionEnglishName,
  getItemKoreanName,
  getItemEnglishName,
  getRuneKoreanName,
  getRuneEnglishName,
  getSummonerSpellKoreanName,
  getAllChampionNames,
  getAllChampionKoreanNames,
  getAllItemNames,
  getAllItemKoreanNames,
  getAllRuneNames,
  getAllRuneKoreanNames,
  searchChampionsByQuery,
  searchItemsByQuery,
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

  describe('Summoner Spells', () => {
    test('getSummonerSpellKoreanName should return korean name for known IDs', () => {
      // 주요 소환사 주문 ID 조회 검증
      expect(getSummonerSpellKoreanName(4)).toBe('점멸');
      expect(getSummonerSpellKoreanName(11)).toBe('강타');
      expect(getSummonerSpellKoreanName(14)).toBe('점화');
      expect(getSummonerSpellKoreanName(12)).toBe('순간이동');
      expect(getSummonerSpellKoreanName(21)).toBe('방어막');
      expect(getSummonerSpellKoreanName(1)).toBe('정화');
      expect(getSummonerSpellKoreanName(3)).toBe('탈진');
      expect(getSummonerSpellKoreanName(6)).toBe('유체화');
      expect(getSummonerSpellKoreanName(7)).toBe('회복');
      expect(getSummonerSpellKoreanName(13)).toBe('총명');
    });

    test('getSummonerSpellKoreanName should return string of the id for unknown IDs', () => {
      // 존재하지 않는 ID는 숫자 문자열로 반환
      expect(getSummonerSpellKoreanName(9999)).toBe('9999');
      expect(getSummonerSpellKoreanName(0)).toBe('0');
    });

    test('SUMMONER_SPELL_MAPPINGS should contain all standard summoner spells', () => {
      // 일반 솔로랭크에서 사용하는 핵심 소환사 주문 포함 여부 확인
      const standardSpells = [4, 11, 14, 12, 21, 1, 3, 6, 7];
      standardSpells.forEach((spellId) => {
        expect(SUMMONER_SPELL_MAPPINGS).toHaveProperty(String(spellId));
      });
    });

    test('All summoner spell names should be non-empty strings', () => {
      // 매핑된 모든 주문 이름이 비어 있지 않은 문자열인지 검증
      Object.values(SUMMONER_SPELL_MAPPINGS).forEach((name) => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });

    test('should work with MatchParticipant summoner spell display', () => {
      // DB에서 읽어온 summoner1Id/summoner2Id를 화면에 표시하는 시나리오
      const summoner1Id = 4;  // 점멸
      const summoner2Id = 11; // 강타
      expect(getSummonerSpellKoreanName(summoner1Id)).toBe('점멸');
      expect(getSummonerSpellKoreanName(summoner2Id)).toBe('강타');
    });
  });

  describe('searchChampionsByQuery', () => {
    test('한글 전체 이름으로 검색 — "아리" → Ahri 포함', () => {
      const result = searchChampionsByQuery('아리');
      expect(result).toContain('Ahri');
    });

    test('영문 부분 문자열로 검색 — "Ah" → Ahri 포함', () => {
      const result = searchChampionsByQuery('Ah');
      expect(result).toContain('Ahri');
    });

    test('영문 소문자로 검색 — "ah" → Ahri 포함', () => {
      const result = searchChampionsByQuery('ah');
      expect(result).toContain('Ahri');
    });

    test('빈 쿼리 — 전체 챔피언 목록 반환', () => {
      const result = searchChampionsByQuery('');
      expect(result.length).toBe(Object.keys(CHAMPION_MAPPINGS).length);
    });

    test('공백만 있는 쿼리 — 전체 챔피언 목록 반환', () => {
      const result = searchChampionsByQuery('   ');
      expect(result.length).toBe(Object.keys(CHAMPION_MAPPINGS).length);
    });

    test('존재하지 않는 이름 검색 — 빈 배열 반환', () => {
      const result = searchChampionsByQuery('없는챔피언xyz');
      expect(result).toHaveLength(0);
    });

    test('한글 부분 이름으로 검색 — "아" → 아리, 아트록스 등 포함', () => {
      const result = searchChampionsByQuery('아');
      expect(result).toContain('Ahri');
      expect(result).toContain('Aatrox');
    });

    test('검색 결과 타입이 영문 이름 배열인지 확인', () => {
      const result = searchChampionsByQuery('Garen');
      expect(result).toContain('Garen');
      // 결과가 영문 키인지 확인 (한글이 아니어야 함)
      result.forEach(name => {
        expect(CHAMPION_MAPPINGS).toHaveProperty(name);
      });
    });
  });

  describe('searchItemsByQuery', () => {
    test('영문 부분 문자열로 검색 — "Doran" → 도란 계열 아이템 포함', () => {
      const result = searchItemsByQuery('Doran');
      expect(result).toContain("Doran's Blade");
      expect(result).toContain("Doran's Shield");
      expect(result).toContain("Doran's Ring");
    });

    test('한글로 검색 — "도란" → 도란 계열 아이템 포함', () => {
      const result = searchItemsByQuery('도란');
      expect(result).toContain("Doran's Blade");
      expect(result).toContain("Doran's Shield");
      expect(result).toContain("Doran's Ring");
    });

    test('빈 쿼리 — 전체 아이템 목록 반환', () => {
      const result = searchItemsByQuery('');
      expect(result.length).toBe(Object.keys(ITEM_MAPPINGS).length);
    });

    test('존재하지 않는 이름 검색 — 빈 배열 반환', () => {
      const result = searchItemsByQuery('없는아이템xyz');
      expect(result).toHaveLength(0);
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
