"use client";

// 개발용 시안 — 메달 상점 첫 상품 6개 미리보기 (실제 구매·DB 없음)
// 접속: http://localhost:3010/dev/medal-shop

import { Medal } from "lucide-react";
import { PortraitParticipantCard } from "@/app/[game]/tournaments/[id]/lobby/_components/PortraitParticipantCard";
import {
  COSMETICS,
  MEDAL_LABEL,
  RARITY_LABEL,
  type CosmeticItem,
} from "@/components/cosmetics/catalog";
import { cn } from "@/lib/utils";

const ICONS = [588, 4568, 5367, 29, 6, 4661];
const icon = (i: number) =>
  `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${ICONS[i % ICONS.length]}.png`;

/** 시안용 참가자 */
function player(i: number, name: string, tier: string, ready = true) {
  return {
    id: `p${i}`,
    userId: `u${i}`,
    username: name,
    avatar: icon(i),
    isHost: i === 0,
    isReady: ready,
    riotAccount: {
      gameName: name,
      tagLine: "KR1",
      tier,
      rank: "II",
      mainRole: "MID",
      subRole: "TOP",
    },
  };
}

const noop = () => {};
const cardProps = {
  size: "lg" as const,
  isCurrentUserHost: false,
  isSelf: false,
  isFriend: true,
  isSent: false,
  addingFriend: null,
  setHoveredPlayer: noop,
  scheduleHoverClose: noop,
  cancelHoverClose: noop,
  handleAddFriend: noop,
  setKickTarget: noop,
};

/** 로비에서 꾸미기를 장착한 모습 — 맨 왼쪽은 아무것도 안 낀 기본 카드 */
const LOBBY_ROW: {
  name: string;
  tier: string;
  frame?: string;
  nameColor?: string;
}[] = [
  { name: "기본 카드", tier: "GOLD" },
  {
    name: "은빛하늘",
    tier: "PLATINUM",
    frame: "FRAME_SILVER",
    nameColor: "NAME_SKY",
  },
  { name: "인디고", tier: "EMERALD", frame: "FRAME_INDIGO" },
  {
    name: "금빛노을",
    tier: "DIAMOND",
    frame: "FRAME_GOLD",
    nameColor: "NAME_SUNSET",
  },
  {
    name: "오로라",
    tier: "MASTER",
    frame: "FRAME_AURORA",
    nameColor: "NAME_SKY",
  },
];

/** 상점 칸 — 상품 하나를 실제 카드에 입혀 미리 보여준다 */
function ShopTile({ item, index }: { item: CosmeticItem; index: number }) {
  const isFrame = item.slot === "CARD_FRAME";
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-bg-tertiary/40 p-4">
      <div className="mx-auto w-[180px]">
        <PortraitParticipantCard
          {...cardProps}
          p={player(index, isFrame ? "미리보기" : "닉네임색", "EMERALD")}
          frameCode={isFrame ? item.code : null}
          nameColorCode={isFrame ? null : item.code}
        />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-text-primary">
              {item.name}
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold",
                item.rarity === "PREMIUM"
                  ? "bg-violet-500/20 text-violet-300"
                  : item.rarity === "COMMON"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-bg-elevated text-text-secondary",
              )}
            >
              {RARITY_LABEL[item.rarity]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {isFrame ? "카드 테두리" : "닉네임 색"} · {item.description}
          </p>
        </div>
      </div>
      <button className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent-primary text-sm font-black text-accent-on">
        <Medal className="h-4 w-4" />
        {item.price.toLocaleString()} {MEDAL_LABEL}
      </button>
    </div>
  );
}

export default function MedalShopPreview() {
  return (
    <div className="container mx-auto max-w-6xl space-y-8 px-6 py-6">
      <section>
        <h2 className="mb-3 text-sm font-bold text-text-secondary">
          로비에서 장착한 모습
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {LOBBY_ROW.map((row, i) => (
            <PortraitParticipantCard
              key={row.name}
              {...cardProps}
              p={player(i, row.name, row.tier, i !== 0)}
              frameCode={row.frame}
              nameColorCode={row.nameColor}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-text-secondary">
            메달 상점 — 첫 상품 6개
          </h2>
          <span className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary px-3 py-1.5 text-sm font-black text-text-primary">
            <Medal className="h-4 w-4 text-amber-300" />
            320 {MEDAL_LABEL}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {COSMETICS.map((item, i) => (
            <ShopTile key={item.code} item={item} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
