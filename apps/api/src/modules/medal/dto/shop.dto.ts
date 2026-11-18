import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
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
