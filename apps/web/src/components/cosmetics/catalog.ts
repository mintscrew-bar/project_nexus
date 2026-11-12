/**
 * 꾸미기 상품 카탈로그 (메달 상점 1단계 — docs/features/RETENTION_SYSTEM_SPEC.md 7절).
 *
 * 지금은 화면 쪽 정의만 있다. 가격·판매 상태의 최종 원본은 나중에 DB(ShopItem)로
 * 옮기고, 여기에는 "코드 → 어떻게 그리는가"만 남긴다. 코드(`code`)는 DB 와 같은
 * 키를 쓰므로 한 번 정하면 바꾸지 않는다.
 *
 * 위치: Tailwind 가 `src/components` 는 읽지만 `src/lib` 은 읽지 않는다. 여기 적힌
 * 클래스 문자열이 CSS 로 생성되려면 이 파일이 components 아래에 있어야 한다.
 *
 * 색 원칙
 * - 원색·형광 금지 (2026-11-12 로비 피드백 "형광이라 눈 아프다"). 채도를 한 톤 낮춘다.
 * - 테두리는 카드 **둘레 전체**를 감싼다. 왼쪽 막대 같은 한쪽 강조는 쓰지 않는다(CLAUDE.md).
 * - 움직이는 상품은 `prefers-reduced-motion` 에서 멈춘다(globals.css).
 */

/** 화면에 보이는 재화 이름 — 이름을 바꾸면 여기 한 곳만 고친다 */
export const MEDAL_LABEL = "메달";

export type CosmeticSlot = "CARD_FRAME" | "NAME_COLOR";
export type CosmeticRarity = "STARTER" | "COMMON" | "PREMIUM";

export interface CosmeticItem {
  code: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  price: number;
  rarity: CosmeticRarity;
  /**
   * CARD_FRAME: 카드를 감싸는 바깥 틀(3px)의 바탕
   * NAME_COLOR: 닉네임 글자에 붙는 클래스
   */
  className: string;
  /**
   * CARD_FRAME 전용 — 틀 안, 카드 뒤에 깔리는 움직이는 층. 카드가 위를 덮으므로
   * 테두리 3px 띠에서만 보인다(회전하는 빛, 지나가는 반짝임 등).
   */
  layerClassName?: string;
}

export const RARITY_LABEL: Record<CosmeticRarity, string> = {
  STARTER: "입문",
  COMMON: "일반",
  PREMIUM: "고급",
};

/**
 * 상품 원칙 (2026-11-12): **모든 상품은 움직인다.** 정적인 색 바꾸기는 살 이유가
 * 약하다는 판단. 대신 움직임은 느리고 차분하게 — 로비에서 10장이 동시에 움직여도
 * 산만하지 않아야 한다. 애니메이션 정의는 globals.css 의 `.cosmetic-*`.
 */
export const COSMETICS: CosmeticItem[] = [
  {
    code: "FRAME_SILVER",
    slot: "CARD_FRAME",
    name: "은빛 반짝임",
    description: "은색 테두리 위로 빛줄기가 몇 초마다 스쳐 지나간다",
    price: 250,
    rarity: "STARTER",
    className: "bg-slate-400/80",
    layerClassName: "cosmetic-sheen",
  },
  {
    code: "NAME_SKY",
    slot: "NAME_COLOR",
    name: "물결 닉네임",
    description: "하늘색 닉네임 위로 밝은 물결이 흐른다",
    price: 250,
    rarity: "STARTER",
    className: "cosmetic-name-sky",
  },
  {
    code: "FRAME_INDIGO",
    slot: "CARD_FRAME",
    name: "넥서스 맥동",
    description: "로고 색 인디고 테두리가 숨 쉬듯 밝아졌다 어두워진다",
    price: 450,
    rarity: "COMMON",
    className: "bg-[#3f4aa8]",
    layerClassName: "cosmetic-pulse",
  },
  {
    code: "FRAME_GOLD",
    slot: "CARD_FRAME",
    name: "금빛 궤도",
    description: "금색 테두리를 따라 빛이 한 바퀴씩 돈다",
    price: 500,
    rarity: "COMMON",
    className: "bg-[#7a561a]",
    layerClassName: "cosmetic-orbit-gold",
  },
  {
    code: "NAME_SUNSET",
    slot: "NAME_COLOR",
    name: "노을 닉네임",
    description: "주황·분홍·보라로 천천히 물드는 닉네임",
    price: 550,
    rarity: "COMMON",
    className: "cosmetic-name-sunset",
  },
  {
    code: "FRAME_AURORA",
    slot: "CARD_FRAME",
    name: "오로라",
    description: "청록·인디고·분홍 빛이 테두리를 돌며 섞인다",
    price: 1000,
    rarity: "PREMIUM",
    className: "bg-[#24304f]",
    layerClassName: "cosmetic-orbit-aurora",
  },
];

export function findCosmetic(code?: string | null): CosmeticItem | undefined {
  if (!code) return undefined;
  return COSMETICS.find((item) => item.code === code);
}
