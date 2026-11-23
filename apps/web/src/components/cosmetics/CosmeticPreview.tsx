"use client";

import Image from "next/image";
import { PortraitParticipantCard } from "@/app/[game]/tournaments/[id]/lobby/_components/PortraitParticipantCard";
import { AvatarDecoration } from "./avatar-effects";
import { StyledName } from "./name-styles";
import { LiveBanner } from "./live-banner";
import type { CosmeticItem } from "./catalog";
import type { NameTint } from "@nexus/types";

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
 * 실제 로비 카드 크기(큰 카드) — 장식 규격 440×420 의 절반 폭. 높이는 준비 띠까지.
 * 미리보기는 이 크기로 그린 뒤 비율 그대로 줄인다(폭만 좁히면 세로로 늘어 보인다).
 */
export const LOBBY_CARD_REAL: [number, number] = [220, 216];

/** 로비 카드를 실제 크기로 그려 `scale` 배로 줄인다(zoom — 줄인 크기대로 자리를 차지한다) */
export function RealSizeLobbyCard({
  scale = 1,
  p,
  frameCode,
  avatarFrameCode,
  nameStyleCode = null,
  nameTint,
}: {
  scale?: number;
  p: {
    id: string;
    userId: string;
    username: string;
    avatar: string;
    isHost: boolean;
    isReady: boolean;
  };
  frameCode?: string | null;
  avatarFrameCode?: string | null;
  nameStyleCode?: string | null;
  nameTint?: NameTint | null;
}) {
  return (
    <div style={{ width: LOBBY_CARD_REAL[0], zoom: scale }}>
      <PortraitParticipantCard
        {...PREVIEW_CARD_PROPS}
        p={p}
        frameCode={frameCode}
        avatarFrameCode={avatarFrameCode}
        nameStyleCode={nameStyleCode}
        nameTint={nameTint}
      />
    </div>
  );
}

/**
 * 꾸미기 상품 하나를 실제로 입힌 모습 — 홈의 상점 줄처럼 같은 높이 칸에 나란히 둘 때 쓴다.
 * 상점 화면의 진열과 같은 그림(로비 카드·아바타·닉네임·프로필 배경)을 높이만 맞춰 그린다.
 */
export function CosmeticPreview({
  item,
  username,
  avatar,
  height = 216,
  tint,
}: {
  item: CosmeticItem;
  /** 닉네임 글꼴에 고른 색(가진 상품) */
  tint?: NameTint | null;
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
          <StyledName code={item.nameStyle} tint={tint}>
            {username}
          </StyledName>
        </div>
        <div className="max-w-full truncate text-[13px] text-text-secondary">
          <span className="font-bold text-text-primary">
            <StyledName code={item.nameStyle} tint={tint}>
              {username}
            </StyledName>
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
  // 카드 장식 — 실제 로비 카드 크기(220×216)를 비율 그대로 칸 높이에 맞춰 줄인다.
  // 예전엔 폭만 136px 로 좁혀 세로로 길쭉해 보였다(2026-11-24 「실제 크기랑 다르다」)
  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ height }}
    >
      <RealSizeLobbyCard
        scale={Math.min(1, (height - 12) / LOBBY_CARD_REAL[1])}
        p={{
          id: `preview-${item.code}`,
          userId: "me",
          username,
          avatar: avatarSrc,
          isHost: false,
          isReady: true,
        }}
        frameCode={item.code}
      />
    </div>
  );
}
