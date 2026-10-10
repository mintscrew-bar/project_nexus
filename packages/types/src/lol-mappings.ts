/**
 * League of Legends 영문->한글 매핑 데이터
 * 챔피언, 아이템, 룬의 공식 한글 이름 데이터
 * 출처: Riot Games Dragon API (16.20.1 패치 기준)
 */

// ============================================
// 챔피언 이름 매핑
// ============================================

export const CHAMPION_MAPPINGS: Record<string, string> = {
  // [AUTO-GENERATED START]
  "Aatrox": "아트록스",
  "Ahri": "아리",
  "Akali": "아칼리",
  "Akshan": "아크샨",
  "Alistar": "알리스타",
  "Ambessa": "암베사",
  "Amumu": "아무무",
  "Anivia": "애니비아",
  "Annie": "애니",
  "Aphelios": "아펠리오스",
  "Ashe": "애쉬",
  "AurelionSol": "아우렐리온 솔",
  "Aurora": "오로라",
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
  "DrMundo": "문도 박사",
  "Draven": "드레이븐",
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
  "KSante": "크산테",
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
  "Leblanc": "르블랑",
  "LeeSin": "리 신",
  "Leona": "레오나",
  "Lillia": "릴리아",
  "Lissandra": "리산드라",
  "Locke": "로크",
  "Lucian": "루시안",
  "Lulu": "룰루",
  "Lux": "럭스",
  "Malphite": "말파이트",
  "Malzahar": "말자하",
  "Maokai": "마오카이",
  "MasterYi": "마스터 이",
  "Mel": "멜",
  "Milio": "밀리오",
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
  "Sett": "세트",
  "Shaco": "샤코",
  "Shen": "쉔",
  "Shyvana": "쉬바나",
  "Singed": "신지드",
  "Sion": "사이온",
  "Sivir": "시비르",
  "Skarner": "스카너",
  "Smolder": "스몰더",
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
  "Tryndamere": "트린다미어",
  "TwistedFate": "트위스티드 페이트",
  "Twitch": "트위치",
  "Udyr": "우디르",
  "Urgot": "우르곳",
  "Varus": "바루스",
  "Vayne": "베인",
  "Veigar": "베이가",
  "Velkoz": "벨코즈",
  "Vex": "벡스",
  "Vi": "바이",
  "Viego": "비에고",
  "Viktor": "빅토르",
  "Vladimir": "블라디미르",
  "Volibear": "볼리베어",
  "Warwick": "워윅",
  "Xayah": "자야",
  "Xerath": "제라스",
  "XinZhao": "신 짜오",
  "Yasuo": "야스오",
  "Yone": "요네",
  "Yorick": "요릭",
  "Yunara": "유나라",
  "Yuumi": "유미",
  "Zaahen": "자헨",
  "Zac": "자크",
  "Zed": "제드",
  "Zeri": "제리",
  "Ziggs": "직스",
  "Zilean": "질리언",
  "Zoe": "조이",
  "Zyra": "자이라",
  // [AUTO-GENERATED END]

};

// ============================================
// 주요 아이템 이름 매핑
// ============================================

export const ITEM_MAPPINGS: Record<string, string> = {
  // [AUTO-GENERATED START]
  "Abyssal Mask": "심연의 가면",
  "Abyssal Scepter": "심연의 홀",
  "Actualizer": "실체화 장비",
  "Aegis of the Legion": "군단의 방패",
  "Aether Wisp": "에테르 환영",
  "Amplifying Tome": "증폭의 고서",
  "Anathema's Chains": "증오의 사슬",
  "Ani-Mines": "동물 지뢰",
  "Anima Echo": "동물 메아리",
  "Animapocalypse": "동물의 종말",
  "Anti-Shark Sea Mine": "상어잡이 해양 기뢰",
  "Archangel's Staff": "대천사의 지팡이",
  "Ardent Censer": "불타는 향로",
  "Armored Advance": "무장 진격",
  "Atma's Impaler": "아트마의 창",
  "Atma's Reckoning": "아트마의 심판",
  "Augment Level": "증강 레벨",
  "Avarice Blade": "탐욕의 검",
  "Axiom Arc": "원칙의 원형낫",
  "B. F. Sword": "B.F. 대검",
  "Bami's Cinder": "바미의 불씨",
  "Bandle Juice of Haste": "가속의 밴들 주스",
  "Bandle Juice of Power": "힘의 밴들 주스",
  "Bandle Juice of Vitality": "활력의 밴들 주스",
  "Bandleglass Mirror": "밴들유리 거울",
  "Bandlepipes": "밴들파이프",
  "Banner of Command": "지휘관의 깃발",
  "Banshee's Veil": "밴시의 장막",
  "Bastionbreaker": "요새파괴자",
  "Battle Bunny Crossbow": "전투 토끼 석궁",
  "Battle Cat Barrage": "전투 고양이 총알 세례",
  "Bearfoot Chem-Dispenser": "맨발 화학 물질 분사기",
  "Berserker's Greaves": "광전사의 군화",
  "Bilgewater Cutlass": "빌지워터 해적검",
  "Black Cleaver": "칠흑의 양날 도끼",
  "Black Hole Gauntlet": "블랙홀 건틀릿",
  "Blackfire Torch": "어둠불꽃 횃불",
  "Blade of The Ruined King": "몰락한 왕의 검",
  "Blade-o-rang": "칼날 부메랑",
  "Blasting Wand": "방출의 마법봉",
  "Blighting Jewel": "역병의 보석",
  "Bloodletter's Curse": "핏빛 저주",
  "Bloodsong": "피의 노래",
  "Bloodthirster": "피바라기",
  "Boots": "장화",
  "Boots of Mobility": "기동력의 장화",
  "Boots of Speed": "속도의 장화",
  "Boots of Swiftness": "신속의 장화",
  "Bramble Vest": "덤불 조끼",
  "Brawler's Gloves": "싸움꾼의 장갑",
  "Bunny Hop": "토끼뜀",
  "Bunny Mega-Blast": "토끼 초강력 폭발",
  "Bunny Prime Ballista": "토끼 프라임 거대 석궁",
  "Cappa Juice": "카파 주스",
  "Carrot Crash": "당근 격돌",
  "Catalyst of Aeons": "억겁의 카탈리스트",
  "Catalyst the Protector": "수호자 카탈리스트",
  "Caulfield's Warhammer": "콜필드의 전투 망치",
  "Celestial Opposition": "천상의 이의",
  "Chain Vest": "쇠사슬 조끼",
  "Chainlaced Crushers": "사슬끈 분쇄자",
  "Chalice of Harmony": "조화의 성배",
  "Chempunk Chainsword": "화공 펑크 사슬검",
  "Cloak and Dagger": "망토와 단검",
  "Cloak of Agility": "민첩성의 망토",
  "Cloak of Starry Night": "별빛밤 망토",
  "Cloth Armor": "천 갑옷",
  "Control Ward": "제어 와드",
  "Cosmic Drive": "우주의 추진력",
  "Crimson Lucidity": "핏빛 명석함",
  "Crown of the Shattered Queen": "부서진 여왕의 왕관",
  "Cruelty": "잔혹 행위",
  "Cryptbloom": "무덤꽃",
  "Crystalline Bracer": "수정 팔 보호구",
  "Crystalline Flask": "수정 플라스크",
  "Cull": "수확의 낫",
  "Cyclonic Slicers": "회오리 칼날",
  "Dagger": "단검",
  "Dark Seal": "암흑의 인장",
  "Darksteel Talons": "흑강철 발톱",
  "Dawncore": "새벽심장",
  "Dead Man's Plate": "망자의 갑옷",
  "Death's Dance": "죽음의 무도",
  "Deathfire Grasp": "죽음불꽃 손아귀",
  "Decapitator": "참수자",
  "Deep Freeze": "완전 빙결",
  "Demon King's Crown": "불사대마왕의 왕관",
  "Demonic Embrace": "악마의 포옹",
  "Detonation Orb": "폭발의 구",
  "Diamond-Tipped Spear": "다이아몬드 창",
  "Divine Sunderer": "신성한 파괴자",
  "Doran's Blade": "도란의 검",
  "Doran's Bow": "도란의 활",
  "Doran's Helm": "도란의 투구",
  "Doran's Ring": "도란의 반지",
  "Doran's Shield": "도란의 방패",
  "Double Bun-Bun Barrage": "이중 깡충깡충 포화",
  "Dragonheart": "용의 심장",
  "Dream Maker": "꿈 생성기",
  "Dusk and Dawn": "황혼과 새벽",
  "Duskblade of Draktharr": "드락사르의 황혼검",
  "Echoes of Helia": "헬리아의 메아리",
  "Echoing Batblades": "메아리치는 박쥐칼날",
  "Eclipse": "월식",
  "Edge of Night": "밤의 끝자락",
  "Eleisa's Miracle": "일라이자의 기적",
  "Elixir of Agility": "민첩의 영약",
  "Elixir of Brilliance": "지능의 영약",
  "Elixir of Fortitude": "불굴의 영약",
  "Elixir of Iron": "강철의 영약",
  "Elixir of Sorcery": "마법의 영약",
  "Elixir of Wrath": "분노의 영약",
  "Emblem of Valor": "용맹의 징표",
  "Empyrean Promise": "창공의 서약",
  "Endless Hunger": "끝없는 갈망",
  "Enveloping Light": "휘감는 빛",
  "Essence Reaver": "정수 약탈자",
  "Everfrost": "만년서리",
  "Evolved Embershot": "진화한 불꽃 사격",
  "Executioner's Calling": "처형인의 대검",
  "Experimental Hexplate": "실험적 마공학판",
  "Explosive Embrace": "폭발의 포옹",
  "Faerie Charm": "요정의 부적",
  "Farsight Alteration": "망원형 개조",
  "Fated Ashes": "운명의 재",
  "FC Limited Express": "FC 급행열차",
  "Fiendhunter Bolts": "악마사냥꾼의 화살",
  "Fiendish Codex": "악마의 마법서",
  "Final City Transit": "최후의 도시 대중교통",
  "Flesheater": "살점포식자",
  "Forbidden Idol": "금지된 우상",
  "Force Of Entropy": "엔트로피의 힘",
  "Force of Nature": "대자연의 힘",
  "Frozen Heart": "얼어붙은 심장",
  "Frozen Mallet": "얼어붙은 망치",
  "Fulmination": "질책",
  "Galeforce": "돌풍",
  "Gambler's Blade": "도박꾼의 칼날",
  "Gargoyle Stoneplate": "가고일 돌갑옷",
  "Gatling Bunny-Guns": "개틀링 토끼 건",
  "Ghostcrawlers": "유령 배회자",
  "Giant's Belt": "거인의 허리띠",
  "Glacial Buckler": "얼음 방패",
  "Glacial Shroud": "빙하의 장막",
  "Glowing Mote": "빛나는 티끌",
  "Gluttonous Greaves": "탐욕의 군화",
  "Golden Spatula": "황금 뒤집개",
  "Goredrinker": "선혈포식자",
  "Grizzly Smash": "곰의 강타",
  "Guardian Angel": "수호 천사",
  "Guardian's Amulet": "수호자의 부적",
  "Guardian's Blade": "수호자의 검",
  "Guardian's Dirk": "수호자의 단검",
  "Guardian's Hammer": "수호자의 망치",
  "Guardian's Horn": "수호자의 뿔피리",
  "Guardian's Orb": "수호자의 보주",
  "Guardian's Shroud": "수호자의 장막",
  "Guiding Hex": "인도의 저주",
  "Guinsoo's Rageblade": "구인수의 격노검",
  "Gunmetal Greaves": "건메탈 군화",
  "Gustwalker Hatchling": "새끼 바람돌이",
  "Hamstringer": "불귀신",
  "Haunting Guise": "기괴한 가면",
  "Health Potion": "체력 물약",
  "Healthbar Cleanup: Reset Color": "체력 바 청소: 색상 초기화",
  "Healthbar Splash: Blue": "체력 바 색칠: 파랑",
  "Healthbar Splash: Green": "체력 바 색칠: 초록",
  "Healthbar Splash: Orange": "체력 바 색칠: 주황",
  "Healthbar Splash: Pink": "체력 바 색칠: 분홍",
  "Healthbar Splash: Rainbow": "체력 바 색칠: 무지개",
  "Heart of Gold": "황금의 심장",
  "Hearthbound Axe": "온기가 필요한 자의 도끼",
  "Heartsteel": "강철심장",
  "Hellfire Hatchet": "지옥불 손도끼",
  "Hemomancer's Helm": "혈마법사의 투구",
  "Hex Core mk-1": "마공학 핵 mk-1",
  "Hex Core mk-2": "마공학 핵 mk-2",
  "Hexbolt Companion": "마공화살 동료",
  "Hexdrinker": "주문포식자",
  "Hexoptics C44": "마법광학 장치 C44",
  "Hextech Alternator": "마법공학 교류 발전기",
  "Hextech Gunblade": "마법공학 총검",
  "Hextech Revolver": "마법공학 리볼버",
  "Hextech Rocketbelt": "마법공학 로켓 벨트",
  "Hollow Radiance": "공허한 광휘",
  "Hopped-Up Hex": "고양된 저주",
  "Horizon Focus": "지평선의 초점",
  "Hubris": "오만",
  "Hullbreaker": "선체파괴자",
  "Hunter's Machete": "사냥꾼의 마체테",
  "Iceblast Armor": "얼음작렬 갑옷",
  "Iceborn Gauntlet": "얼어붙은 건틀릿",
  "Immortal Path": "불멸의 길",
  "Immortal Shieldbow": "불멸의 철갑궁",
  "Imperial Mandate": "제국의 명령",
  "Infinity Edge": "무한의 대검",
  "Innervating Locket": "활력증진의 펜던트",
  "Ionian Boots of Lucidity": "명석함의 아이오니아 장화",
  "Ionic Spark": "이온 충격기",
  "Jak'Sho, The Protean": "해신 작쇼",
  "Jinx's Tri-Namite": "징크스의 삼중 다이너마이트",
  "Juice of Haste": "가속의 주스",
  "Juice of Power": "힘의 주스",
  "Juice of Vitality": "활력의 주스",
  "Kaenic Rookern": "케이닉 루컨",
  "Kalista's Black Spear": "칼리스타의 칠흑의 창",
  "Kindlegem": "점화석",
  "Kinkou Jitte": "킨코우 십수",
  "Knight's Vow": "기사의 맹세",
  "Kraken Slayer": "크라켄 학살자",
  "Last Whisper": "최후의 속삭임",
  "Legendary Assassin Item": "전설 암살자 아이템",
  "Legendary Fighter Item": "전설 전사 아이템",
  "Legendary Mage Item": "전설 마법사 아이템",
  "Legendary Marksman Item": "전설 원거리 딜러 아이템",
  "Legendary Support Item": "전설 서포터 아이템",
  "Legendary Tank Item": "전설 탱커 아이템",
  "Leviathan": "레비아탄 갑옷",
  "Liandry's Anguish": "리안드리의 고뇌",
  "Liandry's Torment": "리안드리의 고통",
  "Lich Bane": "리치베인",
  "Lifeline": "생명선",
  "Light of the Lion": "사자의 광명",
  "Lightning Braid": "번개 끈",
  "Lightning Rod": "번개 막대",
  "Lioness's Lament": "사자의 비가",
  "Locked Weapon Slot": "잠긴 무기 슬롯",
  "Locket of the Iron Solari": "강철의 솔라리 펜던트",
  "Long Sword": "롱소드",
  "Lord Dominik's Regards": "도미닉 경의 인사",
  "Lost Chapter": "사라진 양피지",
  "Lover's Ricochet": "연인의 도탄",
  "Lucky Pick": "행운 피크",
  "Luden's Echo": "루덴의 메아리",
  "Madred's Bloodrazor": "마드레드의 피갈퀴손",
  "Madred's Razors": "마드레드의 갈퀴손",
  "Malady": "역병의 비수",
  "Malignance": "악의",
  "Mana Manipulator": "마나의 보주",
  "Mana Potion": "마나 물약",
  "Manamune": "마나무네",
  "Maw of Malmortius": "맬모셔스의 아귀",
  "Mejai's Soulstealer": "메자이의 영혼약탈자",
  "Meow Meow": "야옹 야옹",
  "Mercurial Scimitar": "헤르메스의 시미터",
  "Mercury's Treads": "헤르메스의 발걸음",
  "Mikael's Blessing": "미카엘의 축복",
  "Mikael's Crucible": "미카엘의 도가니",
  "Mirage Blade": "신기루 검",
  "Moonflair Spellblade": "달빛 마법검",
  "Moonstone Renewer": "월석 재생기",
  "Morellonomicon": "모렐로노미콘",
  "Mortal Reminder": "필멸자의 운명",
  "Mosstomper Seedling": "새끼 이끼쿵쿵이",
  "Multitool": "다용도 도구",
  "Nashor's Tooth": "내셔의 이빨",
  "Navori Flickerblade": "나보리 명멸검",
  "Navori Flickerblades": "나보리 명멸검",
  "Needlessly Large Rod": "쓸데없이 큰 지팡이",
  "Negatron Cloak": "음전자 망토",
  "Neverending Mobstomper": "무한의 괴물 퇴치기",
  "Night Harvester": "밤의 수확자",
  "Ninja Tabi": "닌자의 신발",
  "Noonquiver": "절정의 화살",
  "Null-Magic Mantle": "마법무효화의 망토",
  "Oblivion Orb": "망각의 구",
  "Obsidian Edge": "흑요석 검",
  "Ohmwrecker": "저항 공성기",
  "Opportunity": "기회",
  "Oracle Lens": "예언자의 렌즈",
  "Oracle's Elixir": "예언자의 영약",
  "Overlord's Bloodmail": "지배자의 피갑옷",
  "OwO Blaster": "왕 귀여운 발사기",
  "Party Favor": "파티 선물",
  "Paw Print Poisoner": "발자국 중독 장치",
  "Perfect Hex Core": "완성형 마공학 핵",
  "Perplexity": "당혹",
  "Phage": "탐식의 망치",
  "Phantom Dancer": "유령 무희",
  "Philosopher's Stone": "현자의 돌",
  "Pickaxe": "곡괭이",
  "Pillory Swipe": "족쇄 할퀴기",
  "Plated Steelcaps": "판금 장화",
  "Prismatic Item": "프리즘 아이템",
  "Profane Hydra": "불경한 히드라",
  "Protoplasm Harness": "원형질 안전벨트",
  "Prototype Hex Core": "프로토타입 마공학 핵",
  "Prowler's Claw": "자객의 발톱",
  "Prumbis's Electrocarver": "프룸비스의 전기도축칼",
  "Puppeteer": "조종의 손아귀",
  "Pyromancer's Cloak": "화염술사의 망토",
  "Quad-o-rang": "사중 부메랑",
  "Quest: Bot": "퀘스트: 하단",
  "Quest: Jungle": "퀘스트: 정글",
  "Quest: Mid": "퀘스트: 중단",
  "Quest: Support": "퀘스트: 서포터",
  "Quest: Top": "퀘스트: 상단",
  "Quicksilver Sash": "수은 장식띠",
  "Rabadon's Deathcap": "라바돈의 죽음모자",
  "Radiant Field": "광휘 역장",
  "Radiant Virtue": "광휘의 미덕",
  "Randuin's Omen": "란두인의 예언",
  "Rapid Firecannon": "고속 연사포",
  "Rapid Rabbit Raindown": "고속 토끼 속사포",
  "Ravenous Hydra": "굶주린 히드라",
  "Reality Fracture": "현실 균열",
  "Reaper's Toll": "사신의 대가",
  "Rectrix": "꽁지깃",
  "Recurve Bow": "곡궁",
  "Red Trinket": "빨간색 장신구",
  "Redemption": "구원",
  "Refillable Potion": "충전형 물약",
  "Regicide": "섭정 시해",
  "Rejuvenation Bead": "원기 회복의 구슬",
  "Reverberation": "반향",
  "Riftmaker": "균열 생성기",
  "Rite of Ruin": "파멸의식 고서",
  "Rite Of Ruin": "파멸의식 고서",
  "Rod of Ages": "영겁의 지팡이",
  "Ruby Crystal": "루비 수정",
  "Ruby Sightstone": "루비 시야석",
  "Runaan's Hurricane": "루난의 허리케인",
  "Runecarver": "룬 조각기",
  "Runic Bulwark": "룬 방벽",
  "Rylai's Crystal Scepter": "라일라이의 수정홀",
  "Sanguine Gift": "핏빛 선물",
  "Sapphire Crystal": "사파이어 수정",
  "Savage Slice": "포악한 베기",
  "Scarecrow Effigy": "허수아비",
  "Scorchclaw Pup": "새끼 화염발톱",
  "Scout's Slingshot": "정찰병의 새총",
  "Searing Shortbow": "타오르는 단궁",
  "Seeker's Armguard": "추적자의 팔목 보호대",
  "Serpent's Fang": "독사의 송곳니",
  "Serrated Dirk": "톱날 단검",
  "Serylda's Grudge": "세릴다의 원한",
  "Shadowflame": "그림자불꽃",
  "Shard of True Ice": "얼음 정수의 파편",
  "Shattered Armguard": "부서진 팔목 보호대",
  "Sheen": "광휘의 검",
  "Shield of Molten Stone": "용암의 방패",
  "Shield Slam": "방패 타격",
  "Shurelya's Battlesong": "슈렐리아의 군가",
  "Shurelya's Reverie": "슈렐리아의 몽상",
  "Shushei's Mana Jug": "슈세이의 마나 통",
  "Sight Ward": "시야 와드",
  "Sightstone": "시야석",
  "Sin Eater": "죄악 포식자",
  "Solstice Sleigh": "태양의 썰매",
  "Sorcerer's Shoes": "마법사의 신발",
  "Soul Shroud": "영혼의 갑옷",
  "Sound Wave": "음향의 물결",
  "Spear of Shojin": "쇼진의 창",
  "Spectral Cutlass": "망령 해적검",
  "Spectre's Cowl": "망령의 두건",
  "Spellslinger's Shoes": "주문투척자의 신발",
  "Spirit of the Ancient Golem": "고대 골렘의 영혼",
  "Spirit of the Elder Lizard": "도마뱀 장로의 영혼",
  "Spirit of the Spectral Wraith": "망령의 영혼",
  "Spirit Stone": "정령석",
  "Spirit Visage": "정령의 형상",
  "Stack of Sunfire Capes": "태양불꽃 망토 무더기",
  "Staff of Flowing Water": "흐르는 물의 지팡이",
  "Stark's Fervor": "스타크의 열정",
  "Stat Bonus": "추가 능력치",
  "Statikk Shiv": "스태틱의 단검",
  "Statikk Sword": "스태틱의 검",
  "Stealth Ward": "투명 와드",
  "Steel Sigil": "강철 인장",
  "Steel Tempest": "강철 폭풍",
  "Sterak's Gage": "스테락의 도전",
  "Stinger": "쐐기검",
  "Stormrazor": "폭풍갈퀴",
  "Stormsurge": "폭풍 쇄도",
  "Stridebreaker": "발걸음 분쇄기",
  "Sundered Sky": "갈라진 하늘",
  "Sunfire Aegis": "태양불꽃 방패",
  "Sunfire Cape": "태양불꽃 망토",
  "Swiftmarch": "신속행진",
  "Sword of Blossoming Dawn": "꽃피는 새벽의 검",
  "Sword of the Divine": "신성의 검",
  "Sword of the Occult": "비술의 검",
  "T.I.B.B.E.R.S": "티.버",
  "T.I.B.B.E.R.S (B.E.E.G Edition)": "티.버 (특.대.형 에디션)",
  "Talisman Of Ascension": "승천의 부적",
  "Tear of the Goddess": "여신의 눈물",
  "Tempest's Gauntlet": "폭풍의 건틀릿",
  "Tentacle Slam": "촉수 후려치기",
  "Terminus": "경계",
  "The Annihilator": "절멸자",
  "The Black Cleaver": "칠흑의 양날 도끼",
  "The Bloodthirster": "피바라기",
  "The Brutalizer": "야수화",
  "The Collector": "징수의 총",
  "The Golden Spatula": "황금 뒤집개",
  "Thornmail": "가시 갑옷",
  "Tiamat": "티아맷",
  "Titanic Hydra": "거대한 히드라",
  "Trailblazer": "개척자",
  "Trinity Force": "삼위일체",
  "Tunneler": "땅굴 채굴기",
  "Turbo Chemtank": "터보 화공 탱크",
  "Twilight's Edge": "황혼의 끝자락",
  "Twin Shadows": "쌍둥이 그림자",
  "Ultra Hydra": "궁극의 히드라",
  "Umbral Glaive": "그림자 검",
  "Unceasing Cyclone": "그치지 않는 폭풍",
  "Unending Despair": "끝없는 절망",
  "UwU Blaster": "귀여운 발사기",
  "Vampiric Scepter": "흡혈의 낫",
  "Vayne's Chromablades": "베인의 크로마칼날",
  "Veigar's Talisman of Ascension": "베이가의 승천의 부적",
  "Verdant Barrier": "신록의 장벽",
  "Vigilant Wardstone": "경계의 와드석",
  "Vision Ward": "투명 감지 와드",
  "Void Immolation": "공허의 불길",
  "Void Staff": "공허의 지팡이",
  "Voltaic Cyclosword": "벼락폭풍검",
  "Vortex Glove": "소용돌이 장갑",
  "Wandering Storms": "떠도는 폭풍",
  "Warden's Mail": "파수꾼의 갑옷",
  "Warmog's Armor": "워모그의 갑옷",
  "Watchful Wardstone": "감시하는 와드석",
  "Whispering Circlet": "속삭이는 머리띠",
  "Will of the Ancients": "고대인의 의지",
  "Winged Dagger": "날개 달린 단검",
  "Winged Moonplate": "비상의 월갑",
  "Winter's Approach": "혹한의 손길",
  "Wit's End": "마법사의 최후",
  "Wooglet's Witchcap": "우글렛의 마녀 모자",
  "Wordless Promise": "무언의 서약",
  "World Atlas": "세계 지도집",
  "Wriggle's Lantern": "리글의 랜턴",
  "Yellow Trinket": "노란색 장신구",
  "Youmuu's Ghostblade": "요우무의 유령검",
  "Yun Tal Wildarrows": "윤 탈 야생화살",
  "YuumiBot": "유미봇",
  "YuumiBot_Final_FINAL": "유미봇_최종_최종",
  "Zaz'Zak's Realmspike": "자자크의 세계가시",
  "Zeal": "열정의 검",
  "Zeke's Convergence": "지크의 융합",
  "Zephyr": "서풍",
  "Zhonya's Hourglass": "존야의 모래시계",
  "Zz'Rot Portal": "즈롯 차원문",
  // [AUTO-GENERATED END]

};

// ============================================
// 룬 이름 매핑
// ============================================

export const RUNE_MAPPINGS: Record<string, string> = {
  // [AUTO-GENERATED START]
  "Domination": "지배",
  "Electrocute": "감전",
  "DarkHarvest": "어둠의 수확",
  "HailOfBlades": "칼날비",
  "CheapShot": "비열한 한 방",
  "TasteOfBlood": "피의 맛",
  "SuddenImpact": "돌발 일격",
  "SixthSense": "육감",
  "GrislyMementos": "섬뜩한 기념품",
  "DeepWard": "깊은 와드",
  "TreasureHunter": "보물 사냥꾼",
  "RelentlessHunter": "끈질긴 사냥꾼",
  "UltimateHunter": "궁극의 사냥꾼",
  "Inspiration": "영감",
  "GlacialAugment": "빙결 강화",
  "UnsealedSpellbook": "봉인 풀린 주문서",
  "FirstStrike": "선제공격",
  "HextechFlashtraption": "마법공학 점멸기",
  "MagicalFootwear": "마법의 신발",
  "CashBack": "환급",
  "PerfectTiming": "삼중 물약",
  "TimeWarpTonic": "시간 왜곡 물약",
  "BiscuitDelivery": "비스킷 배달",
  "CosmicInsight": "우주적 통찰력",
  "ApproachVelocity": "쾌속 접근",
  "JackOfAllTrades": "다재다능",
  "Precision": "정밀",
  "PressTheAttack": "집중 공격",
  "LethalTempo": "치명적 속도",
  "FleetFootwork": "기민한 발놀림",
  "Conqueror": "정복자",
  "AbsorbLife": "생명 흡수",
  "Triumph": "승전보",
  "PresenceOfMind": "침착",
  "LegendAlacrity": "전설: 민첩함",
  "LegendHaste": "전설: 가속",
  "LegendBloodline": "전설: 핏빛 길",
  "CoupDeGrace": "최후의 일격",
  "CutDown": "체력차 극복",
  "LastStand": "최후의 저항",
  "Resolve": "결의",
  "GraspOfTheUndying": "착취의 손아귀",
  "Aftershock": "여진",
  "Guardian": "수호자",
  "Demolish": "철거",
  "FontOfLife": "생명의 샘",
  "ShieldBash": "보호막 강타",
  "Conditioning": "사전 준비",
  "SecondWind": "재생의 바람",
  "BonePlating": "뼈 방패",
  "Overgrowth": "과잉성장",
  "Revitalize": "소생",
  "Unflinching": "불굴의 의지",
  "Sorcery": "마법",
  "SummonAery": "콩콩이 소환",
  "ArcaneComet": "신비로운 유성",
  "PhaseRush": "폭풍전사의 포효",
  "DeathfireTouch": "죽음불꽃 손길",
  "NullifyingOrb": "액시옴 비전 마법사",
  "ManaflowBand": "마나순환 팔찌",
  "NimbusCloak": "빛의 망토",
  "Transcendence": "깨달음",
  "Celerity": "기민함",
  "AbsoluteFocus": "절대 집중",
  "Scorch": "주문 작열",
  "Waterwalking": "물 위를 걷는 자",
  "GatheringStorm": "폭풍의 결집",
  // [AUTO-GENERATED END]

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
  // [AUTO-GENERATED START]
  1: "정화",
  3: "탈진",
  4: "점멸",
  6: "유체화",
  7: "회복",
  11: "강타",
  12: "순간이동",
  13: "총명",
  14: "점화",
  21: "방어막",
  30: "왕을 향해!",
  31: "포로 던지기",
  32: "표식",
  39: "표식",
  54: "게임 시작 후 결정",
  55: "TBD 및 공격-강타",
  71: "정화",
  73: "탈진",
  74: "점멸",
  75: "천리안",
  76: "유체화",
  77: "회복",
  705: "구축",
  709: "결집",
  711: "강타",
  712: "순간이동",
  713: "총명",
  714: "점화",
  716: "고양",
  720: "진급",
  721: "방어막",
  777: "부활",
  2201: "도주",
  2202: "점멸",
  // [AUTO-GENERATED END]

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
