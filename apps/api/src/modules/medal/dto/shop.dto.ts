import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { COSMETIC_SLOTS, type CosmeticSlot } from "@nexus/types";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/** POST shop/purchase */
export class PurchaseCosmeticDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  /** 산 즉시 장착할지 (기본: 장착) */
  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  equip?: boolean;

  /** 화면에서 본 가격 — 지금 가격과 다르면 409 로 거절한다(안 넘기면 확인하지 않음) */
  @KeepRaw()
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedPrice?: number;
}

/** PUT shop/loadout — code 가 null 이면 그 자리를 비운다 */
export class EquipCosmeticDto {
  @IsIn(COSMETIC_SLOTS)
  slot!: CosmeticSlot;

  @KeepRaw()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  code!: string | null;
}

/** PUT shop/name-hue — 닉네임 글꼴 색(색상 회전 0~359도). null 이면 원래 색 */
export class NameHueDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @KeepRaw()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(359)
  hue!: number | null;
}
