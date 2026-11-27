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

import { useMemo } from "react";
import {
  COSMETIC_MEDIA_SIZE,
  findCosmeticShopItem,
  type ShopCatalogEntry,
} from "@nexus/types";
import { useCosmeticCatalogStore } from "@/stores/cosmetic-catalog-store";
import type { AvatarEffectSource } from "./avatar-effects";
import type { CosmeticEffectCode } from "./effects";
import type { NameStyleCode } from "./name-styles";
import type { LiveBannerSource } from "./live-banner";

/** 화면에 보이는 재화 이름 — 이름을 바꾸면 여기 한 곳만 고친다 */
export const MEDAL_LABEL = "메달";

/**
 * 꾸미는 자리 — 자리마다 상품을 따로 판다(2026-11-12). 같은 자리에는 하나만 장착한다.
 * - CARD_FRAME: 로비 참가자 카드 장식
 * - AVATAR_FRAME: 프로필 아바타 장식
 * - NAME_STYLE: 닉네임 글꼴 — 글꼴 + 색·효과 세트 (Task 22, 예전 NAME_COLOR 자리를 대신한다)
 * - PROFILE_BANNER: 프로필 배경 — 움직이는 원작 일러스트(live-banner.tsx)
 */
export type CosmeticSlot =
  "CARD_FRAME" | "AVATAR_FRAME" | "NAME_STYLE" | "PROFILE_BANNER";

export const SLOT_LABEL: Record<CosmeticSlot, string> = {
  CARD_FRAME: "카드 장식",
  AVATAR_FRAME: "아바타 장식",
  NAME_STYLE: "닉네임 글꼴",
  PROFILE_BANNER: "프로필 배경",
};
export type CosmeticRarity = "STARTER" | "COMMON" | "PREMIUM" | "RARE";

export interface CosmeticItem {
  code: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  price: number;
  rarity: CosmeticRarity;
  /**
   * CARD_FRAME: 카드를 감싸는 바깥 틀(3px)의 바탕 (AVATAR_FRAME·NAME_STYLE 은 비운다)
   */
  className: string;
  /**
   * CARD_FRAME 전용 — 틀 안, 카드 뒤에 깔리는 움직이는 층. 카드가 위를 덮으므로
   * 테두리 3px 띠에서만 보인다(회전하는 빛, 지나가는 반짝임 등).
   */
  layerClassName?: string;
  /** CARD_FRAME 전용 — 초상화 위에서 움직이는 장식 (effects.tsx) */
  effect?: CosmeticEffectCode;
  /** CARD_FRAME — 영상형 카드 배경 (코드 배경 이름 또는 올린 파일) */
  cardVideo?: LiveBannerSource;
  /** AVATAR_FRAME 전용 — 아바타 둘레 장식 (avatar-effects.tsx, 코드 장식 또는 올린 파일) */
  avatarEffect?: AvatarEffectSource;
  /** NAME_STYLE 전용 — 닉네임 글꼴·효과 (name-styles.tsx) */
  nameStyle?: NameStyleCode;
  /** PROFILE_BANNER 전용 — 움직이는 프로필 배경 (live-banner.tsx, 코드 배경 또는 올린 파일) */
  liveBanner?: LiveBannerSource;
  /** 관리자가 추가한 상품인가 (상점 관리 2단계) */
  custom?: boolean;
}

export const RARITY_LABEL: Record<CosmeticRarity, string> = {
  STARTER: "입문",
  COMMON: "일반",
  PREMIUM: "고급",
  RARE: "희귀",
};

/**
 * 상품 원칙 (2026-11-12)
 * - **모든 상품은 움직인다.** 색만 바꾸는 상품은 살 이유가 약하다.
 * - 테두리 색 바꾸기를 넘어, 카드 위에 **캐릭터·연출이 산다** — 픽셀 검이 휘두르고
 *   박쥐가 날아다니는 식. 픽셀 그림과 벡터 그림을 섞어 종류를 다양하게 한다.
 * - 장식은 초상화 칸 안에서만 움직여 이름·티어·준비 띠는 가리지 않는다.
 * 그림·움직임 정의는 effects.tsx 와 globals.css 의 `.cfx-*`.
 */
/** 그림·이름·설명 정의 — 가격·등급은 아래에서 @nexus/types 원본으로 덮어쓴다 */
const COSMETIC_DEFS: CosmeticItem[] = [
  // ── 카드 장식 (로비) ──
  {
    code: "FX_SLIME",
    slot: "CARD_FRAME",
    name: "통통 슬라임",
    description:
      "숲 가장자리에서 슬라임 둘이 번갈아 통통 뛰어오르고 철퍽 내려앉는다",
    price: 250,
    rarity: "STARTER",
    className: "bg-[#2f6b3a]",
    effect: "slime",
  },
  {
    code: "FX_GHOST",
    slot: "CARD_FRAME",
    name: "꼬마 유령",
    description:
      "초승달 뜬 안개 묘지, 등불 단 고목 아래 꼬마 유령들이 둥실거리고 도깨비불이 떠돈다",
    price: 250,
    rarity: "STARTER",
    className: "bg-[#5b6478]",
    effect: "ghost",
  },
  {
    code: "FX_SAKURA",
    slot: "CARD_FRAME",
    name: "벚꽃의 여운",
    description:
      "노을 진 언덕 위 만개한 벚나무에서 꽃잎이 흩날리고 바람이 스친다",
    price: 450,
    rarity: "COMMON",
    className: "bg-[#b56a86]",
    effect: "sakura",
  },
  {
    code: "FX_FIRE",
    slot: "CARD_FRAME",
    name: "픽셀 화염",
    description:
      "이글이글 일렁이는 불길이 초상화 아래를 집어삼키고 불씨가 솟구친다",
    price: 500,
    rarity: "COMMON",
    className: "bg-[#7a2a12]",
    effect: "fire",
  },
  {
    code: "FX_BATS",
    slot: "CARD_FRAME",
    name: "박쥐 떼",
    description: "보름달 뜬 고성 위로 붉은 눈 박쥐들이 날개를 퍼덕인다",
    price: 600,
    rarity: "COMMON",
    className: "bg-[#3b2a57]",
    effect: "bats",
  },
  {
    code: "FX_SWORD",
    slot: "CARD_FRAME",
    name: "전설의 검",
    description:
      "빛이 드는 돌 성소의 제단, 돌 받침에 꽂힌 검에서 푸른 빛기둥이 솟고 수정 조각이 맴돈다",
    price: 900,
    rarity: "PREMIUM",
    className: "bg-slate-400/80",
    layerClassName: "cosmetic-sheen",
    effect: "sword",
  },
  {
    code: "FX_LIGHTNING",
    slot: "CARD_FRAME",
    name: "천둥번개",
    description: "폭풍 구름 아래 갈래 번개가 초상화 양옆으로 내리꽂힌다",
    price: 1000,
    rarity: "PREMIUM",
    className: "bg-[#1e2f5c]",
    layerClassName: "cosmetic-pulse",
    effect: "lightning",
  },
  {
    code: "FX_DRAGON",
    slot: "CARD_FRAME",
    name: "묵룡의 윤무 · 카드",
    description: "흑백 수묵 용이 원형으로 유영하는 움직이는 카드 배경",
    price: 1800,
    rarity: "RARE",
    className: "bg-[#7a561a]",
    layerClassName: "cosmetic-orbit-gold",
    effect: "dragon",
  },
  {
    code: "FX_EMBER_KNIGHT",
    slot: "CARD_FRAME",
    name: "잿불의 기사 · 카드",
    description: "모닥불 곁에서 밤을 지키는 기사 — 움직이는 픽셀아트 카드 배경",
    price: 2000,
    rarity: "RARE",
    className: "bg-[#30263b]",
    cardVideo: "ember_knight_card",
  },
  {
    code: "FX_LUNAR_PHASES",
    slot: "CARD_FRAME",
    name: "월륜 · 카드",
    description: "깊은 밤하늘에 별빛이 반짝이고 별똥별이 스쳐 지나간다",
    price: 1200,
    rarity: "RARE",
    className: "bg-[#b99a66]",
    effect: "lunar_card",
  },
  // ── 아바타 장식 (프로필) ──
  {
    code: "AV_CAT_EARS",
    slot: "AVATAR_FRAME",
    name: "고양이 귀",
    description:
      "주황 고리에 고양이 귀가 쫑긋, 꼬리가 살랑이고 방울이 달려 있다",
    price: 300,
    rarity: "STARTER",
    className: "",
    avatarEffect: "cat_ears",
  },
  {
    code: "AV_MOON",
    slot: "AVATAR_FRAME",
    name: "공전하는 달",
    description: "은빛 고리 바깥 궤도를 초승달이 돌고 별빛이 번갈아 반짝인다",
    price: 400,
    rarity: "STARTER",
    className: "",
    avatarEffect: "moon",
  },
  {
    code: "AV_LUNAR_PHASES",
    slot: "AVATAR_FRAME",
    name: "월륜 · 아바타",
    description: "여덟 위상의 달이 아바타를 둘러싸고 달빛이 차례로 반짝인다",
    price: 1800,
    rarity: "RARE",
    className: "",
    avatarEffect: "lunar_phases",
  },
  {
    code: "AV_CROWN",
    slot: "AVATAR_FRAME",
    name: "반짝 왕관",
    description:
      "보석 박힌 금 고리 위에 왕관이 비스듬히 얹혀 둥실거리고 반짝인다",
    price: 450,
    rarity: "COMMON",
    className: "",
    avatarEffect: "crown",
  },
  {
    code: "AV_HALO",
    slot: "AVATAR_FRAME",
    name: "천사 고리",
    description:
      "흰금 고리 양옆에 작은 날개가 퍼덕이고 머리 위로 후광이 떠다닌다",
    price: 500,
    rarity: "COMMON",
    className: "",
    avatarEffect: "halo",
  },
  {
    code: "AV_FIRE_RING",
    slot: "AVATAR_FRAME",
    name: "불꽃 고리",
    description: "달군 쇠 고리에서 불길이 이글이글 솟고 불티가 날아오른다",
    price: 600,
    rarity: "COMMON",
    className: "",
    avatarEffect: "fire_ring",
  },
  {
    code: "AV_BAT_WINGS",
    slot: "AVATAR_FRAME",
    name: "박쥐 날개",
    description: "가시 박힌 보랏빛 고리 뒤로 커다란 박쥐 날개가 퍼덕인다",
    price: 900,
    rarity: "PREMIUM",
    className: "",
    avatarEffect: "bat_wings",
  },
  {
    code: "AV_TWIN_SWORDS",
    slot: "AVATAR_FRAME",
    name: "교차 검",
    description:
      "강철 고리 뒤로 엇갈린 두 검이 맞부딪칠 때마다 불꽃이 튀고 빛이 번진다",
    price: 1000,
    rarity: "PREMIUM",
    className: "",
    avatarEffect: "twin_swords",
  },
  {
    code: "AV_DRAGON",
    slot: "AVATAR_FRAME",
    name: "묵룡의 윤무 · 아바타",
    description: "먹빛 용이 아바타 둘레를 감싸고 연무가 흘러가는 영상 프레임",
    price: 1800,
    rarity: "RARE",
    className: "",
    avatarEffect: "dragon_orbit",
  },
  // ── 닉네임 글꼴 (로비·호버·프로필·채팅·대진표·경매·결과창) ──
  {
    code: "NM_INK",
    slot: "NAME_STYLE",
    name: "먹선",
    description: "굵은 고딕에 먹 테두리, 먹이 숨 쉬듯 번졌다 걷힌다",
    price: 150,
    rarity: "STARTER",
    className: "",
    nameStyle: "ink",
  },
  {
    code: "NM_PIXEL",
    slot: "NAME_STYLE",
    name: "픽셀",
    description: "옛 게임 글자 — 하늘색 픽셀 글씨가 가끔 두 번 반짝인다",
    price: 150,
    rarity: "STARTER",
    className: "",
    nameStyle: "pixel",
  },
  {
    code: "NM_PEN",
    slot: "NAME_STYLE",
    name: "손글씨",
    description: "분홍 펜으로 쓴 글씨, 잉크 색이 천천히 흘러간다",
    price: 180,
    rarity: "STARTER",
    className: "",
    nameStyle: "pen",
  },
  {
    code: "NM_BRUSH",
    slot: "NAME_STYLE",
    name: "붓글씨",
    description: "한지빛 붓글씨, 붓 끝에 맺힌 빛이 은은하게 번진다",
    price: 270,
    rarity: "COMMON",
    className: "",
    nameStyle: "brush",
  },
  {
    code: "NM_GOLD",
    slot: "NAME_STYLE",
    name: "금빛",
    description: "금박 글씨 위로 빛이 한 번씩 스쳐 간다",
    price: 360,
    rarity: "COMMON",
    className: "",
    nameStyle: "gold",
  },
  {
    code: "NM_NEON",
    slot: "NAME_STYLE",
    name: "네온",
    description: "분홍 네온관 글씨가 가끔 지직거린다",
    price: 540,
    rarity: "PREMIUM",
    className: "",
    nameStyle: "neon",
  },
  {
    code: "NM_RAINBOW",
    slot: "NAME_STYLE",
    name: "무지개",
    description: "둥근 글씨 위로 무지개 색이 옆으로 흐른다",
    price: 600,
    rarity: "PREMIUM",
    className: "",
    nameStyle: "rainbow",
  },
  {
    code: "NM_FLAME",
    slot: "NAME_STYLE",
    name: "불꽃",
    description: "글자가 아래부터 타오르며 일렁인다",
    price: 1100,
    rarity: "RARE",
    className: "",
    nameStyle: "flame",
  },
  {
    code: "NM_SLIME",
    slot: "NAME_STYLE",
    name: "슬라임",
    description: "통통하게 부푼 연두빛 글씨가 말랑하게 눌렸다 퍼진다",
    price: 180,
    rarity: "STARTER",
    className: "",
    nameStyle: "slime",
  },
  {
    code: "NM_SUNSET",
    slot: "NAME_STYLE",
    name: "선셋",
    description: "깔끔한 고딕에 노을 띠가 천천히 흐른다. 굵기도 고를 수 있다",
    price: 360,
    rarity: "COMMON",
    className: "",
    nameStyle: "sunset",
  },
  {
    code: "NM_MOON",
    slot: "NAME_STYLE",
    name: "문라이트",
    description: "가늘고 둥근 글씨 둘레로 달무리가 번졌다 걷힌다",
    price: 360,
    rarity: "COMMON",
    className: "",
    nameStyle: "moon",
  },
  {
    code: "NM_GHOST",
    slot: "NAME_STYLE",
    name: "고스트",
    description: "삐뚤빼뚤 두꺼운 손글씨 뒤로 흐릿한 잔상이 떠다닌다",
    price: 540,
    rarity: "PREMIUM",
    className: "",
    nameStyle: "ghost",
  },
  {
    code: "NM_FROST",
    slot: "NAME_STYLE",
    name: "프로스트",
    description:
      "서리 낀 세리프 글씨에 얼음 알갱이가 반짝인다. 굵기도 고를 수 있다",
    price: 600,
    rarity: "PREMIUM",
    className: "",
    nameStyle: "frost",
  },
  {
    code: "NM_THUNDER",
    slot: "NAME_STYLE",
    name: "썬더",
    description: "각진 전자 글씨가 번개처럼 번쩍이고 지직거린다",
    price: 1100,
    rarity: "RARE",
    className: "",
    nameStyle: "thunder",
  },
  // ── 프로필 배경 (프로필 위쪽 배너) ──
  {
    code: "BN_INK_SWORDSMAN",
    slot: "PROFILE_BANNER",
    name: "적월의 검객",
    description:
      "핏빛 달 아래 검은 용이 하늘을 가르고, 검객의 머리칼과 붉은 비단이 바람에 흩날린다",
    price: 2500,
    rarity: "RARE",
    className: "",
    liveBanner: "ink_swordsman",
  },
  {
    code: "BN_EMBER_KNIGHT",
    slot: "PROFILE_BANNER",
    name: "잿불의 기사 · 풍경",
    description:
      "달빛 아래 모닥불을 지키는 기사 — 움직이는 픽셀아트 프로필 배경",
    price: 2500,
    rarity: "RARE",
    className: "",
    liveBanner: "ember_knight_banner",
  },
];

/**
 * 진열에 쓰는 최종 목록. 가격·등급은 서버와 같은 원본(@nexus/types)을 따른다 —
 * 화면에 보인 가격과 실제로 깎이는 가격이 어긋나지 않게.
 */
export const COSMETICS: CosmeticItem[] = COSMETIC_DEFS.map((def) => {
  const shared = findCosmeticShopItem(def.code);
  return shared ? { ...def, price: shared.price, rarity: shared.rarity } : def;
});

/* ───────── 관리자가 추가한 상품 (상점 관리 2단계, 2026-11-20) ───────── */

/**
 * 서버 상품표 항목 → 화면 정의.
 * - 그림 빌리기(baseCode): 그 코드 상품의 그림을 그대로 쓰고 이름·가격·등급만 바꾼다.
 * - 올린 파일: 자리별로 카드 영상 배경 · 아바타 투명 장식 · 프로필 배경으로 그린다.
 * 그릴 수 없는 항목(빌린 상품이 사라졌거나 파일이 없음)은 null — 기본 모습으로 보인다.
 */
export function buildCustomCosmetic(e: ShopCatalogEntry): CosmeticItem | null {
  const common = {
    code: e.code,
    slot: e.slot,
    price: e.price,
    rarity: e.rarity,
    custom: true,
  };
  if (e.baseCode) {
    const base = COSMETICS.find((c) => c.code === e.baseCode);
    if (!base || base.slot !== e.slot) return null;
    return {
      ...base,
      ...common,
      name: e.name ?? base.name,
      description: e.description ?? base.description,
    };
  }
  const m = e.media;
  if (!m) return null;
  const item: CosmeticItem = {
    ...common,
    name: e.name ?? e.code,
    description: e.description ?? "",
    className: "",
  };
  if (e.slot === "CARD_FRAME") {
    // 카드 둘레 틀은 어두운 무채색 — 영상이 주인공
    item.className = "bg-[#2a2a2e]";
    item.cardVideo = {
      webm: m.video,
      mp4: m.mp4,
      poster: m.poster,
      size: COSMETIC_MEDIA_SIZE.CARD_FRAME,
      focusY: 0.5,
    };
  } else if (e.slot === "AVATAR_FRAME") {
    item.avatarEffect = { video: m.video, poster: m.poster };
  } else if (e.slot === "PROFILE_BANNER") {
    item.liveBanner = {
      webm: m.video,
      mp4: m.mp4,
      poster: m.poster,
      size: COSMETIC_MEDIA_SIZE.PROFILE_BANNER,
      focusY: 0.5,
    };
  } else {
    return null;
  }
  return item;
}

// 저장소의 상품표가 바뀔 때만 다시 만든다(같은 객체면 캐시 그대로)
let builtFor: Record<string, ShopCatalogEntry> | null = null;
let builtCustom = new Map<string, CosmeticItem>();
let builtAll: CosmeticItem[] = COSMETICS;

function built() {
  const entries = useCosmeticCatalogStore.getState().entries;
  if (entries !== builtFor) {
    builtFor = entries;
    builtCustom = new Map();
    for (const e of Object.values(entries)) {
      if (!e.custom) continue;
      const item = buildCustomCosmetic(e);
      if (item) builtCustom.set(item.code, item);
    }
    builtAll = [...COSMETICS, ...builtCustom.values()];
  }
  return { custom: builtCustom, all: builtAll };
}

/**
 * 코드 → 화면 정의. 코드 상품이 먼저, 없으면 관리자가 추가한 상품.
 * 관리자 상품은 서버 상품표를 받은 뒤에 보이므로, 렌더에서 쓰는 컴포넌트는
 * useCosmeticCatalog() 를 한 번 불러 상품표가 들어올 때 다시 그려지게 한다.
 */
export function findCosmetic(code?: string | null): CosmeticItem | undefined {
  if (!code) return undefined;
  return (
    COSMETICS.find((item) => item.code === code) ?? built().custom.get(code)
  );
}

/**
 * 전체 상품(코드 상품 + 관리자 상품)을 돌려주고, 서버 상품표가 들어오거나 바뀌면 다시 그린다.
 * findCosmetic 을 렌더에서 쓰는 컴포넌트도 이 훅을 불러 두면 함께 갱신된다.
 */
export function useCosmeticCatalog(): CosmeticItem[] {
  const entries = useCosmeticCatalogStore((s) => s.entries);
  // entries 가 바뀌어야만 새 배열 — 쓰는 쪽 useMemo 가 헛돌지 않게
  return useMemo(() => {
    void entries;
    return built().all;
  }, [entries]);
}
