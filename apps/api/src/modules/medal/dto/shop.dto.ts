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
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
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

/** 고른 색 세 값 — 서비스가 범위를 다시 검사한다 */
export class NameTintValueDto {
  @KeepRaw()
  @IsInt()
  @Min(0)
  @Max(359)
  hue!: number;

  @KeepRaw()
  @IsInt()
  @Min(0)
  @Max(200)
  saturation!: number;

  @KeepRaw()
  @IsInt()
  @Min(50)
  @Max(150)
  brightness!: number;
}

/** PUT shop/name-tint — 닉네임 글꼴 색·채도·밝기. tint 가 null 이면 원래 색 */
export class NameTintDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => NameTintValueDto)
  tint!: NameTintValueDto | null;
}

/** POST shop/bundles/:id/purchase — 화면에서 본 가격(다르면 409) */
export class PurchaseBundleDto {
  @KeepRaw()
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedPrice?: number;
}
