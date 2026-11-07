import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

export const BROADCAST_CONTROL_SCENES = [
  "auto",
  "idle",
  "room",
  "auction",
  "role-selection",
  "bracket",
  "match-intro",
  "lineup",
  "match",
  "result",
  "summary",
  "break",
] as const;

export type BroadcastControlScene = (typeof BROADCAST_CONTROL_SCENES)[number];

export class UpdateBroadcastControlDto {
  @IsOptional()
  @IsIn(BROADCAST_CONTROL_SCENES)
  scene?: BroadcastControlScene;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  lowerThirdVisible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  announcement?: string | null;

  /**
   * 휴식 카운트다운(분). 숫자면 지금부터 N분 뒤를 종료 시각으로 잡고, null 이면 카운트다운을 끈다.
   * 장면 전환과는 별개 — 패널은 휴식 장면 전환과 함께 보낸다.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  breakMinutes?: number | null;
}

/** 즉석 연출 신호 — 저장하지 않고 오버레이에 한 번 흘려 보낸다 */
export const BROADCAST_CUE_TYPES = [
  "replay-result",
  "player",
  "clear-player",
] as const;
export type BroadcastCueType = (typeof BROADCAST_CUE_TYPES)[number];

export class BroadcastCueDto {
  @IsIn(BROADCAST_CUE_TYPES)
  type!: BroadcastCueType;

  /** type=player 일 때 띄울 선수 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}

export class BroadcastControlActionDto extends UpdateBroadcastControlDto {}
