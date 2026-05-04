/**
 * League of Legends 영문->한글 매핑 데이터
 * 챔피언, 아이템, 룬의 공식 한글 이름 데이터
 * 출처: Riot Games Dragon API (14.8.1 패치 기준)
 */

// ============================================
// 챔피언 이름 매핑
// ============================================

export const CHAMPION_MAPPINGS: Record<string, string> = {
  "Aatrox": "아트록스",
  "Ahri": "아리",
  "Akali": "아칼리",
  "Akshan": "아크샨",
  "Alistar": "알리스타",
  "Amumu": "아무무",
  "Anivia": "애니비아",
  "Annie": "애니",
  "Aphelios": "아펠리오스",
  "Ashe": "애쉬",
  "AurelionSol": "아우렐리온 솔",
  "Azir": "아지르",
  "Bard": "바드",
  "Belveth": "벨베스",
  "Blitzcrank": "블리츠크랭크",
  "Brand": "브랜드",
  "Braum": "브라움",
  "Briar": "브라이어",
  "Caitlyn": "케이틀린",
  "Camille": "카밀",
  "Cassiopeia": "카시오페아",
  "Chogath": "초가스",
  "Corki": "코르키",
  "Darius": "다리우스",
  "Diana": "다이애나",
  "Draven": "드레이븐",
  "DrMundo": "문도 박사",
  "Ekko": "에코",
  "Elise": "엘리스",
  "Evelynn": "이블린",
  "Ezreal": "이즈리얼",
  "Fiddlesticks": "피들스틱",
  "Fiora": "피오라",
  "Fizz": "피즈",
  "Galio": "갈리오",
  "Gangplank": "갱플랭크",
  "Garen": "가렌",
  "Gnar": "나르",
  "Gragas": "그라가스",
  "Graves": "그레이브즈",
  "Gwen": "그웬",
  "Hecarim": "헤카림",
  "Heimerdinger": "하이머딩거",
  "Hwei": "흐웨이",
  "Illaoi": "일라오이",
  "Irelia": "이렐리아",
  "Ivern": "아이번",
  "Janna": "잔나",
  "JarvanIV": "자르반 4세",
  "Jax": "잭스",
  "Jayce": "제이스",
  "Jhin": "진",
  "Jinx": "징크스",
  "Kaisa": "카이사",
  "Kalista": "칼리스타",
  "Karma": "카르마",
  "Karthus": "카서스",
  "Kassadin": "카사딘",
  "Katarina": "카타리나",
  "Kayle": "케일",
  "Kayn": "케인",
  "Kennen": "케넨",
  "Khazix": "카직스",
  "Kindred": "킨드레드",
  "Kled": "클레드",
  "KogMaw": "코그모",
  "KSante": "크산테",
  "Leblanc": "르블랑",
  "LeeSin": "리 신",
  "Leona": "레오나",
  "Lillia": "릴리아",
  "Lissandra": "리산드라",
  "Lucian": "루시안",
  "Lulu": "룰루",
  "Lux": "럭스",
  "Malphite": "말파이트",
  "Malzahar": "말자하",
  "Maokai": "마오카이",
  "MasterYi": "마스터 이",
  "Milio": "밀리오",
  "Mel": "멜",
  "MissFortune": "미스 포츈",
  "MonkeyKing": "오공",
  "Mordekaiser": "모데카이저",
  "Morgana": "모르가나",
  "Naafiri": "나피리",
  "Nami": "나미",
  "Nasus": "나서스",
  "Nautilus": "노틸러스",
  "Neeko": "니코",
  "Nidalee": "니달리",
  "Nilah": "닐라",
  "Nocturne": "녹턴",
  "Nunu": "누누와 윌럼프",
  "Olaf": "올라프",
  "Orianna": "오리아나",
  "Ornn": "오른",
  "Pantheon": "판테온",
  "Poppy": "뽀삐",
  "Pyke": "파이크",
  "Qiyana": "키아나",
  "Quinn": "퀸",
  "Rakan": "라칸",
  "Rammus": "람머스",
  "RekSai": "렉사이",
  "Rell": "렐",
  "Renata": "레나타 글라스크",
  "Renekton": "레넥톤",
  "Rengar": "렝가",
  "Riven": "리븐",
  "Rumble": "럼블",
  "Ryze": "라이즈",
  "Samira": "사미라",
  "Sejuani": "세주아니",
  "Senna": "세나",
  "Seraphine": "세라핀",
  "Sett": "셋",
  "Shaco": "샤코",
  "Shen": "쉔",
  "Shyvana": "쉬바나",
  "Singed": "신지드",
  "Sion": "사이온",
  "Sivir": "시비르",
  "Skarner": "스카너",
  "Sona": "소나",
  "Soraka": "소라카",
  "Swain": "스웨인",
  "Sylas": "사일러스",
  "Syndra": "신드라",
  "TahmKench": "탐 켄치",
  "Taliyah": "탈리야",
  "Talon": "탈론",
  "Taric": "타릭",
  "Teemo": "티모",
  "Thresh": "쓰레쉬",
  "Tristana": "트리스타나",
  "Trundle": "트런들",
  "Tryndamere": "트린다미르",
  "TwistedFate": "트위스티드 페이트",
  "Twitch": "트위치",
  "Udyr": "우디르",
  "Urgot": "우르곳",
  "Varus": "바루스",
  "Vayne": "베인",
  "Veigar": "베이가",
  "Vex": "벡스",
  "Vi": "바이",
  "Viego": "비에고",
  "Viktor": "빅토르",
  "Vladimir": "블라디미르",
  "Volibear": "볼리베어",
  "Warwick": "워윅",
  "Wukong": "우콩",
  "Xayah": "자야",
  "Xerath": "제라스",
  "XinZhao": "신짜오",
  "Yasuo": "야스오",
  "Yone": "요네",
  "Yorick": "요릭",
  "Yuumi": "유미",
  "Zac": "자크",
  "Zed": "제드",
  "Zeri": "제리",
  "Ziggs": "직스",
  "Zilean": "질리언",
  "Zoe": "조이",
  "Zyra": "자이라",
  "Ambessa": "암베사",
  "Yunara": "유나라",
  "Smolder": "스몰더",
  "Aurora": "오로라",
};

// ============================================
// 주요 아이템 이름 매핑
// ============================================

export const ITEM_MAPPINGS: Record<string, string> = {
  "Boots": "장화",
  "Faerie Charm": "요정의 부적",
  "Rejuvenation Bead": "원기 회복의 구슬",
  "Giant's Belt": "거인의 허리띠",
  "Cloak of Agility": "민첩성의 망토",
  "Blasting Wand": "방출의 마법봉",
  "Sapphire Crystal": "사파이어 수정",
  "Ruby Crystal": "루비 수정",
  "Cloth Armor": "천 갑옷",
  "Chain Vest": "쇠사슬 조끼",
  "Null-Magic Mantle": "마법무효화의 망토",
  "Negatron Cloak": "음전자 망토",
  "Needlessly Large Rod": "쓸데없이 큰 지팡이",
  "Doran's Shield": "도란의 방패",
  "Doran's Blade": "도란의 검",
  "Doran's Ring": "도란의 반지",
  "B.F. Sword": "B.F. 대검",
  "Long Sword": "롱소드",
  "Pickaxe": "곡괭이",
  "Dagger": "단검",
  "Recurve Bow": "곡궁",
  "Abyssal Mask": "심연의 가면",
  "Adaptive Helm": "적응형 투구",
  "Aether Wisp": "에테르 미스트",
  "Amplifying Tome": "증폭 비약",
  "Anathema's Chains": "저주의 쇠사슬",
  "Ardent Censer": "열정의 향로",
  "Banshee's Veil": "밴시의 베일",
  "Black Cleaver": "검은 칼날",
  "Bloodthirster": "피아귀",
  "Boots of Speed": "이동속도 신발",
  "Boots of Swiftness": "신속의 신발",
  "Bramble Vest": "가시 조끼",
  "Brawler's Gauntlets": "격투가의 건틀릿",
  "Brutalizer": "야만성",
  "Buckler": "방패",
  "Bulwark": "보루",
  "Burning Compass": "타오르는 나침반",
  "Butcher's Cleaver": "정육점주의 칼날",
};

// ============================================
// 룬 이름 매핑
// ============================================

export const RUNE_MAPPINGS: Record<string, string> = {
  // Domination (지배)
  "Electrocute": "감전",
  "Predator": "포식자",
  "Dark Harvest": "어둠의 수확",
  "Hail of Blades": "칼날비",

  // Inspiration (영감)
  "Glacial Augment": "빙결 강화",
  "Unsealed Spellbook": "봉인 풀린 주문서",
  "First Strike": "선제공격",

  // Precision (정밀)
  "Press the Attack": "집중 공격",
  "Lethal Tempo": "치명적 속도",
  "Fleet Footwork": "기민한 발놀림",
  "Conqueror": "정복자",

  // Resolve (결의)
  "Grasp of the Undying": "착취의 손아귀",
  "Aftershock": "여진",
  "Guardian": "수호자",

  // Sorcery (마법)
  "Summon Aery": "콩콩이 소환",
  "Arcane Comet": "신비로운 유성",
  "Phase Rush": "난입",

  // Secondary Runes (보조 룬)
  "Triumph": "승리",
  "Presence of Mind": "정신 집중",
  "Legend: Alacrity": "전설: 민첩성",
  "Legend: Tenacity": "전설: 강인함",
  "Legend: Bloodline": "전설: 핏줄",
  "Last Stand": "최후의 저항",
  "Cutdown": "깎아내림",
  "Coup de Grace": "최종 일격",
  "Conditioning": "적응",
  "Second Wind": "재기의 바람",
  "Bone Plating": "뼈 판정",
  "Overgrowth": "초과성장",
  "Revitalize": "부활",
  "Unflinching": "굴하지 않음",
  "Absolute Focus": "절대 집중",
  "Celerity": "신속함",
  "Manaflow Band": "마나 흐름 띠",
  "Nimbus Cloak": "구름 망토",
  "Waterwalking": "물 위 걷기",
  "Transcendence": "초월",
  "Scorch": "작열",
  "Gathering Storm": "폭풍의 모임",
  "Cosmic Insight": "우주 통찰",
  "Perfect Timing": "완벽한 타이밍",
  "Biscuit Delivery": "비스킷 배달",
  "Stopwatch": "정지시계",
  "Futures Market": "선물 시장",
  "Magical Footwear": "마법의 신발",
  "Minion Dematerializer": "미니언 해체기",
  "Jack of All Trades": "만능꾼",
  "Approach Velocity": "근접 속도",
  "Time Warp Tonic": "시간 왜곡 강장제",
};

// ============================================
// 헬퍼 함수
// ============================================

/**
 * 챔피언의 영문 이름을 한글로 변환
 * @param championName - 영문 챔피언 이름
 * @returns 한글 챔피언 이름, 매핑이 없으면 원래 이름 반환
 */
export function getChampionKoreanName(championName: string): string {
  return CHAMPION_MAPPINGS[championName] ?? championName;
}

/**
 * 아이템의 영문 이름을 한글로 변환
 * @param itemName - 영문 아이템 이름
 * @returns 한글 아이템 이름, 매핑이 없으면 원래 이름 반환
 */
export function getItemKoreanName(itemName: string): string {
  return ITEM_MAPPINGS[itemName] ?? itemName;
}

/**
 * 룬의 영문 이름을 한글로 변환
 * @param runeName - 영문 룬 이름
 * @returns 한글 룬 이름, 매핑이 없으면 원래 이름 반환
 */
export function getRuneKoreanName(runeName: string): string {
  return RUNE_MAPPINGS[runeName] ?? runeName;
}

/**
 * 역 매핑: 한글 이름을 영문으로 변환 (챔피언)
 * @param koreanName - 한글 챔피언 이름
 * @returns 영문 챔피언 이름, 매핑이 없으면 undefined 반환
 */
export function getChampionEnglishName(koreanName: string): string | undefined {
  return Object.entries(CHAMPION_MAPPINGS).find(([, v]) => v === koreanName)?.[0];
}

/**
 * 역 매핑: 한글 이름을 영문으로 변환 (아이템)
 * @param koreanName - 한글 아이템 이름
 * @returns 영문 아이템 이름, 매핑이 없으면 undefined 반환
 */
export function getItemEnglishName(koreanName: string): string | undefined {
  return Object.entries(ITEM_MAPPINGS).find(([, v]) => v === koreanName)?.[0];
}

/**
 * 역 매핑: 한글 이름을 영문으로 변환 (룬)
 * @param koreanName - 한글 룬 이름
 * @returns 영문 룬 이름, 매핑이 없으면 undefined 반환
 */
export function getRuneEnglishName(koreanName: string): string | undefined {
  return Object.entries(RUNE_MAPPINGS).find(([, v]) => v === koreanName)?.[0];
}

/**
 * 모든 챔피언의 영문 이름 목록 반환
 */
export function getAllChampionNames(): string[] {
  return Object.keys(CHAMPION_MAPPINGS);
}

/**
 * 모든 챔피언의 한글 이름 목록 반환
 */
export function getAllChampionKoreanNames(): string[] {
  return Object.values(CHAMPION_MAPPINGS);
}

/**
 * 모든 아이템의 영문 이름 목록 반환
 */
export function getAllItemNames(): string[] {
  return Object.keys(ITEM_MAPPINGS);
}

/**
 * 모든 아이템의 한글 이름 목록 반환
 */
export function getAllItemKoreanNames(): string[] {
  return Object.values(ITEM_MAPPINGS);
}

/**
 * 모든 룬의 영문 이름 목록 반환
 */
export function getAllRuneNames(): string[] {
  return Object.keys(RUNE_MAPPINGS);
}

/**
 * 모든 룬의 한글 이름 목록 반환
 */
export function getAllRuneKoreanNames(): string[] {
  return Object.values(RUNE_MAPPINGS);
}

// ============================================
// 소환사 주문 매핑 (숫자 ID → 한글 이름)
// 출처: Riot Games Data Dragon 16.8.1 패치 기준
// DB의 MatchParticipant.summoner1Id / summoner2Id 필드에 저장된 ID와 매핑
// ============================================

export const SUMMONER_SPELL_MAPPINGS: Record<number, string> = {
  1: "정화",         // SummonerBoost — 군중 제어 해제
  2202: "점멸",      // SummonerCherryFlash — 아레나 모드 전용 점멸
  2201: "도주",      // SummonerCherryHold — 아레나 모드 전용 이동기
  14: "점화",        // SummonerDot — 점화
  3: "탈진",         // SummonerExhaust — 탈진
  4: "점멸",         // SummonerFlash — 표준 점멸
  6: "유체화",       // SummonerHaste — 유체화(고스트)
  7: "회복",         // SummonerHeal — 회복
  13: "총명",        // SummonerMana — 총명
  30: "왕을 향해!",  // SummonerPoroRecall — 칼바람 나락 포로 귀환
  31: "포로 던지기", // SummonerPoroThrow — 칼바람 나락 포로 던지기
  11: "강타",        // SummonerSmite — 강타
  39: "표식",        // SummonerSnowURFSnowball_Mark — 눈보라 URF 눈덩이
  32: "표식",        // SummonerSnowball — 일반 표식(칼바람)
  21: "방어막",      // SummonerBarrier — 방어막
  12: "순간이동",    // SummonerTeleport — 순간이동
  54: "결정 미완료", // Summoner_UltBookPlaceholder — 자리 채움용(궁 주문서)
  55: "결정 미완료(강타)", // Summoner_UltBookSmitePlaceholder — 자리 채움용(강타)
};

/**
 * 소환사 주문 ID로 한글 이름 조회
 * @param spellId - DB에 저장된 숫자형 소환사 주문 ID
 * @returns 한글 소환사 주문 이름, 매핑이 없으면 숫자 문자열 반환
 */
export function getSummonerSpellKoreanName(spellId: number): string {
  return SUMMONER_SPELL_MAPPINGS[spellId] ?? String(spellId);
}

// ============================================
// 검색 유틸리티 (한글/영문 모두 지원)
// ============================================

/**
 * 챔피언 이름 검색 — 한글 또는 영문 쿼리 모두 지원
 * 부분 일치(포함 여부)로 검색
 * @param query - 검색어 (한글 또는 영문, 빈 문자열이면 전체 반환)
 * @returns 매칭된 영문 챔피언 이름 배열
 */
export function searchChampionsByQuery(query: string): string[] {
  // 빈 쿼리면 전체 챔피언 목록 반환
  if (!query.trim()) return Object.keys(CHAMPION_MAPPINGS);
  const q = query.toLowerCase().trim();
  return Object.entries(CHAMPION_MAPPINGS)
    .filter(([en, ko]) =>
      // 영문 이름 소문자 부분 일치 또는 한글 이름 부분 일치
      en.toLowerCase().includes(q) || ko.includes(query.trim())
    )
    .map(([en]) => en);
}

/**
 * 아이템 이름 검색 — 한글 또는 영문 쿼리 모두 지원
 * 부분 일치(포함 여부)로 검색
 * @param query - 검색어 (한글 또는 영문, 빈 문자열이면 전체 반환)
 * @returns 매칭된 영문 아이템 이름 배열
 */
export function searchItemsByQuery(query: string): string[] {
  // 빈 쿼리면 전체 아이템 목록 반환
  if (!query.trim()) return Object.keys(ITEM_MAPPINGS);
  const q = query.toLowerCase().trim();
  return Object.entries(ITEM_MAPPINGS)
    .filter(([en, ko]) =>
      // 영문 이름 소문자 부분 일치 또는 한글 이름 부분 일치
      en.toLowerCase().includes(q) || ko.includes(query.trim())
    )
    .map(([en]) => en);
}
