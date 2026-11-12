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
   * CARD_FRAME: 카드를 감싸는 바깥 틀의 배경(2px 여백으로 테두리처럼 보인다)
   * NAME_COLOR: 닉네임 글자에 붙는 클래스
   */
  className: string;
}

export const RARITY_LABEL: Record<CosmeticRarity, string> = {
  STARTER: "입문",
  COMMON: "일반",
  PREMIUM: "고급",
};

export const COSMETICS: CosmeticItem[] = [
  {
    code: "FRAME_SILVER",
    slot: "CARD_FRAME",
    name: "은빛 테두리",
    description: "로비 참가자 카드를 차분한 은색으로 감싼다",
    price: 250,
    rarity: "STARTER",
    className: "bg-slate-300/70",
  },
  {
    code: "NAME_SKY",
    slot: "NAME_COLOR",
    name: "하늘색 닉네임",
    description: "로비·채팅·대진표의 닉네임을 하늘색으로",
    price: 250,
    rarity: "STARTER",
    className: "text-sky-300",
  },
  {
    code: "FRAME_INDIGO",
    slot: "CARD_FRAME",
    name: "넥서스 인디고",
    description: "로고 색 인디고에서 보라로 이어지는 테두리",
    price: 450,
    rarity: "COMMON",
    className: "bg-gradient-to-br from-[#667EEA] to-violet-500",
  },
  {
    code: "FRAME_GOLD",
    slot: "CARD_FRAME",
    name: "금빛 테두리",
    description: "빛을 받은 금속처럼 결이 있는 금색 테두리",
    price: 500,
    rarity: "COMMON",
    className:
      "bg-[linear-gradient(135deg,#f3d58a_0%,#b8862b_45%,#f3d58a_70%,#9a6d1f_100%)]",
  },
  {
    code: "NAME_SUNSET",
    slot: "NAME_COLOR",
    name: "노을 닉네임",
    description: "주황에서 분홍으로 물드는 닉네임",
    price: 550,
    rarity: "COMMON",
    className:
      "bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-transparent",
  },
  {
    code: "FRAME_AURORA",
    slot: "CARD_FRAME",
    name: "오로라",
    description: "청록·인디고·분홍이 천천히 흐르는 테두리",
    price: 1000,
    rarity: "PREMIUM",
    className: "cosmetic-aurora",
  },
];

export function findCosmetic(code?: string | null): CosmeticItem | undefined {
  if (!code) return undefined;
  return COSMETICS.find((item) => item.code === code);
}
