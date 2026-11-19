"use client";

import Image from "next/image";
import { PortraitParticipantCard } from "@/app/[game]/tournaments/[id]/lobby/_components/PortraitParticipantCard";
import { AvatarDecoration } from "./avatar-effects";
import { StyledName } from "./name-styles";
import { LiveBanner } from "./live-banner";
import type { CosmeticItem } from "./catalog";

const AVATAR_FALLBACK = "/images/placeholders/non-avatar-256.png";
const noop = () => {};
/** 미리보기 카드는 눌러도 아무 일 없게 — 로비 카드의 조작 버튼을 끈다 */
const PREVIEW_CARD_PROPS = {
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

/**
 * 꾸미기 상품 하나를 실제로 입힌 모습 — 홈의 상점 줄처럼 같은 높이 칸에 나란히 둘 때 쓴다.
 * 상점 화면의 진열과 같은 그림(로비 카드·아바타·닉네임·프로필 배경)을 높이만 맞춰 그린다.
 */
export function CosmeticPreview({
  item,
  username,
  avatar,
  height = 216,
}: {
  item: CosmeticItem;
  username: string;
  avatar?: string | null;
  height?: number;
}) {
  const avatarSrc = avatar || AVATAR_FALLBACK;

  if (item.slot === "PROFILE_BANNER" && item.liveBanner) {
    return (
      <div className="relative w-full overflow-hidden" style={{ height }}>
        <LiveBanner code={item.liveBanner} className="absolute inset-0" />
      </div>
    );
  }
  if (item.slot === "NAME_STYLE") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 px-3"
        style={{ height }}
      >
        <div className="max-w-full truncate text-2xl font-black text-text-primary">
          <StyledName code={item.nameStyle}>{username}</StyledName>
        </div>
        <div className="max-w-full truncate text-[13px] text-text-secondary">
          <span className="font-bold text-text-primary">
            <StyledName code={item.nameStyle}>{username}</StyledName>
          </span>
          : 다음 판 미드 갑니다
        </div>
      </div>
    );
  }
  if (item.slot === "AVATAR_FRAME") {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <AvatarDecoration code={item.avatarEffect} size={84}>
          <div className="relative h-[84px] w-[84px] overflow-hidden rounded-full bg-bg-tertiary">
            <Image
              src={avatarSrc}
              alt=""
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        </AvatarDecoration>
      </div>
    );
  }
  // 카드 장식 — 로비 카드에 입혀 보인다(폭 136px 이면 칸 높이 216px 안에 들어간다)
  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ height }}
    >
      <div className="w-[136px]">
        <PortraitParticipantCard
          {...PREVIEW_CARD_PROPS}
          p={{
            id: `preview-${item.code}`,
            userId: "me",
            username,
            avatar: avatarSrc,
            isHost: false,
            isReady: true,
          }}
          frameCode={item.code}
          avatarFrameCode={undefined}
          nameStyleCode={null}
        />
      </div>
    </div>
  );
}
