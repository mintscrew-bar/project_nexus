"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  Check,
  Crown,
  UserMinus,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { getRoleTier } from "@/lib/role-tier";
import { cn } from "@/lib/utils";
import {
  findCosmetic,
  useCosmeticCatalog,
} from "@/components/cosmetics/catalog";
import { CosmeticEffect } from "@/components/cosmetics/effects";
import { LiveBanner } from "@/components/cosmetics/live-banner";
import { AvatarDecoration } from "@/components/cosmetics/avatar-effects";
import { UserName } from "@/components/cosmetics/UserName";
import { PositionIcon } from "./icons";

/**
 * 초상화 카드 크기. 방 정원에 맞춰 고른다 (`portraitCardSize`).
 * - lg: 10명 이하 — 5열, 초상화 크게
 * - md: 20명 이하 — 10열(넓은 화면), 2줄
 * - sm: 40명 이하 — 10열, 4줄. 티어만 남기고 라인 아이콘은 뺀다
 * - xs: 그보다 큰 방(배그 64~100명) — 초상화 대신 작은 아바타 한 줄짜리
 */
export type PortraitCardSize = "lg" | "md" | "sm" | "xs";

/** 정원으로 카드 크기를 고른다 — 데스크톱 로비가 한 화면에 들어오게 하려는 것 */
export function portraitCardSize(maxParticipants: number): PortraitCardSize {
  if (maxParticipants <= 10) return "lg";
  if (maxParticipants <= 20) return "md";
  if (maxParticipants <= 40) return "sm";
  return "xs";
}

/** 크기별 격자 열 수. 로비 왼쪽 칸 폭(대략 640~1150px)에 맞춘 값이다 */
export const PORTRAIT_GRID_COLS: Record<PortraitCardSize, string> = {
  lg: "grid-cols-4 xl:grid-cols-5",
  md: "grid-cols-5 xl:grid-cols-8 2xl:grid-cols-10",
  sm: "grid-cols-5 xl:grid-cols-8 2xl:grid-cols-10",
  xs: "grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6",
};

/**
 * 크기별 카드 높이 — 빈 자리 카드도 같은 높이를 쓴다.
 * 원형 사진 + 아바타 장식이 들어가면서 30px 안팎 키웠다 (Task 22 시안 A2).
 */
export const PORTRAIT_CARD_HEIGHT: Record<PortraitCardSize, string> = {
  lg: "h-[210px]",
  md: "h-[170px]",
  sm: "h-[140px]",
  xs: "h-12",
};

/** 크기별 원형 사진 지름(px) — 아바타 장식도 이 지름에 맞춰 그린다 */
const PORTRAIT_AVATAR_PX: Record<Exclude<PortraitCardSize, "xs">, number> = {
  lg: 88,
  md: 68,
  sm: 52,
};

/** 빈 자리 카드 — 몇 자리가 남았는지 칸 모양으로 보여준다 */
export function EmptyPortraitSlot({
  size,
  index,
}: {
  size: PortraitCardSize;
  index: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-dashed border-bg-elevated/70 text-text-tertiary",
        PORTRAIT_CARD_HEIGHT[size],
        size === "xs" ? "gap-1.5 text-xs" : "flex-col gap-1 text-xs",
      )}
    >
      <span className="tabular-nums">{index}</span>
      {size !== "sm" && <span>빈 자리</span>}
    </div>
  );
}

/**
 * 로비 데스크톱 참가자 카드 — 가운데 원형 사진(아바타 장식 포함) 아래에 이름·티어,
 * 맨 아래에 준비 상태 띠를 가로로 꽉 채운다 (왼쪽 색 막대는 쓰지 않는다 — CLAUDE.md 규칙).
 * 카드 장식 효과는 준비 띠 위 전체(이름 줄 뒤까지)를 무대로 쓴다 (Task 22 시안 A2).
 *
 * 준비 안 한 사람은 사진을 흑백·반투명으로 눌러서, 멀리서 봐도 컬러 사진
 * = 준비한 사람으로 읽히게 한다. 기능(호버 프로필·친구 추가·강퇴·음성 상태)은
 * 예전 목록 카드(CompactParticipantCard)와 같다.
 */
export function PortraitParticipantCard({
  p,
  size,
  isCurrentUserHost,
  isSelf,
  isFriend,
  isSent,
  addingFriend,
  setHoveredPlayer,
  scheduleHoverClose,
  cancelHoverClose,
  handleAddFriend,
  setKickTarget,
  frameCode,
  avatarFrameCode,
  nameStyleCode,
}: {
  p: any;
  size: PortraitCardSize;
  isCurrentUserHost: boolean;
  isSelf: boolean;
  isFriend: boolean;
  isSent: boolean;
  addingFriend: string | null;
  setHoveredPlayer: (
    value: { id: string; rect: DOMRect; participant: any } | null,
  ) => void;
  scheduleHoverClose: () => void;
  cancelHoverClose: () => void;
  handleAddFriend: (userId: string) => void;
  setKickTarget: (value: { id: string; username: string } | null) => void;
  /** 장착한 카드 테두리 상품 코드 (components/cosmetics/catalog.ts). 없으면 테두리 없음 */
  frameCode?: string | null;
  /** 장착한 아바타 장식 상품 코드 — 원형 사진 둘레에 그린다 */
  avatarFrameCode?: string | null;
  /** 장착한 닉네임 글꼴 상품 코드 (NAME_STYLE) */
  nameStyleCode?: string | null;
}) {
  // 관리자가 추가한 상품의 그림 정의가 들어오면 다시 그린다
  useCosmeticCatalog();
  const frame = findCosmetic(frameCode);
  const avatarFx = findCosmetic(avatarFrameCode)?.avatarEffect;
  const cardRef = useRef<HTMLDivElement>(null);
  const riot = p.riotAccount;
  const pubg = p.pubgAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const displayTier = getRoleTier(riot, mainRole);
  const displayName = riot
    ? riot.gameName
    : pubg
      ? pubg.playerName
      : p.username;
  const avatarSrc = p.avatar || "/images/placeholders/non-avatar-256.png";

  const handleMouseEnter = () => {
    cancelHoverClose();
    if (cardRef.current) {
      setHoveredPlayer({
        id: p.userId ?? p.id,
        rect: cardRef.current.getBoundingClientRect(),
        participant: p,
      });
    }
  };

  // 친구 추가·강퇴 — 카드 위에 마우스를 올렸을 때만 진하게 보인다
  const actionButtons = (
    <>
      {!isSelf && !isFriend && !isSent && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddFriend(p.userId);
          }}
          disabled={addingFriend === p.userId}
          className="rounded-md bg-black/55 p-1 text-white/80 opacity-0 backdrop-blur transition-opacity hover:text-white group-hover:opacity-100 disabled:opacity-30"
          title="친구 추가"
          aria-label={`${p.username} 친구 추가`}
        >
          <UserPlus className="h-3.5 w-3.5" />
        </button>
      )}
      {isCurrentUserHost && !isSelf && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setKickTarget({ id: p.id, username: p.username });
          }}
          className="rounded-md bg-black/55 p-1 text-red-300 opacity-0 backdrop-blur transition-opacity hover:text-red-200 group-hover:opacity-100"
          title="강퇴"
          aria-label={`${p.username} 강퇴`}
        >
          <UserMinus className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );

  // 음성 대기실 참가 여부 — 방에 Discord 채널이 있을 때만 값이 온다
  const voiceBadge =
    p.inVoice === undefined ? null : p.inVoice ? (
      <span title="음성채널 참가 중">
        <Volume2 className="h-3.5 w-3.5 text-green-400" />
      </span>
    ) : (
      <span title="음성채널 미참가">
        <VolumeX className="h-3.5 w-3.5 text-text-tertiary" />
      </span>
    );

  const nameRow = (
    <div className="flex min-w-0 max-w-full items-center justify-center gap-1">
      {p.isHost && (
        <Crown
          className="h-3.5 w-3.5 flex-shrink-0 text-accent-gold"
          aria-label="방장"
        />
      )}
      <span
        className={cn(
          "truncate font-black text-text-primary",
          size === "lg" ? "text-sm" : "text-xs",
        )}
      >
        {/* 장착한 닉네임 글꼴 — 로비 목록이 모아 읽은 코드를 받는다 */}
        <UserName styleCode={nameStyleCode ?? null}>{displayName}</UserName>
      </span>
      {isSelf && (
        <span className="flex-shrink-0 text-[10px] font-bold text-accent-primary">
          나
        </span>
      )}
    </div>
  );

  /* ─── xs: 큰 방 — 작은 아바타 한 줄. 준비 여부는 바탕색과 체크로 ─── */
  if (size === "xs") {
    return (
      <div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleHoverClose}
        className={cn(
          "group relative flex min-w-0 items-center gap-2 rounded-lg px-2",
          PORTRAIT_CARD_HEIGHT.xs,
          p.isReady ? "bg-accent-success/[0.12]" : "bg-bg-tertiary/60",
          isSelf && "ring-1 ring-inset ring-accent-primary/60",
        )}
      >
        <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-bg-elevated">
          <Image
            src={avatarSrc}
            alt=""
            fill
            unoptimized
            className={cn("object-cover", !p.isReady && "opacity-50 grayscale")}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            {p.isHost && (
              <Crown className="h-3 w-3 flex-shrink-0 text-accent-gold" />
            )}
            <span className="truncate text-xs font-bold text-text-primary">
              <UserName styleCode={nameStyleCode ?? null}>
                {displayName}
              </UserName>
            </span>
          </div>
          <span
            className={cn(
              "text-[10px] font-black",
              p.isReady ? "text-accent-success" : "text-text-tertiary",
            )}
          >
            {p.isReady ? "준비 완료" : "대기 중"}
          </span>
        </div>
        {voiceBadge}
        <div className="flex items-center gap-0.5">{actionButtons}</div>
      </div>
    );
  }

  /* ─── lg·md·sm: 원형 사진 카드 ─── */
  const avatarPx = PORTRAIT_AVATAR_PX[size];
  const card = (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={scheduleHoverClose}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-xl",
        PORTRAIT_CARD_HEIGHT[size],
        p.isReady ? "bg-accent-success/[0.07]" : "bg-bg-tertiary/60",
        // 내 카드는 옅은 테두리로 — 수십 장 중에서 내 자리를 바로 찾게
        isSelf && "ring-1 ring-inset ring-accent-primary/60",
      )}
    >
      {/* 무대 — 준비 띠 위 전체. 카드 장식 효과가 이름 줄 뒤까지 깔린다 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {frame?.cardVideo && <LiveBanner code={frame.cardVideo} />}
        {frame?.effect && (
          <CosmeticEffect
            code={frame.effect}
            px={size === "lg" ? 3 : size === "md" ? 2 : 1.5}
          />
        )}
        <div className="relative z-10 flex h-full flex-col items-center">
          {/* 원형 사진 — 위쪽에 여유를 두고 조금 아래로. 준비 전에는 흑백으로 눌러 둔다 */}
          <div
            className={cn(
              "flex min-h-0 flex-1 items-center justify-center",
              size === "lg" ? "pt-4" : "pt-2.5",
            )}
          >
            <AvatarDecoration code={avatarFx} size={avatarPx}>
              <div
                className="relative overflow-hidden rounded-full bg-bg-elevated"
                style={{ width: avatarPx, height: avatarPx }}
              >
                <Image
                  src={avatarSrc}
                  alt=""
                  fill
                  unoptimized
                  sizes={`${avatarPx * 2}px`}
                  className={cn(
                    "object-cover transition-[filter,opacity]",
                    !p.isReady && "opacity-50 grayscale",
                  )}
                />
              </div>
            </AvatarDecoration>
          </div>

          {/* 이름·티어·라인 — 장식 효과 위에서도 읽히게 아래로 갈수록 어두운 막을 깐다 */}
          <div className="relative w-full flex-shrink-0">
            {(frame?.effect || frame?.cardVideo) && (
              <div className="cfx-deco absolute inset-0 bg-gradient-to-t from-black/85 via-black/65 to-transparent" />
            )}
            <div
              className={cn(
                "relative flex flex-col items-center px-1.5",
                size === "lg" ? "gap-1 py-2" : "gap-0.5 py-1.5",
                (frame?.effect || frame?.cardVideo) &&
                  "[&_span]:drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]",
              )}
            >
              {nameRow}
              <div className="flex min-w-0 items-center justify-center gap-1">
                {riot?.tier && (
                  <span
                    className="flex-shrink-0"
                    title={displayTier ? "주 포지션 티어" : "솔로랭크 티어"}
                  >
                    <TierBadge
                      tier={displayTier?.tier || riot.tier}
                      rank={displayTier?.rank || riot.rank || undefined}
                      size="sm"
                      showIcon={false}
                    />
                  </span>
                )}
                {pubg && (
                  <span className="flex-shrink-0 rounded bg-accent-primary/10 px-1 py-0.5 text-[9px] font-bold text-accent-primary">
                    {pubg.lastMatchShard === "STEAM"
                      ? "스배"
                      : pubg.lastMatchShard === "KAKAO"
                        ? "카배"
                        : "미확인"}
                  </span>
                )}
                {/* 라인 아이콘은 sm(40명 방)에선 자리가 없어 뺀다 — 호버 카드에서 보인다 */}
                {size !== "sm" && mainRole && (
                  <PositionIcon position={mainRole} className="!h-3.5 !w-3.5" />
                )}
                {size === "lg" && subRole && (
                  <PositionIcon
                    position={subRole}
                    className="!h-3 !w-3"
                    opacity={0.5}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 왼쪽 위: 음성 상태 / 오른쪽 위: 친구 추가·강퇴 */}
        {voiceBadge && (
          <span className="absolute left-1.5 top-1.5 z-20 rounded-md bg-black/55 p-1 backdrop-blur">
            {voiceBadge}
          </span>
        )}
        <div className="absolute right-1.5 top-1.5 z-20 flex gap-1">
          {actionButtons}
        </div>
      </div>

      {/* 준비 띠 — 카드 맨 아래를 가로로 꽉 채운다 */}
      <div
        className={cn(
          "flex flex-shrink-0 items-center justify-center gap-1 font-black",
          size === "lg" ? "h-7 text-xs" : "h-5 text-[10px]",
          // 원색 초록은 형광처럼 눈이 아프고 35%는 너무 어두웠다(2026-11-12) — 60%
          p.isReady
            ? "bg-accent-success/60 text-white"
            : "bg-bg-elevated/60 text-text-tertiary",
        )}
      >
        {p.isReady && (
          <Check
            className={size === "lg" ? "h-3.5 w-3.5" : "h-3 w-3"}
            strokeWidth={3}
          />
        )}
        {p.isReady
          ? size === "lg"
            ? "준비 완료"
            : "준비"
          : size === "lg"
            ? "대기 중"
            : "대기"}
      </div>
    </div>
  );

  // 장착한 테두리가 있으면 3px 바깥 틀로 감싼다 — 둘레 전체를 두르는 모양만 쓴다.
  // 틀 안에는 움직이는 층(layerClassName)을 카드 뒤에 깔아서, 카드가 덮지 않은
  // 테두리 띠에서만 빛이 돌거나 스쳐 지나가게 한다.
  if (!frame) return card;
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[15px] p-[3px]",
        frame.className,
      )}
    >
      {frame.layerClassName && (
        <span
          aria-hidden
          className={cn(
            // cfx-layer — 꾸미기 효과 설정이 이 층의 움직임을 멈추거나 숨긴다
            "cfx-layer pointer-events-none absolute -z-10",
            frame.layerClassName,
          )}
        />
      )}
      {/* 카드 바탕이 반투명이라 틀 색이 비치지 않게 불투명한 바탕을 한 겹 깐다 */}
      <div className="rounded-xl bg-bg-secondary">{card}</div>
    </div>
  );
}
